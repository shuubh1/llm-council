import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import MessageItem from './MessageItem';
import PromptBar from './PromptBar';
import { api } from '../api';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  councilConfig,
  prompts,
  isLoading,
  theme,
  onToggleTheme,
  onOpenStudio,
  onSendMessage,
  onStopGeneration,
  onNewConversation,
  onEditAndRerun,
  onSwitchBranch,
  onResynthesizeStage3,
  onRegenerateFull,
  onExportMessage,
  onExportThread,
  onRefreshConversation,
  onSavePromptTemplate,
  onDeletePromptTemplate,
}) {
  const [previewArtifact, setPreviewArtifact] = useState(null);
  const [showCaseDrawer, setShowCaseDrawer] = useState(false);
  const [isUploadingPin, setIsUploadingPin] = useState(false);

  const messagesEndRef = useRef(null);
  const caseFileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages?.length]);

  const activeSeatsCount =
    councilConfig?.members?.filter((m) => m.enabled !== false).length || 0;
  const reconMode = councilConfig?.reconciliation_mode || 'consensus';
  const zdrEnabled = Boolean(councilConfig?.zero_data_retention);
  const pinnedFiles = conversation?.pinned_files || [];
  const totalBranches = conversation?.branches?.length || 0;

  const handleUploadPinnedCaseFile = async (e) => {
    const files = e.target.files;
    if (!files || !files.length || !conversation?.id) return;
    setIsUploadingPin(true);
    try {
      for (const f of Array.from(files)) {
        await api.uploadFile(f, conversation.id, true);
      }
      if (onRefreshConversation) await onRefreshConversation();
    } catch (err) {
      alert(`Failed to pin file: ${err.message}`);
    } finally {
      setIsUploadingPin(false);
      if (caseFileInputRef.current) caseFileInputRef.current.value = '';
    }
  };

  const handleUnpinCaseFile = async (attachmentId) => {
    if (!conversation?.id) return;
    await api.unpinFile(conversation.id, attachmentId);
    if (onRefreshConversation) await onRefreshConversation();
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Welcome to LLM Council Console</h2>
          <p>Start a multi-model deliberation to consult the Council</p>
          {onNewConversation && (
            <button className="cta-button" onClick={onNewConversation}>
              + Start New Deliberation
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {/* Gemini-Style Top Navigation Bar */}
      <header className="chat-top-nav">
        <div className="nav-left">
          <h2 className="nav-conv-title" title={conversation.title}>
            {conversation.title || 'New Conversation'}
          </h2>
          {totalBranches > 0 && (
            <button
              type="button"
              className="nav-branch-pill"
              onClick={() => onSwitchBranch(0)}
              title="Switch between edited prompt branches"
            >
              🔀 Branch ‹ 1 / {totalBranches + 1} ›
            </button>
          )}
        </div>

        <div className="nav-right">
          {/* Active Council Status Pill (opens Council Studio) */}
          <button
            type="button"
            className="nav-council-pill"
            onClick={onOpenStudio}
            title="Configure Council Seats, Roles & Reconciliation Mode"
          >
            <span>🏛️ {activeSeatsCount} Seats</span>
            <span className="nav-pill-sep">•</span>
            <span className="nav-mode-text">{reconMode.replace('_', ' ')}</span>
            {zdrEnabled && (
              <>
                <span className="nav-pill-sep">•</span>
                <span className="zdr-active-dot" title="Zero Data Retention Enabled">
                  🔒 ZDR
                </span>
              </>
            )}
          </button>

          {/* Pinned Case File Drawer Button */}
          <button
            type="button"
            className={`nav-utility-btn ${pinnedFiles.length > 0 ? 'has-pins' : ''}`}
            onClick={() => setShowCaseDrawer((s) => !s)}
            title="Open Conversation Case File Drawer (Pinned Context Documents)"
          >
            📌 Case Files ({pinnedFiles.length})
          </button>

          {/* Export Thread Button */}
          {conversation.messages.length > 0 && (
            <button
              type="button"
              className="nav-utility-btn"
              onClick={() => onExportThread(conversation.id)}
              title="Export Full Conversation Thread as PDF"
            >
              📥 Export Thread
            </button>
          )}

          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            className="nav-utility-btn theme-btn"
            onClick={onToggleTheme}
            title="Toggle Dark / Light Theme"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      {/* Collapsible Conversation Case File Drawer */}
      {showCaseDrawer && (
        <div className="case-file-drawer">
          <div className="case-drawer-header">
            <div>
              <strong>📌 Pinned Conversation Case Files</strong>
              <span className="case-drawer-sub">
                Pinned documents are automatically injected into every council turn in this conversation.
              </span>
            </div>
            <div className="case-drawer-actions">
              <input
                ref={caseFileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.py,.js,.png,.jpg,.jpeg,.webp"
                style={{ display: 'none' }}
                onChange={handleUploadPinnedCaseFile}
              />
              <button
                type="button"
                className="primary-btn xs"
                onClick={() => caseFileInputRef.current?.click()}
                disabled={isUploadingPin}
              >
                {isUploadingPin ? 'Uploading...' : '+ Pin Document / Image'}
              </button>
              <button
                type="button"
                className="icon-close-btn sm"
                onClick={() => setShowCaseDrawer(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {pinnedFiles.length === 0 ? (
            <div className="case-drawer-empty">
              No files pinned yet. Pin PDFs, contracts, specs, or images so every follow-up turn retains full document context.
            </div>
          ) : (
            <div className="case-files-grid">
              {pinnedFiles.map((pf) => (
                <div key={pf.id} className="case-file-chip">
                  <span>📎 {pf.filename}</span>
                  {pf.estimated_tokens > 0 && (
                    <span className="case-file-tok">~{pf.estimated_tokens} tok</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleUnpinCaseFile(pf.id)}
                    title="Unpin from conversation"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Split View: Chat Stream + Optional Artifact Reader Drawer */}
      <div className="chat-workspace-split">
        <div className="messages-container">
          {conversation.messages.length === 0 ? (
            <div className="empty-state">
              <div className="gemini-hero-badge">⚖️ Multi-Agent Consensus &amp; Synthesis</div>
              <h2>Consult Your Custom AI Council</h2>
              <p>
                {activeSeatsCount} specialized seats will independently draft responses, conduct blind peer review in{' '}
                <strong>{reconMode.replace('_', ' ').toUpperCase()}</strong> mode, and synthesize a verified answer.
              </p>

              <div className="starter-cards-grid">
                <button
                  type="button"
                  className="starter-card"
                  onClick={() =>
                    onSendMessage({
                      content:
                        'Generate a board-ready Executive Decision Brief comparing microservices vs. modular monolith architecture, and compile a downloadable PDF report using an <artifact type="pdf" title="Architecture_Decision_Brief"> tag.',
                      executionMode: 'full_council',
                      webSearch: false,
                      attachments: [],
                    })
                  }
                >
                  <span className="starter-icon">📕</span>
                  <strong>Generate PDF Decision Brief</strong>
                  <span>Full 3-Stage deliberation + compiled downloadable PDF artifact</span>
                </button>

                <button
                  type="button"
                  className="starter-card"
                  onClick={() =>
                    onSendMessage({
                      content:
                        'Perform a zero-loss Union Risk audit on a typical SaaS Enterprise MSA: list all hidden indemnification traps, uncapped liability clauses, and IP assignment pitfalls with recommended redline language.',
                      executionMode: 'full_council',
                      webSearch: false,
                      attachments: [],
                    })
                  }
                >
                  <span className="starter-icon">🛡️</span>
                  <strong>Legal &amp; Risk Clause Audit</strong>
                  <span>Surface every unique risk &amp; loophole across council personas</span>
                </button>

                <button
                  type="button"
                  className="starter-card"
                  onClick={() =>
                    onSendMessage({
                      content:
                        'Compare the top 5 vector databases for production RAG systems and output a downloadable comparison matrix wrapped in <artifact type="csv" title="Vector_DB_Comparison"> tags.',
                      executionMode: 'full_council',
                      webSearch: true,
                      attachments: [],
                    })
                  }
                >
                  <span className="starter-icon">📊</span>
                  <strong>Web-Grounded CSV Dataset</strong>
                  <span>Live web search grounding + downloadable spreadsheet artifact</span>
                </button>
              </div>
            </div>
          ) : (
            conversation.messages.map((msg, index) => (
              <div key={msg.id || index} className="message-group">
                <MessageItem
                  msg={msg}
                  index={index}
                  totalBranches={index === 0 ? totalBranches : 0}
                  onSwitchBranch={onSwitchBranch}
                  onEditAndRerun={onEditAndRerun}
                  onResynthesizeStage3={onResynthesizeStage3}
                  onRegenerateFull={onRegenerateFull}
                  onExportMessage={onExportMessage}
                  onPreviewArtifact={(art) => setPreviewArtifact(art)}
                  isBusy={isLoading}
                />
              </div>
            ))
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Side-by-Side Artifact Preview Reader Drawer */}
        {previewArtifact && (
          <aside className="artifact-reader-drawer">
            <div className="reader-header">
              <div>
                <span className="reader-badge">
                  {(previewArtifact.format || 'DOC').toUpperCase()} PREVIEW
                </span>
                <h4>{previewArtifact.title || previewArtifact.filename}</h4>
              </div>
              <div className="reader-header-actions">
                <a
                  href={api.getDownloadUrl(
                    previewArtifact.download_url || previewArtifact.id
                  )}
                  download={previewArtifact.filename}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-btn xs"
                >
                  ⬇ Download {previewArtifact.format?.toUpperCase()}
                </a>
                <button
                  type="button"
                  className="icon-close-btn sm"
                  onClick={() => setPreviewArtifact(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="reader-body markdown-content">
              <ReactMarkdown>
                {previewArtifact.preview_content || 'Preview ready for download.'}
              </ReactMarkdown>
            </div>
          </aside>
        )}
      </div>

      {/* Persistent Bottom Gemini Prompt Bar */}
      <PromptBar
        conversationId={conversation.id}
        onSendMessage={onSendMessage}
        onStopGeneration={onStopGeneration}
        onFilePinnedChange={onRefreshConversation}
        isLoading={isLoading}
        prompts={prompts}
        onSavePromptTemplate={onSavePromptTemplate}
        onDeletePromptTemplate={onDeletePromptTemplate}
      />
    </div>
  );
}
