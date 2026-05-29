const { Segment, useDefault } = require('segmentit');
const hsk = require('@leonsilicon/hsk3.0');

const segmentit = useDefault(new Segment());

// Pre-compute HSK map
const hskMap = {};
[1, 2, 3, 4, 5, 6, 7].forEach(level => {
    const key = level === 7 ? 'hsk30WordsLevel7to9' : `hsk30WordsLevel${level}`;
    if (hsk[key]) {
        hsk[key].forEach(w => {
            hskMap[w] = level;
        });
    }
});

const PUNCTUATION = new Set(['。', '！', '？', '.', '!', '?', '\n']);
const CLAUSE_PUNCTUATION = new Set(['，', ',', '、', '：', ':', '；', ';', '“', '”', '‘', '’', '（', '）', '(', ')', '《', '》', '【', '】', '—', '…', ' ', '　']);

function getHSKLevel(word) {
    return hskMap[word] || 99; // 99 means non-HSK or proper noun
}

function cleanAndPushChunk(tokenObjs, chunksOut) {
    let chunkText = tokenObjs.map(x => x.w).join('');
    let cleaned = chunkText.replace(/^[\s\p{P}\p{S}]+/gu, '').replace(/[\s\p{P}\p{S}]+$/gu, '');
    
    if (!cleaned) return;
    if (!/[\u4e00-\u9fa5]/.test(cleaned)) return; // must contain Chinese characters
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(cleaned)) return; // filter out Japanese Hiragana/Katakana
    
    // filter dates, page numbers, editions (e.g. "2023年", "1382年", "506頁", "第33代")
    if (/^第?[\d\s\p{P}\p{S}]+[\u4e00-\u9fa5]{1,2}$/u.test(cleaned)) return;
    
    // filter very short or single character chunks (handled by words mode if important)
    if (cleaned.length <= 1) return;
    
    chunksOut.push(cleaned);
}

function processText(text, hskFrom = 1, hskTo = 6, mode = 'words') {
    // modes: 'words', 'chunks', 'grammar'
    const tokens = segmentit.doSegment(text);
    
    const uniqueWords = new Map(); // word -> context
    const chunks = [];
    const sentences = [];
    
    let currentSentence = [];
    
    for (const token of tokens) {
        currentSentence.push(token);
        
        if (PUNCTUATION.has(token.w)) {
            processSentence(currentSentence, uniqueWords, chunks, sentences, hskFrom, hskTo, mode);
            currentSentence = [];
        }
    }
    
    if (currentSentence.length > 0) {
        processSentence(currentSentence, uniqueWords, chunks, sentences, hskFrom, hskTo, mode);
    }
    
    // Convert to target format and sort by HSK
    const formattedWords = Array.from(uniqueWords.keys()).map(w => {
        return { type: "word", text: w, context: uniqueWords.get(w), hsk: getHSKLevel(w) };
    }).sort((a, b) => a.hsk - b.hsk).map(i => { delete i.hsk; return i; });

    let dataToFeed = formattedWords;
    let estimatedCards = formattedWords.length;

    if (mode === 'chunks' || mode === 'grammar') {
        const uniqueChunks = Array.from(new Set(chunks)); // simple deduplication
        dataToFeed = dataToFeed.concat(uniqueChunks.map(c => ({ type: "chunk", text: c, context: c })));
        estimatedCards += uniqueChunks.length;
    }
    
    // Grammar regex extraction
    if (mode === 'grammar') {
        const grammarPatterns = [
            /(如果|要是).+(就|那么).+/g,
            /(因为|由于).+(所以|因此).+/g,
            /(虽然|尽管).+(但是|可是).+/g,
            /(不但|不仅).+(而且|还).+/g,
            /(只有).+(才).+/g,
            /(只要).+(就).+/g,
            /(无论|不论).+(都|也).+/g
        ];
        sentences.forEach(s => {
            grammarPatterns.forEach(r => {
                const match = s.match(r);
                if (match) {
                    dataToFeed.push({ type: "grammar", text: match[0], context: s });
                    estimatedCards++;
                }
            });
        });
    }

    return {
        dataToFeed,
        estimatedCards,
        rawTokens: tokens
    };
}

function processSentence(tokenObjs, uniqueWordsMap, chunksOut, sentencesOut, hskFrom, hskTo, mode) {
    // Filter out punctuation for counting real words
    const realWords = tokenObjs.filter(t => !PUNCTUATION.has(t.w) && !CLAUSE_PUNCTUATION.has(t.w));
    if (realWords.length === 0) return;
    
    const sentenceText = tokenObjs.map(t => t.w).join('');
    
    // Process single words
    for (const rw of realWords) {
        const level = getHSKLevel(rw.w);
        if (level >= hskFrom && level <= hskTo) {
            if (!uniqueWordsMap.has(rw.w)) {
                uniqueWordsMap.set(rw.w, sentenceText);
            }
        }
    }
    
    if (mode === 'words') return; // Skip chunks/sentences if only words
    
    if (realWords.length > 6) {
        // Split by clause punctuation first
        let currentChunk = [];
        let realWordCount = 0;
        
        for (const t of tokenObjs) {
            currentChunk.push(t);
            if (!PUNCTUATION.has(t.w) && !CLAUSE_PUNCTUATION.has(t.w)) {
                realWordCount++;
            }
            
            if (CLAUSE_PUNCTUATION.has(t.w) || realWordCount >= 5) {
                if (realWordCount > 0) {
                    cleanAndPushChunk(currentChunk, chunksOut);
                }
                currentChunk = [];
                realWordCount = 0;
            }
        }
        if (realWordCount > 0) {
            cleanAndPushChunk(currentChunk, chunksOut);
        }
    } else {
        cleanAndPushChunk(tokenObjs, chunksOut);
    }
    
    // Always store sentences for grammar matching
    sentencesOut.push(sentenceText);
}

module.exports = { processText, getHSKLevel };
