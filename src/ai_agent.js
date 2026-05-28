const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const fetch = require('node-fetch'); // If Node < 18, but Playwright requires Node 16+ where fetch is standard. Assuming global fetch exists.

class AIAgent {
    constructor(config) {
        this.config = {
            deepSeekKey: process.env.DEEPSEEK_API_KEY,
            geminiKey: process.env.GEMINI_API_KEY,
            orKey: process.env.OPENROUTER_API_KEY,
            ...config
        };
        this.genAI = this.config.geminiKey ? new GoogleGenerativeAI(this.config.geminiKey) : null;
        this.geminiQueue = [];
        this.currentGeminiIdx = 0;
        this.bannedORModels = new Set();
        this.autoModelOR = null;
    }

    async init() {
        if (this.genAI) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.geminiKey}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.models) {
                    this.geminiQueue = data.models
                        .filter(m => {
                            const n = m.name.toLowerCase();
                            return n.includes("gemini") && (n.includes("1.5") || n.includes("2.0")) && 
                                   !n.includes("vision") && !n.includes("tuning") && m.supportedGenerationMethods.includes("generateContent");
                        })
                        .map(m => m.name.replace('models/', ''))
                        .sort((a, b) => (a.includes('2.0') ? -1 : 1));
                    console.log(`[AI] Gemini carousel ready: ${this.geminiQueue.length} models.`);
                }
            } catch (e) {
                this.geminiQueue = ['gemini-2.0-flash', 'gemini-1.5-flash'];
            }
        }
    }

    async findBestFreeModelOR() {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            const data = await response.json();
            const freeModels = data.data.filter(m => (m.pricing.prompt === "0" || m.pricing.prompt === 0) && !this.bannedORModels.has(m.id));
            const priority = ['google/gemini-2.0-flash', 'qwen/qwen-2.5-72b-instruct', 'mistralai/mistral-7b-instruct'];
            for (const p of priority) {
                const found = freeModels.find(m => m.id.includes(p));
                if (found) return found.id;
            }
            return freeModels[0]?.id || 'google/gemini-2.0-flash-exp:free';
        } catch (e) {
            return 'google/gemini-2.0-flash-exp:free';
        }
    }

    async callAI(prompt) {
        // --- 1. DeepSeek API ---
        if (this.config.deepSeekKey) {
            try {
                console.log(`[AI] Attempting DeepSeek...`);
                const response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.deepSeekKey}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            { role: 'system', content: 'You are a helpful language assistant.' },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 8192
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.log(`[!] DeepSeek API Error (${response.status}): ${errText}`);
                } else {
                    const data = await response.json();
                    let content = data.choices[0].message.content;
                    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                    return content;
                }
            } catch (err) {
                console.warn(`[!] DeepSeek Request Failed: ${err.message}`);
            }
        }

        // 2. Try Gemini carousel
        while (this.currentGeminiIdx < this.geminiQueue.length) {
            const modelName = this.geminiQueue[this.currentGeminiIdx];
            try {
                console.log(`[AI] Attempting Gemini: ${modelName}...`);
                const model = this.genAI.getGenerativeModel({ model: modelName });
                const result = await Promise.race([
                    model.generateContent(prompt),
                    new Promise((_, r) => setTimeout(() => r(new Error('TIMEOUT')), 30000))
                ]);
                let content = result.response.text();
                return content.replace(/```json/g, '').replace(/```/g, '').trim();
            } catch (err) {
                console.warn(`[!] Gemini ${modelName} failed: ${err.message}`);
                this.currentGeminiIdx++;
            }
        }

        // 3. Fallback to OpenRouter
        console.log(`[AI] Falling back to OpenRouter...`);
        if (!this.autoModelOR) this.autoModelOR = await this.findBestFreeModelOR();
        
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.orKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": this.autoModelOR,
                    "messages": [
                        { role: 'system', content: 'You are a helpful language assistant.' },
                        { "role": "user", "content": prompt }
                    ],
                    "max_tokens": 8192
                })
            });
            const data = await response.json();
            if (data.choices) {
                let content = data.choices[0].message.content;
                return content.replace(/```json/g, '').replace(/```/g, '').trim();
            }
            throw new Error(JSON.stringify(data.error));
        } catch (e) {
            console.error(`[!] OpenRouter failed: ${e.message}`);
            throw e;
        }
    }
}

module.exports = AIAgent;
