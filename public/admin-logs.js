let currentType = 'ACTION';
let currentPage = 1;
let hasMore = true;

document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/auth/status')
        .then(r => r.json())
        .then(data => {
            if (!data.authenticated || data.user.is_admin !== 1) {
                window.location.href = '/';
                return;
            }
            loadLogs(true);
        });

    document.querySelectorAll('.tab').forEach(t => {
        t.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            currentType = e.target.getAttribute('data-type');
            loadLogs(true);
        });
    });

    document.getElementById('btn-apply-filter').addEventListener('click', () => loadLogs(true));
    document.getElementById('btn-clear-filter').addEventListener('click', () => {
        document.getElementById('filter-user').value = '';
        document.getElementById('filter-session').value = '';
        loadLogs(true);
    });
    document.getElementById('btn-load-more').addEventListener('click', () => loadLogs(false));
});

function loadLogs(reset = false) {
    if (reset) {
        currentPage = 1;
        document.getElementById('logs-table').innerHTML = '';
    }

    const userId = document.getElementById('filter-user').value;
    const sessionId = document.getElementById('filter-session').value;
    
    let url = `/api/admin/logs?type=${currentType}&page=${currentPage}&limit=50`;
    if (userId) url += `&userId=${userId}`;
    if (sessionId) url += `&sessionId=${encodeURIComponent(sessionId)}`;

    const loadBtn = document.getElementById('btn-load-more');
    loadBtn.innerText = 'Завантаження...';

    fetch(url)
        .then(r => {
            if (!r.ok) throw new Error('Failed to fetch');
            return r.json();
        })
        .then(data => {
            const tbody = document.getElementById('logs-table');
            
            if (data.data.length === 0 && reset) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Записів не знайдено</td></tr>`;
                loadBtn.style.display = 'none';
                return;
            }

            let html = '';
            data.data.forEach(l => {
                const dateObj = new Date(l.created_at + 'Z'); // SQLite assumes UTC usually
                const timeStr = dateObj.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second:'2-digit' });
                
                const shortSession = l.session_id ? l.session_id.split('-')[0] : '-';
                const msgClass = currentType === 'ERROR' ? 'error-msg' : '';

                html += `<tr>
                    <td class="log-time">${timeStr}</td>
                    <td>${l.user_id || '-'}</td>
                    <td>${l.session_id ? `<span class="session-id" title="${l.session_id}">${shortSession}</span>` : '-'}</td>
                    <td class="${msgClass}">${l.message}</td>
                </tr>`;
            });
            
            if (reset) {
                tbody.innerHTML = html;
            } else {
                tbody.insertAdjacentHTML('beforeend', html);
            }

            if (currentPage >= data.totalPages) {
                loadBtn.style.display = 'none';
            } else {
                loadBtn.style.display = 'block';
                loadBtn.innerText = 'Завантажити ще';
                currentPage++;
            }
        })
        .catch(e => {
            if (reset) {
                document.getElementById('logs-table').innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">Помилка завантаження логів</td></tr>`;
            }
            loadBtn.style.display = 'none';
        });
}
