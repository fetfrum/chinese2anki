const fs = require('fs');
const path = require('path');
const { default: ApkgExport } = require('anki-apkg-export');

const MODEL_CSS = `
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
`;

const TEMPLATE = {
    question: `
<div class="hanzi">{{Hanzi}}</div>
<button class="show-pinyin-btn" onclick="document.getElementById('pinyin-div').style.display='block';">Show pinyin</button>
<div id="pinyin-div" class="pinyin">{{Pinyin}}</div>
<div>{{AudioButtons}}</div>
<div class="meta">{{Meta}}</div>
<a href="{{SourceUrl}}" class="source-link">source</a>
`,
    answer: `
<div class="hanzi">{{Hanzi}}</div>
<div class="pinyin" style="display:block;">{{Pinyin}}</div>
<div>{{AudioButtons}}</div>
<hr id=answer>
<div class="meaning">{{Meaning}}</div>
<div class="meta">{{Meta}}</div>
<a href="{{SourceUrl}}" class="source-link">source</a>
`
};

function formatMeaningHtml(meaning) {
    let sanitized = (meaning || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return sanitized;
}

function buildMetaHtml(hskRaw) {
    if (!hskRaw) return '';
    return `<span style="background:#00bcd4;color:white;padding:2px 6px;border-radius:3px;">HSK${hskRaw}</span>`;
}

function buildAudioButtonsHtml(pinyins, filenames) {
    if (!filenames || filenames.length === 0) return '';
    let html = '';
    for (let i = 0; i < filenames.length; i++) {
        const label = pinyins[i] ? `▶ ${pinyins[i]}` : `▶ Audio ${i + 1}`;
        html += `<button class="audio-btn" onclick="var a=new Audio('${filenames[i]}');a.play();">${label}</button> `;
    }
    return html;
}

async function createDeck(jsonPath, audioDir, outPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const deckName = data.deck_title || 'ChineseDuoDeck';
    
    const apkg = new ApkgExport(deckName);

    for (const card of (data.cards || [])) {
        const hskStr = card.hsk ? card.hsk.toString() : '';
        const pinyins = (card.pinyin || '').split(',').map(s => s.trim());
        
        let dir = 'words';
        if (card.type === 'expression') dir = 'expressions';
        if (card.type === 'sentence') dir = 'sentences';

        const audioFiles = [];
        const audioFilenames = [];
        
        for (const p of pinyins) {
            const fileName = `${Buffer.from(card.hanzi + '_' + p).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}.mp3`;
            const filePath = path.join(audioDir, dir, fileName);
            if (fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                apkg.addMedia(fileName, buf);
                audioFiles.push(`[sound:${fileName}]`);
                audioFilenames.push(fileName);
            }
        }

        const fields = {
            Hanzi: card.hanzi || '',
            Pinyin: card.pinyin || '',
            Meaning: formatMeaningHtml(card.ukrainian),
            Audio: audioFiles.join(''),
            AudioButtons: buildAudioButtonsHtml(pinyins, audioFilenames),
            Meta: buildMetaHtml(hskStr),
            SourceUrl: ''
        };

        let front = TEMPLATE.question;
        let back = TEMPLATE.answer;
        
        for (const [key, val] of Object.entries(fields)) {
            const r = new RegExp(`{{${key}}}`, 'g');
            front = front.replace(r, val);
            back = back.replace(r, val);
        }

        apkg.addCard(front, back, { tags: [hskStr ? `HSK${hskStr}` : ''] });
    }

    const zip = await apkg.save();
    fs.writeFileSync(outPath, zip, 'binary');
    return outPath;
}

module.exports = { createDeck };
