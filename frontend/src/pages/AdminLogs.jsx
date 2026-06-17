import React, { useEffect, useState } from 'react';
import { useToastStore } from '../stores/toastStore';

export function AdminLogs() {
  const showToast = useToastStore((state) => state.showToast);
  const [currentType, setCurrentType] = useState('ACTION');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [userIdFilter, setUserIdFilter] = useState('');
  const [sessionIdFilter, setSessionIdFilter] = useState('');

  const loadLogs = (reset = false) => {
    setLoading(true);
    const pageToLoad = reset ? 1 : currentPage;
    
    let url = `/api/admin/logs?type=${currentType}&page=${pageToLoad}&limit=50`;
    if (userIdFilter) url += `&userId=${userIdFilter}`;
    if (sessionIdFilter) url += `&sessionId=${encodeURIComponent(sessionIdFilter)}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch logs');
        return r.json();
      })
      .then((data) => {
        if (reset) {
          setLogs(data.data || []);
          setCurrentPage(2);
        } else {
          setLogs((prev) => [...prev, ...(data.data || [])]);
          setCurrentPage((prev) => prev + 1);
        }
        setTotalPages(data.totalPages || 1);
        setLoading(false);
      })
      .catch((e) => {
        setLoading(false);
        showToast('Помилка завантаження логів');
      });
  };

  useEffect(() => {
    loadLogs(true);
  }, [currentType]);

  const handleApplyFilter = () => {
    loadLogs(true);
  };

  const handleClearFilter = () => {
    setUserIdFilter('');
    setSessionIdFilter('');
    // Need to trigger reload after resetting state
    setTimeout(() => {
      loadLogs(true);
    }, 50);
  };

  return (
    <div className="main-wrapper" style={{ overflowY: 'auto', display: 'block', padding: '40px 20px' }}>
      <div style={{ width: '90%', maxWidth: '1400px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '24px', color: 'var(--primary)' }}>Логи системи</h2>
        
        <div className="main-card" style={{ padding: '30px', flexDirection: 'column', height: 'auto' }}>
          
          {/* Tabs */}
          <div 
            style={{ 
              display: 'flex', 
              borderBottom: '1px solid var(--border-color)', 
              marginBottom: '20px' 
            }}
          >
            <div 
              className={`tab ${currentType === 'ACTION' ? 'active' : ''}`}
              style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 500, borderBottom: '2px solid transparent' }}
              onClick={() => setCurrentType('ACTION')}
            >
              Дії
            </div>
            <div 
              className={`tab ${currentType === 'ERROR' ? 'active' : ''}`}
              style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 500, borderBottom: '2px solid transparent' }}
              onClick={() => setCurrentType('ERROR')}
            >
              Помилки
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 500 }}>ID Користувача</label>
              <input 
                type="number" 
                className="filter-input" 
                placeholder="Наприклад, 1"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 500 }}>UUID Сесії</label>
              <input 
                type="text" 
                className="filter-input" 
                placeholder="Наприклад, abc12"
                value={sessionIdFilter}
                onChange={(e) => setSessionIdFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none' }}
              />
            </div>
            <button 
              className="btn-primary" 
              style={{ padding: '8px 16px', borderRadius: '6px', height: '38px', fontSize: '0.9rem' }}
              onClick={handleApplyFilter}
            >
              Застосувати
            </button>
            <button 
              className="btn-primary" 
              style={{ padding: '8px 16px', borderRadius: '6px', height: '38px', fontSize: '0.9rem', background: '#e2e8f0', color: '#1e293b' }}
              onClick={handleClearFilter}
            >
              Скинути
            </button>
          </div>

          {/* Logs Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '0.95rem' }}>
            <thead>
              <tr>
                <th style={{ width: '15%', padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Час</th>
                <th style={{ width: '10%', padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>User ID</th>
                <th style={{ width: '15%', padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Session ID</th>
                <th style={{ width: '60%', padding: '12px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', fontWeight: 600, color: 'var(--text-muted)' }}>Подія</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, idx) => {
                const dateObj = new Date(l.created_at + 'Z');
                const timeStr = dateObj.toLocaleString('uk-UA', { 
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' 
                });
                const shortSession = l.session_id ? l.session_id.split('-')[0] : '-';
                return (
                  <tr key={idx}>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{timeStr}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>{l.user_id || '-'}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
                      {l.session_id ? (
                        <span 
                          style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }} 
                          title={l.session_id}
                        >
                          {shortSession}
                        </span>
                      ) : '-'}
                    </td>
                    <td 
                      style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}
                      className={currentType === 'ERROR' ? 'error-msg' : ''}
                    >
                      {l.message}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Записів не знайдено</td>
                </tr>
              )}
            </tbody>
          </table>

          {currentPage - 1 < totalPages && (
            <button 
              onClick={() => loadLogs(false)} 
              className="btn-secondary"
              style={{ display: 'block', width: '100%', textAlign: 'center', padding: '12px', background: '#f8fafc', border: '1px dashed var(--border-color)', borderRadius: '6px', cursor: 'pointer', marginTop: '20px', fontWeight: 500 }}
            >
              {loading ? 'Завантаження...' : 'Завантажити ще'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
