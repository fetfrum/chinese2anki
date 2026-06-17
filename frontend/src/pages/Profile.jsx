import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGeneratorStore } from '../stores/generatorStore';

export function Profile() {
  const { user, deleteAccount } = useAuthStore();
  const { historyList, loadHistory } = useGeneratorStore();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDeleteAccount = () => {
    if (!deleteChecked) return;
    if (confirm('Ви впевнені, що хочете видалити свій акаунт? Цю дію неможливо скасувати!')) {
      deleteAccount().then(() => {
        window.location.href = '/';
      });
    }
  };

  return (
    <div className="main-wrapper" style={{ overflowY: 'auto', display: 'block', padding: '40px 20px' }}>
      <div 
        style={{
          width: '80%',
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        <h2 style={{ color: 'var(--primary)' }}>Профіль користувача</h2>
        
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 3fr',
            gap: '30px',
            alignItems: 'start'
          }}
        >
          {/* User Profile Card */}
          <div className="main-card" style={{ flexDirection: 'column', padding: '30px', textAlign: 'center', height: 'auto' }}>
            {user?.picture ? (
              <img 
                src={user.picture} 
                alt="Фото" 
                style={{ width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 15px auto', display: 'block' }} 
              />
            ) : (
              <div 
                style={{ 
                  width: '100px', 
                  height: '100px', 
                  borderRadius: '50%', 
                  background: 'var(--primary)', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '2.5rem', 
                  margin: '0 auto 15px auto' 
                }}
              >
                {user?.display_name ? user.display_name.charAt(0).toUpperCase() : '?'}
              </div>
            )}
            <h3 style={{ marginBottom: '15px', color: 'var(--text-main)' }}>{user?.display_name || 'Завантаження...'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Токенів (карток) залишилось:</p>
            <h2 style={{ color: 'var(--primary)', fontSize: '2.5rem', marginTop: '5px' }}>{user?.tokens_remaining || 0}</h2>
          </div>
          
          {/* History and Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* History Table */}
            <div className="main-card" style={{ flexDirection: 'column', padding: '30px', height: 'auto' }}>
              <h3 style={{ marginBottom: '15px', color: 'var(--primary)' }}>Історія генерацій</h3>
              {historyList && historyList.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Дата</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Колода</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Карток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((g, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{g.date} {g.time}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{g.deck_name}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{g.cards_generated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px' }}>Історія порожня.</p>
              )}
            </div>
            
            {/* Danger Zone */}
            <div className="main-card" style={{ flexDirection: 'column', padding: '30px', height: 'auto', background: '#fff5f5', border: '1px solid #fed7d7' }}>
              <h3 style={{ color: '#c53030', marginBottom: '10px' }}>Небезпечна зона</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.95rem', lineHeight: 1.5 }}>
                Видалення акаунту видалить вашу історію генерацій, але ваш ідентифікатор Google залишиться в системі. Якщо у вас від'ємний баланс токенів, ви не зможете зареєструватися заново до спливу штрафного терміну.
              </p>
              
              {!deleteConfirmOpen ? (
                <button 
                  className="btn-primary" 
                  style={{ background: '#e53e3e', width: 'fit-content' }}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  Видалити мій акаунт
                </button>
              ) : (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #fed7d7' }}>
                  <p style={{ fontWeight: 600, marginBottom: '10px', color: '#c53030' }}>Ви впевнені?</p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={deleteChecked} 
                      onChange={(e) => setDeleteChecked(e.target.checked)} 
                    />
                    <span>Я підтверджую видалення даних</span>
                  </label>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => setDeleteConfirmOpen(false)}
                    >
                      Скасувати
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ background: '#e53e3e', opacity: deleteChecked ? 1 : 0.5 }}
                      disabled={!deleteChecked}
                      onClick={handleDeleteAccount}
                    >
                      Видалити назавжди
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
