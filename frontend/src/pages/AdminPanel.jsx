import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

export function AdminPanel() {
  const { user } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxTokens, setMaxTokens] = useState(300);
  const [regenPerDay, setRegenPerDay] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);

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

  const loadSettings = () => {
    fetch('/api/admin/settings')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch settings');
        return r.json();
      })
      .then((data) => {
        setMaxTokens(data.max_tokens);
        setRegenPerDay(data.regen_per_day);
      })
      .catch((e) => {
        showToast('Помилка завантаження глобальних налаштувань');
      });
  };

  useEffect(() => {
    loadUsers();
    loadSettings();
  }, []);

  const handleUpdateTokens = (userId, tokens, regenRate) => {
    if (isNaN(tokens)) {
      showToast('Введіть коректне число');
      return;
    }
    const rateVal = regenRate === '' || regenRate === null || regenRate === undefined ? null : parseInt(regenRate);
    if (rateVal !== null && (isNaN(rateVal) || rateVal < 0)) {
      showToast('Введіть коректне число швидкості відновлення');
      return;
    }
    fetch(`/api/admin/users/${userId}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, regen_rate: rateVal })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          showToast('Дані користувача збережено!');
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

  const handleDeleteUser = (userId, displayName) => {
    if (userId === 1) {
      showToast('Не можна видалити головного адміністратора');
      return;
    }
    if (!confirm(`Ви впевнені, що хочете ПОВНІСТЮ видалити профіль користувача "${displayName}"? Цю дію не можна скасувати!`)) {
      return;
    }
    fetch(`/api/admin/users/${userId}/delete`, {
      method: 'POST'
    })
      .then((r) => r.json())
      .then((data) => {
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
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSavingSettings(true);
    fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_tokens: maxTokens, regen_per_day: regenPerDay })
    })
      .then((r) => r.json())
      .then((data) => {
        setSavingSettings(false);
        if (data.success) {
          showToast('Налаштування успішно збережено!');
        } else {
          showToast('Помилка збереження: ' + data.error);
        }
      })
      .catch(() => {
        setSavingSettings(false);
        showToast('Помилка запиту збереження');
      });
  };

  return (
    <div className="main-wrapper" style={{ overflowY: 'auto', display: 'block', padding: '40px 20px' }}>
      <div style={{ width: '90%', maxWidth: '1400px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '24px', color: 'var(--primary)' }}>Глобальні налаштування токенів</h2>
        <div className="main-card" style={{ padding: '30px', marginBottom: '30px', flexDirection: 'column', height: 'auto' }}>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="input-group" style={{ margin: 0, minWidth: '240px', flex: 1 }}>
              <label htmlFor="max-tokens-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Ліміт токенів користувача (Максимум / Старт)</label>
              <input 
                type="number" 
                id="max-tokens-input" 
                value={maxTokens} 
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.95rem' }}
              />
            </div>
            <div className="input-group" style={{ margin: 0, minWidth: '240px', flex: 1 }}>
              <label htmlFor="regen-per-day-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Швидкість відновлення токенів (у добу)</label>
              <input 
                type="number" 
                id="regen-per-day-input" 
                value={regenPerDay} 
                onChange={(e) => setRegenPerDay(parseInt(e.target.value) || 0)}
                style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.95rem' }}
              />
            </div>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={savingSettings}
              style={{ padding: '12px 24px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', borderRadius: '6px' }}
            >
              {savingSettings ? 'Збереження...' : 'Зберегти ліміти'}
            </button>
          </form>
        </div>

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
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Відновлення (день)</th>
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
                        <input 
                          type="number" 
                          defaultValue={u.regen_rate !== null ? u.regen_rate : ''} 
                          id={`regen-${u.id}`}
                          placeholder={`системне (${regenPerDay})`}
                          style={{ width: '130px', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', textAlign: 'center' }}
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
                          title="Зберегти токени та ліміт відновлення"
                          style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', marginRight: '5px', background: '#00796b' }}
                          onClick={() => handleUpdateTokens(
                            u.id, 
                            parseInt(document.getElementById(`tokens-${u.id}`).value),
                            document.getElementById(`regen-${u.id}`).value
                          )}
                        >
                          💾
                        </button>
                        {isBanned ? (
                          <button 
                            className="btn-primary" 
                            title="Розбанити користувача"
                            style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', marginRight: '5px', background: '#48bb78' }}
                            onClick={() => handleSetBan(u.id, null)}
                          >
                            🔓
                          </button>
                        ) : (
                          <button 
                            className="btn-primary" 
                            title="Забанити користувача"
                            style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', marginRight: '5px', background: '#e53e3e' }}
                            onClick={() => handleSetBan(u.id, '2099-12-31')}
                          >
                            🚫
                          </button>
                        )}
                        {u.is_admin === 1 ? (
                          u.id === 1 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginLeft: '5px' }} title="Головний адміністратор">👑</span>
                          ) : (
                            <button 
                              className="btn-primary" 
                              title="Забрати права адміністратора"
                              style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', marginRight: '5px', background: '#718096' }}
                              onClick={() => handleSetRole(u.id, false)}
                            >
                              👤
                            </button>
                          )
                        ) : (
                          <button 
                            className="btn-primary" 
                            title="Зробити адміністратором"
                            style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', marginRight: '5px', background: '#4a5568' }}
                            onClick={() => handleSetRole(u.id, true)}
                          >
                            👑
                          </button>
                        )}
                        {u.id !== 1 && (
                          <button 
                            className="btn-primary" 
                            title="Повністю видалити профіль користувача"
                            style={{ padding: '8px 12px', fontSize: '1.05rem', borderRadius: '4px', background: '#9b2c2c' }}
                            onClick={() => handleDeleteUser(u.id, u.display_name)}
                          >
                            🗑️
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
