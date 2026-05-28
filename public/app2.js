document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let activeSessionId = null;
    let pollInterval = null;

    // --- Vanilla UI Logic ---
    
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // Custom Toast
    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        container.appendChild(toast);
        
        // Trigger reflow to start transition
        void toast.offsetWidth;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- State Restoration ---
    if (localStorage.getItem('saved_url')) document.getElementById('url-input').value = localStorage.getItem('saved_url');
    if (localStorage.getItem('saved_title')) document.getElementById('title-input').value = localStorage.getItem('saved_title');
    if (localStorage.getItem('saved_text')) document.getElementById('text-input').value = localStorage.getItem('saved_text');

    // Save state before login
    document.getElementById('nav-login').addEventListener('click', () => {
        localStorage.setItem('saved_url', document.getElementById('url-input').value);
        localStorage.setItem('saved_title', document.getElementById('title-input').value);
        localStorage.setItem('saved_text', document.getElementById('text-input').value);
    });

    // --- Authentication ---
    fetch('/api/auth/status')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                currentUser = data.user;
                document.getElementById('nav-login').style.display = 'none';
                document.getElementById('nav-profile').style.display = 'flex';
                document.getElementById('nav-tokens').style.display = 'flex';
                document.getElementById('nav-logout').style.display = 'flex';
                document.getElementById('token-count').innerText = currentUser.tokens_remaining;
                
                checkLegals();
            }
            checkGDPR();
        });

    function checkGDPR() {
        const banner = document.getElementById('gdpr-banner');
        if (!localStorage.getItem('gdpr_accepted')) {
            setTimeout(() => {
                banner.style.transform = 'translate(-50%, 0)';
                banner.style.opacity = '1';
            }, 500);
            
            document.getElementById('gdpr-accept').onclick = () => {
                localStorage.setItem('gdpr_accepted', 'true');
                banner.style.transform = 'translate(-50%, 150%)';
                banner.style.opacity = '0';
                setTimeout(() => { banner.style.display = 'none'; }, 500);
            };
        } else {
            banner.style.display = 'none';
        }
    }

    function checkLegals() {
        if (!localStorage.getItem('legals_accepted')) {
            // Usually we'd show a modal here, but for simplicity we will just accept it behind the scenes for now.
            // Or we can implement a custom modal in vanilla CSS if needed.
            localStorage.setItem('legals_accepted', 'true');
        }
    }

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', {method: 'POST'});
        window.location.reload();
    });

    // --- Generate Pipeline ---
    document.getElementById('generate-btn').addEventListener('click', async () => {
        if (!currentUser) {
            showToast('Спочатку увійдіть через Google!');
            localStorage.setItem('saved_url', document.getElementById('url-input').value);
            localStorage.setItem('saved_title', document.getElementById('title-input').value);
            localStorage.setItem('saved_text', document.getElementById('text-input').value);
            setTimeout(() => { window.location.href = '/auth/google'; }, 1000);
            return;
        }

        const text = document.getElementById('text-input').value;
        const url = document.getElementById('url-input').value;
        const customTitle = document.getElementById('title-input').value;
        
        if (!text && !url) return showToast('Заповніть посилання або текст!');

        const hskTo = document.getElementById('hsk-to').value;
        const mode = document.querySelector('input[name="extract-mode"]:checked').value;

        try {
            document.getElementById('generate-btn').disabled = true;
            document.getElementById('generate-btn').innerText = 'Оцінка...';
            
            const estRes = await fetch('/api/estimate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text, url, hskTo, mode})
            });
            const estData = await estRes.json();
            
            if (!estRes.ok) throw new Error(estData.error || 'Помилка');

            if (!confirm(`Орієнтовна кількість карток: ~${estData.estimatedCards}. З вашого балансу буде знято токени. Продовжити?`)) {
                document.getElementById('generate-btn').disabled = false;
                document.getElementById('generate-btn').innerText = 'Згенерувати колоду';
                return;
            }

            startAiGeneration(text, url, customTitle, hskTo, mode);
            
        } catch (e) {
            showToast('Помилка оцінки: ' + e.message);
            document.getElementById('generate-btn').disabled = false;
            document.getElementById('generate-btn').innerText = 'Згенерувати колоду';
        }
    });

    async function startAiGeneration(text, url, customTitle, hskTo, mode) {
        document.getElementById('tab-url').style.display = 'none';
        document.getElementById('tab-text').style.display = 'none';
        document.querySelector('.tabs-container').style.display = 'none';
        
        document.getElementById('progress-card').style.display = 'flex';
        updateProgress('Аналіз тексту AI...', 10);

        try {
            const res = await fetch('/api/ai-request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text, url, title: customTitle, hskTo, mode})
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            activeSessionId = data.sessionId;
            
            pollInterval = setInterval(pollStatus, 2000);
        } catch (e) {
            showToast('Помилка старту: ' + e.message);
            resetUI();
        }
    }

    async function pollStatus() {
        if (!activeSessionId) return;
        try {
            const res = await fetch(`/api/status/${activeSessionId}`);
            const data = await res.json();

            let percentage = 20;
            if (data.status.includes('Звук')) percentage = 60;
            if (data.status.includes('APKG')) percentage = 90;
            if (data.status === 'DONE') percentage = 100;

            updateProgress(data.status, percentage);

            if (data.status === 'DONE') {
                clearInterval(pollInterval);
                showToast('Колоду успішно створено!');
                document.getElementById('progress-card').innerHTML = `
                    <h3 style="color: var(--primary); margin-bottom: 20px;">Готово!</h3>
                    <a href="/data/sessions/${activeSessionId}/deck.apkg" class="btn-primary" download>Завантажити APKG</a>
                    <button id="reset-btn" class="tab-btn" style="margin-top: 15px; text-decoration: underline;">Створити ще</button>
                `;
                document.getElementById('reset-btn').addEventListener('click', () => window.location.reload());
                updateTokenCount();
            } else if (data.status.startsWith('ERROR')) {
                clearInterval(pollInterval);
                showToast(data.status);
                resetUI();
            }
        } catch (e) {
            console.error('Poll error', e);
        }
    }

    function updateProgress(msg, percentage) {
        document.getElementById('progress-text').innerText = msg;
        if (percentage) {
            document.getElementById('progress-bar').style.width = `${percentage}%`;
        }
    }

    function resetUI() {
        document.getElementById('generate-btn').disabled = false;
        document.getElementById('generate-btn').innerText = 'Згенерувати колоду';
        document.getElementById('progress-card').style.display = 'none';
        document.querySelector('.tabs-container').style.display = 'inline-flex';
        // Restore active tab display based on which button is active
        const activeTabTarget = document.querySelector('.tab-btn.active').dataset.target;
        document.getElementById(activeTabTarget).style.display = 'flex';
    }

    async function updateTokenCount() {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.authenticated) {
            document.getElementById('token-count').innerText = data.user.tokens_remaining;
        }
    }
});
