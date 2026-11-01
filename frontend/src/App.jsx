import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import CouncilStudioModal from './components/CouncilStudioModal';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [councilConfig, setCouncilConfig] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('council_theme') || 'dark');

  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('council_theme', theme);
  }, [theme]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const initializeApp = async () => {
    await Promise.all([loadConversations(), loadCouncilConfig(), loadPromptsList()]);
  };

  const loadCouncilConfig = async () => {
    try {
      const cfg = await api.getConfig();
      setCouncilConfig(cfg);
    } catch (err) {
      console.error('Failed to load council config:', err);
    }
  };

  const loadPromptsList = async () => {
    try {
      const list = await api.listPrompts();
      setPrompts(list);
    } catch (err) {
      console.error('Failed to load prompt templates:', err);
    }
  };

  const loadConversations = async () => {
    try {
      setError(null);
      const convs = await api.listConversations();
      setConversations(convs);

      if (convs.length > 0) {
        setCurrentConversationId((prev) => prev || convs[0].id);
      } else {
        await handleNewConversation();
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Unable to connect to backend server. Make sure it is running on http://localhost:8001.');
    }
  };

  const loadConversation = async (id) => {
    try {
      setError(null);
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError('Failed to load conversation details.');
    }
  };

  const handleNewConversation = async () => {
    try {
      setError(null);
      const newConv = await api.createConversation();
      setConversations((prev) => [
        {
          id: newConv.id,
          created_at: newConv.created_at,
          updated_at: newConv.updated_at,
          message_count: 0,
          pinned: false,
          pinned_files_count: 0,
          title: 'New Conversation',
        },
        ...prev,
      ]);
      setCurrentConversationId(newConv.id);
      setCurrentConversation(newConv);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to create a new conversation. Make sure backend is running.');
    }
  };

  const handleSearchConversations = async (query) => {
    try {
      const results = await api.searchConversations(query);
      setConversations(results);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleTogglePinConversation = async (id, pinned) => {
    try {
      await api.updateConversation(id, { pinned });
      await loadConversations();
    } catch (err) {
      setError(`Failed to update pin: ${err.message}`);
    }
  };

  const handleRenameConversation = async (id, title) => {
    try {
      const updated = await api.updateConversation(id, { title });
      if (id === currentConversationId) {
        setCurrentConversation(updated);
      }
      await loadConversations();
    } catch (err) {
      setError(`Failed to rename conversation: ${err.message}`);
    }
  };

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (currentConversationId === id) {
        if (remaining.length > 0) {
          setCurrentConversationId(remaining[0].id);
        } else {
          await handleNewConversation();
        }
      }
    } catch (err) {
      setError(`Failed to delete conversation: ${err.message}`);
    }
  };

  const handleSendMessage = async (payload) => {
    if (!currentConversationId) return;

    const reqObj =
      typeof payload === 'string'
        ? {
            content: payload,
            executionMode: 'full_council',
            webSearch: false,
            attachments: [],
            editMessageIndex: null,
          }
        : payload;

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const userMessage = {
        role: 'user',
        content: reqObj.content,
        attachments: reqObj.attachments || [],
        execution_mode: reqObj.executionMode || 'full_council',
        web_search: Boolean(reqObj.webSearch),
      };

      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        artifacts: [],
        loading: {
          web_search: false,
          stage1: false,
          stage2: false,
          stage3: false,
        },
      };

      setCurrentConversation((prev) => {
        const baseMsgs =
          reqObj.editMessageIndex !== null && reqObj.editMessageIndex !== undefined
            ? prev.messages.slice(0, reqObj.editMessageIndex)
            : prev.messages;
        return {
          ...prev,
          messages: [...baseMsgs, userMessage, assistantMessage],
        };
      });

      await api.sendMessageStream(
        currentConversationId,
        reqObj,
        (eventType, event) => {
          switch (eventType) {
            case 'web_search_start':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.loading = { ...lastMsg.loading, web_search: true };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'web_search_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.loading = { ...lastMsg.loading, web_search: false };
                lastMsg.metadata = { ...(lastMsg.metadata || {}), citations: event.data };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage1_start':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.loading = { ...lastMsg.loading, stage1: true };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage1_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.stage1 = event.data;
                lastMsg.loading = { ...lastMsg.loading, stage1: false };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage2_start':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.loading = { ...lastMsg.loading, stage2: true };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage2_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.stage2 = event.data;
                lastMsg.metadata = { ...(lastMsg.metadata || {}), ...(event.metadata || {}) };
                lastMsg.loading = { ...lastMsg.loading, stage2: false };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage3_start':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.loading = { ...lastMsg.loading, stage3: true };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'stage3_complete':
              setCurrentConversation((prev) => {
                const messages = [...prev.messages];
                const lastMsg = { ...messages[messages.length - 1] };
                lastMsg.stage3 = event.data;
                lastMsg.artifacts = event.artifacts || [];
                lastMsg.metadata = { ...(lastMsg.metadata || {}), ...(event.metadata || {}) };
                lastMsg.loading = { ...lastMsg.loading, stage3: false };
                messages[messages.length - 1] = lastMsg;
                return { ...prev, messages };
              });
              break;

            case 'title_complete':
              loadConversations();
              break;

            case 'cancelled':
              setIsLoading(false);
              loadConversation(currentConversationId);
              break;

            case 'complete':
              loadConversations();
              loadConversation(currentConversationId);
              setIsLoading(false);
              break;

            case 'error':
              setError(`Deliberation error: ${event.message}`);
              setIsLoading(false);
              break;

            default:
              break;
          }
        },
        controller.signal
      );
    } catch (err) {
      if (err.name === 'AbortError') {
        setIsLoading(false);
        return;
      }
      console.error('Failed to send message:', err);
      setError(`Failed to send message: ${err.message}`);
      setIsLoading(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (currentConversationId) {
      await api.stopGeneration(currentConversationId);
    }
    setIsLoading(false);
  };

  const handleEditAndRerun = async (userMessageIndex, newContent) => {
    const existingMsg = currentConversation?.messages?.[userMessageIndex] || {};
    await handleSendMessage({
      content: newContent,
      executionMode: existingMsg.execution_mode || 'full_council',
      webSearch: Boolean(existingMsg.web_search),
      attachments: existingMsg.attachments || [],
      editMessageIndex: userMessageIndex,
    });
  };

  const handleRegenerateFull = async (assistantMessageIndex) => {
    const userMsgIndex = assistantMessageIndex - 1;
    if (userMsgIndex < 0) return;
    const userMsg = currentConversation?.messages?.[userMsgIndex];
    if (!userMsg || userMsg.role !== 'user') return;

    await handleSendMessage({
      content: userMsg.content,
      executionMode: userMsg.execution_mode || 'full_council',
      webSearch: Boolean(userMsg.web_search),
      attachments: userMsg.attachments || [],
      editMessageIndex: userMsgIndex,
    });
  };

  const handleSwitchBranch = async (branchIndex) => {
    if (!currentConversationId) return;
    try {
      const updated = await api.switchBranch(currentConversationId, branchIndex);
      setCurrentConversation(updated);
    } catch (err) {
      setError(`Failed to switch branch: ${err.message}`);
    }
  };

  const handleResynthesizeStage3 = async (messageIndex, modifier, chairmanModel) => {
    if (!currentConversationId) return;
    try {
      setError(null);
      const res = await api.resynthesizeStage3(currentConversationId, {
        messageIndex,
        modifier,
        chairmanModel,
      });
      setCurrentConversation(res.conversation);
    } catch (err) {
      setError(`Stage 3 re-synthesis failed: ${err.message}`);
    }
  };

  const handleExportMessage = async (messageIndex, content, format) => {
    if (!currentConversationId) return;
    try {
      const title = `${currentConversation?.title || 'Council_Synthesis'}_Turn_${Math.ceil(
        (messageIndex + 1) / 2
      )}`;
      const record = await api.generateFile({
        conversationId: currentConversationId,
        messageIndex,
        title,
        content,
        format,
      });
      await loadConversation(currentConversationId);
      // Trigger direct browser download immediately as well
      const dlUrl = api.getDownloadUrl(record.download_url || record.id);
      window.open(dlUrl, '_blank');
    } catch (err) {
      setError(`Failed to export file: ${err.message}`);
    }
  };

  const handleExportThread = async (convId) => {
    try {
      const record = await api.exportConversationThread(convId, 'pdf');
      const dlUrl = api.getDownloadUrl(record.download_url || record.id);
      window.open(dlUrl, '_blank');
    } catch (err) {
      setError(`Failed to export thread: ${err.message}`);
    }
  };

  const handleSaveConfig = async (newConfig) => {
    const saved = await api.updateConfig(newConfig);
    setCouncilConfig(saved);
    return saved;
  };

  const handleSavePreset = async (name, description, snapshot) => {
    const saved = await api.savePreset(name, description, snapshot);
    setCouncilConfig(saved);
    return saved;
  };

  const handleDeletePreset = async (presetId) => {
    const saved = await api.deletePreset(presetId);
    setCouncilConfig(saved);
    return saved;
  };

  const handleSavePromptTemplate = async (item) => {
    const updated = await api.savePrompt(item);
    setPrompts(updated);
  };

  const handleDeletePromptTemplate = async (id) => {
    const updated = await api.deletePrompt(id);
    setPrompts(updated);
  };

  return (
    <div className={`app theme-${theme}`}>
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={(id) => setCurrentConversationId(id)}
        onNewConversation={handleNewConversation}
        onSearchConversations={handleSearchConversations}
        onTogglePinConversation={handleTogglePinConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onExportThread={handleExportThread}
        onOpenStudio={() => setIsStudioOpen(true)}
      />

      <div className="main-content-wrapper">
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <div className="error-actions">
              <button className="retry-btn" onClick={loadConversations}>
                Retry
              </button>
              <button className="dismiss-btn" onClick={() => setError(null)}>
                ✕
              </button>
            </div>
          </div>
        )}

        <ChatInterface
          conversation={currentConversation}
          councilConfig={councilConfig}
          prompts={prompts}
          isLoading={isLoading}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onOpenStudio={() => setIsStudioOpen(true)}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onNewConversation={handleNewConversation}
          onEditAndRerun={handleEditAndRerun}
          onSwitchBranch={handleSwitchBranch}
          onResynthesizeStage3={handleResynthesizeStage3}
          onRegenerateFull={handleRegenerateFull}
          onExportMessage={handleExportMessage}
          onExportThread={handleExportThread}
          onRefreshConversation={() =>
            currentConversationId && loadConversation(currentConversationId)
          }
          onSavePromptTemplate={handleSavePromptTemplate}
          onDeletePromptTemplate={handleDeletePromptTemplate}
        />
      </div>

      <CouncilStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        config={councilConfig}
        onSaveConfig={handleSaveConfig}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
      />
    </div>
  );
}

export default App;
