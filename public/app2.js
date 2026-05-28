document.addEventListener('DOMContentLoaded', function() {
    M.AutoInit();
    
    let currentUser = null;
    let activeSessionId = null;
    let pollInterval = null;

    // Always show interface
    document.getElementById('app-interface').style.display = 'block';

    // Restore saved inputs if any
    if (localStorage.getItem('saved_url')) document.getElementById('url-input').value = localStorage.getItem('saved_url');
    if (localStorage.getItem('saved_title')) document.getElementById('title-input').value = localStorage.getItem('saved_title');
    if (localStorage.getItem('saved_text')) document.getElementById('text-input').value = localStorage.getItem('saved_text');
    M.updateTextFields();

    // Check auth status
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
            } else {
                document.getElementById('auth-warning').style.display = 'block';
            }
            checkGDPR();
        });

    // Save state before login
    document.getElementById('nav-login').addEventListener('click', () => {
        localStorage.setItem('saved_url', document.getElementById('url-input').value);
        localStorage.setItem('saved_title', document.getElementById('title-input').value);
        localStorage.setItem('saved_text', document.getElementById('text-input').value);
    });

    function checkGDPR() {
        const banner = document.getElementById('gdpr-banner');
        if (!localStorage.getItem('gdpr_accepted')) {
            // Small delay to allow CSS transition to work after initial render
            setTimeout(() => {
                banner.style.transform = 'translateY(0)';
                banner.style.opacity = '1';
            }, 500);
            
            document.getElementById('gdpr-accept').onclick = () => {
                localStorage.setItem('gdpr_accepted', 'true');
                banner.style.transform = 'translateY(150%)';
                banner.style.opacity = '0';
                setTimeout(() => { banner.style.display = 'none'; }, 500);
            };
        } else {
            banner.style.display = 'none';
        }
    }

    function checkLegals() {
        if (!localStorage.getItem('legals_accepted')) {
            // Usually we'd fetch LEGALS.md here, for now we hardcode a summary
            document.getElementById('legal-content').innerHTML = `
                <p>1. Використовуючи цей сервіс, ви погоджуєтеся з правилами.</p>
                <p>2. Сервіс не несе відповідальності за авторські права на тексти, які ви завантажуєте.</p>
                <p>3. Сервіс зберігає історію ваших запитів.</p>
            `;
            const legalModal = M.Modal.getInstance(document.getElementById('legal-modal'));
            legalModal.open();
            
            document.getElementById('legal-checkbox').addEventListener('change', (e) => {
                const btn = document.getElementById('legal-accept-btn');
                if (e.target.checked) btn.classList.remove('disabled');
                else btn.classList.add('disabled');
            });
            
            document.getElementById('legal-accept-btn').onclick = () => {
                localStorage.setItem('legals_accepted', 'true');
                legalModal.close();
            };
        }
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload());
    });

    // Scrape button
    document.getElementById('scrape-btn').addEventListener('click', async () => {
        const url = document.getElementById('url-input').value;
        if (!url) return M.toast({html: 'Введіть URL!'});
        
        document.getElementById('scrape-btn').classList.add('disabled');
        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url})
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            document.getElementById('text-input').value = data.content;
            M.updateTextFields();
            const tabs = M.Tabs.getInstance(document.querySelector('.tabs'));
            tabs.select('tab-text');
            M.toast({html: 'Текст успішно завантажено!'});
        } catch (e) {
            M.toast({html: 'Помилка завантаження: ' + e.message, classes: 'red'});
        } finally {
            document.getElementById('scrape-btn').classList.remove('disabled');
        }
    });

    // Generate Pipeline
    document.getElementById('generate-btn').addEventListener('click', async () => {
        if (!currentUser) {
            M.toast({html: 'Спочатку увійдіть через Google!'});
            // Save state and redirect to login
            localStorage.setItem('saved_url', document.getElementById('url-input').value);
            localStorage.setItem('saved_title', document.getElementById('title-input').value);
            localStorage.setItem('saved_text', document.getElementById('text-input').value);
            window.location.href = '/auth/google';
            return;
        }

        const text = document.getElementById('text-input').value;
        const url = document.getElementById('url-input').value;
        const customTitle = document.getElementById('title-input').value;
        
        if (!text && !url) return M.toast({html: 'Заповніть посилання або текст!'});

        const hskTo = document.getElementById('hsk-to').value;
        const mode = document.querySelector('input[name="extract-mode"]:checked').value;

        try {
            const res = await fetch('/api/estimate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text, mode, hskLevel: parseInt(hskTo)})
            });
            const data = await res.json();
            
            document.getElementById('est-cards').innerText = data.estimatedCards;
            document.getElementById('est-balance').innerText = currentUser.tokens_remaining;
            
            if (data.estimatedCards > currentUser.tokens_remaining) {
                document.getElementById('est-warning').style.display = 'block';
            } else {
                document.getElementById('est-warning').style.display = 'none';
            }

            const modal = M.Modal.getInstance(document.getElementById('estimate-modal'));
            modal.open();

            document.getElementById('confirm-generate-btn').onclick = () => {
                startAiGeneration(text, url, customTitle, hskTo, mode);
            };
        } catch (e) {
            M.toast({html: 'Помилка оцінки: ' + e.message});
        }
    });

    async function startAiGeneration(text, url, customTitle, hskTo, mode) {
        document.getElementById('app-interface').style.display = 'none';
        document.getElementById('progress-card').style.display = 'block';
        updateProgress('Аналіз тексту AI...', true);

        try {
            const res = await fetch('/api/ai-request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text, url, title: customTitle, hskTo, mode})
            });
            const data = await res.json();
            
            if (data.error) {
                showError(data.error);
                return;
            }

            activeSessionId = data.sessionId;
            pollInterval = setInterval(pollAiStatus, 2000);
            
        } catch (e) {
            showError(e.message);
        }
    }

    async function pollAiStatus() {
        try {
            const res = await fetch(`/api/ai-status/${activeSessionId}`);
            const data = await res.json();
            
            if (data.status === 'completed') {
                clearInterval(pollInterval);
                startExport();
            } else if (data.status === 'error') {
                clearInterval(pollInterval);
                showError(data.message);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function startExport() {
        updateProgress('Генерація аудіо та створення колоди...', true);
        pollInterval = setInterval(pollExportStatus, 3000);
        pollExportStatus(); // call immediately once
    }

    async function pollExportStatus() {
        try {
            const res = await fetch('/api/export-apkg', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({sessionId: activeSessionId})
            });
            const data = await res.json();

            if (data.status === 'tts_running') {
                const prog = data.progress;
                if (prog.total > 0) {
                    const pct = Math.round(((prog.done + prog.error) / prog.total) * 100);
                    updateProgress(`Озвучування карток: ${prog.done + prog.error} / ${prog.total} (${pct}%)`, false, pct);
                }
            } else if (data.status === 'ready') {
                clearInterval(pollInterval);
                updateProgress('Готово!', false, 100);
                
                document.getElementById('progress-bar').classList.remove('indeterminate');
                document.getElementById('progress-bar').style.width = '100%';
                
                const dlBtn = document.getElementById('download-btn');
                dlBtn.href = data.downloadUrl;
                
                const manual = document.getElementById('manual-download');
                manual.href = data.downloadUrl;
                
                document.getElementById('download-section').style.display = 'block';
                
                // auto download
                window.location.href = data.downloadUrl;
                
                // Refresh tokens
                fetch('/api/auth/status').then(r=>r.json()).then(d => {
                    if (d.user) document.getElementById('token-count').innerText = d.user.tokens_remaining;
                });
            } else if (data.error) {
                clearInterval(pollInterval);
                showError(data.error);
            }
        } catch (e) {
            console.error(e);
        }
    }

    function updateProgress(text, indeterminate = false, pct = 0) {
        document.getElementById('progress-text').innerText = text;
        const pb = document.getElementById('progress-bar');
        if (indeterminate) {
            pb.classList.add('indeterminate');
            pb.classList.remove('determinate');
            pb.style.width = 'auto';
        } else {
            pb.classList.remove('indeterminate');
            pb.classList.add('determinate');
            pb.style.width = pct + '%';
        }
    }

    function showError(msg) {
        document.getElementById('progress-text').innerText = 'Помилка';
        document.getElementById('progress-text').classList.replace('teal-text', 'red-text');
        document.getElementById('progress-subtext').innerText = msg;
        document.getElementById('progress-bar').parentElement.style.display = 'none';
        
        setTimeout(() => {
            document.getElementById('progress-card').style.display = 'none';
            document.getElementById('app-interface').style.display = 'block';
            document.getElementById('progress-text').classList.replace('red-text', 'teal-text');
            document.getElementById('progress-bar').parentElement.style.display = 'block';
        }, 5000);
    }
});
