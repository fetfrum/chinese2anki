import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGeneratorStore } from '../stores/generatorStore';
import { useToastStore } from '../stores/toastStore';
import { Modal } from './Modal';

export function Navbar({ onNavigate, currentPage }) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { regFlowActive, setRegFlow } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  
  const saveStateToStorage = useGeneratorStore((state) => state.saveStateToStorage);

  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!localStorage.getItem('gdpr_accepted')) {
      showToast('Спочатку прийміть умови Політики конфіденційності!');
      return;
    }
    saveStateToStorage();
    window.location.href = '/auth/google';
  };

  const handleRegisterClick = (e) => {
    e.preventDefault();
    if (!localStorage.getItem('gdpr_accepted')) {
      showToast('Спочатку прийміть умови Політики конфіденційності!');
      return;
    }
    setLegalChecked(false);
    setLegalModalOpen(true);
  };

  const handleLegalAccept = () => {
    setLegalModalOpen(false);
    window.location.href = '/auth/google?mode=register';
  };

  return (
    <>
      <header className="app-header">
        <div className="header-container">
          <a href="#" onClick={() => onNavigate('dashboard')} className="logo-section">
            <img src="/logo_ci_1779933981137.png" alt="logo" style={{ borderRadius: '8px' }} />
            <div className="logo-text">
              <h1 style={{ color: 'var(--text-main)' }}>Chinese2Anki</h1>
              <p style={{ fontWeight: 500 }}>Інтелектуальна система створення карток для вивчення китайської мови</p>
            </div>
          </a>
          
          <div className="nav-actions">
            {isAuthenticated ? (
              <>
                {user?.is_admin === 1 && (
                  <>
                    <a 
                      href="#" 
                      onClick={() => onNavigate('admin')}
                      style={{ color: currentPage === 'admin' ? 'var(--primary)' : 'inherit', fontWeight: 600 }}
                    >
                      Користувачі
                    </a>
                    <a 
                      href="#" 
                      onClick={() => onNavigate('admin-logs')}
                      style={{ color: currentPage === 'admin-logs' ? 'var(--primary)' : 'inherit', fontWeight: 600 }}
                    >
                      Логи
                    </a>
                  </>
                )}
                <a 
                  href="#" 
                  onClick={() => onNavigate('profile')}
                  style={{ fontWeight: 500 }}
                >
                  Профіль
                </a>
                <a 
                  href="#" 
                  onClick={() => onNavigate('profile')} 
                  className="btn-primary" 
                  style={{ 
                    margin: 0, 
                    background: '#e1e6eb', 
                    color: 'var(--text-main)', 
                    padding: '10px 20px' 
                  }}
                >
                  Токени: <span style={{ marginLeft: '6px', fontWeight: 700 }}>{user?.tokens_remaining || 0}</span>
                </a>
                <a 
                  href="#" 
                  onClick={(e) => { e.preventDefault(); logout().then(() => window.location.reload()); }}
                  style={{ fontWeight: 500 }}
                >
                  Вийти
                </a>
              </>
            ) : (
              <>
                <a href="#" onClick={handleLogin} className="btn-primary" style={{ margin: 0 }}>
                  Увійти
                </a>
                <a 
                  href="#" 
                  onClick={handleRegisterClick} 
                  className="btn-primary" 
                  style={{ 
                    margin: 0, 
                    background: '#e0f2f1', 
                    color: '#00796b', 
                    border: '1px solid #00796b', 
                    marginLeft: '10px' 
                  }}
                >
                  Зареєструватися
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Registration Legal Modal */}
      <Modal isOpen={legalModalOpen} onClose={() => setLegalModalOpen(false)}>
        <h2>Умови користування та юридична інформація</h2>
        <div className="modal-legal-content">
          <p><strong>1. Загальні положення</strong><br />
          Створюючи обліковий запис у сервісі Chinese2Anki, ви погоджуєтеся з цими умовами використання, нашою політикою конфіденційності та використання файлів cookie.</p>
          <p style={{ marginTop: '10px' }}><strong>2. Нарахування токенів</strong><br />
          Кожному новому користувачеві при реєстрації безкоштовно нараховується стартовий баланс у розмірі 300 токенів. Ці токени використовуються для генерації карток Anki.</p>
          <p style={{ marginTop: '10px' }}><strong>3. Відповідальність</strong><br />
          Користувач несе повну ответственность за безпеку свого імені користувача та за будь-які дії, здійснені під його обліковим записом.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.95rem' }}>
          <input 
            type="checkbox" 
            checked={legalChecked} 
            onChange={(e) => setLegalChecked(e.target.checked)} 
          />
          <span>Я згоден з умовами та юридичною інформацією</span>
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setLegalModalOpen(false)}>Відмовитися від реєстрації</button>
          <button className="btn-primary" disabled={!legalChecked} onClick={handleLegalAccept}>Прийняти умови</button>
        </div>
      </Modal>
    </>
  );
}
