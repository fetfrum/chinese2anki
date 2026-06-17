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
                    <td>
                        <input type="number" id="regen-${u.id}" class="token-input" style="width:130px;" value="${u.regen_rate !== null ? u.regen_rate : ''}" placeholder="системне">
                    </td>
                    <td>${banText}</td>
                    <td>
                        <button class="btn-small btn-save" title="Зберегти токени та ліміт відновлення" onclick="updateTokens(${u.id})">💾</button>
                        ${isBanned 
                            ? `<button class="btn-small btn-unban" title="Розбанити користувача" onclick="setBan(${u.id}, null)">🔓</button>`
                            : `<button class="btn-small btn-ban" title="Забанити користувача" onclick="setBan(${u.id}, '2099-12-31')">🚫</button>`
                        }
                        ${u.is_admin === 1
                            ? (u.id === 1 ? '<span style="color:var(--text-muted);font-size:1.1rem;margin-left:5px;" title="Головний адмін">👑</span>' : `<button class="btn-small btn-role" title="Забрати права адміна" onclick="setRole(${u.id}, false)">👤</button>`)
                            : `<button class="btn-small btn-role" title="Зробити адміном" onclick="setRole(${u.id}, true)">👑</button>`
                        }
                        ${u.id !== 1 
                            ? `<button class="btn-small btn-ban" style="background:#9b2c2c;" title="Повністю видалити профіль користувача" onclick="deleteUser(${u.id}, '${(u.display_name || 'Невідомо').replace(/'/g, "\\'")}')">🗑️</button>`
                            : ''
                        }
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
        })
        .catch(e => {
            document.getElementById('users-table').innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Помилка завантаження даних (ви не адміністратор?)</td></tr>`;
        });
}

function updateTokens(userId) {
    const tokens = parseInt(document.getElementById(`tokens-${userId}`).value);
    if (isNaN(tokens)) {
        showToast("Введіть коректне число");
        return;
    }
    const regenVal = document.getElementById(`regen-${userId}`).value;
    const rateVal = regenVal === '' ? null : parseInt(regenVal);
    if (rateVal !== null && (isNaN(rateVal) || rateVal < 0)) {
        showToast("Введіть коректне число швидкості відновлення");
        return;
    }

    fetch(`/api/admin/users/${userId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, regen_rate: rateVal })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('Дані користувача збережено!');
            loadUsers();
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

function deleteUser(userId, displayName) {
    if (userId === 1) {
        showToast("Не можна видалити головного адміністратора");
        return;
    }
    if (!confirm(`Ви впевнені, що хочете ПОВНІСТЮ видалити профіль користувача "${displayName}"? Цю дію не можна скасувати!`)) {
        return;
    }
    fetch(`/api/admin/users/${userId}/delete`, {
        method: 'POST'
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showToast('Користувача повністю видалено!');
            loadUsers();
        } else {
            showToast('Помилка: ' + data.error);
        }
    })
    .catch(() => {
        showToast('Помилка запиту видалення');
    });
}
window.deleteUser = deleteUser;
