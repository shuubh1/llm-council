"""Multimodal Context & Document Attachment Parser for LLM Council."""

import io
import os
import json
import uuid
import base64
import mimetypes
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Union
from .config import UPLOADS_DIR


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".py", ".js", ".jsx", ".ts", ".tsx",
    ".html", ".css", ".yaml", ".yml", ".xml", ".sql", ".sh", ".bat", ".toml", ".ini"
}


def ensure_uploads_dir():
    Path(UPLOADS_DIR).mkdir(parents=True, exist_ok=True)


def parse_pdf_bytes(file_bytes: bytes) -> str:
    """Extract text with page markers from a PDF file using pypdf."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for idx, page in enumerate(reader.pages, start=1):
        txt = page.extract_text() or ""
        pages_text.append(f"--- [Page {idx} of {len(reader.pages)}] ---\n{txt.strip()}")
    return "\n\n".join(pages_text).strip()


def parse_docx_bytes(file_bytes: bytes) -> str:
    """Extract paragraphs and tables from a Word (.docx) document."""
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    parts = []

    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)

    for t_idx, table in enumerate(doc.tables, start=1):
        rows_str = [f"\n[Table {t_idx}]"]
        for row in table.rows:
            cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
            rows_str.append(" | ".join(cells))
        parts.append("\n".join(rows_str))

    return "\n\n".join(parts).strip()


def parse_xlsx_bytes(file_bytes: bytes) -> str:
    """Extract sheets and rows from an Excel (.xlsx) workbook."""
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheets_out = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = []
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                rows.append(" | ".join("" if c is None else str(c) for c in row))
        if rows:
            sheets_out.append(f"=== Sheet: {sheet_name} ===\n" + "\n".join(rows))
    return "\n\n".join(sheets_out).strip()


def process_uploaded_file(
    filename: str,
    file_bytes: bytes,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parse an uploaded file (PDF, DOCX, XLSX, Text/Code, or Image), persist metadata
    in data/uploads/, and return structured attachment record.
    """
    ensure_uploads_dir()
    ext = os.path.splitext(filename)[1].lower()
    mime_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    attachment_id = f"att-{uuid.uuid4().hex[:12]}"
    size_bytes = len(file_bytes)

    is_image = ext in IMAGE_EXTENSIONS or mime_type.startswith("image/")
    extracted_text = ""
    data_url = None
    estimated_tokens = 0

    if is_image:
        b64_data = base64.b64encode(file_bytes).decode("utf-8")
        if not mime_type.startswith("image/"):
            mime_type = f"image/{ext.lstrip('.') or 'png'}"
            if mime_type == "image/jpg":
                mime_type = "image/jpeg"
        data_url = f"data:{mime_type};base64,{b64_data}"
        estimated_tokens = 285  # Standard vision tile token estimate
    elif ext == ".pdf" or mime_type == "application/pdf":
        try:
            extracted_text = parse_pdf_bytes(file_bytes)
        except Exception as e:
            extracted_text = f"[Error extracting PDF text: {e}]"
        estimated_tokens = max(1, len(extracted_text) // 4)
    elif ext == ".docx" or "wordprocessingml" in mime_type:
        try:
            extracted_text = parse_docx_bytes(file_bytes)
        except Exception as e:
            extracted_text = f"[Error extracting DOCX text: {e}]"
        estimated_tokens = max(1, len(extracted_text) // 4)
    elif ext == ".xlsx" or "spreadsheetml" in mime_type:
        try:
            extracted_text = parse_xlsx_bytes(file_bytes)
        except Exception as e:
            extracted_text = f"[Error extracting XLSX text: {e}]"
        estimated_tokens = max(1, len(extracted_text) // 4)
    else:
        # Treat as text / code / data file
        try:
            extracted_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            extracted_text = file_bytes.decode("latin-1", errors="replace")
        estimated_tokens = max(1, len(extracted_text) // 4)

    record = {
        "id": attachment_id,
        "filename": filename,
        "extension": ext,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "is_image": is_image,
        "extracted_text": extracted_text,
        "data_url": data_url,
        "estimated_tokens": estimated_tokens,
        "created_at": datetime.utcnow().isoformat(),
    }

    meta_path = os.path.join(UPLOADS_DIR, f"{attachment_id}.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)

    return record


def get_uploaded_attachment(attachment_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a parsed attachment record by ID."""
    ensure_uploads_dir()
    meta_path = os.path.join(UPLOADS_DIR, f"{attachment_id}.json")
    if not os.path.exists(meta_path):
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_attachments(attachments_input: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Resolve a list of attachment objects or IDs into full attachment records.
    """
    if not attachments_input:
        return []
    resolved = []
    seen_ids = set()
    for item in attachments_input:
        att_id = item.get("id")
        if att_id and att_id in seen_ids:
            continue
        if att_id:
            seen_ids.add(att_id)
        # If item already has extracted_text or data_url, use it; otherwise load from disk
        if item.get("extracted_text") or item.get("data_url"):
            resolved.append(item)
        elif att_id:
            loaded = get_uploaded_attachment(att_id)
            if loaded:
                resolved.append({**loaded, "pinned": item.get("pinned", False)})
    return resolved


def build_context_enriched_prompt(
    user_query: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    web_citations: Optional[List[Dict[str, str]]] = None,
) -> Union[str, List[Dict[str, Any]]]:
    """
    Combine user query, extracted document texts, live web search grounding snippets,
    and base64 image attachments into either a text prompt or an OpenRouter multimodal
    content array.
    """
    resolved_atts = resolve_attachments(attachments)
    doc_blocks = []
    image_blocks = []

    for att in resolved_atts:
        if att.get("is_image") and att.get("data_url"):
            image_blocks.append({
                "type": "image_url",
                "image_url": {
                    "url": att["data_url"]
                }
            })
        elif att.get("extracted_text"):
            pin_label = "PINNED CASE FILE" if att.get("pinned") else "ATTACHED DOCUMENT"
            doc_blocks.append(
                f"<{pin_label} filename=\"{att.get('filename', 'document')}\" tokens=\"{att.get('estimated_tokens', 0)}\">\n"
                f"{att['extracted_text']}\n"
                f"</{pin_label}>"
            )

    web_block = ""
    if web_citations:
        snippets = []
        for idx, c in enumerate(web_citations, start=1):
            snippets.append(f"[{idx}] {c.get('title', 'Source')} ({c.get('url', '')})\n{c.get('snippet', '')}")
        web_block = (
            "<LIVE_WEB_GROUNDING_RESULTS>\n"
            "Use the following live web search results to ground your answer with up-to-date facts and cite sources where relevant:\n\n"
            + "\n\n".join(snippets)
            + "\n</LIVE_WEB_GROUNDING_RESULTS>\n\n"
        )

    docs_section = ""
    if doc_blocks:
        docs_section = (
            "<ATTACHED_CONTEXT_DOCUMENTS>\n"
            + "\n\n".join(doc_blocks)
            + "\n</ATTACHED_CONTEXT_DOCUMENTS>\n\n"
        )

    combined_text = f"{web_block}{docs_section}{user_query}".strip()

    if image_blocks:
        return [
            {"type": "text", "text": combined_text},
            *image_blocks,
        ]
    return combined_text

