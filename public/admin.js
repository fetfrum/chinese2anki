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
    }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
    // Check auth first
    fetch('/api/auth/status')
        .then(r => r.json())
        .then(data => {
            if (!data.authenticated || data.user.is_admin !== 1) {
                window.location.href = '/';
                return;
            }
            loadUsers();
        });
});

function loadUsers() {
    fetch('/api/admin/users')
        .then(r => {
            if (!r.ok) throw new Error('Failed to fetch');
            return r.json();
        })
        .then(users => {
            const tbody = document.getElementById('users-table');
            let html = '';
            users.forEach(u => {
                const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
                const banText = isBanned ? `<span style="color:red;font-weight:bold;">Забанений до ${u.banned_until}</span>` : '<span style="color:green;">Активний</span>';
                
                html += `<tr>
                    <td>${u.id}</td>
                    <td>
                        <img src="${u.picture || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}" class="user-pic" onerror="this.style.display='none'">
                        <strong>${u.display_name || 'Невідомо'}</strong>
                        ${u.is_admin === 1 ? '<span style="background:var(--primary);color:white;font-size:0.7rem;padding:2px 6px;border-radius:10px;margin-left:5px;">ADMIN</span>' : ''}
                    </td>
                    <td>
                        <input type="number" id="tokens-${u.id}" class="token-input" value="${u.tokens_remaining}">
                    </td>
                    <td>${banText}</td>
                    <td>
                        <button class="btn-small btn-save" onclick="updateTokens(${u.id})">Зберегти токени</button>
                        ${isBanned 
                            ? `<button class="btn-small btn-unban" onclick="setBan(${u.id}, null)">Розбанити</button>`
                            : `<button class="btn-small btn-ban" onclick="setBan(${u.id}, '2099-12-31')">Забанити (до 2099)</button>`
                        }
                        ${u.is_admin === 1
                            ? (u.id === 1 ? '<span style="color:var(--text-muted);font-size:0.85rem;margin-left:5px;">Головний адмін</span>' : `<button class="btn-small btn-role" onclick="setRole(${u.id}, false)">Забрати права адміна</button>`)
                            : `<button class="btn-small btn-role" onclick="setRole(${u.id}, true)">Зробити адміном</button>`
                        }
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
        })
        .catch(e => {
            document.getElementById('users-table').innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">Помилка завантаження даних (ви не адміністратор?)</td></tr>`;
        });
}

function updateTokens(userId) {
    const tokens = parseInt(document.getElementById(`tokens-${userId}`).value);
    if (isNaN(tokens)) {
        showToast("Введіть коректне число");
        return;
    }
    fetch(`/api/admin/users/${userId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('Токени збережено!');
        } else {
            showToast('Помилка: ' + data.error);
        }
    });
}
window.updateTokens = updateTokens;

function setBan(userId, dateStr) {
    fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_until: dateStr })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('Статус бана оновлено');
            loadUsers(); // refresh table
        } else {
            showToast('Помилка: ' + data.error);
        }
    });
}
window.setBan = setBan;

function setRole(userId, isAdmin) {
    fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_admin: isAdmin })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('Права користувача оновлено');
            loadUsers(); // refresh table
        } else {
            showToast('Помилка: ' + data.error);
        }
    });
}
window.setRole = setRole;
