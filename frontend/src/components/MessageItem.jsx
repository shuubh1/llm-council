import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import ArtifactCard from './ArtifactCard';

const CODE_EXT_MAP = {
  python: 'py',
  py: 'py',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  html: 'html',
  css: 'css',
  json: 'json',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  yaml: 'yml',
  yml: 'yml',
  markdown: 'md',
  md: 'md',
  csv: 'csv',
};

function CodeBlockRenderer({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);

  const match = /language-(\w+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');
  const isMultiLine = !inline && (match || codeText.includes('\n'));

  if (!isMultiLine) {
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  }

  const lang = (match?.[1] || 'text').toLowerCase();

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadCode = () => {
    const ext = CODE_EXT_MAP[lang] || 'txt';
    const blob = new Blob([codeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `council_snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="polished-code-block">
      <div className="code-block-header">
        <span className="code-lang-badge">{lang}</span>
        <div className="code-block-actions">
          <button
            type="button"
            className="code-action-btn"
            onClick={() => setWrapLines((w) => !w)}
            title="Toggle line wrapping"
          >
            {wrapLines ? '⇄ Unwrap' : '↩ Wrap'}
          </button>
          <button
            type="button"
            className="code-action-btn"
            onClick={handleCopyCode}
            title="Copy code to clipboard"
          >
            {copied ? '✓ Copied' : '📋 Copy Code'}
          </button>
          <button
            type="button"
            className="code-action-btn"
            onClick={handleDownloadCode}
            title="Download snippet as file"
          >
            ⬇ Download File
          </button>
        </div>
      </div>
      <pre className={`code-block-pre ${wrapLines ? 'wrap' : ''}`}>
        <code className={className} {...props}>
          {codeText}
        </code>
      </pre>
    </div>
  );
}

export default function MessageItem({
  msg,
  index,
  totalBranches = 0,
  onSwitchBranch,
  onEditAndRerun,
  onResynthesizeStage3,
  onRegenerateFull,
  onExportMessage,
  onPreviewArtifact,
  isBusy,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(msg.content || '');
  const [copiedUser, setCopiedUser] = useState(false);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('stage1'); // 'stage1' | 'stage2'

  const [copiedRich, setCopiedRich] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [showResynthMenu, setShowResynthMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [customChairModel, setCustomChairModel] = useState('');
  const [isResynthesizing, setIsResynthesizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const richContentRef = useRef(null);

  // ==========================================================================
  // User Message Rendering
  // ==========================================================================
  if (msg.role === 'user') {
    const handleCopyPrompt = async () => {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedUser(true);
      setTimeout(() => setCopiedUser(false), 1800);
    };

    const handleSaveEdit = () => {
      if (!editValue.trim() || isBusy) return;
      setIsEditing(false);
      onEditAndRerun(index, editValue.trim());
    };

    return (
      <div className="user-message-row">
        <div className="user-message-card">
          <div className="user-msg-header">
            <span className="message-label">You</span>
            <div className="user-msg-badges">
              {msg.execution_mode === 'solo' && (
                <span className="mini-tag solo">⚡ Fast Solo</span>
              )}
              {msg.web_search && <span className="mini-tag web">🌐 Web Grounded</span>}
              {totalBranches > 0 && onSwitchBranch && (
                <div className="branch-switcher" title="Switch conversation edit branch">
                  <button
                    type="button"
                    onClick={() => onSwitchBranch(0)}
                    className="branch-btn"
                  >
                    ‹ 1 / {totalBranches + 1} ›
                  </button>
                </div>
              )}
            </div>
          </div>

          {msg.attachments && msg.attachments.length > 0 && (
            <div className="user-msg-attachments">
              {msg.attachments.map((att, i) => (
                <div key={att.id || i} className="msg-attachment-chip">
                  {att.is_image && att.data_url ? (
                    <img
                      src={att.data_url}
                      alt={att.filename}
                      className="att-chip-thumb"
                    />
                  ) : (
                    <span className="att-chip-icon">📎</span>
                  )}
                  <span className="att-chip-name">{att.filename}</span>
                  {att.estimated_tokens > 0 && (
                    <span className="att-chip-tokens">~{att.estimated_tokens} tok</span>
                  )}
                  {att.pinned && <span className="att-chip-pin">📌 Pinned</span>}
                </div>
              ))}
            </div>
          )}

          {isEditing ? (
            <div className="inline-edit-box">
              <textarea
                className="inline-edit-textarea"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={Math.min(10, Math.max(3, editValue.split('\n').length))}
                autoFocus
              />
              <div className="inline-edit-actions">
                <button
                  type="button"
                  className="secondary-btn sm"
                  onClick={() => {
                    setEditValue(msg.content || '');
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn sm"
                  onClick={handleSaveEdit}
                  disabled={!editValue.trim() || isBusy}
                >
                  Save &amp; Re-run Council
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="user-msg-text markdown-content">
                <ReactMarkdown components={{ code: CodeBlockRenderer }}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              <div className="user-hover-actions">
                <button
                  type="button"
                  className="hover-action-btn"
                  onClick={handleCopyPrompt}
                  title="Copy prompt"
                >
                  {copiedUser ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  type="button"
                  className="hover-action-btn"
                  onClick={() => {
                    setEditValue(msg.content || '');
                    setIsEditing(true);
                  }}
                  disabled={isBusy}
                  title="Edit prompt in-place and branch conversation"
                >
                  ✏️ Edit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Assistant / Council Message Rendering
  // ==========================================================================
  const stage1Count = msg.stage1?.length || 0;
  const stage2Count = msg.stage2?.length || 0;
  const hasDebateStages = stage1Count > 0 || stage2Count > 0;
  const execTime = msg.metadata?.execution_time;
  const totalTokens = msg.metadata?.total_tokens;
  const citations = msg.metadata?.citations || [];
  const artifacts = msg.artifacts || [];
  const finalResponseText = msg.stage3?.response || '';

  const handleCopyRichText = async () => {
    try {
      const htmlEl = richContentRef.current;
      const htmlString = htmlEl ? htmlEl.innerHTML : `<p>${finalResponseText}</p>`;
      // Strip raw markdown symbols for the plain text fallback
      const cleanPlain = htmlEl
        ? htmlEl.innerText
        : finalResponseText.replace(/[#*_`~>]/g, '');

      if (window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html': new Blob([htmlString], { type: 'text/html' }),
          'text/plain': new Blob([cleanPlain], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(cleanPlain);
      }
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 2000);
    } catch (err) {
      console.warn('ClipboardItem fallback:', err);
      await navigator.clipboard.writeText(finalResponseText);
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 2000);
    }
  };

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(finalResponseText);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  const triggerResynthesize = async (modifier, chairOverride = null) => {
    setShowResynthMenu(false);
    setIsResynthesizing(true);
    try {
      await onResynthesizeStage3(index, modifier, chairOverride);
    } finally {
      setIsResynthesizing(false);
    }
  };

  const triggerExport = async (format) => {
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      await onExportMessage(index, finalResponseText, format);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="assistant-message-card">
      <div className="assistant-header-row">
        <div className="council-avatar-badge">⚖️</div>
        <div className="council-header-meta">
          <span className="council-title-label">
            LLM Council
            {msg.stage3?.role_name ? ` • ${msg.stage3.role_name}` : ''}
          </span>
          {msg.stage3?.model && (
            <span className="chairman-model-chip">
              {msg.stage3.model.split('/')[1] || msg.stage3.model}
            </span>
          )}
          {msg.metadata?.reconciliation_mode && (
            <span className={`recon-chip ${msg.metadata.reconciliation_mode}`}>
              {msg.metadata.reconciliation_mode === 'union_risk'
                ? '🛡️ Union Risk'
                : msg.metadata.reconciliation_mode === 'adversarial'
                ? '⚔️ Adversarial'
                : msg.metadata.reconciliation_mode === 'solo'
                ? '⚡ Fast Solo'
                : '🤝 Consensus'}
            </span>
          )}
        </div>
      </div>

      {/* Live Progress Banners while stages are streaming */}
      {msg.loading?.web_search && (
        <div className="stage-loading">
          <div className="spinner" />
          <span>Searching live web sources for grounding citations...</span>
        </div>
      )}
      {msg.loading?.stage1 && (
        <div className="stage-loading">
          <div className="spinner" />
          <span>Running Stage 1: Collecting parallel council seat responses...</span>
        </div>
      )}
      {msg.loading?.stage2 && (
        <div className="stage-loading">
          <div className="spinner" />
          <span>Running Stage 2: Blind peer review &amp; Borda ranking...</span>
        </div>
      )}
      {msg.loading?.stage3 && (
        <div className="stage-loading">
          <div className="spinner" />
          <span>Running Stage 3: Chairman synthesis...</span>
        </div>
      )}

      {/* Sleek Collapsible Stage Inspector Pill */}
      {hasDebateStages && (
        <div className="stage-inspector-wrapper">
          <button
            type="button"
            className={`stage-inspector-pill ${inspectorOpen ? 'open' : ''}`}
            onClick={() => setInspectorOpen((o) => !o)}
          >
            <span className="pill-icon">{inspectorOpen ? '▼' : '▶'}</span>
            <span className="pill-main-text">
              View Council Debate: {stage1Count} Drafts • Peer Rankings • Leaderboard
            </span>
            {execTime && <span className="pill-metric">• {execTime}s</span>}
            {totalTokens > 0 && <span className="pill-metric">• {totalTokens} tok</span>}
          </button>

          {inspectorOpen && (
            <div className="stage-inspector-drawer">
              <div className="inspector-subtabs">
                <button
                  type="button"
                  className={`inspector-subtab ${inspectorTab === 'stage1' ? 'active' : ''}`}
                  onClick={() => setInspectorTab('stage1')}
                >
                  Stage 1: Individual Seat Drafts ({stage1Count})
                </button>
                <button
                  type="button"
                  className={`inspector-subtab ${inspectorTab === 'stage2' ? 'active' : ''}`}
                  onClick={() => setInspectorTab('stage2')}
                >
                  Stage 2: Peer Rankings &amp; Borda Leaderboard ({stage2Count})
                </button>
              </div>

              {inspectorTab === 'stage1' && <Stage1 responses={msg.stage1} />}
              {inspectorTab === 'stage2' && (
                <Stage2
                  rankings={msg.stage2}
                  labelToModel={msg.metadata?.label_to_model}
                  aggregateRankings={msg.metadata?.aggregate_rankings}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Prominent Stage 3 Synthesis Stream */}
      {msg.stage3 && (
        <div className="gemini-synthesis-body" ref={richContentRef}>
          {msg.stage3.modifier && (
            <div className="resynth-modifier-banner">
              ✨ Re-synthesized with modifier: <strong>{msg.stage3.modifier}</strong>
            </div>
          )}
          <div className="markdown-content">
            <ReactMarkdown components={{ code: CodeBlockRenderer }}>
              {finalResponseText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Clickable Web Grounding Source Citation Pills */}
      {citations.length > 0 && (
        <div className="citations-bar">
          <span className="citations-label">🌐 Grounded Sources:</span>
          <div className="citations-pills-list">
            {citations.map((c, idx) => (
              <a
                key={idx}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="citation-pill"
                title={c.snippet}
              >
                <span className="citation-num">[{idx + 1}]</span>
                <span className="citation-title">{c.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Generated Downloadable File Cards (Artifacts) */}
      {artifacts.length > 0 && (
        <div className="artifacts-list">
          {artifacts.map((art) => (
            <ArtifactCard
              key={art.id}
              artifact={art}
              onPreview={onPreviewArtifact}
            />
          ))}
        </div>
      )}

      {/* Assistant Bottom Action Bar */}
      {msg.stage3 && (
        <div className="assistant-action-bar">
          <button
            type="button"
            className="action-bar-btn"
            onClick={handleCopyRichText}
            title="Copy formatted Rich Text (for pasting into Word/Google Docs without raw # or **)"
          >
            {copiedRich ? '✓ Copied Rich Text' : '📄 Copy Rich Text'}
          </button>

          <button
            type="button"
            className="action-bar-btn"
            onClick={handleCopyMarkdown}
            title="Copy raw Markdown source"
          >
            {copiedMd ? '✓ Copied MD' : '📋 Copy Markdown'}
          </button>

          {/* Re-Synthesize Stage 3 Only Dropdown */}
          <div className="dropdown-anchor">
            <button
              type="button"
              className="action-bar-btn highlight"
              onClick={() => {
                setShowResynthMenu((s) => !s);
                setShowExportMenu(false);
              }}
              disabled={isBusy || isResynthesizing}
              title="Re-run ONLY Stage 3 Chairman Synthesis (saves Stage 1 & 2 cost)"
            >
              {isResynthesizing ? '⏳ Re-Synthesizing...' : '⚡ Re-Synthesize Stage 3 ▾'}
            </button>

            {showResynthMenu && (
              <div className="action-dropdown-menu">
                <div className="dropdown-section-title">Quick Synthesis Modifiers</div>
                <button
                  type="button"
                  onClick={() => triggerResynthesize('concise')}
                >
                  ✂️ Make Concise (Executive Summary)
                </button>
                <button
                  type="button"
                  onClick={() => triggerResynthesize('formal')}
                >
                  🏛️ Make Formal (Board / Legal Tone)
                </button>
                <button
                  type="button"
                  onClick={() => triggerResynthesize('expand')}
                >
                  🔬 Expand Technical Details
                </button>
                <button
                  type="button"
                  onClick={() => triggerResynthesize('action_plan')}
                >
                  📋 Convert to Prioritized Action Plan
                </button>
                <div className="dropdown-divider" />
                <div className="dropdown-custom-chair">
                  <input
                    type="text"
                    placeholder="Override Chairman model ID..."
                    value={customChairModel}
                    onChange={(e) => setCustomChairModel(e.target.value)}
                  />
                  <button
                    type="button"
                    className="primary-btn xs"
                    onClick={() =>
                      triggerResynthesize(null, customChairModel.trim() || null)
                    }
                  >
                    Run
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Regenerate Full 3-Stage Run */}
          <button
            type="button"
            className="action-bar-btn"
            onClick={() => onRegenerateFull(index)}
            disabled={isBusy}
            title="Re-run all 3 stages from scratch"
          >
            🔄 Regenerate Full Run
          </button>

          {/* Export Response As Downloadable File Menu */}
          <div className="dropdown-anchor">
            <button
              type="button"
              className="action-bar-btn export"
              onClick={() => {
                setShowExportMenu((s) => !s);
                setShowResynthMenu(false);
              }}
              disabled={isExporting}
              title="Convert this response into a real downloadable document"
            >
              {isExporting ? '⏳ Generating File...' : '📥 Export Response As... ▾'}
            </button>

            {showExportMenu && (
              <div className="action-dropdown-menu">
                <div className="dropdown-section-title">Generate Downloadable Artifact</div>
                <button type="button" onClick={() => triggerExport('pdf')}>
                  📕 Styled PDF Report (.pdf)
                </button>
                <button type="button" onClick={() => triggerExport('docx')}>
                  📘 Word Document (.docx)
                </button>
                <button type="button" onClick={() => triggerExport('xlsx')}>
                  📗 Excel Spreadsheet (.xlsx)
                </button>
                <button type="button" onClick={() => triggerExport('csv')}>
                  📊 CSV Dataset (.csv)
                </button>
                <button type="button" onClick={() => triggerExport('md')}>
                  📝 Markdown Document (.md)
                </button>
                <button type="button" onClick={() => triggerExport('txt')}>
                  📄 Plain Text (.txt)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

