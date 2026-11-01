import { useState } from 'react';
import SidebarSearch from './SidebarSearch';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onSearchConversations,
  onTogglePinConversation,
  onRenameConversation,
  onDeleteConversation,
  onExportThread,
  onOpenStudio,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');

  const startRename = (e, conv) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameText(conv.title || 'New Conversation');
  };

  const submitRename = async (e, id) => {
    e.stopPropagation();
    if (renameText.trim()) {
      await onRenameConversation(id, renameText.trim());
    }
    setRenamingId(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-row">
          <div className="brand-logo">⚖️</div>
          <div>
            <h1>LLM Council</h1>
            <span className="brand-subtitle">Gemini Console v2.0</span>
          </div>
        </div>

        <button className="new-conversation-btn" onClick={onNewConversation}>
          + New Deliberation
        </button>

        <SidebarSearch onSearch={onSearchConversations} />
      </div>

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">No conversations found</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                conv.id === currentConversationId ? 'active' : ''
              } ${conv.pinned ? 'pinned-conv' : ''}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              {renamingId === conv.id ? (
                <div className="inline-rename-row" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(e, conv.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={(e) => submitRename(e, conv.id)}>
                    ✓
                  </button>
                </div>
              ) : (
                <>
                  <div className="conv-top-line">
                    <div className="conversation-title" title={conv.title}>
                      {conv.pinned && <span className="pin-badge">📌 </span>}
                      {conv.title || 'New Conversation'}
                    </div>
                  </div>

                  {conv.snippet && (
                    <div className="conversation-snippet">{conv.snippet}</div>
                  )}

                  <div className="conv-bottom-line">
                    <span className="conversation-meta">
                      {conv.message_count} msgs
                      {conv.pinned_files_count > 0
                        ? ` • 📎 ${conv.pinned_files_count}`
                        : ''}
                    </span>

                    <div
                      className="conv-hover-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title={conv.pinned ? 'Unpin conversation' : 'Pin to Top'}
                        onClick={() => onTogglePinConversation(conv.id, !conv.pinned)}
                      >
                        📌
                      </button>
                      <button
                        type="button"
                        title="Rename conversation"
                        onClick={(e) => startRename(e, conv)}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        title="Export Full Thread as PDF"
                        onClick={() => onExportThread(conv.id)}
                      >
                        📥
                      </button>
                      <button
                        type="button"
                        className="del-btn"
                        title="Delete conversation"
                        onClick={() => onDeleteConversation(conv.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="studio-launch-btn" onClick={onOpenStudio}>
          ⚙️ Council Studio &amp; Rules
        </button>
      </div>
    </aside>
  );
}
