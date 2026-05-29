document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/auth/status')
        .then(r => r.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/';
                return;
            }
            const user = data.user;
            if (user.is_admin === 1) {
                document.getElementById('nav-admin').style.display = 'flex';
            }
            document.getElementById('profile-name').innerText = user.display_name;
            document.getElementById('profile-tokens').innerText = user.tokens_remaining;
            if (user.picture) {
                const img = document.getElementById('profile-pic');
                img.src = user.picture;
                img.style.display = 'inline-block';
            }
            loadHistory();
        });
        
    function loadHistory() {
        fetch('/api/user/history')
            .then(r => r.json())
            .then(generations => {
                if (!generations || generations.length === 0) {
                    document.getElementById('no-history').style.display = 'block';
                    return;
                }
                const tbody = document.getElementById('history-table');
                let html = '';
                generations.forEach(g => {
                    html += `<tr>
                        <td>${g.date} ${g.time}</td>
                        <td>${g.deck_name}</td>
                        <td>${g.cards_generated}</td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            });
    }
    
    document.getElementById('delete-trigger').addEventListener('click', () => {
        document.getElementById('delete-confirm-area').style.display = 'block';
        document.getElementById('delete-trigger').style.display = 'none';
    });

    document.getElementById('confirm-delete-checkbox').addEventListener('change', (e) => {
        const btn = document.getElementById('do-delete-btn');
        if (e.target.checked) {
            btn.disabled = false;
            btn.style.opacity = '1';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    });
    
    document.getElementById('do-delete-btn').addEventListener('click', () => {
        fetch('/api/user/delete', { method: 'POST' })
            .then(() => window.location.href = '/');
    });
});
