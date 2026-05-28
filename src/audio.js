require('dotenv').config();
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'txt', 'tts-news.log');
const originalLog = console.log;
console.log = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    fs.appendFileSync(LOG_FILE, `[${new Date().toLocaleString()}] ${msg}\n`);
    originalLog(...args);
};

const INPUT_FILE = path.join(__dirname, 'txt', 'vocab_news.txt');
const SPEECH_DIR = path.join(__dirname, 'txt', 'speech');
const { EdgeTTS } = require('node-edge-tts');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'users.db');

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

if (!fs.existsSync(SPEECH_DIR)) fs.mkdirSync(SPEECH_DIR, { recursive: true });

function pinyinSyllableToTone(syllable) {
    const diacritics = {
        'a': { 'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4 },
        'e': { 'ē': 1, 'é': 2, 'ě': 3, 'è': 4 },
        'i': { 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4 },
        'o': { 'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4 },
        'u': { 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4 },
        'v': { 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4, 'ü': 5 }
    };
    let result = syllable.toLowerCase().trim();
    let toneNum = 5; 
    for (const [base, marks] of Object.entries(diacritics)) {
        for (const [mark, tone] of Object.entries(marks)) {
            if (result.includes(mark)) {
                result = result.replace(mark, base);
                toneNum = tone;
                break;
            }
        }
    }
    return result.replace(/[^a-z]/g, '') + ' ' + toneNum;
}

function pinyinToToneNumbers(pinyin) {
    return pinyin.split(/\s+/).map(pinyinSyllableToTone).join(' ');
}

function needsPhoneme(hanzi, pinyinStr) {
    return hanzi.length <= 2 && pinyinStr.includes(',');
}

async function synthesizeAzure(text, pinyinReading, filePath, usePhoneme = false, retryCount = 0) {
    const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    let ssml;

    const prosodyStart = `<prosody rate='${AZURE_RATE}' pitch='${AZURE_PITCH}'>`;
    const prosodyEnd = "</prosody>";

    if (usePhoneme) {
        const tonePinyin = pinyinToToneNumbers(pinyinReading);
        ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>
    <voice name='zh-CN-XiaoxiaoNeural'>
        <mstts:express-as style='${AZURE_STYLE}'>
            ${prosodyStart}
                <phoneme alphabet='sapi' ph='${tonePinyin}'>${text}</phoneme>
            ${prosodyEnd}
        </mstts:express-as>
    </voice>
</speak>`;
    } else {
        ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>
    <voice name='zh-CN-XiaoxiaoNeural'>
        <mstts:express-as style='${AZURE_STYLE}'>
            ${prosodyStart}${text}${prosodyEnd}
        </mstts:express-as>
    </voice>
</speak>`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'News-Pipeline-TTS'
        },
        body: ssml
    });

    if (response.status === 429 && retryCount < 3) {
        const wait = (retryCount + 1) * 2000;
        console.warn(`[!] Azure 429 (Rate Limit). Retry in ${wait}ms (${retryCount + 1}/3)...`);
        await new Promise(r => setTimeout(r, wait));
        return synthesizeAzure(text, pinyinReading, filePath, usePhoneme, retryCount + 1);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Azure Error ${response.status}: ${errorBody}`);
    }
    fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
}

async function synthesizeEdge(text, filePath, retryCount = 0) {
    try {
        await edgeTts.ttsPromise(text, filePath);
    } catch (err) {
        if (retryCount < 3) {
            const wait = (retryCount + 1) * 2000;
            console.warn(`[!] Edge-TTS Error. Retry in ${wait}ms (${retryCount + 1}/3)...`);
            await new Promise(r => setTimeout(r, wait));
            return synthesizeEdge(text, filePath, retryCount + 1);
        }
        throw err;
    }
}

async function synthesize(text, pinyinReading, baseFilePath, usePhoneme = false) {
    if (AZURE_KEY) {
        try {
            await synthesizeAzure(text, pinyinReading, baseFilePath, usePhoneme);
            return path.basename(baseFilePath);
        } catch (err) {
            console.warn(`[!] Azure failed for '${text}': ${err.message}. Falling back to Edge-TTS...`);
        }
    }

    const edgeFileName = path.basename(baseFilePath, '.mp3') + '_edge.mp3';
    const edgeFilePath = path.join(path.dirname(baseFilePath), edgeFileName);
    
    await synthesizeEdge(text, edgeFilePath);
    return edgeFileName;
}

async function run() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Файл не знайдено: ${INPUT_FILE}`);
        return;
    }

    const lines = fs.readFileSync(INPUT_FILE, 'utf8').split('\n');
    console.log(`🚀 Озвучка новин: ${lines.length} рядків...`);

    const db = new sqlite3.Database(dbPath);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        let parts = line.split('|').map(s => s.trim());
        if (parts.length < 2) continue;

        let [hanzi, pinyinStr, trans, hsk] = parts;

        const row = await new Promise((resolve, reject) => {
            db.get("SELECT audio_tags FROM dictionary WHERE hanzi = ? AND pinyin = ?", [hanzi, pinyinStr], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        let needsRegeneration = true;
        
        if (row && row.audio_tags && row.audio_tags.includes('[sound:')) {
            needsRegeneration = false;
            const soundRegex = /\[sound:(.*?)\]/g;
            let match;
            while ((match = soundRegex.exec(row.audio_tags)) !== null) {
                const audioFile = match[1];
                if (!fs.existsSync(path.join(SPEECH_DIR, audioFile))) {
                    needsRegeneration = true;
                }
            }
        }

        if (!needsRegeneration) {
            continue;
        }

        const pinyinVariants = (pinyinStr || '').split(',').map(v => v.trim()).filter(v => v);
        const usePhoneme = needsPhoneme(hanzi, pinyinStr || '');
        let audioFiles = [];

        for (const variant of pinyinVariants) {
            const fileName = `${Buffer.from(hanzi + '_' + variant).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}.mp3`;
            const filePath = path.join(SPEECH_DIR, fileName);

            let finalFileName = fileName;
            try {
                console.log(`[i] Синтез: ${hanzi} (${variant})...`);
                finalFileName = await synthesize(hanzi, variant, filePath, usePhoneme);
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error(`❌ Помилка озвучки ${hanzi}: ${err.message}`);
                continue; 
            }
            
            audioFiles.push(finalFileName);
        }

        const ankiAudio = audioFiles.map(f => `[sound:${f}]`).join('');
        
        // Update DB with generated audio tag
        await new Promise((resolve, reject) => {
            db.run("UPDATE dictionary SET audio_tags = ? WHERE hanzi = ? AND pinyin = ?", [ankiAudio, hanzi, pinyinStr], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    db.close();
    console.log(`✅ Озвучку завершено! Всі аудіо-теги збережені в базі даних.`);
}

module.exports = { runTTS: run };

if (require.main === module) {
    run();
}
