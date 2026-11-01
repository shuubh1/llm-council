import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './Stage1.css';

export default function Stage1({ responses }) {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState(null);

  if (!responses || responses.length === 0) {
    return null;
  }

  const safeIndex = activeTab < responses.length ? activeTab : 0;
  const current = responses[safeIndex];

  const handleCopyDraft = async () => {
    if (!current?.response) return;
    await navigator.clipboard.writeText(current.response);
    setCopiedIdx(safeIndex);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  return (
    <div className="stage stage1">
      <div className="stage-header-bar">
        <h3 className="stage-title">Stage 1: Individual Council Seat Drafts</h3>
        <span className="stage-count-badge">{responses.length} Parallel Seats</span>
      </div>

      <div className="tabs">
        {responses.map((resp, index) => {
          const shortModel = resp.model?.split('/')[1] || resp.model;
          return (
            <button
              key={index}
              type="button"
              className={`tab ${safeIndex === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              <span className="tab-role">{resp.role_name || `Seat #${index + 1}`}</span>
              <span className="tab-model-sub">{shortModel}</span>
            </button>
          );
        })}
      </div>

      <div className="tab-content">
        <div className="draft-meta-header">
          <div className="draft-meta-badges">
            {current.role_name && (
              <span className="role-pill-badge">{current.role_name}</span>
            )}
            <span className="model-pill-badge">{current.model}</span>
            {current.latency_ms > 0 && (
              <span className="telemetry-pill">{(current.latency_ms / 1000).toFixed(1)}s</span>
            )}
            {current.usage?.total_tokens > 0 && (
              <span className="telemetry-pill">{current.usage.total_tokens} tok</span>
            )}
          </div>
          <button
            type="button"
            className="copy-draft-btn"
            onClick={handleCopyDraft}
          >
            {copiedIdx === safeIndex ? '✓ Copied Draft' : '📋 Copy Draft'}
          </button>
        </div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{current.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
