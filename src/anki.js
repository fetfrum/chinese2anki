const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_FILE = path.join(__dirname, 'txt', 'vocab_news_tts.txt');
const AUDIO_DIR = path.join(__dirname, 'txt', 'speech');
const MODEL_NAME = 'ChineseDuoNews';
const LOG_FILE = path.join(__dirname, 'txt', 'import_news.log');
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const ANKI_CONNECT_VERSION = 6;

fs.writeFileSync(LOG_FILE, '', 'utf8');

function logger(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    console.log(logLine);
    fs.appendFileSync(LOG_FILE, logLine + '\n', 'utf8');
}

async function startAnki() {
    return new Promise((resolve) => {
        logger('Attempting to start Anki...', 'INFO');
        // Try common installation paths on Windows
        const paths = [
            `"${process.env.LOCALAPPDATA}\\Programs\\Anki\\anki.exe"`,
            `"C:\\Program Files\\Anki\\anki.exe"`
        ];
        exec(`start "" ${paths[0]} || start "" ${paths[1]} || start anki`, (error) => {
            if (error) {
                logger('Failed to start Anki automatically: ' + error.message, 'WARNING');
            }
            // Give Anki some time to start up and load the add-on
            setTimeout(resolve, 10000); 
        });
    });
}

async function invokeAnki(action, params = {}, retry = true) {
    try {
        const response = await fetch(ANKI_CONNECT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params })
        });
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return data.result;
    } catch (error) {
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            if (retry) {
                logger('AnkiConnect connection refused. Trying to launch Anki...', 'WARNING');
                await startAnki();
                return invokeAnki(action, params, false);
            } else {
                logger('AnkiConnect connection refused even after attempting to start.', 'FATAL');
                console.error('\n❌ Помилка: Anki не запущено, або плагін AnkiConnect не встановлено.');
                process.exit(1);
            }
        }
        throw error;
    }
}

function escapeHtml(value) {
    if (!value) return '';
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function ensureDeck(deckName) {
    try {
        await invokeAnki('createDeck', { deck: deckName });
        logger(`Ensured deck exists: ${deckName}`, 'DEBUG');
    } catch (e) {
        logger(`Error ensuring deck ${deckName}: ${e.message}`, 'WARNING');
    }
}

async function ensureModel() {
    const modelNames = await invokeAnki('modelNames');
    if (!modelNames.includes(MODEL_NAME)) {
        logger(`Model ${MODEL_NAME} missing. Creating it...`, 'INFO');
        await createChineseDuoModel();
    } else {
        logger(`Model ${MODEL_NAME} found. Verifying fields...`, 'INFO');
        const fieldNames = await invokeAnki('modelFieldNames', { modelName: MODEL_NAME });
        const expectedFields = ['Hanzi', 'Pinyin', 'Meaning', 'Audio', 'AudioButtons', 'Meta', 'SourceUrl'];
        const isMatch = fieldNames.length === expectedFields.length && fieldNames.every((f, i) => f === expectedFields[i]);
        if (!isMatch) {
            logger(`Model field mismatch. Expected: ${expectedFields.join(', ')}`, 'FATAL');
            process.exit(1);
        }
    }
}

async function createChineseDuoModel() {
    const modelDefinition = {
        modelName: MODEL_NAME,
        inOrderFields: ['Hanzi', 'Pinyin', 'Meaning', 'Audio', 'AudioButtons', 'Meta', 'SourceUrl'],
        css: `
.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
}
.hanzi {
    font-size: 40px;
    font-weight: bold;
}
.pinyin {
    font-size: 24px;
    color: #555;
    display: none;
}
.show-pinyin-btn {
    cursor: pointer;
    background: #e0e0e0;
    border: 1px solid #ccc;
    padding: 5px 10px;
    border-radius: 4px;
    margin-top: 10px;
}
.audio-btn {
    cursor: pointer;
    background: #4CAF50;
    color: white;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    margin: 5px;
    font-size: 16px;
}
.meaning {
    font-size: 22px;
    margin-top: 20px;
}
.meta {
    font-size: 14px;
    color: #888;
    margin-top: 30px;
}
.source-link {
    display: block;
    margin-top: 40px;
    font-size: 12px;
    color: #ccc;
    text-decoration: none;
}
.source-link:hover {
    color: #888;
}
.inline-pinyin {
    color: darkblue;
    font-style: italic;
}
        `,
        isCloze: false,
        cardTemplates: [
            {
                Name: 'Card 1',
                Front: `
<div class="hanzi">{{Hanzi}}</div>
<button class="show-pinyin-btn" onclick="document.getElementById('pinyin-div').style.display='block';">Show pinyin</button>
<div id="pinyin-div" class="pinyin">{{Pinyin}}</div>
<div>{{AudioButtons}}</div>
<div class="meta">{{Meta}}</div>
<a href="{{SourceUrl}}" class="source-link">source</a>
                `,
                Back: `
<div class="hanzi">{{Hanzi}}</div>
<div class="pinyin" style="display:block;">{{Pinyin}}</div>
<div>{{AudioButtons}}</div>
<hr id=answer>
<div class="meaning">{{Meaning}}</div>
<div class="meta">{{Meta}}</div>
<a href="{{SourceUrl}}" class="source-link">source</a>
                `
            }
        ]
    };
    await invokeAnki('createModel', modelDefinition);
    logger(`Created model ${MODEL_NAME}`, 'INFO');
}

function extractAudioFilenames(audioMarkup) {
    const regex = /\[sound:(.*?)\]/g;
    const filenames = [];
    let match;
    while ((match = regex.exec(audioMarkup)) !== null) {
        filenames.push(match[1]);
    }
    return filenames;
}

function buildAudioButtonsHtml(pinyin, audioMarkup) {
    const filenames = extractAudioFilenames(audioMarkup);
    if (filenames.length === 0) return '';
    
    let labels = [];
    if (pinyin && pinyin.includes(',')) {
        labels = pinyin.split(',').map(p => p.trim());
    }
    
    let html = '';
    for (let i = 0; i < filenames.length; i++) {
        const label = labels[i] ? `▶ ${escapeHtml(labels[i])}` : `▶ Audio ${i + 1}`;
        html += `<button class="audio-btn" onclick="var a=new Audio('${filenames[i]}');a.play();">${label}</button> `;
    }
    return html;
}

function normalizeHskToTags(hskLevel) {
    if (!hskLevel || !hskLevel.trim()) return [];
    const level = hskLevel.trim();
    if (/\d+/.test(level)) {
        const match = level.match(/\d+/);
        return [`HSK${match[0]}`];
    }
    return [];
}

function formatMeaningHtml(meaning) {
    let sanitized = meaning
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    const safeTags = ['span', 'i', 'em', 'b', 'strong', 'br'];
    safeTags.forEach(tag => {
        const openRegex = new RegExp(`&lt;${tag}([^&]*)&gt;`, 'gi');
        sanitized = sanitized.replace(openRegex, `<${tag}$1>`);
        const closeRegex = new RegExp(`&lt;/${tag}&gt;`, 'gi');
        sanitized = sanitized.replace(closeRegex, `</${tag}>`);
    });

    sanitized = sanitized.replace(/<i>(.*?)<\/i>/gi, '<span class="inline-pinyin"><i>$1</i></span>');
    return sanitized;
}

function buildMetaHtml(tags, rawHskLevel) {
    let html = '';
    if (tags.length > 0) {
        html += `<span style="background:#00bcd4;color:white;padding:2px 6px;border-radius:3px;">${tags.join(' ')}</span>`;
    }
    return html;
}

function parseEntryLine(line, lineNumber, currentDeckName, sourceUrl) {
    const parts = line.split(' | ');
    if (parts.length < 5) {
        logger(`Line ${lineNumber} skipped (malformed, expected 5 parts): ${line}`, 'WARNING');
        return null;
    }

    let [hanzi, pinyinStr, trans, hsk, audioMarkup] = parts;
    hanzi = hanzi.trim();
    pinyinStr = pinyinStr.trim();
    const tags = normalizeHskToTags(hsk);
    const audioFiles = extractAudioFilenames(audioMarkup || '');

    return {
        deckName: currentDeckName,
        hanzi,
        pinyin: pinyinStr,
        meaning: trans,
        hskRaw: (hsk || '').trim(),
        tags,
        audioMarkup: (audioMarkup || '').trim(),
        audioFiles,
        sourceUrl
    };
}

async function uploadMedia(filename, fullPath) {
    if (!fs.existsSync(fullPath)) return false;
    try {
        const fileData = fs.readFileSync(fullPath).toString('base64');
        await invokeAnki('storeMediaFile', {
            filename: filename,
            data: fileData
        });
        return true;
    } catch (e) {
        logger(`Error uploading media ${filename}: ${e.message}`, 'ERROR');
        return false;
    }
}

async function findExistingNote(deckName, hanzi, pinyin) {
    const query = `"deck:${deckName}" "Hanzi:${hanzi}"`;
    const notes = await invokeAnki('findNotes', { query });
    if (notes.length === 0) return false;
    
    const infoList = await invokeAnki('notesInfo', { notes });
    for (const info of infoList) {
        const existingPinyin = info.fields.Pinyin.value;
        if (existingPinyin === escapeHtml(pinyin)) {
            return true;
        }
    }
    return false;
}

async function addNote(entry) {
    const isDuplicate = await findExistingNote(entry.deckName, entry.hanzi, entry.pinyin);
    if (isDuplicate) return 'DUPLICATE';

    for (const filename of entry.audioFiles) {
        const fullPath = path.join(AUDIO_DIR, filename);
        if (!fs.existsSync(fullPath)) return 'MISSING_AUDIO';
    }

    for (const filename of entry.audioFiles) {
        const fullPath = path.join(AUDIO_DIR, filename);
        await uploadMedia(filename, fullPath);
    }

    const note = {
        deckName: entry.deckName,
        modelName: MODEL_NAME,
        fields: {
            Hanzi: escapeHtml(entry.hanzi),
            Pinyin: escapeHtml(entry.pinyin),
            Meaning: formatMeaningHtml(entry.meaning),
            Audio: entry.audioMarkup,
            AudioButtons: buildAudioButtonsHtml(entry.pinyin, entry.audioMarkup),
            Meta: buildMetaHtml(entry.tags, entry.hskRaw),
            SourceUrl: escapeHtml(entry.sourceUrl)
        },
        options: { allowDuplicate: true },
        tags: entry.tags
    };

    try {
        await invokeAnki('addNote', { note });
        return 'SUCCESS';
    } catch (e) {
        logger(`Error adding note for ${entry.hanzi}: ${e.message}`, 'ERROR');
        return 'ERROR';
    }
}

async function main() {
    logger('Starting Anki Import Process', 'INFO');
    
    if (!fs.existsSync(DATA_FILE)) {
        logger(`Data file missing: ${DATA_FILE}`, 'FATAL');
        process.exit(1);
    }

    // Ensure connection first (which might start Anki)
    await invokeAnki('version');
    await ensureModel();

    const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
    let sourceUrl = '';
    let rootDeckName = 'ChineseNews'; // Fallback

    const stats = { added: 0, skipped: 0, errors: 0 };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('# URL:')) {
            sourceUrl = line.substring(6).trim();
            continue;
        }
        
        if (line.startsWith('# ') && !line.startsWith('## ')) {
            rootDeckName = line.substring(2).trim();
            await ensureDeck(rootDeckName);
            continue;
        }

        // Ignore subtitles if any sneak in
        if (line.startsWith('##')) continue;

        const entry = parseEntryLine(line, i + 1, rootDeckName, sourceUrl);
        if (!entry) {
            stats.errors++;
            continue;
        }
        
        const result = await addNote(entry);
        if (result === 'SUCCESS') stats.added++;
        else if (result === 'ERROR') stats.errors++;
        else stats.skipped++;
    }

    logger(`--- IMPORT COMPLETE ---`, 'INFO');
    logger(`Added: ${stats.added}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`, 'INFO');
    console.log(`\n✅ Імпорт в Anki завершено! Додано карток: ${stats.added}`);
}

module.exports = { importAnki: main };

if (require.main === module) {
    main().catch(e => {
        logger(`Fatal error: ${e.message}`, 'FATAL');
        console.error(e);
    });
}
