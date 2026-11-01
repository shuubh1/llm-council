/**
 * Production API client for the Gemini-Class LLM Council Console backend.
 */

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001').replace(/\/+$/, '');

export const api = {
  // ==========================================================================
  // Council Configuration & Presets
  // ==========================================================================
  async getConfig() {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) throw new Error(`Failed to load council config: ${response.status}`);
    return response.json();
  },

  async updateConfig(configData) {
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configData),
    });
    if (!response.ok) throw new Error(`Failed to save council config: ${response.status}`);
    return response.json();
  },

  async savePreset(name, description = '', config = null) {
    const response = await fetch(`${API_BASE}/api/config/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, config }),
    });
    if (!response.ok) throw new Error(`Failed to save preset: ${response.status}`);
    return response.json();
  },

  async deletePreset(presetId) {
    const response = await fetch(`${API_BASE}/api/config/presets/${presetId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Failed to delete preset: ${response.status}`);
    return response.json();
  },

  // ==========================================================================
  // Slash-Command Prompt Templates Library
  // ==========================================================================
  async listPrompts() {
    const response = await fetch(`${API_BASE}/api/prompts`);
    if (!response.ok) throw new Error(`Failed to load prompt templates: ${response.status}`);
    return response.json();
  },

  async savePrompt(promptItem) {
    const response = await fetch(`${API_BASE}/api/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptItem),
    });
    if (!response.ok) throw new Error(`Failed to save prompt template: ${response.status}`);
    return response.json();
  },

  async deletePrompt(promptId) {
    const response = await fetch(`${API_BASE}/api/prompts/${promptId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Failed to delete prompt template: ${response.status}`);
    return response.json();
  },

  // ==========================================================================
  // Conversations & Workspace Search
  // ==========================================================================
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error(`Failed to list conversations: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async searchConversations(query) {
    const response = await fetch(
      `${API_BASE}/api/conversations/search?q=${encodeURIComponent(query || '')}`
    );
    if (!response.ok) throw new Error(`Failed to search conversations: ${response.status}`);
    return response.json();
  },

  async createConversation(title = 'New Conversation') {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`);
    if (!response.ok) {
      throw new Error(`Failed to get conversation: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async updateConversation(conversationId, updates) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error(`Failed to update conversation: ${response.status}`);
    return response.json();
  },

  async deleteConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(`Failed to delete conversation: ${response.status}`);
    return response.json();
  },

  async switchBranch(conversationId, branchIndex) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/branch/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_index: branchIndex }),
    });
    if (!response.ok) throw new Error(`Failed to switch branch: ${response.status}`);
    return response.json();
  },

  // ==========================================================================
  // Multimodal Uploads & Conversation Pinned Case Files
  // ==========================================================================
  async uploadFile(file, conversationId = null, pinToConversation = false) {
    const formData = new FormData();
    formData.append('file', file);
    if (conversationId) formData.append('conversation_id', conversationId);
    formData.append('pin_to_conversation', String(pinToConversation));

    const response = await fetch(`${API_BASE}/api/uploads`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error(`Failed to upload file: ${response.status}`);
    return response.json();
  },

  async pinFile(conversationId, attachmentId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachment_id: attachmentId }),
    });
    if (!response.ok) throw new Error(`Failed to pin file: ${response.status}`);
    return response.json();
  },

  async unpinFile(conversationId, attachmentId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/pins/${attachmentId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error(`Failed to unpin file: ${response.status}`);
    return response.json();
  },

  // ==========================================================================
  // Standalone Document & File Generation Engine
  // ==========================================================================
  async generateFile({ conversationId, messageIndex = null, title, content, format = 'pdf' }) {
    const response = await fetch(`${API_BASE}/api/files/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        message_index: messageIndex,
        title,
        content,
        format,
      }),
    });
    if (!response.ok) throw new Error(`Failed to generate ${format.toUpperCase()} file: ${response.status}`);
    return response.json();
  },

  async exportConversationThread(conversationId, format = 'pdf') {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/export?format=${encodeURIComponent(format)}`,
      { method: 'POST' }
    );
    if (!response.ok) throw new Error(`Failed to export conversation thread: ${response.status}`);
    return response.json();
  },

  getDownloadUrl(downloadPathOrId) {
    if (!downloadPathOrId) return '#';
    if (downloadPathOrId.startsWith('http')) return downloadPathOrId;
    if (downloadPathOrId.startsWith('/')) return `${API_BASE}${downloadPathOrId}`;
    return `${API_BASE}/api/files/download/${downloadPathOrId}`;
  },

  // ==========================================================================
  // Deliberation Streaming, Stage 3 Re-Synthesis & Cancellation
  // ==========================================================================
  async stopGeneration(conversationId) {
    try {
      await fetch(`${API_BASE}/api/conversations/${conversationId}/stop`, {
        method: 'POST',
      });
    } catch (e) {
      console.warn('Stop request warning:', e);
    }
  },

  async resynthesizeStage3(conversationId, { messageIndex, modifier = null, chairmanModel = null }) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/resynthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_index: messageIndex,
        modifier,
        chairman_model: chairmanModel,
      }),
    });
    if (!response.ok) throw new Error(`Failed to re-synthesize Stage 3: ${response.status}`);
    return response.json();
  },

  async sendMessageStream(conversationId, payload, onEvent, abortSignal = null) {
    const bodyObj =
      typeof payload === 'string'
        ? { content: payload, execution_mode: 'full_council', web_search: false, attachments: [] }
        : {
            content: payload.content,
            execution_mode: payload.executionMode || payload.execution_mode || 'full_council',
            web_search: Boolean(payload.webSearch ?? payload.web_search),
            attachments: payload.attachments || [],
            edit_message_index: payload.editMessageIndex ?? payload.edit_message_index ?? null,
          };

    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
        signal: abortSignal,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to stream message: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};
