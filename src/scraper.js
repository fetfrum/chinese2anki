require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const AIAgent = require('./ai_agent');

class NewsScraper {
    constructor(url) {
        this.url = url || process.argv[2];
        if (!this.url && require.main === module) {
            console.error('Usage: node scrape_news.js <URL>');
            process.exit(1);
        }
        this.outputFile = path.join(__dirname, 'txt', 'vocab_news.txt');
        this.reqFile = path.join(__dirname, 'txt', 'antigravity_req.txt');
        this.resFile = path.join(__dirname, 'txt', 'antigravity_res.txt');
        
        // Ensure txt directory exists
        const txtDir = path.join(__dirname, 'txt');
        if (!fs.existsSync(txtDir)) {
            fs.mkdirSync(txtDir, { recursive: true });
        }
    }

    async processAntigravity(promptText) {
        const reqContent = `Ви працюєте в режимі Antigravity (обхід API лімітів).\n\nЗавдання:\nЗгенеруйте словник на основі тексту згідно з правилами ПРОМПТУ.\n\n=== ПРОМПТ ЕКСТРАКТОРА ===\n${promptText}`;
        fs.writeFileSync(this.reqFile, reqContent, 'utf8');
        
        console.log('\n======================================================');
        console.log('⚠️ РЕЖИМ ANTIGRAVITY АКТИВОВАНО');
        console.log('Попросіть мене (вашого ШІ-асистента в чаті) обробити файл:');
        console.log('txt/antigravity_req.txt');
        console.log('\nОчікування результату у txt/antigravity_res.txt...');
        console.log('======================================================\n');
        
        while (!fs.existsSync(this.resFile)) {
            await new Promise(r => setTimeout(r, 2000));
        }
        
        const result = fs.readFileSync(this.resFile, 'utf8').trim();
        fs.unlinkSync(this.reqFile);
        fs.unlinkSync(this.resFile);
        return result;
    }

    async extractText(url) {
        console.log(`🌍 Fetching URL: ${url}`);
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        let html = await page.content();
        let pageTitle = await page.title();
        await browser.close();

        // Use Readability to extract the main article content and ignore UI decorations
        const doc = new JSDOM(html, { url });
        const reader = new Readability(doc.window.document);
        const article = reader.parse();
        
        let content = article ? article.textContent : html.replace(/<[^>]+>/g, ' '); // fallback if parsing fails
        
        content = content.replace(/\s+/g, ' ').trim();
        
        // DeepSeek can easily handle 64K tokens, so we don't need a strict 1000 char limit.
        // We will cap at 20,000 chars just to be safe from absolute massive Wikipedia pages breaking JSON.
        if (content.length > 20000) {
            console.log(`✂️ Text is too long (${content.length} chars). Truncating to 20,000 characters...`);
            content = content.substring(0, 20000);
        }
        
        const title = (article && article.title) ? article.title : pageTitle;
        return { title, content };
    }

    async run() {
        try {
            const extracted = await this.extractText(this.url);
            const content = extracted.content;
            const prompt = fs.readFileSync(path.join(__dirname, 'prompts', 'news_scraper.md'), 'utf8');
            const fullPrompt = `${prompt}\n\n=== RAW WEBPAGE TEXT ===\n${content}`;
            
            let result = '';
            if (process.env.USE_ANTIGRAVITY === 'true') {
                result = await this.processAntigravity(fullPrompt);
            } else {
                console.log('🧠 Sending to AI for segmentation and sorting...');
                const agent = new AIAgent({ name: 'NewsExtractor' });
                await agent.init();
                result = await agent.callAI(fullPrompt);
                
                // Clean markdown code blocks if any
                result = result.replace(/```[\s\S]*?\n/g, '').replace(/```/g, '').trim();
            }
            
            // Prepend URL to the output
            const finalOutput = `# URL: ${this.url}\n${result}\n`;
            
            fs.writeFileSync(this.outputFile, finalOutput, 'utf8');
            console.log(`✅ Словник успішно згенеровано та збережено у ${this.outputFile}!`);
            
        } catch (error) {
            console.error('❌ Error extracting news:', error.message);
        }
    }
}

module.exports = { NewsScraper };

if (require.main === module) {
    const scraper = new NewsScraper();
    scraper.run();
}
