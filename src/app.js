require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const JSON5 = require('json5');

const { processText } = require('./preprocessor');
const AIAgent = require('./ai_agent');
const { NewsScraper } = require('./scraper');

const app = express();
const PORT = 3000;

const db = new sqlite3.Database(path.join(__dirname, '..', 'users.db'));
const dataDir = path.join(__dirname, '..', 'data');
const sessionsDir = path.join(dataDir, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

// Configs
const MAX_CARDS = 300;
const REGEN_PER_DAY = 10;

function safeJSONParse(str) {
    try {
        return JSON5.parse(str);
    } catch (e) {
        let cleaned = str;
        
        // Fix trailing commas
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
        
        // Try to recover from truncated response (e.g. max_tokens limit hit)
        // Find the last complete object in the cards array
        const lastCompleteObj = cleaned.lastIndexOf('},');
        if (lastCompleteObj !== -1) {
            // Cut off the incomplete object and close the array and root object
            const truncated = cleaned.substring(0, lastCompleteObj + 1) + '\n  ]\n}';
            try {
                return JSON5.parse(truncated);
            } catch (err2) {}
        }
        
        // If it still fails, try to extract just the outermost object/array
        const firstBrace = Math.min(cleaned.indexOf('{') === -1 ? Infinity : cleaned.indexOf('{'), cleaned.indexOf('[') === -1 ? Infinity : cleaned.indexOf('['));
        const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
        
        if (firstBrace !== Infinity && lastBrace !== -1 && firstBrace < lastBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }
        return JSON5.parse(cleaned); // Will throw if still invalid
    }
}

function writeLog(type, message, userId = null, sessionId = null) {
    db.run('INSERT INTO logs (type, message, user_id, session_id) VALUES (?, ?, ?, ?)', [type, message, userId, sessionId], err => {
        if (err) console.error('Failed to write log:', err);
    });
}

// Passport Setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
    callbackURL: "/auth/google/callback",
    proxy: true
  },
  function(accessToken, refreshToken, profile, cb) {
      db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, row) => {
          if (err) return cb(err);
          const today = new Date().toISOString().split('T')[0];
          
          if (!row) {
              const pic = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '';
              db.run('INSERT INTO users (google_id, display_name, picture, tokens_remaining, last_reset_date) VALUES (?, ?, ?, ?, ?)',
              [profile.id, profile.displayName, pic, MAX_CARDS, today], function(err) {
                  if (err) return cb(err);
                  return cb(null, { id: this.lastID, google_id: profile.id, display_name: profile.displayName, picture: pic, tokens_remaining: MAX_CARDS });
              });
          } else {
              if (row.banned_until) {
                  const banDate = new Date(row.banned_until);
                  if (new Date() < banDate) {
                      return cb(null, false, { message: `Account banned until ${row.banned_until}` });
                  } else {
                      db.run('UPDATE users SET banned_until = NULL WHERE id = ?', [row.id]);
                      row.banned_until = null;
                  }
              }

              if (row.last_reset_date !== today) {
                  const last = new Date(row.last_reset_date);
                  const now = new Date(today);
                  const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
                  
                  if (diffDays > 0) {
                      let newTokens = row.tokens_remaining + (diffDays * REGEN_PER_DAY);
                      if (newTokens > MAX_CARDS) newTokens = MAX_CARDS;
                      db.run('UPDATE users SET tokens_remaining = ?, last_reset_date = ? WHERE id = ?', [newTokens, today, row.id]);
                      row.tokens_remaining = newTokens;
                  }
              }
              writeLog('ACTION', 'User logged in', row.id);
              return cb(null, row);
          }
      });
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => done(err, row));
});

app.use(cors());
app.use('/media', express.static(path.join(dataDir, 'speech')));
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..') }),
    secret: process.env.SESSION_SECRET || 'supersecret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    res.send(`<script>window.opener ? (window.opener.postMessage('auth_success', '*'), window.close()) : window.location.href='/';</script>`);
});

app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: req.isAuthenticated(), user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ success: true }); });
    });
});

function checkAuth(req, res, next) {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

function checkAdmin(req, res, next) {
    if (!req.isAuthenticated() || req.user.is_admin !== 1) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

// Admin Routes
app.get('/api/admin/users', checkAdmin, (req, res) => {
    db.all('SELECT id, google_id, display_name, picture, tokens_remaining, last_reset_date, banned_until, is_admin FROM users', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/users/:id/tokens', checkAdmin, (req, res) => {
    const { tokens } = req.body;
    const userId = req.params.id;
    if (typeof tokens !== 'number') return res.status(400).json({ error: 'Invalid tokens' });
    
    db.run('UPDATE users SET tokens_remaining = ? WHERE id = ?', [tokens, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        writeLog('ACTION', `Admin updated tokens for user ${userId} to ${tokens}`, req.user.id);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/ban', checkAdmin, (req, res) => {
    const { banned_until } = req.body; // YYYY-MM-DD or null
    const userId = req.params.id;
    
    db.run('UPDATE users SET banned_until = ? WHERE id = ?', [banned_until || null, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        writeLog('ACTION', `Admin set ban for user ${userId} to ${banned_until || 'null'}`, req.user.id);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/role', checkAdmin, (req, res) => {
    const { is_admin } = req.body; 
    const userId = req.params.id;
    
    if (userId === '1' && !is_admin) {
        return res.status(403).json({ error: 'Не можна забрати права у головного адміністратора' });
    }
    
    db.run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        writeLog('ACTION', `Changed admin role of user ${userId} to ${is_admin}`, req.user.id);
        res.json({ success: true });
    });
});

app.get('/api/admin/logs', checkAdmin, (req, res) => {
    const { type, page = 1, limit = 50, userId, sessionId } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM logs WHERE 1=1';
    let params = [];
    
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }
    if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
    }
    if (sessionId) {
        query += ' AND session_id LIKE ?';
        params.push(`%${sessionId}%`);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM logs WHERE 1=1';
        let countParams = [];
        if (type) { countQuery += ' AND type = ?'; countParams.push(type); }
        if (userId) { countQuery += ' AND user_id = ?'; countParams.push(userId); }
        if (sessionId) { countQuery += ' AND session_id LIKE ?'; countParams.push(`%${sessionId}%`); }
        
        db.get(countQuery, countParams, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
                total: row.count,
                page: parseInt(page),
                totalPages: Math.ceil(row.count / limit)
            });
        });
    });
});

app.post('/api/scrape', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });
        const scraper = new NewsScraper(url);
        let { title, content } = await scraper.extractText(url);
        
        if (title) {
            try {
                const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=${encodeURIComponent(title)}`;
                const gtxRes = await fetch(gtxUrl);
                const gtxData = await gtxRes.json();
                if (gtxData && gtxData[0] && gtxData[0][0] && gtxData[0][0][0]) {
                    title = gtxData[0].map(item => item[0]).join('');
                }
            } catch (e) {
                console.error('GTX Translation failed:', e);
            }
        }
        
        res.json({ title, content });
    } catch (error) {
        writeLog('ERROR', `Scraping error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/estimate', (req, res) => {
    const { text, mode, hskFrom, hskTo } = req.body;
    const result = processText(text, parseInt(hskFrom) || 1, parseInt(hskTo) || 6, mode || 'words');
    res.json({ estimatedCards: result.estimatedCards, maxLevel: hskTo, mode });
});

app.post('/api/ai-request', checkAuth, async (req, res) => {
    try {
        const { text, url, title, hskFrom, hskTo, mode } = req.body;
        const sessionId = uuidv4();
        const sessionPath = path.join(sessionsDir, sessionId);
        fs.mkdirSync(sessionPath, { recursive: true });

        // 1. Process text
        const parsedData = processText(text, parseInt(hskFrom) || 1, parseInt(hskTo) || 6, mode || 'words');
        
        // Ensure user has tokens
        if (req.user.tokens_remaining <= 0) {
            return res.status(403).json({ error: 'Баланс токенів вичерпано. Дочекайтеся відновлення.' });
        }
        if (parsedData.estimatedCards > req.user.tokens_remaining) {
            return res.status(403).json({ error: `Розмір тексту занадто великий. Очікується ~${parsedData.estimatedCards} карток, а ваш баланс становить ${req.user.tokens_remaining} токенів. Будь ласка, зменште текст.` });
        }

        // Send status immediately
        res.json({ status: 'started', sessionId });
        
        writeLog('ACTION', `Отримано запит на генерацію (режим: ${mode}, HSK: ${hskFrom}-${hskTo})`, req.user.id, sessionId);

        // Run AI in background
        (async () => {
            try {
                writeLog('ACTION', `Ініціалізація AI агента`, req.user.id, sessionId);
                const agent = new AIAgent();
                await agent.init();
                
                const promptTemplate = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'news_scraper.md'), 'utf8');
                const p = promptTemplate.replace('HSK 1-6', `HSK ${hskFrom || 1}-${hskTo == 79 ? 'Будь-які' : hskTo || 6}`);
                
                let dataToFeed = parsedData.dataToFeed || [];
                
                writeLog('ACTION', `Відправка даних до AI моделі (Батчами по 25 слів)...`, req.user.id, sessionId);
                
                const BATCH_SIZE = 25;
                const cards = [];
                let deckTitle = (title && title.trim().length > 0) ? title.trim() : 'Згенерована колода';

                for (let i = 0; i < dataToFeed.length; i += BATCH_SIZE) {
                    const batch = dataToFeed.slice(i, i + BATCH_SIZE);
                    const fullPrompt = `${p}\n\n=== DATA ===\n` + JSON.stringify(batch);
                    
                    try {
                        const resultStr = await agent.callAI(fullPrompt);
                        const lines = resultStr.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('```'));
                        
                        for (const line of lines) {
                            if (!line.includes('|')) continue;
                            const parts = line.split('|').map(p => p.trim());
                            if (parts.length >= 8) { // 9 fields expected, minimum 8
                                cards.push({
                                    type: parts[0] || 'word',
                                    hanzi: parts[1] || '',
                                    pinyin: parts[2] || '',
                                    ukrainian: parts[3] || '',
                                    hsk: parseInt(parts[4]) || 0,
                                    pos: parts[5] || '',
                                    example_hanzi: parts[6] || '',
                                    example_pinyin: parts[7] || '',
                                    example_ukr: parts[8] || ''
                                });
                            }
                        }
                    } catch (batchErr) {
                        writeLog('ERROR', `Помилка батчу ${i}: ${batchErr.message}`, req.user.id, sessionId);
                    }
                }
                
                let resultJson = { deck_title: deckTitle, cards };
                
                if (cards.length === 0) {
                    throw new Error('Жодної картки не знайдено у відповіді AI.');
                }
                
                fs.writeFileSync(path.join(sessionPath, 'vocab_news.json'), JSON.stringify(resultJson, null, 2));
                
                // Deduct tokens based on actual cards
                const generatedCount = resultJson.cards ? resultJson.cards.length : 0;
                const newBalance = req.user.tokens_remaining - generatedCount;
                
                db.run('UPDATE users SET tokens_remaining = ? WHERE id = ?', [newBalance, req.user.id]);
                
                // Add generation stat
                const date = new Date().toISOString().split('T')[0];
                const time = new Date().toTimeString().split(' ')[0];
                db.run('INSERT INTO generations (user_id, uuid, date, time, deck_name, cards_generated) VALUES (?, ?, ?, ?, ?, ?)',
                    [req.user.id, sessionId, date, time, resultJson.deck_title || 'Unknown', generatedCount]);
                
                writeLog('ACTION', `Успішно згенеровано ${generatedCount} карток`, req.user.id, sessionId);
                fs.writeFileSync(path.join(sessionPath, 'status.txt'), 'COMPLETED');
            } catch (err) {
                console.error('AI Error:', err);
                writeLog('ERROR', `Помилка генерації AI: ${err.message}`, req.user.id, sessionId);
                fs.writeFileSync(path.join(sessionPath, 'status.txt'), 'ERROR: ' + err.message);
            }
        })();
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ai-status/:sessionId', checkAuth, (req, res) => {
    const sessionPath = path.join(sessionsDir, req.params.sessionId);
    if (!fs.existsSync(sessionPath)) return res.json({ status: 'not_found' });
    
    const statusFile = path.join(sessionPath, 'status.txt');
    if (!fs.existsSync(statusFile)) return res.json({ status: 'pending' });
    
    const status = fs.readFileSync(statusFile, 'utf8');
    res.json({ status: status.trim() });
});

app.get('/api/session-vocab/:sessionId', checkAuth, (req, res) => {
    const vocabFile = path.join(sessionsDir, req.params.sessionId, 'vocab_news.json');
    if (!fs.existsSync(vocabFile)) return res.status(404).json({ error: 'Vocab not found' });
    try {
        const data = JSON.parse(fs.readFileSync(vocabFile, 'utf8'));
        
        // Check for existing audio files
        if (data.cards) {
            data.cards.forEach(card => {
                let dir = card.type + 's';
                if (card.type === 'grammar') dir = 'grammar';
                
                const pinyins = (card.pinyin || '').split(',').map(s => s.trim()).filter(s => s);
                card.audioExists = false;
                card.audioUrl = '';
                
                for (const p of pinyins) {
                    const fileName = `${Buffer.from(card.hanzi + '_' + p).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}.mp3`;
                    const filePath = path.join(dataDir, 'speech', dir, fileName);
                    if (fs.existsSync(filePath)) {
                        card.audioExists = true;
                        card.audioUrl = `/media/${dir}/${fileName}`;
                        break;
                    }
                }
            });
        }
        
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Parse error' });
    }
});

app.post('/api/update-vocab', checkAuth, (req, res) => {
    const { sessionId, cards } = req.body;
    if (!sessionId || !cards) return res.status(400).json({ error: 'Missing data' });
    
    const vocabFile = path.join(sessionsDir, sessionId, 'vocab_news.json');
    if (!fs.existsSync(vocabFile)) return res.status(404).json({ error: 'Session not found' });
    
    try {
        const data = JSON.parse(fs.readFileSync(vocabFile, 'utf8'));
        data.cards = cards;
        fs.writeFileSync(vocabFile, JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update vocab' });
    }
});

const { createDeck } = require('./export_anki');
const AudioQueue = require('./audio_queue');
const audioQueue = new AudioQueue(db, dataDir);

app.get('/api/tts-status/:sessionId', checkAuth, (req, res) => {
    const progress = audioQueue.getProgress(req.params.sessionId);
    if (!progress) return res.json({ status: 'not_found' });
    res.json({ status: 'processing', progress });
});

app.post('/api/export-apkg', checkAuth, async (req, res) => {
    const { sessionId } = req.body;
    const sessionPath = path.join(sessionsDir, sessionId);
    if (!fs.existsSync(sessionPath)) return res.status(404).json({ error: 'Session not found' });
    
    try {
        const jsonPath = path.join(sessionPath, 'vocab_news.json');
        
        // Start TTS first if not started
        if (!audioQueue.getProgress(sessionId)) {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            audioQueue.addTasks(req.user.id, sessionId, data.cards || []);
            return res.json({ status: 'tts_started' });
        }
        
        // Check TTS status
        const progress = audioQueue.getProgress(sessionId);
        if (progress.done + progress.error < progress.total) {
            return res.json({ status: 'tts_running', progress });
        }
        
        // TTS complete, generate APKG
        const outPath = path.join(sessionPath, 'deck.apkg');
        await createDeck(jsonPath, audioQueue.speechDir, outPath);
        
        res.json({ status: 'ready', downloadUrl: `/api/download/${sessionId}` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/download/:sessionId', checkAuth, (req, res) => {
    const sessionPath = path.join(sessionsDir, req.params.sessionId);
    const apkFile = path.join(sessionPath, 'deck.apkg');
    
    if (fs.existsSync(apkFile)) {
        // Read JSON to get deck title for the file name
        let filename = 'ChineseDuoDeck.apkg';
        try {
            const data = JSON.parse(fs.readFileSync(path.join(sessionPath, 'vocab_news.json')));
            if (data.deck_title) {
                // Sanitize filename but keep spaces
                filename = data.deck_title.replace(/[\\/:*?"<>|]/g, '') + '.apkg';
            }
        } catch(e) {}
        
        res.download(apkFile, filename, (err) => {
            if (!err) {
                // Cleanup session after download
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        });
    } else {
        res.status(404).send('File not found');
    }
});

app.get('/api/user/history', checkAuth, (req, res) => {
    db.all('SELECT * FROM generations WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/user/delete', checkAuth, (req, res) => {
    const tokens = req.user.tokens_remaining;
    let penaltyDays = 30;
    if (tokens < 0) {
        penaltyDays += Math.ceil(Math.abs(tokens) / 10);
    }
    
    const bannedUntil = new Date();
    bannedUntil.setDate(bannedUntil.getDate() + penaltyDays);
    const bannedUntilStr = bannedUntil.toISOString().split('T')[0];
    
    db.serialize(() => {
        db.run('DELETE FROM generations WHERE user_id = ?', [req.user.id]);
        db.run('UPDATE users SET display_name = ?, picture = ?, banned_until = ? WHERE id = ?', 
            ['Deleted User', '', bannedUntilStr, req.user.id], (err) => {
            req.logout(() => {
                req.session.destroy(() => res.json({ success: true, bannedUntil: bannedUntilStr }));
            });
        });
    });
});

app.listen(PORT, () => console.log(`🚀 Chinese2Anki server running on http://localhost:${PORT}`));
