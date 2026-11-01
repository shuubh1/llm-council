"""JSON-based persistent storage for conversations, metadata, branches, and pinned files."""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from .config import DATA_DIR


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def get_conversation_path(conversation_id: str) -> str:
    """Get the file path for a conversation."""
    return os.path.join(DATA_DIR, f"{conversation_id}.json")


def create_conversation(conversation_id: str, title: str = "New Conversation") -> Dict[str, Any]:
    """
    Create a new conversation with support for pinned files, pin-to-top, and branch history.
    """
    ensure_data_dir()

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "title": title,
        "pinned": False,
        "pinned_files": [],
        "branches": [],
        "messages": [],
    }

    path = get_conversation_path(conversation_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(conversation, f, indent=2)

    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage, ensuring backward-compatible defaults.
    """
    path = get_conversation_path(conversation_id)

    if not os.path.exists(path):
        return None

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    data.setdefault("pinned", False)
    data.setdefault("pinned_files", [])
    data.setdefault("branches", [])
    data.setdefault("updated_at", data.get("created_at", datetime.utcnow().isoformat()))
    return data


def save_conversation(conversation: Dict[str, Any]):
    """Save a conversation to storage."""
    ensure_data_dir()
    conversation["updated_at"] = datetime.utcnow().isoformat()
    path = get_conversation_path(conversation["id"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(conversation, f, indent=2)


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation JSON file."""
    path = get_conversation_path(conversation_id)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only), sorted with pinned conversations first,
    then newest first.
    """
    ensure_data_dir()

    conversations = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".json"):
            path = os.path.join(DATA_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    conversations.append({
                        "id": data["id"],
                        "created_at": data["created_at"],
                        "updated_at": data.get("updated_at", data["created_at"]),
                        "title": data.get("title", "New Conversation"),
                        "pinned": bool(data.get("pinned", False)),
                        "message_count": len(data.get("messages", [])),
                        "pinned_files_count": len(data.get("pinned_files", [])),
                    })
            except Exception as e:
                print(f"Skipping corrupted conversation file {filename}: {e}")

    conversations.sort(
        key=lambda x: (1 if x.get("pinned") else 0, x.get("updated_at") or x["created_at"]),
        reverse=True,
    )
    return conversations


def search_conversations(query: str) -> List[Dict[str, Any]]:
    """
    Full-text search across conversation titles, user prompts, and Chairman responses.
    """
    q = (query or "").strip().lower()
    if not q:
        return list_conversations()

    ensure_data_dir()
    matches = []

    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(DATA_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        title = data.get("title", "New Conversation")
        matched_snippet = None

        if q in title.lower():
            matched_snippet = f"Title match: {title}"

        for msg in data.get("messages", []):
            if msg.get("role") == "user":
                text = msg.get("content", "")
                if isinstance(text, str) and q in text.lower():
                    idx = text.lower().find(q)
                    start = max(0, idx - 40)
                    end = min(len(text), idx + len(q) + 60)
                    matched_snippet = f"You: ...{text[start:end]}..."
                    break
            elif msg.get("role") == "assistant":
                s3 = (msg.get("stage3") or {}).get("response", "")
                if isinstance(s3, str) and q in s3.lower():
                    idx = s3.lower().find(q)
                    start = max(0, idx - 40)
                    end = min(len(s3), idx + len(q) + 60)
                    matched_snippet = f"Chairman: ...{s3[start:end]}..."
                    break

        if matched_snippet is not None:
            matches.append({
                "id": data["id"],
                "created_at": data["created_at"],
                "updated_at": data.get("updated_at", data["created_at"]),
                "title": title,
                "pinned": bool(data.get("pinned", False)),
                "message_count": len(data.get("messages", [])),
                "pinned_files_count": len(data.get("pinned_files", [])),
                "snippet": matched_snippet,
            })

    matches.sort(
        key=lambda x: (1 if x.get("pinned") else 0, x.get("updated_at") or x["created_at"]),
        reverse=True,
    )
    return matches


def add_user_message(
    conversation_id: str,
    content: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    execution_mode: str = "full_council",
    web_search: bool = False,
):
    """Add a user message (with optional attachments & execution flags) to a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    clean_attachments = []
    if attachments:
        for att in attachments:
            clean_attachments.append({
                "id": att.get("id"),
                "filename": att.get("filename"),
                "mime_type": att.get("mime_type"),
                "size_bytes": att.get("size_bytes", 0),
                "is_image": att.get("is_image", False),
                "estimated_tokens": att.get("estimated_tokens", 0),
                "pinned": att.get("pinned", False),
                "data_url": att.get("data_url") if att.get("is_image") else None,
            })

    conversation["messages"].append({
        "id": f"msg-{len(conversation['messages']) + 1}-{int(datetime.utcnow().timestamp())}",
        "role": "user",
        "content": content,
        "attachments": clean_attachments,
        "execution_mode": execution_mode,
        "web_search": web_search,
        "created_at": datetime.utcnow().isoformat(),
    })

    save_conversation(conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    artifacts: Optional[List[Dict[str, Any]]] = None,
):
    """
    Add an assistant message with all 3 stages, persistent metadata
    (label_to_model, aggregate_rankings, execution_time, token/cost telemetry, citations),
    and downloadable file artifacts.
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "id": f"msg-{len(conversation['messages']) + 1}-{int(datetime.utcnow().timestamp())}",
        "role": "assistant",
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "metadata": metadata or {},
        "artifacts": artifacts or [],
        "created_at": datetime.utcnow().isoformat(),
    })

    save_conversation(conversation)


def update_assistant_message(
    conversation_id: str,
    message_index: int,
    stage3: Dict[str, Any],
    artifacts: Optional[List[Dict[str, Any]]] = None,
    metadata_updates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Update an existing assistant message in-place (e.g. when re-synthesizing Stage 3
    or exporting a message into a downloadable artifact).
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    messages = conversation.get("messages", [])
    if message_index < 0 or message_index >= len(messages):
        raise ValueError(f"Invalid message_index {message_index}")

    target = messages[message_index]
    if stage3 is not None:
        # Preserve history of previous Stage 3 syntheses on the message
        prev_syntheses = target.get("stage3_history", [])
        if target.get("stage3"):
            prev_syntheses.append(target["stage3"])
        target["stage3_history"] = prev_syntheses
        target["stage3"] = stage3

    if artifacts is not None:
        existing_arts = target.get("artifacts", [])
        existing_ids = {a.get("id") for a in existing_arts}
        for art in artifacts:
            if art.get("id") not in existing_ids:
                existing_arts.append(art)
        target["artifacts"] = existing_arts

    if metadata_updates:
        meta = target.get("metadata") or {}
        meta.update(metadata_updates)
        target["metadata"] = meta

    save_conversation(conversation)
    return conversation


def branch_conversation_at(
    conversation_id: str,
    message_index: int,
) -> Dict[str, Any]:
    """
    Save current message timeline as a branch snapshot and truncate messages
    from message_index onward so an edited prompt or full regeneration can run cleanly.
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    messages = conversation.get("messages", [])
    if 0 <= message_index < len(messages):
        branches = conversation.get("branches", [])
        branches.append({
            "branch_id": f"branch-{len(branches) + 1}",
            "created_at": datetime.utcnow().isoformat(),
            "fork_index": message_index,
            "messages": messages,
        })
        conversation["branches"] = branches[-10:]  # Keep up to 10 branches
        conversation["messages"] = messages[:message_index]
        save_conversation(conversation)

    return conversation


def switch_conversation_branch(
    conversation_id: str,
    branch_index: int,
) -> Dict[str, Any]:
    """Switch active conversation messages with a stored branch."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    branches = conversation.get("branches", [])
    if 0 <= branch_index < len(branches):
        current_msgs = conversation.get("messages", [])
        target_branch = branches[branch_index]
        branches[branch_index] = {
            "branch_id": target_branch.get("branch_id", f"branch-{branch_index + 1}"),
            "created_at": datetime.utcnow().isoformat(),
            "fork_index": target_branch.get("fork_index", 0),
            "messages": current_msgs,
        }
        conversation["messages"] = target_branch.get("messages", [])
        conversation["branches"] = branches
        save_conversation(conversation)

    return conversation


def update_conversation_title(conversation_id: str, title: str):
    """Update the title of a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["title"] = title
    save_conversation(conversation)


def update_conversation_metadata(
    conversation_id: str,
    title: Optional[str] = None,
    pinned: Optional[bool] = None,
) -> Dict[str, Any]:
    """Update title and/or pinned status of a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    if title is not None:
        conversation["title"] = title.strip() or "New Conversation"
    if pinned is not None:
        conversation["pinned"] = bool(pinned)

    save_conversation(conversation)
    return conversation


def add_pinned_file(conversation_id: str, attachment_record: Dict[str, Any]) -> Dict[str, Any]:
    """Pin an uploaded file to a conversation's Case File Drawer."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    pinned_files = conversation.get("pinned_files", [])
    if not any(f.get("id") == attachment_record.get("id") for f in pinned_files):
        pinned_files.append({
            "id": attachment_record["id"],
            "filename": attachment_record.get("filename", "Document"),
            "mime_type": attachment_record.get("mime_type", ""),
            "size_bytes": attachment_record.get("size_bytes", 0),
            "is_image": attachment_record.get("is_image", False),
            "estimated_tokens": attachment_record.get("estimated_tokens", 0),
            "pinned": True,
            "created_at": attachment_record.get("created_at", datetime.utcnow().isoformat()),
        })
    conversation["pinned_files"] = pinned_files
    save_conversation(conversation)
    return conversation


def remove_pinned_file(conversation_id: str, attachment_id: str) -> Dict[str, Any]:
    """Remove a pinned file from a conversation's Case File Drawer."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["pinned_files"] = [
        f for f in conversation.get("pinned_files", []) if f.get("id") != attachment_id
    ]
    save_conversation(conversation)
    return conversation
