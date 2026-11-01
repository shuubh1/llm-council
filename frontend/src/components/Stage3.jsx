import ReactMarkdown from 'react-markdown';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  if (!finalResponse) {
    return null;
  }

  return (
    <div className="stage stage3">
      <div className="final-response">
        <div className="chairman-label">
          <span>
            ⚖️ {finalResponse.role_name || 'Chairman'}:{' '}
            <strong>{finalResponse.model?.split('/')[1] || finalResponse.model}</strong>
          </span>
          {finalResponse.reconciliation_mode && (
            <span className="recon-mode-tag">
              Mode: {finalResponse.reconciliation_mode.toUpperCase()}
            </span>
          )}
          {finalResponse.modifier && (
            <span className="modifier-tag">Refined: {finalResponse.modifier}</span>
          )}
        </div>
        <div className="final-text markdown-content">
          <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
