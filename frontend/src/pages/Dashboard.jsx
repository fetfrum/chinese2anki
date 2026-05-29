import React, { useEffect, useRef } from 'react';
import { useGeneratorStore } from '../stores/generatorStore';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

export function Dashboard() {
  const { isAuthenticated } = useAuthStore();
  const showToast = useToastStore((state) => state.showToast);
  
  const {
    activeTab, title, text, url, urlTitle, urlText, hskFrom, hskTo, cbChunks, cbGrammar,
    costEstimate, isFetchingUrl, isEstimating, isProcessing, progressPercent, progressText,
    phase, cardsList, downloadUrl,
    setField, setTab, fetchUrlText, startAiGeneration, updateCard, deleteCard, saveEditsAndExport, resetUI, restoreState
  } = useGeneratorStore();

  const urlInputRef = useRef(null);

  useEffect(() => {
    restoreState();
  }, []);

  const handleTabChange = (tab) => {
    setTab(tab);
  };

  const handleUrlChange = (e) => {
    const targetUrl = e.target.value;
    setField('url', targetUrl);
    
    if (targetUrl.startsWith('http')) {
      // Debounced fetch logic is handled inside store with a promise
      fetchUrlText(targetUrl)
        .then(() => showToast('Текст успішно завантажено!'))
        .catch((err) => showToast(err.message));
    }
  };

  const handleGenerate = () => {
    if (!isAuthenticated) {
      showToast('Спочатку увійдіть через Google!');
      return;
    }

    if (!confirm(`З вашого балансу буде знято токени (~${costEstimate}). Продовжити?`)) {
      return;
    }

    startAiGeneration()
      .catch((err) => showToast('Помилка старту: ' + err.message));
  };

  const isGenerateDisabled = () => {
    if (isFetchingUrl || isEstimating) return true;
    if (activeTab === 'tab-text') {
      return !title.trim() || !text.trim();
    } else {
      return !urlTitle.trim() || !urlText.trim();
    }
  };

  return (
    <div className="main-wrapper">
      {phase === 'idle' && (
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === 'tab-text' ? 'active' : ''}`}
            onClick={() => handleTabChange('tab-text')}
          >
            Свій текст
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tab-url' ? 'active' : ''}`}
            onClick={() => handleTabChange('tab-url')}
          >
            За посиланням
          </button>
        </div>
      )}

      <div className="main-card">
        {/* Left Side: Forms or Loading or Previews */}
        <div className="form-section">
          {phase === 'idle' && (
            <>
              {activeTab === 'tab-text' ? (
                <div id="tab-text" className="tab-content active">
                  <div className="input-group">
                    <label htmlFor="title-input">Заголовок (Назва колоди)</label>
                    <input 
                      type="text" 
                      id="title-input" 
                      placeholder="Введіть заголовок..."
                      value={title}
                      onChange={(e) => setField('title', e.target.value)}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label htmlFor="text-input">Китайський текст</label>
                    <textarea 
                      id="text-input" 
                      placeholder="Вставте текст тут..."
                      value={text}
                      onChange={(e) => setField('text', e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div id="tab-url" className="tab-content active">
                  <div className="input-group">
                    <label htmlFor="url-input">Посилання на статтю (китайською)</label>
                    <input 
                      type="text" 
                      id="url-input" 
                      placeholder="https://zh.wikipedia.org/wiki/..."
                      value={url}
                      onChange={handleUrlChange}
                      ref={urlInputRef}
                    />
                  </div>
                  
                  {isFetchingUrl ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                      <span className="spinner" style={{ borderColor: 'rgba(0, 121, 107, 0.3)', borderTopColor: 'var(--primary)', width: '40px', height: '40px' }}></span>
                      <p style={{ marginTop: '15px', color: 'var(--text-muted)' }}>Завантаження та аналіз статті з URL...</p>
                    </div>
                  ) : urlText && (
                    <div id="url-fetched-area" className="show" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div className="input-group">
                        <label htmlFor="url-title-input">Заголовок (Назва колоди)</label>
                        <input 
                          type="text" 
                          id="url-title-input"
                          value={urlTitle}
                          onChange={(e) => setField('urlTitle', e.target.value)}
                        />
                      </div>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label htmlFor="url-text-input">Отриманий текст (можна редагувати)</label>
                        <textarea 
                          id="url-text-input"
                          value={urlText}
                          onChange={(e) => setField('urlText', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="action-footer">
                <button 
                  id="generate-btn" 
                  className={`btn-primary ${(isFetchingUrl || isEstimating) ? 'loading' : ''}`}
                  disabled={isGenerateDisabled()}
                  onClick={handleGenerate}
                >
                  {(isFetchingUrl || isEstimating) && <span className="spinner"></span>}
                  {isEstimating ? 'Розрахунок вартості...' : 'Згенерувати колоду'}
                </button>
              </div>
            </>
          )}

          {/* AI Generation/Exporting Progress View */}
          {(phase === 'generating' || phase === 'exporting' || phase === 'ready') && (
            <div id="progress-card" style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              {phase === 'ready' ? (
                <>
                  <h3 style={{ color: 'var(--primary)', marginBottom: '20px', fontSize: '2rem' }}>Готово!</h3>
                  <a href={downloadUrl} className="btn-primary" download style={{ padding: '15px 40px', fontSize: '1.1rem' }}>
                    Завантажити APKG
                  </a>
                  <button 
                    onClick={resetUI}
                    className="tab-btn" 
                    style={{ marginTop: '25px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Створити ще
                  </button>
                </>
              ) : (
                <>
                  <h3 style={{ color: 'var(--primary)', marginBottom: '10px' }}>
                    {phase === 'generating' ? 'Генерація...' : 'Експорт...'}
                  </h3>
                  <p id="progress-text" style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{progressText}</p>
                  <div style={{ width: '60%', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                    <div 
                      id="progress-bar" 
                      style={{ 
                        height: '100%', 
                        width: `${progressPercent}%`, 
                        background: 'var(--primary)', 
                        transition: 'width 0.3s', 
                        borderRadius: '3px' 
                      }}
                    ></div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Table Preview Cards View */}
          {phase === 'preview' && (
            <div id="preview-card" style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '5px' }}>
                Попередній перегляд карток{' '}
                <span id="word-count-badge" style={{ background: '#e0f2f1', color: '#00796b', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', verticalAlign: 'middle', marginLeft: '10px' }}>
                  {cardsList.length} слів
                </span>
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '10px' }}>
                Видаліть непотрібні слова або виправте помилки перед генерацією аудіо.
              </p>
              
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-color)', maxHeight: 'calc(100vh - 360px)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Слово</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Піньїнь</th>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Переклад</th>
                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', width: '60px' }}>Дія</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardsList.map((card, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', background: 'white' }}>
                          {card.audioExists && card.audioUrl && (
                            <button 
                              className="preview-play-btn" 
                              type="button" 
                              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0 5px', fontSize: '1.1em' }}
                              onClick={() => new Audio(card.audioUrl).play()}
                            >
                              ▶
                            </button>
                          )}
                          {card.hanzi}
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', background: 'white' }}>
                          <input 
                            type="text" 
                            value={card.pinyin} 
                            style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px' }}
                            onChange={(e) => updateCard(idx, 'pinyin', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', background: 'white' }}>
                          <input 
                            type="text" 
                            value={card.ukrainian} 
                            style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px' }}
                            onChange={(e) => updateCard(idx, 'ukrainian', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', textAlign: 'center', background: 'white' }}>
                          <button 
                            className="remove-card-btn" 
                            style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', padding: '5px' }}
                            onClick={() => deleteCard(idx)}
                          >
                            ✖
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="action-footer" style={{ gap: '15px' }}>
                <button 
                  onClick={resetUI}
                  className="btn-secondary"
                  style={{ background: '#f5f5f5', border: '1px solid var(--border-color)' }}
                >
                  Скасувати
                </button>
                <button 
                  id="confirm-preview-btn" 
                  className="btn-primary" 
                  disabled={isProcessing}
                  onClick={() => saveEditsAndExport().catch((err) => showToast(err.message))}
                  style={{ background: '#00796b' }}
                >
                  {isProcessing ? 'Збереження...' : 'Озвучити та упакувати APKG'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Settings */}
        {phase === 'idle' && (
          <div className="settings-section">
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Налаштування</h3>
            
            <div className="setting-item">
              <div className="hsk-range">
                <div>
                  <label htmlFor="hsk-from">Рівень HSK (Від)</label>
                  <select 
                    id="hsk-from"
                    value={hskFrom}
                    onChange={(e) => setField('hskFrom', e.target.value)}
                  >
                    <option value="1">HSK 1 (найпростіші службові слова)</option>
                    <option value="2">HSK 2</option>
                    <option value="3">HSK 3</option>
                    <option value="4">HSK 4</option>
                    <option value="5">HSK 5</option>
                    <option value="6">HSK 6</option>
                    <option value="7">HSK 7-9</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="hsk-to">Рівень HSK (До)</label>
                  <select 
                    id="hsk-to"
                    value={hskTo}
                    onChange={(e) => setField('hskTo', e.target.value)}
                  >
                    <option value="1">HSK 1</option>
                    <option value="2">HSK 2</option>
                    <option value="3">HSK 3</option>
                    <option value="4">HSK 4</option>
                    <option value="5">HSK 5</option>
                    <option value="6">HSK 6</option>
                    <option value="7">HSK 7-9</option>
                    <option value="79">Будь-які (не HSK)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="checkbox-group">
              <div style={{ fontWeight: 500, marginBottom: '10px' }}>Додавати в словник (слова HSK включені завжди):</div>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                <input 
                  id="cb-chunks" 
                  type="checkbox" 
                  checked={cbChunks}
                  onChange={(e) => setField('cbChunks', e.target.checked)}
                />
                <span>Осмислені вирази (чанки)</span>
              </label>
              <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                <input 
                  id="cb-grammar" 
                  type="checkbox"
                  checked={cbGrammar}
                  onChange={(e) => setField('cbGrammar', e.target.checked)}
                />
                <span>Граматичні конструкції</span>
              </label>
            </div>

            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Орієнтовна кількість карток:</p>
              <h2 id="cost-estimate" style={{ color: 'var(--primary)', fontSize: '2rem' }}>
                {costEstimate}
              </h2>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
