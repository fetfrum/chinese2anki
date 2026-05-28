document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null;
    let activeSessionId = null;
    let pollInterval = null;
    let activeTab = 'tab-text';
    
    let estimationDebounce = null;
    let urlFetchDebounce = null;
    let isFetchingUrl = false;
    let isEstimating = false;

    // Elements
    const btnGenerate = document.getElementById('generate-btn');
    const textInput = document.getElementById('text-input');
    const titleInput = document.getElementById('title-input');
    const urlInput = document.getElementById('url-input');
    const urlTextInput = document.getElementById('url-text-input');
    const urlTitleInput = document.getElementById('url-title-input');
    const urlFetchedArea = document.getElementById('url-fetched-area');
    const costEstimate = document.getElementById('cost-estimate');

    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            activeTab = btn.dataset.target;
            document.getElementById(activeTab).classList.add('active');
            
            validateAndEstimate();
        });
    });

    // Custom Toast
    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        container.appendChild(toast);
        
        void toast.offsetWidth;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // Auth Status
    fetch('/api/auth/status')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                currentUser = data.user;
                document.getElementById('nav-login').style.display = 'none';
                document.getElementById('nav-profile').style.display = 'flex';
                document.getElementById('nav-tokens').style.display = 'flex';
                document.getElementById('logout-btn').style.display = 'flex';
                document.getElementById('token-count').innerText = currentUser.tokens_remaining;
                
                if (currentUser.is_admin === 1) {
                    const adminBtn = document.getElementById('nav-admin');
                    if (adminBtn) adminBtn.style.display = 'flex';
                }
                
                checkLegals();
            } else {
                const loginBtn = document.getElementById('nav-login');
                if (loginBtn) loginBtn.style.display = 'inline-flex';
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

    // Block login if GDPR not accepted
    document.getElementById('nav-login').addEventListener('click', (e) => {
        e.preventDefault();
        if (!localStorage.getItem('gdpr_accepted')) {
            showToast('Спочатку прийміть умови Політики конфіденційності!');
            highlightGDPR();
            return;
        }
        localStorage.setItem('saved_tab', activeTab);
        localStorage.setItem('saved_title', activeTab === 'tab-text' ? titleInput.value : urlTitleInput.value);
        localStorage.setItem('saved_text', activeTab === 'tab-text' ? textInput.value : urlTextInput.value);
        localStorage.setItem('saved_url', urlInput.value);
        window.location.href = '/auth/google';
    });

    function highlightGDPR() {
        const banner = document.getElementById('gdpr-banner');
        banner.style.transition = 'all 0.3s';
        banner.style.boxShadow = '0 0 20px rgba(0, 121, 107, 0.6)';
        banner.style.borderColor = 'var(--primary)';
        setTimeout(() => {
            banner.style.boxShadow = 'var(--shadow-soft)';
            banner.style.borderColor = 'var(--border-color)';
        }, 1500);
    }

    function checkLegals() {
        if (!localStorage.getItem('legals_accepted')) {
            localStorage.setItem('legals_accepted', 'true');
        }
    }

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', {method: 'POST'});
        window.location.reload();
    });

    function setButtonLoading(isLoading, text = "Згенерувати колоду") {
        if (isLoading) {
            btnGenerate.disabled = true;
            btnGenerate.innerHTML = `<span class="spinner"></span>${text}`;
        } else {
            btnGenerate.innerHTML = text;
            // Validate to see if it should remain disabled
            btnGenerate.disabled = !isValidInput();
        }
    }

    function isValidInput() {
        if (isFetchingUrl || isEstimating) return false;
        if (activeTab === 'tab-text') {
            return titleInput.value.trim().length > 0 && textInput.value.trim().length > 0;
        } else {
            // URL Tab
            return urlTitleInput.value.trim().length > 0 && urlTextInput.value.trim().length > 0;
        }
    }

    // Dynamic URL Fetching
    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        urlFetchedArea.classList.remove('show');
        setTimeout(() => { urlFetchedArea.style.display = 'none'; }, 300);
        urlTitleInput.value = '';
        urlTextInput.value = '';
        validateAndEstimate();

        if (!url.startsWith('http')) return;

        clearTimeout(urlFetchDebounce);
        urlFetchDebounce = setTimeout(async () => {
            isFetchingUrl = true;
            setButtonLoading(true, "Завантаження статті...");
            
            try {
                const res = await fetch('/api/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                
                urlTitleInput.value = data.title || 'Нова колода (з URL)';
                urlTextInput.value = data.content || '';
                urlFetchedArea.style.display = 'flex';
                void urlFetchedArea.offsetWidth;
                urlFetchedArea.classList.add('show');
                
                showToast('Текст успішно завантажено!');
            } catch (e) {
                showToast('Помилка завантаження URL');
            } finally {
                isFetchingUrl = false;
                setButtonLoading(false, "Згенерувати колоду");
                validateAndEstimate();
            }
        }, 1000);
    });

    // Inputs triggering validation and estimation
    const inputsToWatch = [titleInput, textInput, urlTitleInput, urlTextInput, document.getElementById('hsk-from'), document.getElementById('hsk-to')];
    document.querySelectorAll('input[name="extract-mode"]').forEach(r => inputsToWatch.push(r));

    inputsToWatch.forEach(el => {
        el.addEventListener('input', validateAndEstimate);
        el.addEventListener('change', validateAndEstimate);
    });

    function saveState() {
        localStorage.setItem('saved_tab', activeTab);
        localStorage.setItem('saved_title', activeTab === 'tab-text' ? titleInput.value : urlTitleInput.value);
        localStorage.setItem('saved_text', activeTab === 'tab-text' ? textInput.value : urlTextInput.value);
        localStorage.setItem('saved_url', urlInput.value);
    }

    function validateAndEstimate() {
        saveState();
        if (!isValidInput()) {
            btnGenerate.disabled = true;
            costEstimate.innerText = '0';
            return;
        }

        const text = activeTab === 'tab-text' ? textInput.value : urlTextInput.value;
        const hskFrom = document.getElementById('hsk-from').value;
        const hskTo = document.getElementById('hsk-to').value;
        const mode = document.querySelector('input[name="extract-mode"]:checked').value;

        if (!text.trim()) return;

        clearTimeout(estimationDebounce);
        estimationDebounce = setTimeout(async () => {
            isEstimating = true;
            setButtonLoading(true, "Розрахунок вартості...");
            
            try {
                const estRes = await fetch('/api/estimate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({text, url: '', hskFrom, hskTo, mode})
                });
                if (!estRes.ok) throw new Error('Estimate failed');
                const estData = await estRes.json();
                costEstimate.innerText = `~${estData.estimatedCards}`;
            } catch (e) {
                costEstimate.innerText = 'Помилка';
            } finally {
                isEstimating = false;
                setButtonLoading(false, "Згенерувати колоду");
            }
        }, 800);
    }

    // Generate Pipeline
    btnGenerate.addEventListener('click', async () => {
        if (!currentUser) {
            if (!localStorage.getItem('gdpr_accepted')) {
                showToast('Спочатку прийміть умови Політики конфіденційності!');
                highlightGDPR();
                return;
            }
            showToast('Спочатку увійдіть через Google!');
            saveState();
            setTimeout(() => { window.location.href = '/auth/google'; }, 1000);
            return;
        }

        const text = activeTab === 'tab-text' ? textInput.value : urlTextInput.value;
        const title = activeTab === 'tab-text' ? titleInput.value : urlTitleInput.value;
        const hskFrom = document.getElementById('hsk-from').value;
        const hskTo = document.getElementById('hsk-to').value;
        const mode = document.querySelector('input[name="extract-mode"]:checked').value;

        if (!confirm(`З вашого балансу буде знято токени (~${costEstimate.innerText}). Продовжити?`)) {
            return;
        }

        startAiGeneration(text, title, hskFrom, hskTo, mode);
    });

    // --- State Restoration on Load ---
    if (localStorage.getItem('saved_tab')) {
        const tab = localStorage.getItem('saved_tab');
        
        if (tab === 'tab-text') {
            titleInput.value = localStorage.getItem('saved_title') || '';
            textInput.value = localStorage.getItem('saved_text') || '';
        } else {
            urlInput.value = localStorage.getItem('saved_url') || '';
            urlTitleInput.value = localStorage.getItem('saved_title') || '';
            urlTextInput.value = localStorage.getItem('saved_text') || '';
            if (urlTextInput.value.trim().length > 0) {
                urlFetchedArea.style.display = 'flex';
                void urlFetchedArea.offsetWidth;
                urlFetchedArea.classList.add('show');
            }
        }
        
        document.querySelector(`.tab-btn[data-target="${tab}"]`).click();
        validateAndEstimate();
    }

    async function startAiGeneration(text, customTitle, hskFrom, hskTo, mode) {
        document.getElementById('tab-url').style.display = 'none';
        document.getElementById('tab-text').style.display = 'none';
        document.querySelector('.tabs-container').style.display = 'none';
        document.querySelector('.settings-section').style.display = 'none';
        
        document.getElementById('progress-card').style.display = 'flex';
        updateProgress('Аналіз тексту AI...', 10);

        try {
            const res = await fetch('/api/ai-request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                // Note: passing empty url because we already fetched it client-side
                body: JSON.stringify({text, url: '', title: customTitle, hskFrom, hskTo, mode})
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
            const res = await fetch(`/api/ai-status/${activeSessionId}`);
            const data = await res.json();

            let percentage = 20;
            updateProgress('Аналіз тексту AI...', percentage);

            if (data.status === 'COMPLETED') {
                clearInterval(pollInterval);
                showPreview();
            } else if (data.status.startsWith('ERROR')) {
                clearInterval(pollInterval);
                showToast(data.status);
                resetUI();
            }
        } catch (e) {
            console.error('Poll error', e);
        }
    }
    
    let currentCards = [];
    
    async function showPreview() {
        document.getElementById('progress-text').innerText = 'Перевірте та відредагуйте картки:';
        document.getElementById('progress-bar').style.width = '100%';
        
        try {
            const res = await fetch(`/api/session-vocab/${activeSessionId}`);
            if (!res.ok) throw new Error('Failed to load vocab');
            const data = await res.json();
            currentCards = data.cards || [];
            
            renderPreviewTable();
            
            document.getElementById('preview-card').style.display = 'flex';
            document.getElementById('confirm-preview-btn').style.display = 'block';
            document.getElementById('generate-btn').style.display = 'none';
            
        } catch (e) {
            showToast('Помилка завантаження прев\'ю: ' + e.message);
            startExport(); // fallback
        }
    }
    
    function renderPreviewTable() {
        const tbody = document.getElementById('preview-table-body');
        tbody.innerHTML = '';
        
        currentCards.forEach((card, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">${card.hanzi}</td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                    <input type="text" value="${card.pinyin}" style="width: 100%; border: none; background: transparent; padding: 4px;" data-idx="${index}" data-field="pinyin">
                </td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                    <input type="text" value="${card.ukrainian}" style="width: 100%; border: none; background: transparent; padding: 4px;" data-idx="${index}" data-field="ukrainian">
                </td>
                <td style="padding: 10px; border-bottom: 1px solid var(--border-color); text-align: center;">
                    <button class="remove-card-btn" data-idx="${index}" style="background: none; border: none; color: #d32f2f; cursor: pointer; padding: 5px;">✖</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Event listeners
        document.querySelectorAll('.remove-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                currentCards.splice(idx, 1);
                renderPreviewTable();
            });
        });
        
        document.querySelectorAll('#preview-table-body input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                const field = e.currentTarget.getAttribute('data-field');
                currentCards[idx][field] = e.currentTarget.value;
            });
        });
    }

    document.getElementById('confirm-preview-btn').addEventListener('click', async () => {
        const btn = document.getElementById('confirm-preview-btn');
        btn.disabled = true;
        btn.innerText = 'Збереження...';
        
        try {
            const res = await fetch('/api/update-vocab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: activeSessionId, cards: currentCards })
            });
            if (!res.ok) throw new Error('Failed to save edits');
            
            document.getElementById('preview-card').style.display = 'none';
            btn.style.display = 'none';
            startExport();
        } catch (e) {
            showToast('Помилка збереження: ' + e.message);
            btn.disabled = false;
            btn.innerText = 'Озвучити та упакувати APKG';
        }
    });

    async function startExport() {
        updateProgress('Генерація аудіо та створення колоди...', 50);
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
                    const pct = 60 + Math.round(((prog.done + prog.error) / prog.total) * 30);
                    updateProgress(`Озвучування карток: ${prog.done + prog.error} / ${prog.total}`, pct);
                }
            } else if (data.status === 'ready') {
                clearInterval(pollInterval);
                showToast('Колоду успішно створено!');
                document.getElementById('progress-bar').style.width = '100%';
                
                document.getElementById('progress-card').innerHTML = `
                    <h3 style="color: var(--primary); margin-bottom: 20px;">Готово!</h3>
                    <a href="${data.downloadUrl}" class="btn-primary" download>Завантажити APKG</a>
                    <button id="reset-btn" class="tab-btn" style="margin-top: 15px; text-decoration: underline;">Створити ще</button>
                `;
                
                localStorage.removeItem('saved_title');
                localStorage.removeItem('saved_text');
                localStorage.removeItem('saved_url');
                
                document.getElementById('reset-btn').addEventListener('click', () => window.location.reload());
                updateTokenCount();
                
                // auto download
                window.location.href = data.downloadUrl;
            } else if (data.error) {
                clearInterval(pollInterval);
                showToast(data.error);
                resetUI();
            }
        } catch (e) {
            console.error('Export poll error', e);
        }
    }

    function updateProgress(msg, percentage) {
        document.getElementById('progress-text').innerText = msg;
        if (percentage) {
            document.getElementById('progress-bar').style.width = `${percentage}%`;
        }
    }

    function resetUI() {
        setButtonLoading(false, 'Згенерувати колоду');
        document.getElementById('progress-card').style.display = 'none';
        document.querySelector('.settings-section').style.display = 'flex';
        document.querySelector('.tabs-container').style.display = 'inline-flex';
        document.getElementById(activeTab).style.display = 'flex';
    }
});
