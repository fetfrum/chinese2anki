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
app.use(express.json());
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
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/ban', checkAdmin, (req, res) => {
    const { banned_until } = req.body; // YYYY-MM-DD or null
    const userId = req.params.id;
    
    db.run('UPDATE users SET banned_until = ? WHERE id = ?', [banned_until || null, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
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
        res.json({ success: true });
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
        const { text, url, hskFrom, hskTo, mode } = req.body;
        const sessionId = uuidv4();
        const sessionPath = path.join(sessionsDir, sessionId);
        fs.mkdirSync(sessionPath, { recursive: true });

        // 1. Process text
        const parsedData = processText(text, parseInt(hskFrom) || 1, parseInt(hskTo) || 6, mode || 'words');
        
        // Ensure user has tokens
        if (req.user.tokens_remaining <= 0) {
            return res.status(403).json({ error: 'Негативний або нульовий баланс. Зачекайте відновлення токенів.' });
        }

        // Send status immediately
        res.json({ status: 'started', sessionId });

        // Run AI in background
        (async () => {
            try {
                const agent = new AIAgent();
                await agent.init();
                
                const promptTemplate = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'news_scraper.md'), 'utf8');
                const p = promptTemplate.replace('HSK 1-6', `HSK ${hskFrom || 1}-${hskTo == 79 ? 'Будь-які' : hskTo || 6}`);
                
                let dataToFeed = parsedData.words;
                if (mode === 'chunks' || mode === 'sentences') dataToFeed = dataToFeed.concat(parsedData.chunks);
                if (mode === 'sentences') dataToFeed = dataToFeed.concat(parsedData.sentences);
                
                const fullPrompt = `${p}\n\n=== DATA ===\n` + JSON.stringify(dataToFeed);
                
                const resultStr = await agent.callAI(fullPrompt);
                const resultJson = JSON.parse(resultStr);
                
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
                
                fs.writeFileSync(path.join(sessionPath, 'status.txt'), 'COMPLETED');
            } catch (err) {
                console.error('AI Error:', err);
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
    if (status.startsWith('ERROR')) return res.json({ status: 'error', message: status });
    
    res.json({ status: 'completed' });
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
                // Sanitize filename
                filename = data.deck_title.replace(/[^a-zA-Z0-9_а-яА-ЯіІїЇєЄ]/g, '_') + '.apkg';
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
