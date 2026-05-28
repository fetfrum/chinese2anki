const fs = require('fs');
const path = require('path');
const { default: ApkgExport } = require('./anki-export/index.js'); // Use local fork

const MODEL_CSS = `
.card {
  font-family: "Noto Sans", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 20px;
  text-align: center;
  color: #222;
  background-color: #fff;
}

.card-wrap {
  padding: 24px 16px;
}

.hanzi {
  font-size: 42px;
  font-weight: 600;
  margin-bottom: 12px;
  line-height: 1.2;
}

.pinyin {
  font-size: 24px;
  color: #666;
  margin-top: 12px;
  margin-bottom: 14px;
}

.meaning {
  font-size: 28px;
  color: #111;
  margin-top: 16px;
  line-height: 1.45;
}

.audio-controls {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  margin-bottom: 14px;
}

.audio-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #b9c2d0;
  border-radius: 999px;
  background: #f7f9fc;
  color: #24364f;
  cursor: pointer;
  font-size: 16px;
}

.audio-btn:hover {
  background: #eef3fa;
}

.toggle-btn {
  font-size: 16px;
  padding: 8px 14px;
  border: 1px solid #bbb;
  border-radius: 8px;
  background: #f5f5f5;
  cursor: pointer;
}

.hidden {
  display: none;
}

.inline-pinyin {
  color: #1f3b73;
  font-style: italic;
}

.meta {
  margin-top: 14px;
}

.hsk-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2f7;
  color: #41556f;
  font-size: 14px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.divider {
  margin: 18px auto;
  width: 60%;
}
`;

const TEMPLATE = {
    question: `
<div class="card-wrap">
  <div class="hanzi">{{Hanzi}}</div>

  <button type="button" class="toggle-btn" onclick="togglePinyin()">
    Show pinyin
  </button>

  <div id="pinyinBlock" class="pinyin hidden">
    {{Pinyin}}
  </div>

  <div class="audio-controls">
    {{AudioButtons}}
  </div>

  {{#Meta}}
  <div class="meta">{{Meta}}</div>
  {{/Meta}}

  <div class="audio-raw visually-hidden">{{Audio}}</div>
</div>

<script>
if (typeof togglePinyin !== 'function') {
    window.togglePinyin = function() {
      var el = document.getElementById('pinyinBlock');
      var btn = document.querySelector('.toggle-btn');
      if (!el || !btn) return;
      if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        btn.textContent = 'Hide pinyin';
      } else {
        el.classList.add('hidden');
        btn.textContent = 'Show pinyin';
      }
    }
}
</script>
`,
    answer: `
<div class="card-wrap">
  <div class="hanzi">{{Hanzi}}</div>
  <div class="pinyin">{{Pinyin}}</div>

  <div class="audio-controls">
    {{AudioButtons}}
  </div>

  <hr id="answer" class="divider">

  <div class="meaning">{{Meaning}}</div>

  {{#Meta}}
  <div class="meta">{{Meta}}</div>
  {{/Meta}}

  <div class="audio-raw visually-hidden">{{Audio}}</div>
</div>
`
};

function formatMeaningHtml(meaning) {
    if (!meaning) return '';
    let sanitized = (meaning || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // Styling inline pinyin
    sanitized = sanitized.replace(/\(<i>([^<]+)<\/i>\)/g, '(<i class="inline-pinyin">$1</i>)');
    return sanitized;
}

function escapeHtml(value) {
    if (!value) return '';
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildMetaHtml(hskRaw) {
    if (!hskRaw || String(hskRaw).trim() === '' || String(hskRaw) === '0') return '';
    return `<span class="hsk-badge">HSK${escapeHtml(String(hskRaw).trim())}</span>`;
}

function buildAudioButtonsHtml(pinyins, filenames) {
    if (!filenames || filenames.length === 0) return '';
    let html = '';
    for (let i = 0; i < filenames.length; i++) {
        const label = pinyins[i] || `Audio ${i + 1}`;
        // Generates identical structure to Duo project
        html += `<button type="button" class="audio-btn" onclick="var links = document.querySelectorAll('.audio-raw span[data-src], .audio-raw a'); if(links[${i}]) links[${i}].click();">▶ ${escapeHtml(label)}</button> `;
    }
    return html;
}

async function createDeck(jsonPath, audioDir, outPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const deckName = data.deck_title || 'ChineseDuoDeck';
    
    const apkg = new ApkgExport(deckName, {
        questionFormat: TEMPLATE.question,
        answerFormat: TEMPLATE.answer,
        css: MODEL_CSS
    });

    for (const card of (data.cards || [])) {
        const hskStr = card.hsk ? card.hsk.toString() : '';
        const pinyins = (card.pinyin || '').split(',').map(s => s.trim()).filter(s => s);
        
        // Resolve directory issues
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

        apkg.addCard({
            Hanzi: card.hanzi || '',
            Pinyin: card.pinyin || '',
            Meaning: formatMeaningHtml(card.ukrainian),
            Audio: audioFiles.join(''),
            AudioButtons: buildAudioButtonsHtml(pinyins, audioFilenames),
            Meta: buildMetaHtml(hskStr)
        }, { tags: [hskStr ? `HSK${hskStr}` : ''] });
    }

    const zip = await apkg.save();
    fs.writeFileSync(outPath, zip, 'binary');
    return outPath;
}

module.exports = { createDeck };
