"""FastAPI backend for Gemini-Class LLM Council Console."""

import os
import time
import uuid
import json
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel, Field

from . import storage
from .config import (
    load_council_config,
    save_council_config,
    save_council_preset,
    delete_council_preset,
    load_prompts,
    save_prompts,
)
from .council import (
    run_full_council,
    generate_conversation_title,
    stage1_collect_responses,
    stage2_collect_rankings,
    stage3_synthesize_final,
    calculate_aggregate_rankings,
    compute_telemetry_summary,
)
from .openrouter import perform_web_search
from .context_parser import (
    process_uploaded_file,
    get_uploaded_attachment,
    build_context_enriched_prompt,
)
from .file_generator import (
    create_export_file,
    get_export_file,
    extract_and_compile_artifacts,
)

app = FastAPI(title="LLM Council Console API", version="2.0.0")

# Enable CORS for frontend clients (Vercel, custom domain, local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registry of active generation tasks per conversation for instant Stop/Cancellation
ACTIVE_TASKS: Dict[str, asyncio.Task] = {}


# ============================================================================
# Pydantic Schemas
# ============================================================================

class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None


class SwitchBranchRequest(BaseModel):
    branch_index: int


class SendMessageRequest(BaseModel):
    content: str
    execution_mode: str = "full_council"  # "full_council" | "solo"
    web_search: bool = False
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    edit_message_index: Optional[int] = None


class ResynthesizeRequest(BaseModel):
    message_index: int
    modifier: Optional[str] = None
    chairman_model: Optional[str] = None


class GenerateFileRequest(BaseModel):
    conversation_id: Optional[str] = "general"
    message_index: Optional[int] = None
    title: str = "Council_Synthesis_Report"
    content: str
    format: str = "pdf"  # pdf | docx | xlsx | csv | md | txt


class SavePresetRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    config: Optional[Dict[str, Any]] = None


class PromptTemplateItem(BaseModel):
    id: Optional[str] = None
    command: str
    title: str
    category: Optional[str] = "Custom"
    content: str


class PinFileRequest(BaseModel):
    attachment_id: str


# ============================================================================
# Health & Council Studio Configuration Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council Console API", "version": "2.0.0"}


@app.get("/api/config")
async def get_config():
    """Get active dynamic council configuration and saved presets."""
    return load_council_config()


@app.put("/api/config")
async def update_config(config_data: Dict[str, Any]):
    """Save updated council members, roles, rules, reconciliation mode, and ZDR setting."""
    return save_council_config(config_data)


@app.post("/api/config/presets")
async def create_preset(request: SavePresetRequest):
    """Save a named Council Preset."""
    if not request.name.strip():
        raise HTTPException(status_code=400, detail="Preset name is required")
    return save_council_preset(request.name, request.description or "", request.config)


@app.delete("/api/config/presets/{preset_id}")
async def remove_preset(preset_id: str):
    """Delete a saved Council Preset."""
    return delete_council_preset(preset_id)


# ============================================================================
# Slash-Command Prompt Library Endpoints
# ============================================================================

@app.get("/api/prompts")
async def list_prompt_templates():
    """List all saved slash-command prompt templates."""
    return load_prompts()


@app.post("/api/prompts")
async def upsert_prompt_template(item: PromptTemplateItem):
    """Create or update a slash-command prompt template."""
    prompts = load_prompts()
    cmd = item.command.strip()
    if not cmd.startswith("/"):
        cmd = "/" + cmd
    new_entry = {
        "id": item.id or f"tpl-{uuid.uuid4().hex[:8]}",
        "command": cmd,
        "title": item.title.strip(),
        "category": (item.category or "Custom").strip(),
        "content": item.content,
    }
    updated = False
    for idx, p in enumerate(prompts):
        if p.get("id") == new_entry["id"] or p.get("command") == cmd:
            prompts[idx] = new_entry
            updated = True
            break
    if not updated:
        prompts.append(new_entry)
    return save_prompts(prompts)


@app.delete("/api/prompts/{prompt_id}")
async def delete_prompt_template(prompt_id: str):
    """Delete a prompt template by ID."""
    prompts = load_prompts()
    filtered = [p for p in prompts if p.get("id") != prompt_id]
    return save_prompts(filtered)


# ============================================================================
# Conversation & Workspace Search Endpoints
# ============================================================================

@app.get("/api/conversations")
async def list_conversations():
    """List all conversations (pinned first, then newest)."""
    return storage.list_conversations()


@app.get("/api/conversations/search")
async def search_conversations(q: str = Query("", description="Full-text search query")):
    """Search across conversation titles, user prompts, and Chairman syntheses."""
    return storage.search_conversations(q)


@app.post("/api/conversations")
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    return storage.create_conversation(conversation_id, title=request.title or "New Conversation")


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all messages, metadata, branches, and pinned files."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.patch("/api/conversations/{conversation_id}")
async def patch_conversation(conversation_id: str, request: UpdateConversationRequest):
    """Rename a conversation or toggle Pin-to-Top."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return storage.update_conversation_metadata(
        conversation_id,
        title=request.title,
        pinned=request.pinned,
    )


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: str):
    """Delete a conversation."""
    deleted = storage.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted", "id": conversation_id}


@app.post("/api/conversations/{conversation_id}/branch/switch")
async def switch_branch(conversation_id: str, request: SwitchBranchRequest):
    """Switch active timeline with a stored conversation branch."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return storage.switch_conversation_branch(conversation_id, request.branch_index)


# ============================================================================
# Multimodal Context & Case File Drawer Upload Endpoints
# ============================================================================

@app.post("/api/uploads")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
    pin_to_conversation: bool = Form(False),
):
    """
    Upload and parse a document (.pdf, .docx, .xlsx, .csv, .txt, .md, code) or image (.png, .jpg, .webp).
    Optionally pins the file directly to the conversation's Case File Drawer.
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    record = process_uploaded_file(
        filename=file.filename or "uploaded_file",
        file_bytes=file_bytes,
        content_type=file.content_type,
    )
    record["pinned"] = bool(pin_to_conversation)

    if pin_to_conversation and conversation_id:
        conv = storage.get_conversation(conversation_id)
        if conv is not None:
            storage.add_pinned_file(conversation_id, record)

    return {
        "id": record["id"],
        "filename": record["filename"],
        "extension": record["extension"],
        "mime_type": record["mime_type"],
        "size_bytes": record["size_bytes"],
        "is_image": record["is_image"],
        "estimated_tokens": record["estimated_tokens"],
        "pinned": record["pinned"],
        "data_url": record["data_url"] if record["is_image"] else None,
        "preview_text": (record.get("extracted_text") or "")[:500],
        "created_at": record["created_at"],
    }


@app.post("/api/conversations/{conversation_id}/pins")
async def pin_existing_attachment(conversation_id: str, request: PinFileRequest):
    """Pin an already-uploaded attachment to the conversation."""
    att = get_uploaded_attachment(request.attachment_id)
    if att is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return storage.add_pinned_file(conversation_id, att)


@app.delete("/api/conversations/{conversation_id}/pins/{attachment_id}")
async def unpin_attachment(conversation_id: str, attachment_id: str):
    """Remove a pinned file from the conversation's Case File Drawer."""
    return storage.remove_pinned_file(conversation_id, attachment_id)


# ============================================================================
# Standalone Document & File Generation Endpoints
# ============================================================================

@app.post("/api/files/generate")
async def generate_downloadable_file(request: GenerateFileRequest):
    """
    Generate a downloadable file (.pdf, .docx, .xlsx, .csv, .md, .txt) on demand
    from any response or document content.
    """
    record = create_export_file(
        conversation_id=request.conversation_id or "general",
        title=request.title,
        content=request.content,
        file_format=request.format,
    )

    if request.conversation_id and request.message_index is not None:
        try:
            storage.update_assistant_message(
                conversation_id=request.conversation_id,
                message_index=request.message_index,
                stage3=None,
                artifacts=[record],
            )
        except Exception as e:
            print(f"Could not attach artifact to message: {e}")

    return record


@app.get("/api/files/download/{file_id}")
async def download_generated_file(file_id: str):
    """Download a generated artifact file by its file_id."""
    rec = get_export_file(file_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Generated file not found")

    mime_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
        "md": "text/markdown",
        "txt": "text/plain",
    }
    media_type = mime_map.get(rec.get("format", "txt"), "application/octet-stream")
    return FileResponse(
        path=rec["physical_path"],
        media_type=media_type,
        filename=rec["filename"],
    )


@app.post("/api/conversations/{conversation_id}/export")
async def export_full_conversation(conversation_id: str, format: str = Query("pdf")):
    """Export an entire conversation thread as a downloadable PDF, DOCX, or Markdown document."""
    conv = storage.get_conversation(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    title = conv.get("title") or "Council_Deliberation_Thread"
    sections = []
    for idx, msg in enumerate(conv.get("messages", []), start=1):
        if msg.get("role") == "user":
            sections.append(f"## Turn {(idx + 1) // 2} — User Prompt\n\n{msg.get('content', '')}")
        elif msg.get("role") == "assistant":
            s3 = (msg.get("stage3") or {}).get("response", "")
            model_name = (msg.get("stage3") or {}).get("model", "Chairman")
            sections.append(f"## Council Synthesis ({model_name})\n\n{s3}")

    full_body = "\n\n---\n\n".join(sections) if sections else "No messages in conversation."
    return create_export_file(
        conversation_id=conversation_id,
        title=title,
        content=full_body,
        file_format=format,
    )


# ============================================================================
# Council Deliberation, Streaming, Re-Synthesis, and Cancellation Endpoints
# ============================================================================

@app.post("/api/conversations/{conversation_id}/stop")
async def stop_generation(conversation_id: str):
    """Cancel any active council deliberation task for this conversation."""
    task = ACTIVE_TASKS.pop(conversation_id, None)
    if task and not task.done():
        task.cancel()
        return {"status": "cancelled", "conversation_id": conversation_id}
    return {"status": "idle", "conversation_id": conversation_id}


@app.post("/api/conversations/{conversation_id}/resynthesize")
async def resynthesize_stage3(conversation_id: str, request: ResynthesizeRequest):
    """
    Re-run ONLY Stage 3 (Chairman Synthesis) on an existing assistant message
    using already-collected Stage 1 & Stage 2 outputs, with optional modifier or Chairman model override.
    """
    conv = storage.get_conversation(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = conv.get("messages", [])
    if request.message_index < 0 or request.message_index >= len(messages):
        raise HTTPException(status_code=400, detail="Invalid message_index")

    target_msg = messages[request.message_index]
    if target_msg.get("role") != "assistant":
        raise HTTPException(status_code=400, detail="Target message must be an assistant message")

    # Find corresponding user prompt preceding this assistant message
    user_query = ""
    prior_history = []
    if request.message_index > 0 and messages[request.message_index - 1].get("role") == "user":
        user_query = messages[request.message_index - 1].get("content", "")
        prior_history = messages[: request.message_index - 1]

    stage1_results = target_msg.get("stage1") or []
    stage2_results = target_msg.get("stage2") or []

    start_ts = time.perf_counter()
    new_stage3 = await stage3_synthesize_final(
        user_query=user_query,
        stage1_results=stage1_results,
        stage2_results=stage2_results,
        conversation_history=prior_history,
        modifier=request.modifier,
        chairman_model_override=request.chairman_model,
    )
    elapsed = round(time.perf_counter() - start_ts, 2)

    cleaned_resp, new_artifacts = extract_and_compile_artifacts(
        conversation_id, new_stage3.get("response", "")
    )
    new_stage3["response"] = cleaned_resp

    updated_conv = storage.update_assistant_message(
        conversation_id=conversation_id,
        message_index=request.message_index,
        stage3=new_stage3,
        artifacts=new_artifacts,
        metadata_updates={"last_resynthesis_time": elapsed, "modifier": request.modifier},
    )

    return {
        "stage3": new_stage3,
        "artifacts": updated_conv["messages"][request.message_index].get("artifacts", []),
        "metadata": updated_conv["messages"][request.message_index].get("metadata", {}),
        "conversation": updated_conv,
    }


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: SendMessageRequest):
    """
    Send a message and run the council process (non-streaming).
    """
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if request.edit_message_index is not None:
        conversation = storage.branch_conversation_at(conversation_id, request.edit_message_index)

    prior_history = list(conversation.get("messages", []))
    is_first_message = len(prior_history) == 0

    all_attachments = [*(conversation.get("pinned_files") or []), *(request.attachments or [])]

    storage.add_user_message(
        conversation_id,
        request.content,
        attachments=request.attachments,
        execution_mode=request.execution_mode,
        web_search=request.web_search,
    )

    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    stage1_results, stage2_results, stage3_result, metadata = await run_full_council(
        user_query=request.content,
        conversation_history=prior_history,
        attachments=all_attachments,
        execution_mode=request.execution_mode,
        web_search=request.web_search,
    )

    cleaned_resp, artifacts = extract_and_compile_artifacts(
        conversation_id, stage3_result.get("response", "")
    )
    stage3_result["response"] = cleaned_resp

    storage.add_assistant_message(
        conversation_id,
        stage1_results,
        stage2_results,
        stage3_result,
        metadata=metadata,
        artifacts=artifacts,
    )

    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": metadata,
        "artifacts": artifacts,
    }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(
    conversation_id: str,
    request: SendMessageRequest,
    http_request: Request,
):
    """
    Send a message and stream the 3-stage (or Fast Solo) council deliberation via SSE.
    Supports multi-turn history, prompt editing/branching, multimodal attachments,
    web grounding citations, and downloadable artifact compilation.
    """
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    async def event_generator():
        start_ts = time.perf_counter()
        title_task = None
        try:
            conv = storage.get_conversation(conversation_id)
            if request.edit_message_index is not None:
                conv = storage.branch_conversation_at(conversation_id, request.edit_message_index)

            prior_history = list(conv.get("messages", []))
            is_first_message = len(prior_history) == 0

            # Auto-pin any attachments marked as pinned
            for att in request.attachments or []:
                if att.get("pinned"):
                    storage.add_pinned_file(conversation_id, att)

            conv = storage.get_conversation(conversation_id)
            all_attachments = [*(conv.get("pinned_files") or []), *(request.attachments or [])]

            # Persist user message
            storage.add_user_message(
                conversation_id,
                request.content,
                attachments=request.attachments,
                execution_mode=request.execution_mode,
                web_search=request.web_search,
            )

            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            cfg = load_council_config()
            reconciliation_mode = cfg.get("reconciliation_mode", "consensus")

            # Optional Web Grounding step
            citations = []
            if request.web_search:
                yield f"data: {json.dumps({'type': 'web_search_start'})}\n\n"
                citations = await perform_web_search(request.content, max_results=5)
                yield f"data: {json.dumps({'type': 'web_search_complete', 'data': citations})}\n\n"

            enriched_content = build_context_enriched_prompt(
                user_query=request.content,
                attachments=all_attachments,
                web_citations=citations,
            )

            # Check for Fast Solo mode (Chairman-only bypass)
            if request.execution_mode == "solo":
                yield f"data: {json.dumps({'type': 'stage3_start', 'mode': 'solo'})}\n\n"
                stage3_result = await stage3_synthesize_final(
                    user_query=request.content,
                    stage1_results=[],
                    stage2_results=[],
                    council_config=cfg,
                    conversation_history=prior_history,
                    enriched_user_content=enriched_content,
                )
                cleaned_resp, artifacts = extract_and_compile_artifacts(
                    conversation_id, stage3_result.get("response", "")
                )
                stage3_result["response"] = cleaned_resp
                elapsed = time.perf_counter() - start_ts
                telemetry = compute_telemetry_summary([], [], stage3_result, elapsed)
                metadata = {
                    "label_to_model": {},
                    "aggregate_rankings": [],
                    "execution_mode": "solo",
                    "reconciliation_mode": "solo",
                    "citations": citations,
                    **telemetry,
                }
                yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result, 'artifacts': artifacts, 'metadata': metadata})}\n\n"

                if title_task:
                    title = await title_task
                    storage.update_conversation_title(conversation_id, title)
                    yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

                storage.add_assistant_message(
                    conversation_id,
                    [],
                    [],
                    stage3_result,
                    metadata=metadata,
                    artifacts=artifacts,
                )
                yield f"data: {json.dumps({'type': 'complete', 'metadata': metadata})}\n\n"
                return

            # Stage 1: Collect parallel council seat responses
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1_results = await stage1_collect_responses(
                user_query=request.content,
                council_config=cfg,
                conversation_history=prior_history,
                enriched_user_content=enriched_content,
            )
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            if await http_request.is_disconnected():
                return

            # Stage 2: Anonymized peer evaluations & rankings
            yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
            stage2_results, label_to_model = await stage2_collect_rankings(
                user_query=request.content,
                stage1_results=stage1_results,
                council_config=cfg,
            )
            aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
            partial_meta = {
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate_rankings,
                "execution_mode": "full_council",
                "reconciliation_mode": reconciliation_mode,
                "citations": citations,
            }
            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': partial_meta})}\n\n"

            if await http_request.is_disconnected():
                return

            # Stage 3: Chairman synthesis
            yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"
            stage3_result = await stage3_synthesize_final(
                user_query=request.content,
                stage1_results=stage1_results,
                stage2_results=stage2_results,
                council_config=cfg,
                conversation_history=prior_history,
                enriched_user_content=enriched_content,
            )
            cleaned_resp, artifacts = extract_and_compile_artifacts(
                conversation_id, stage3_result.get("response", "")
            )
            stage3_result["response"] = cleaned_resp

            elapsed = time.perf_counter() - start_ts
            telemetry = compute_telemetry_summary(stage1_results, stage2_results, stage3_result, elapsed)
            full_metadata = {
                **partial_meta,
                **telemetry,
            }

            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result, 'artifacts': artifacts, 'metadata': full_metadata})}\n\n"

            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result,
                metadata=full_metadata,
                artifacts=artifacts,
            )

            yield f"data: {json.dumps({'type': 'complete', 'metadata': full_metadata})}\n\n"

        except asyncio.CancelledError:
            yield f"data: {json.dumps({'type': 'cancelled', 'message': 'Generation stopped by user.'})}\n\n"
        except Exception as e:
            print(f"Stream error in conversation {conversation_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            if title_task and not title_task.done():
                title_task.cancel()
            ACTIVE_TASKS.pop(conversation_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
