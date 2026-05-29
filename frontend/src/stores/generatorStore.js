import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useGeneratorStore = create(
  devtools(
    (set, get) => ({
      // --- STATE ---
      activeTab: 'tab-text', // 'tab-text' | 'tab-url'
      title: '',
      text: '',
      url: '',
      urlTitle: '',
      urlText: '',
      hskFrom: '1',
      hskTo: '6',
      cbChunks: true,
      cbGrammar: false,
      
      // UI States
      costEstimate: '0',
      isFetchingUrl: false,
      isEstimating: false,
      isProcessing: false,
      progressPercent: 0,
      progressText: '',
      phase: 'idle', // 'idle' | 'generating' | 'preview' | 'exporting' | 'ready'
      sessionId: null,
      cardsList: [],
      downloadUrl: null,
      historyList: [],
      
      // --- ACTIONS ---
      setField: (field, value) => {
        set({ [field]: value });
        get().saveStateToStorage();
        if (['text', 'urlText', 'hskFrom', 'hskTo', 'cbChunks', 'cbGrammar', 'activeTab'].includes(field)) {
          get().estimateCost();
        }
      },

      setTab: (tab) => {
        set({ activeTab: tab });
        get().saveStateToStorage();
        get().estimateCost();
      },

      saveStateToStorage: () => {
        const state = get();
        localStorage.setItem('saved_tab', state.activeTab);
        localStorage.setItem('saved_title', state.activeTab === 'tab-text' ? state.title : state.urlTitle);
        localStorage.setItem('saved_text', state.activeTab === 'tab-text' ? state.text : state.urlText);
        localStorage.setItem('saved_url', state.url);
        localStorage.setItem('saved_hsk_from', state.hskFrom);
        localStorage.setItem('saved_hsk_to', state.hskTo);
        localStorage.setItem('saved_cb_chunks', state.cbChunks ? 'true' : 'false');
        localStorage.setItem('saved_cb_grammar', state.cbGrammar ? 'true' : 'false');
      },

      restoreState: () => {
        const savedTab = localStorage.getItem('saved_tab') || 'tab-text';
        const savedTitle = localStorage.getItem('saved_title') || '';
        const savedText = localStorage.getItem('saved_text') || '';
        const savedUrl = localStorage.getItem('saved_url') || '';
        const savedHskFrom = localStorage.getItem('saved_hsk_from') || '1';
        const savedHskTo = localStorage.getItem('saved_hsk_to') || '6';
        const savedCbChunks = localStorage.getItem('saved_cb_chunks') !== 'false';
        const savedCbGrammar = localStorage.getItem('saved_cb_grammar') === 'true';

        set({
          activeTab: savedTab,
          title: savedTab === 'tab-text' ? savedTitle : '',
          text: savedTab === 'tab-text' ? savedText : '',
          url: savedUrl,
          urlTitle: savedTab === 'tab-url' ? savedTitle : '',
          urlText: savedTab === 'tab-url' ? savedText : '',
          hskFrom: savedHskFrom,
          hskTo: savedHskTo,
          cbChunks: savedCbChunks,
          cbGrammar: savedCbGrammar
        });

        // Restore active running session if any
        const savedSessionId = localStorage.getItem('active_session_id');
        const savedPhase = localStorage.getItem('active_session_phase');

        if (savedSessionId && savedPhase) {
          set({ sessionId: savedSessionId, phase: savedPhase, isProcessing: true });
          if (savedPhase === 'generating') {
            get().startPollingStatus();
          } else if (savedPhase === 'preview') {
            get().fetchSessionVocab();
          } else if (savedPhase === 'exporting') {
            get().startPollingExportStatus();
          }
        } else {
          get().estimateCost();
        }
      },

      fetchUrlText: async (targetUrl) => {
        if (!targetUrl.startsWith('http')) return;
        set({ isFetchingUrl: true, urlTitle: '', urlText: '' });
        
        try {
          const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl })
          });
          if (!res.ok) throw new Error('Scraping failed');
          const data = await res.json();
          
          set({
            urlTitle: data.title || 'Нова колода (з URL)',
            urlText: data.content || '',
            isFetchingUrl: false
          });
          get().saveStateToStorage();
          get().estimateCost();
          return { success: true };
        } catch (e) {
          set({ isFetchingUrl: false });
          get().estimateCost();
          throw new Error('Помилка завантаження тексту з URL: ' + e.message);
        }
      },

      getMode: () => {
        const { cbChunks, cbGrammar } = get();
        if (cbChunks && cbGrammar) return 'both';
        if (cbChunks) return 'chunks';
        if (cbGrammar) return 'grammar';
        return 'words';
      },

      estimateCost: async () => {
        const state = get();
        const activeText = state.activeTab === 'tab-text' ? state.text : state.urlText;
        
        if (!activeText.trim()) {
          set({ costEstimate: '0' });
          return;
        }

        set({ isEstimating: true });
        try {
          const res = await fetch('/api/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: activeText,
              url: '',
              hskFrom: state.hskFrom,
              hskTo: state.hskTo,
              mode: state.getMode()
            })
          });
          if (!res.ok) throw new Error('Failed to estimate');
          const data = await res.json();
          set({ costEstimate: String(data.estimatedCards), isEstimating: false });
        } catch (e) {
          set({ costEstimate: 'Помилка', isEstimating: false });
        }
      },

      startAiGeneration: async () => {
        const state = get();
        const activeText = state.activeTab === 'tab-text' ? state.text : state.urlText;
        const activeTitle = state.activeTab === 'tab-text' ? state.title : state.urlTitle;
        
        set({
          phase: 'generating',
          isProcessing: true,
          progressPercent: 10,
          progressText: 'Аналіз тексту AI...'
        });

        try {
          const res = await fetch('/api/ai-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: activeText,
              url: '',
              title: activeTitle,
              hskFrom: state.hskFrom,
              hskTo: state.hskTo,
              mode: state.getMode()
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to start generation');
          
          set({ sessionId: data.sessionId });
          localStorage.setItem('active_session_id', data.sessionId);
          localStorage.setItem('active_session_phase', 'generating');
          
          get().startPollingStatus();
        } catch (e) {
          get().resetUI();
          throw e;
        }
      },

      startPollingStatus: () => {
        const interval = setInterval(async () => {
          const { sessionId } = get();
          if (!sessionId) {
            clearInterval(interval);
            return;
          }
          
          try {
            const res = await fetch(`/api/ai-status/${sessionId}`);
            const data = await res.json();
            
            set({ progressPercent: 20, progressText: 'Аналіз тексту AI...' });

            if (data.status === 'COMPLETED') {
              clearInterval(interval);
              get().fetchSessionVocab();
            } else if (data.status.startsWith('ERROR')) {
              clearInterval(interval);
              throw new Error(data.status);
            }
          } catch (e) {
            clearInterval(interval);
            get().resetUI();
            alert('Помилка генерації AI: ' + e.message);
          }
        }, 2000);
      },

      fetchSessionVocab: async () => {
        const { sessionId } = get();
        if (!sessionId) return;
        
        set({ phase: 'preview', progressPercent: 100, progressText: 'Готово!' });
        localStorage.setItem('active_session_phase', 'preview');

        try {
          const res = await fetch(`/api/session-vocab/${sessionId}`);
          if (!res.ok) throw new Error('Failed to load vocabulary');
          const data = await res.json();
          set({ cardsList: data.cards || [] });
        } catch (e) {
          alert('Помилка завантаження попереднього перегляду: ' + e.message);
          get().startExport(); // fallback
        }
      },

      updateCard: (index, field, value) => {
        const { cardsList } = get();
        const updated = [...cardsList];
        updated[index] = { ...updated[index], [field]: value };
        set({ cardsList: updated });
      },

      deleteCard: (index) => {
        const { cardsList } = get();
        const updated = cardsList.filter((_, i) => i !== index);
        set({ cardsList: updated });
      },

      saveEditsAndExport: async () => {
        const { sessionId, cardsList } = get();
        set({ isProcessing: true });
        
        try {
          const res = await fetch('/api/update-vocab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, cards: cardsList })
          });
          if (!res.ok) throw new Error('Failed to save edited cards');
          get().startExport();
        } catch (e) {
          set({ isProcessing: false });
          throw e;
        }
      },

      startExport: () => {
        const { sessionId } = get();
        set({
          phase: 'exporting',
          isProcessing: true,
          progressPercent: 50,
          progressText: 'Генерація аудіо та створення колоди...'
        });
        localStorage.setItem('active_session_phase', 'exporting');
        get().startPollingExportStatus();
      },

      startPollingExportStatus: () => {
        const interval = setInterval(async () => {
          const { sessionId } = get();
          if (!sessionId) {
            clearInterval(interval);
            return;
          }

          try {
            const res = await fetch('/api/export-apkg', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId })
            });
            const data = await res.json();

            if (data.status === 'tts_running') {
              const prog = data.progress;
              if (prog.total > 0) {
                const pct = 60 + Math.round(((prog.done + prog.error) / prog.total) * 30);
                set({
                  progressPercent: pct,
                  progressText: `Озвучування карток: ${prog.done + prog.error} / ${prog.total}`
                });
              }
            } else if (data.status === 'ready') {
              clearInterval(interval);
              set({
                phase: 'ready',
                progressPercent: 100,
                progressText: 'Колоду успішно створено!',
                downloadUrl: data.downloadUrl,
                isProcessing: false
              });
              
              // Clear stored drafts
              localStorage.removeItem('saved_title');
              localStorage.removeItem('saved_text');
              localStorage.removeItem('saved_url');
              localStorage.removeItem('active_session_id');
              localStorage.removeItem('active_session_phase');
              
              // Trigger automatic browser download
              window.location.href = data.downloadUrl;
            } else if (data.error) {
              clearInterval(interval);
              throw new Error(data.error);
            }
          } catch (e) {
            clearInterval(interval);
            get().resetUI();
            alert('Помилка створення APKG: ' + e.message);
          }
        }, 3000);
      },

      loadHistory: async () => {
        try {
          const res = await fetch('/api/user/history');
          if (!res.ok) throw new Error('Failed to fetch history');
          const data = await res.json();
          set({ historyList: data || [] });
        } catch (e) {
          console.error(e);
        }
      },

      resetUI: () => {
        const { sessionId } = get();
        if (sessionId) {
          fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          }).catch(console.error);
        }

        localStorage.removeItem('active_session_id');
        localStorage.removeItem('active_session_phase');
        
        set({
          phase: 'idle',
          isProcessing: false,
          progressPercent: 0,
          progressText: '',
          sessionId: null,
          cardsList: [],
          downloadUrl: null
        });
        
        get().restoreState();
      }
    }),
    { name: 'GeneratorStore' }
  )
);
