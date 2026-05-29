import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

export function AdminPanel() {
  const { user } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = () => {
    setLoading(true);
    fetch('/api/admin/users')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((e) => {
        setLoading(false);
        showToast('Помилка завантаження користувачів');
      });
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUpdateTokens = (userId, tokens) => {
    if (isNaN(tokens)) {
      showToast('Введіть коректне число');
      return;
    }
    fetch(`/api/admin/users/${userId}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          showToast('Токени збережено!');
          loadUsers();
        } else {
          showToast('Помилка: ' + data.error);
        }
      });
  };

  const handleSetBan = (userId, dateStr) => {
    fetch(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned_until: dateStr })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          showToast('Статус бана оновлено');
          loadUsers();
        } else {
          showToast('Помилка: ' + data.error);
        }
      });
  };

  const handleSetRole = (userId, isAdmin) => {
    fetch(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: isAdmin })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          showToast('Права користувача оновлено');
          loadUsers();
        } else {
          showToast('Помилка: ' + data.error);
        }
      });
  };

  return (
    <div className="main-wrapper" style={{ overflowY: 'auto', display: 'block', padding: '40px 20px' }}>
      <div style={{ width: '90%', maxWidth: '1400px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '24px', color: 'var(--primary)' }}>Управління користувачами</h2>
        
        <div className="main-card" style={{ padding: '30px', flexDirection: 'column', height: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <span className="spinner" style={{ borderColor: 'rgba(0, 121, 107, 0.3)', borderTopColor: 'var(--primary)', width: '30px', height: '30px' }}></span>
              <p style={{ marginTop: '10px' }}>Завантаження користувачів...</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>ID</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Користувач</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Токени</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Статус / Бан</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isBanned = u.banned_until && new Date(u.banned_until) > new Date();
                  return (
                    <tr key={u.id}>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{u.id}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <img 
                          src={u.picture || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='} 
                          alt="avatar"
                          style={{ width: '32px', height: '32px', borderRadius: '50%', verticalAlign: 'middle', marginRight: '10px' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <strong>{u.display_name || 'Невідомо'}</strong>
                        {u.is_admin === 1 && (
                          <span style={{ background: 'var(--primary)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', marginLeft: '5px' }}>
                            ADMIN
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <input 
                          type="number" 
                          defaultValue={u.tokens_remaining} 
                          id={`tokens-${u.id}`}
                          style={{ width: '80px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        {isBanned ? (
                          <span style={{ color: 'red', fontWeight: 'bold' }}>Забанений до {u.banned_until}</span>
                        ) : (
                          <span style={{ color: 'green' }}>Активний</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <button 
                          className="btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem', borderRadius: '4px', marginRight: '5px' }}
                          onClick={() => handleUpdateTokens(u.id, parseInt(document.getElementById(`tokens-${u.id}`).value))}
                        >
                          Зберегти токени
                        </button>
                        {isBanned ? (
                          <button 
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.85rem', borderRadius: '4px', marginRight: '5px', background: '#48bb78' }}
                            onClick={() => handleSetBan(u.id, null)}
                          >
                            Розбанити
                          </button>
                        ) : (
                          <button 
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.85rem', borderRadius: '4px', marginRight: '5px', background: '#e53e3e' }}
                            onClick={() => handleSetBan(u.id, '2099-12-31')}
                          >
                            Забанити
                          </button>
                        )}
                        {u.is_admin === 1 ? (
                          u.id === 1 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '5px' }}>Головний адмін</span>
                          ) : (
                            <button 
                              className="btn-primary" 
                              style={{ padding: '6px 12px', fontSize: '0.85rem', borderRadius: '4px', background: '#4a5568' }}
                              onClick={() => handleSetRole(u.id, false)}
                            >
                              Забрати права адміна
                            </button>
                          )
                        ) : (
                          <button 
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.85rem', borderRadius: '4px', background: '#4a5568' }}
                            onClick={() => handleSetRole(u.id, true)}
                          >
                            Зробити адміном
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
