import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/ToastContainer';
import { GDPRBanner } from './components/GDPRBanner';
import { Dashboard } from './pages/Dashboard';
import { Profile } from './pages/Profile';
import { AdminPanel } from './pages/AdminPanel';
import { AdminLogs } from './pages/AdminLogs';
import { Modal } from './components/Modal';

function App() {
  const { checkAuthStatus, isLoading, isAuthenticated, user, registerUser } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    // Check authentication on startup
    checkAuthStatus();

    // Check for query parameters (e.g. Oauth redirects or error redirects)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('error') && urlParams.get('error') === 'not_registered') {
      showToast('Користувача не знайдено. Будь ласка, зареєструйтеся!');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (urlParams.has('show_register_username')) {
      setUsernameModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleRegisterSubmit = async () => {
    const cleanUsername = regUsername.trim();
    if (!cleanUsername) {
      showToast("Будь ласка, введіть ім'я користувача!");
      return;
    }

    setRegistering(true);
    try {
      await registerUser(cleanUsername);
      showToast('Реєстрація успішна! Ласкаво просимо!');
      setUsernameModalOpen(false);
      // reload status
      checkAuthStatus();
    } catch (err) {
      showToast(err.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-color)' }}>
        <span className="spinner" style={{ borderColor: 'rgba(0, 121, 107, 0.3)', borderTopColor: 'var(--primary)', width: '50px', height: '50px' }}></span>
        <p style={{ marginTop: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>Завантаження системи...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar onNavigate={handleNavigate} currentPage={currentPage} />
      
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'profile' && <Profile />}
      {currentPage === 'admin' && <AdminPanel />}
      {currentPage === 'admin-logs' && <AdminLogs />}

      {/* GDPR cookie banner */}
      <GDPRBanner />

      {/* Global toasts notifications container */}
      <ToastContainer />

      {/* Register Username Modal */}
      <Modal isOpen={usernameModalOpen} onClose={() => setUsernameModalOpen(false)}>
        <h2>Реєстрація користувача</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Будь ласка, введіть бажане ім'я користувача. Після реєстрації вам буде автоматично нараховано 300 стартових токенів.
        </p>
        <div>
          <label htmlFor="reg-username-input" style={{ fontWeight: 500, display: 'block', marginBottom: '8px' }}>
            Ім'я користувача
          </label>
          <input 
            type="text" 
            id="reg-username-input" 
            className="modal-input" 
            placeholder="Введіть ваше ім'я..." 
            value={regUsername}
            onChange={(e) => setRegUsername(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setUsernameModalOpen(false)}>Назад</button>
          <button className="btn-primary" disabled={registering} onClick={handleRegisterSubmit}>
            {registering ? 'Реєстрація...' : 'Зареєструватися'}
          </button>
        </div>
      </Modal>
    </>
  );
}

export default App;
