import { api } from '../api';

const FORMAT_META = {
  pdf: { icon: '📕', badge: 'PDF Document', color: '#dc2626' },
  docx: { icon: '📘', badge: 'Word DOCX', color: '#2563eb' },
  xlsx: { icon: '📗', badge: 'Excel XLSX', color: '#16a34a' },
  csv: { icon: '📊', badge: 'CSV Dataset', color: '#059669' },
  md: { icon: '📝', badge: 'Markdown', color: '#7c3aed' },
  txt: { icon: '📄', badge: 'Plain Text', color: '#475569' },
};

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ArtifactCard({ artifact, onPreview }) {
  if (!artifact) return null;

  const fmt = (artifact.format || 'pdf').toLowerCase();
  const meta = FORMAT_META[fmt] || FORMAT_META.txt;
  const downloadUrl = api.getDownloadUrl(artifact.download_url || artifact.id);

  return (
    <div className="artifact-card">
      <div className="artifact-icon" style={{ borderColor: meta.color }}>
        <span>{meta.icon}</span>
      </div>
      <div className="artifact-details">
        <div className="artifact-title" title={artifact.filename || artifact.title}>
          {artifact.title || artifact.filename}
        </div>
        <div className="artifact-meta-row">
          <span className="artifact-format-badge" style={{ backgroundColor: meta.color }}>
            {meta.badge}
          </span>
          <span className="artifact-size">{formatFileSize(artifact.size_bytes)}</span>
          <span className="artifact-filename">{artifact.filename}</span>
        </div>
      </div>
      <div className="artifact-actions">
        {onPreview && (
          <button
            type="button"
            className="artifact-btn preview"
            onClick={() => onPreview(artifact)}
            title="Open side-by-side reader preview"
          >
            👁 Preview
          </button>
        )}
        <a
          href={downloadUrl}
          download={artifact.filename}
          target="_blank"
          rel="noreferrer"
          className="artifact-btn download"
          title="Download generated file"
        >
          ⬇ Download
        </a>
      </div>
    </div>
  );
}

