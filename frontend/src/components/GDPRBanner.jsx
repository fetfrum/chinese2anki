import React, { useState, useEffect } from 'react';

export function GDPRBanner() {
  const [accepted, setAccepted] = useState(true); // default to true until checked

  useEffect(() => {
    const isAccepted = localStorage.getItem('gdpr_accepted');
    if (!isAccepted) {
      setAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('gdpr_accepted', 'true');
    setAccepted(true);
  };

  if (accepted) return null;

  return (
    <div 
      id="gdpr-banner" 
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        width: '90%',
        maxWidth: '800px',
        transform: 'translate(-50%, 0)',
        opacity: 1,
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '15px 24px'
      }}
    >
      <div style={{ lineHeight: '1.4' }}>
        <strong>Політика конфіденційності:</strong>{' '}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Ми використовуємо файли cookie та зберігаємо історію генерацій для роботи сервісу.
        </span>
      </div>
      <button 
        id="gdpr-accept" 
        className="btn-primary" 
        style={{ padding: '6px 16px', fontSize: '0.9rem' }}
        onClick={handleAccept}
      >
        Я погоджуюсь
      </button>
    </div>
  );
}
