import { useState, useEffect } from 'react';

const SUGGESTED_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3.5-lightning:free',
  'cohere/north-mini-code:free',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o',
  'deepseek/deepseek-r1:free',
];

const RECONCILIATION_MODES = [
  {
    id: 'consensus',
    label: 'Consensus Synthesis',
    badge: 'Balanced',
    description:
      'Synthesizes majority agreement across the council while noting key trade-offs and nuances.',
  },
  {
    id: 'union_risk',
    label: 'Union Risk (Risk-Preservation)',
    badge: 'Zero-Loss Audit',
    description:
      'Explicitly preserves and surfaces EVERY unique risk, loophole, or edge case flagged by ANY single seat.',
  },
  {
    id: 'adversarial',
    label: 'Adversarial Red-Team',
    badge: 'Stress-Test',
    description:
      'Stage 2 peer reviewers aggressively hunt for logical flaws, weak assumptions, and hallucinated citations.',
  },
];

export default function CouncilStudioModal({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onSavePreset,
  onDeletePreset,
}) {
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('seats'); // 'seats' | 'chairman' | 'presets'
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (config) {
      setDraft(JSON.parse(JSON.stringify(config)));
    }
  }, [config, isOpen]);

  if (!isOpen || !draft) return null;

  const handleSeatChange = (index, field, value) => {
    const updated = [...draft.members];
    updated[index] = { ...updated[index], [field]: value };
    setDraft({ ...draft, members: updated });
  };

  const handleAddSeat = () => {
    const nextNum = draft.members.length + 1;
    const newSeat = {
      id: `seat-${Date.now()}`,
      model: 'nvidia/nemotron-3.5-lightning:free',
      role_name: `Specialist Seat #${nextNum}`,
      system_prompt:
        'Provide rigorous domain analysis, surface hidden trade-offs, and cite concrete examples.',
      temperature: 0.7,
      enabled: true,
    };
    setDraft({ ...draft, members: [...draft.members, newSeat] });
  };

  const handleRemoveSeat = (index) => {
    if (draft.members.length <= 1) return;
    const updated = draft.members.filter((_, idx) => idx !== index);
    setDraft({ ...draft, members: updated });
  };

  const handleLoadPreset = (preset) => {
    setDraft({
      ...draft,
      reconciliation_mode: preset.reconciliation_mode || 'consensus',
      chairman_model: preset.chairman_model || draft.chairman_model,
      chairman_role_name: preset.chairman_role_name || draft.chairman_role_name,
      chairman_system_prompt: preset.chairman_system_prompt || draft.chairman_system_prompt,
      chairman_temperature: preset.chairman_temperature ?? 0.5,
      zero_data_retention: Boolean(preset.zero_data_retention),
      members: JSON.parse(JSON.stringify(preset.members || [])),
    });
    setStatusMsg(`Loaded preset "${preset.name}" — click Save Configuration to apply.`);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg('');
    try {
      await onSaveConfig(draft);
      setStatusMsg('Council configuration saved!');
      setTimeout(() => {
        onClose();
      }, 450);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePreset = async (e) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    setIsSaving(true);
    try {
      const updated = await onSavePreset(newPresetName.trim(), newPresetDesc.trim(), draft);
      setDraft(updated);
      setNewPresetName('');
      setNewPresetDesc('');
      setStatusMsg(`Saved preset "${newPresetName.trim()}"`);
    } catch (err) {
      setStatusMsg(`Error saving preset: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="studio-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="studio-header">
          <div>
            <h2>Council Studio — Roles, Rules & Reconciliation Engine</h2>
            <p className="studio-subtitle">
              Configure per-seat personas, OpenRouter model IDs, reconciliation rules, and Zero Data Retention.
            </p>
          </div>
          <button className="icon-close-btn" onClick={onClose} title="Close Council Studio">
            ✕
          </button>
        </div>

        <div className="studio-tabs-bar">
          <button
            className={`studio-tab-btn ${activeTab === 'seats' ? 'active' : ''}`}
            onClick={() => setActiveTab('seats')}
          >
            Council Seats ({draft.members.filter((m) => m.enabled).length}/{draft.members.length} Active)
          </button>
          <button
            className={`studio-tab-btn ${activeTab === 'chairman' ? 'active' : ''}`}
            onClick={() => setActiveTab('chairman')}
          >
            Chairman & Reconciliation ({draft.reconciliation_mode})
          </button>
          <button
            className={`studio-tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            Council Presets ({(draft.presets || []).length})
          </button>
        </div>

        <div className="studio-body">
          {/* Privacy & Reconciliation Quick Banner */}
          <div className="studio-privacy-bar">
            <label className="zdr-toggle-label">
              <input
                type="checkbox"
                checked={Boolean(draft.zero_data_retention)}
                onChange={(e) =>
                  setDraft({ ...draft, zero_data_retention: e.target.checked })
                }
              />
              <span className="zdr-title">
                🔒 Zero Data Retention (<code>data_collection: &quot;deny&quot;</code>)
              </span>
              <span className="zdr-hint">
                Enforces strict OpenRouter non-logging / zero-training policy when supported.
              </span>
            </label>
          </div>

          {activeTab === 'seats' && (
            <div className="studio-section">
              <div className="section-header-row">
                <div>
                  <h3>Council Member Seats</h3>
                  <p className="section-desc">
                    Each enabled seat runs in parallel during Stage 1 &amp; Stage 2 with its custom role and system rules.
                  </p>
                </div>
                <button type="button" className="primary-btn sm" onClick={handleAddSeat}>
                  + Add Council Seat
                </button>
              </div>

              <datalist id="openrouter-models-list">
                {SUGGESTED_MODELS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <div className="seats-grid">
                {draft.members.map((seat, idx) => (
                  <div
                    key={seat.id || idx}
                    className={`seat-card ${seat.enabled ? 'enabled' : 'disabled'}`}
                  >
                    <div className="seat-card-top">
                      <div className="seat-badge">Seat #{idx + 1}</div>
                      <label className="seat-enable-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(seat.enabled)}
                          onChange={(e) =>
                            handleSeatChange(idx, 'enabled', e.target.checked)
                          }
                        />
                        <span>{seat.enabled ? 'Active' : 'Muted'}</span>
                      </label>
                      {draft.members.length > 1 && (
                        <button
                          type="button"
                          className="seat-delete-btn"
                          onClick={() => handleRemoveSeat(idx)}
                          title="Remove Seat"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="seat-form-row">
                      <div className="form-field">
                        <label>Role Persona Title</label>
                        <input
                          type="text"
                          value={seat.role_name || ''}
                          onChange={(e) =>
                            handleSeatChange(idx, 'role_name', e.target.value)
                          }
                          placeholder="e.g., Lead Drafter, Devil's Advocate..."
                        />
                      </div>

                      <div className="form-field">
                        <label>OpenRouter Model ID</label>
                        <input
                          type="text"
                          list="openrouter-models-list"
                          value={seat.model || ''}
                          onChange={(e) =>
                            handleSeatChange(idx, 'model', e.target.value)
                          }
                          placeholder="e.g., nvidia/nemotron-3-ultra-550b-a55b:free"
                        />
                      </div>

                      <div className="form-field temp-field">
                        <label>
                          Temp: <strong>{Number(seat.temperature ?? 0.7).toFixed(1)}</strong>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1.5"
                          step="0.1"
                          value={seat.temperature ?? 0.7}
                          onChange={(e) =>
                            handleSeatChange(idx, 'temperature', parseFloat(e.target.value))
                          }
                        />
                      </div>
                    </div>

                    <div className="form-field">
                      <label>Seat System Prompt &amp; Domain Rules</label>
                      <textarea
                        rows={2}
                        value={seat.system_prompt || ''}
                        onChange={(e) =>
                          handleSeatChange(idx, 'system_prompt', e.target.value)
                        }
                        placeholder="Custom behavioral rules, domain constraints, and output formatting rules..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'chairman' && (
            <div className="studio-section">
              <h3>Reconciliation Strategy (Stage 2 &amp; Stage 3 Directives)</h3>
              <div className="reconciliation-grid">
                {RECONCILIATION_MODES.map((mode) => (
                  <div
                    key={mode.id}
                    className={`recon-card ${
                      draft.reconciliation_mode === mode.id ? 'selected' : ''
                    }`}
                    onClick={() =>
                      setDraft({ ...draft, reconciliation_mode: mode.id })
                    }
                  >
                    <div className="recon-card-header">
                      <span className="recon-title">{mode.label}</span>
                      <span className="recon-badge">{mode.badge}</span>
                    </div>
                    <p className="recon-desc">{mode.description}</p>
                  </div>
                ))}
              </div>

              <div className="chairman-config-box">
                <h3>Chairman Model &amp; Synthesis Instructions</h3>
                <div className="seat-form-row">
                  <div className="form-field">
                    <label>Chairman Role Title</label>
                    <input
                      type="text"
                      value={draft.chairman_role_name || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, chairman_role_name: e.target.value })
                      }
                      placeholder="Chief Justice / Synthesizer"
                    />
                  </div>
                  <div className="form-field">
                    <label>Chairman OpenRouter Model ID</label>
                    <input
                      type="text"
                      list="openrouter-models-list"
                      value={draft.chairman_model || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, chairman_model: e.target.value })
                      }
                      placeholder="nvidia/nemotron-3-ultra-550b-a55b:free"
                    />
                  </div>
                  <div className="form-field temp-field">
                    <label>
                      Temp: <strong>{Number(draft.chairman_temperature ?? 0.5).toFixed(1)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.1"
                      value={draft.chairman_temperature ?? 0.5}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          chairman_temperature: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Chairman Stage 3 System Prompt</label>
                  <textarea
                    rows={4}
                    value={draft.chairman_system_prompt || ''}
                    onChange={(e) =>
                      setDraft({ ...draft, chairman_system_prompt: e.target.value })
                    }
                    placeholder="Instructions for how the Chairman synthesizes Stage 1 & Stage 2 outputs..."
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'presets' && (
            <div className="studio-section">
              <h3>Saved Council Presets</h3>
              <p className="section-desc">
                One-click load specialized council configurations (seats, personas, models, and reconciliation mode).
              </p>

              <div className="presets-list">
                {(draft.presets || []).map((preset) => (
                  <div key={preset.id} className="preset-card">
                    <div className="preset-info">
                      <div className="preset-title-row">
                        <strong>{preset.name}</strong>
                        <span className="preset-mode-pill">
                          {preset.reconciliation_mode || 'consensus'}
                        </span>
                        <span className="preset-seats-pill">
                          {(preset.members || []).length} seats
                        </span>
                      </div>
                      <p>{preset.description}</p>
                    </div>
                    <div className="preset-actions">
                      <button
                        type="button"
                        className="secondary-btn sm"
                        onClick={() => handleLoadPreset(preset)}
                      >
                        Load Preset
                      </button>
                      {!preset.id?.startsWith('preset-free') &&
                        !preset.id?.startsWith('preset-legal') &&
                        !preset.id?.startsWith('preset-deep') && (
                          <button
                            type="button"
                            className="danger-btn sm"
                            onClick={async () => {
                              const updated = await onDeletePreset(preset.id);
                              setDraft(updated);
                            }}
                          >
                            Delete
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>

              <form className="save-preset-form" onSubmit={handleCreatePreset}>
                <h4>Save Current Configuration as New Preset</h4>
                <div className="seat-form-row">
                  <div className="form-field">
                    <label>Preset Name</label>
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Security Architecture Review"
                      required
                    />
                  </div>
                  <div className="form-field" style={{ flex: 2 }}>
                    <label>Short Description</label>
                    <input
                      type="text"
                      value={newPresetDesc}
                      onChange={(e) => setNewPresetDesc(e.target.value)}
                      placeholder="Describe when to use this council preset..."
                    />
                  </div>
                  <button type="submit" className="primary-btn" disabled={isSaving}>
                    Save Preset
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="studio-footer">
          <div className="studio-status">{statusMsg}</div>
          <div className="studio-footer-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save & Apply Council Config'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

