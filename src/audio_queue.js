const fs = require('fs');
const path = require('path');
const { EdgeTTS } = require('node-edge-tts');
const fetch = require('node-fetch'); // assuming fetch is globally available in Node 18+

const AZURE_KEY = (process.env.AZURE_SPEECH_KEY || '').trim();
const AZURE_REGION = (process.env.AZURE_SPEECH_REGION || 'eastus').trim();
const AZURE_RATE = (process.env.AZURE_SPEECH_RATE || '-15%').trim();
const AZURE_PITCH = (process.env.AZURE_SPEECH_PITCH || '+5%').trim();
const AZURE_STYLE = (process.env.AZURE_SPEECH_STYLE || 'newscast').trim();

const edgeTts = new EdgeTTS({
    voice: 'zh-CN-XiaoxiaoNeural',
    rate: AZURE_RATE,
    pitch: AZURE_PITCH
});

class AudioQueue {
    constructor(db, dataDir) {
        this.db = db;
        this.dataDir = dataDir;
        this.speechDir = path.join(dataDir, 'speech');
        
        ['words', 'expressions', 'sentences'].forEach(d => {
            fs.mkdirSync(path.join(this.speechDir, d), { recursive: true });
        });

        this.queues = {}; // userId -> array of tasks
        this.activeUsers = [];
        this.isProcessing = false;
        this.userProgress = {}; // sessionId -> { total, done, error }
    }

    addTasks(userId, sessionId, cards) {
        if (!this.queues[userId]) {
            this.queues[userId] = [];
            this.activeUsers.push(userId);
        }

        const tasks = [];
        for (const card of cards) {
            // Determine type directory
            let dir = 'words';
            if (card.type === 'expression') dir = 'expressions';
            if (card.type === 'sentence') dir = 'sentences';
            
            const pinyins = (card.pinyin || '').split(',').map(v => v.trim()).filter(v => v);
            for (const p of pinyins) {
                tasks.push({ hanzi: card.hanzi, pinyin: p, type: dir, sessionId });
            }
        }
        
        this.userProgress[sessionId] = { total: tasks.length, done: 0, error: 0 };
        this.queues[userId].push(...tasks);
        
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    getProgress(sessionId) {
        return this.userProgress[sessionId] || null;
    }

    async processQueue() {
        this.isProcessing = true;
        
        while (this.activeUsers.length > 0) {
            const userId = this.activeUsers.shift();
            const userQueue = this.queues[userId];
            
            if (userQueue && userQueue.length > 0) {
                const task = userQueue.shift();
                
                // Process 1 task
                try {
                    await this.synthesizeTask(task);
                    this.userProgress[task.sessionId].done++;
                } catch (err) {
                    console.error(`TTS Error for ${task.hanzi}:`, err.message);
                    this.userProgress[task.sessionId].error++;
                }

                // If user still has tasks, push to back of line (Round Robin)
                if (userQueue.length > 0) {
                    this.activeUsers.push(userId);
                } else {
                    delete this.queues[userId];
                }
            }
        }
        
        this.isProcessing = false;
    }

    async synthesizeTask(task) {
        const { hanzi, pinyin, type } = task;
        const fileName = `${Buffer.from(hanzi + '_' + pinyin).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}.mp3`;
        const filePath = path.join(this.speechDir, type, fileName);
        
        if (fs.existsSync(filePath)) return; // Already exists

        if (AZURE_KEY) {
            try {
                await this.synthesizeAzure(hanzi, pinyin, filePath);
                return;
            } catch (e) {
                console.warn(`Azure failed, fallback EdgeTTS: ${e.message}`);
            }
        }
        
        await this.synthesizeEdge(hanzi, filePath);
    }

    async synthesizeAzure(text, pinyinReading, filePath) {
        const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>
    <voice name='zh-CN-XiaoxiaoNeural'>
        <mstts:express-as style='${AZURE_STYLE}'>
            <prosody rate='${AZURE_RATE}' pitch='${AZURE_PITCH}'>${text}</prosody>
        </mstts:express-as>
    </voice>
</speak>`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
                'User-Agent': 'Chinese2Anki'
            },
            body: ssml
        });

        if (!response.ok) throw new Error(await response.text());
        fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
    }

    async synthesizeEdge(text, filePath) {
        await edgeTts.ttsPromise(text, filePath);
    }
}

module.exports = AudioQueue;
