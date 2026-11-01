import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export default function PromptBar({
  conversationId,
  onSendMessage,
  onStopGeneration,
  onFilePinnedChange,
  isLoading,
  prompts = [],
  onSavePromptTemplate,
  onDeletePromptTemplate,
}) {
  const [input, setInput] = useState('');
  const [executionMode, setExecutionMode] = useState('full_council'); // 'full_council' | 'solo'
  const [webSearch, setWebSearch] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newCmd, setNewCmd] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-open slash command menu when input starts with '/'
  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ') && input.length < 25) {
      setShowSlashMenu(true);
    }
  }, [input]);

  const filteredPrompts = prompts.filter((p) => {
    if (!input.startsWith('/')) return true;
    const q = input.slice(1).toLowerCase();
    return (
      p.command?.toLowerCase().includes(q) ||
      p.title?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  const handleSelectPromptTemplate = (tpl) => {
    setInput(tpl.content);
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const handleFilesSelected = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded = [];
      for (const file of Array.from(fileList)) {
        const rec = await api.uploadFile(file, conversationId, false);
        uploaded.push(rec);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Failed to upload file: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTogglePinAttachment = async (idx) => {
    const target = attachments[idx];
    const nextPinned = !target.pinned;
    const updated = [...attachments];
    updated[idx] = { ...target, pinned: nextPinned };
    setAttachments(updated);

    if (conversationId && target.id) {
      try {
        if (nextPinned) {
          await api.pinFile(conversationId, target.id);
        } else {
          await api.unpinFile(conversationId, target.id);
        }
        if (onFilePinnedChange) onFilePinnedChange();
      } catch (e) {
        console.warn('Pin toggle warning:', e);
      }
    }
  };

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || isUploading) return;

    onSendMessage({
      content: input.trim() || 'Analyze the attached context.',
      executionMode,
      webSearch,
      attachments,
    });
    setInput('');
    setAttachments([]);
    setShowSlashMenu(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'Escape' && showSlashMenu) {
      setShowSlashMenu(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleSaveTemplateForm = async (e) => {
    e.preventDefault();
    if (!newCmd.trim() || !newTitle.trim() || !newContent.trim()) return;
    await onSavePromptTemplate({
      command: newCmd.trim(),
      title: newTitle.trim(),
      category: 'Custom',
      content: newContent.trim(),
    });
    setNewCmd('');
    setNewTitle('');
    setNewContent('');
    setShowCreateTemplate(false);
  };

  return (
    <div
      className={`gemini-prompt-wrapper ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Slash Command Prompt Library Popover */}
      {showSlashMenu && (
        <div className="slash-menu-popover">
          <div className="slash-menu-header">
            <span>⚡ Prompt Templates Library (type <code>/</code> to filter)</span>
            <div className="slash-header-actions">
              <button
                type="button"
                className="secondary-btn xs"
                onClick={() => setShowCreateTemplate((s) => !s)}
              >
                {showCreateTemplate ? 'Cancel' : '+ New Template'}
              </button>
              <button
                type="button"
                className="icon-close-btn sm"
                onClick={() => setShowSlashMenu(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {showCreateTemplate ? (
            <form className="slash-create-form" onSubmit={handleSaveTemplateForm}>
              <div className="slash-form-row">
                <input
                  type="text"
                  placeholder="/command-slug"
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Template Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>
              <textarea
                rows={2}
                placeholder="Reusable prompt template content..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                required
              />
              <button type="submit" className="primary-btn xs">
                Save Prompt Template
              </button>
            </form>
          ) : (
            <div className="slash-menu-list">
              {filteredPrompts.map((tpl) => (
                <div
                  key={tpl.id || tpl.command}
                  className="slash-menu-item"
                  onClick={() => handleSelectPromptTemplate(tpl)}
                >
                  <div className="slash-item-top">
                    <code className="slash-cmd-code">{tpl.command}</code>
                    <strong className="slash-item-title">{tpl.title}</strong>
                    <span className="slash-item-cat">{tpl.category}</span>
                    {onDeletePromptTemplate && tpl.category === 'Custom' && (
                      <button
                        type="button"
                        className="slash-del-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePromptTemplate(tpl.id);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="slash-item-preview">{tpl.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending File Chips Bar */}
      {(attachments.length > 0 || isUploading) && (
        <div className="pending-attachments-bar">
          {attachments.map((att, idx) => (
            <div key={att.id || idx} className="pending-attachment-chip">
              {att.is_image && att.data_url ? (
                <img src={att.data_url} alt={att.filename} className="pending-thumb" />
              ) : (
                <span className="pending-file-icon">📄</span>
              )}
              <div className="pending-file-info">
                <span className="pending-filename" title={att.filename}>
                  {att.filename}
                </span>
                <span className="pending-tokens">~{att.estimated_tokens} tokens</span>
              </div>
              <button
                type="button"
                className={`pin-chat-toggle ${att.pinned ? 'pinned' : ''}`}
                onClick={() => handleTogglePinAttachment(idx)}
                title={
                  att.pinned
                    ? 'Pinned to Conversation (included in all turns)'
                    : 'Click to Pin file to Conversation Case Drawer'
                }
              >
                {att.pinned ? '📌 Pinned' : '📍 Single Turn'}
              </button>
              <button
                type="button"
                className="remove-att-btn"
                onClick={() => handleRemoveAttachment(idx)}
                title="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="pending-uploading-chip">
              <div className="spinner sm" />
              <span>Parsing document context...</span>
            </div>
          )}
        </div>
      )}

      {/* Main Gemini Input Card */}
      <form className="gemini-input-card" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.py,.js,.jsx,.ts,.tsx,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }}
          onChange={(e) => handleFilesSelected(e.target.files)}
        />

        <textarea
          ref={textareaRef}
          className="gemini-textarea"
          placeholder="Ask the LLM Council anything, drop PDFs/DOCX/Images, or type '/' for Prompt Templates..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={Math.min(7, Math.max(2, input.split('\n').length))}
        />

        <div className="gemini-controls-toolbar">
          <div className="toolbar-left">
            {/* Attach File / Multimodal Button */}
            <button
              type="button"
              className="toolbar-pill-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Attach PDF, DOCX, Excel, Code, or Image (or drag & drop)"
            >
              📎 Attach
            </button>

            {/* Slash Prompts Library Button */}
            <button
              type="button"
              className={`toolbar-pill-btn ${showSlashMenu ? 'active' : ''}`}
              onClick={() => setShowSlashMenu((s) => !s)}
              title="Open reusable Slash Prompt Templates (/)"
            >
              ⚡ Prompts
            </button>

            {/* Live Web Grounding Toggle */}
            <button
              type="button"
              className={`toolbar-pill-btn web-toggle ${webSearch ? 'active' : ''}`}
              onClick={() => setWebSearch((w) => !w)}
              title="Toggle Live Web Search Grounding with Source Citations"
            >
              🌐 {webSearch ? 'Web Grounding: ON' : 'Search Web'}
            </button>

            {/* Execution Mode Toggle: Full Council vs Fast Solo */}
            <div className="execution-mode-segmented" title="Switch between Full 3-Stage Council and Fast Solo (Chairman Only)">
              <button
                type="button"
                className={`seg-btn ${executionMode === 'full_council' ? 'active' : ''}`}
                onClick={() => setExecutionMode('full_council')}
              >
                🏛️ Full Council (3-Stage)
              </button>
              <button
                type="button"
                className={`seg-btn ${executionMode === 'solo' ? 'active' : ''}`}
                onClick={() => setExecutionMode('solo')}
              >
                ⚡ Fast Solo (Chairman)
              </button>
            </div>
          </div>

          <div className="toolbar-right">
            {isLoading ? (
              <button
                type="button"
                className="stop-generation-btn"
                onClick={onStopGeneration}
                title="Stop in-flight council deliberation immediately"
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                type="submit"
                className="gemini-send-btn"
                disabled={(!input.trim() && attachments.length === 0) || isUploading}
              >
                Send ➤
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

