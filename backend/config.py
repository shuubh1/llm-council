"""Configuration and Dynamic Council Engine for the LLM Council."""

import os
import json
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Ensure .env overrides any pre-existing environment variables
load_dotenv(override=True)

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Default Council members - list of OpenRouter model identifiers (verified active free tier)
COUNCIL_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-super-vl:free",
    "nvidia/nemotron-3.5-lightning:free",
    "cohere/north-mini-code:free",
]

CHAIRMAN_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directories and persistent files
DATA_DIR = "data/conversations"
COUNCIL_CONFIG_PATH = "data/council_config.json"
EXPORTS_DIR = "data/exports"
UPLOADS_DIR = "data/uploads"
PROMPTS_PATH = "data/prompts.json"

DEFAULT_CHAIRMAN_SYSTEM_PROMPT = (
    "You are the Chief Justice & Lead Synthesizer of an elite LLM Council. "
    "Synthesize the council's collective analysis into an authoritative, comprehensive, "
    "and well-structured response. Use clear headings, bullet points, and tables where appropriate. "
    "When the user explicitly requests a downloadable document, report, contract, spreadsheet, or file "
    "(such as a PDF, DOCX, CSV, Markdown, or TXT file), wrap the complete standalone document body inside "
    '<artifact type="pdf|docx|md|txt|csv" title="Document_Title">...</artifact> tags so the platform '
    "automatically compiles it into a downloadable artifact."
)


def get_default_seats() -> List[Dict[str, Any]]:
    """Return default council member seats seeded from COUNCIL_MODELS."""
    default_personas = [
        {
            "id": "seat-1",
            "model": COUNCIL_MODELS[0],
            "role_name": "Lead Drafter & Strategist",
            "system_prompt": (
                "You are the Lead Drafter & Strategist on the council. Provide a comprehensive, "
                "well-structured primary analysis with clear architecture, actionable insights, and deep reasoning."
            ),
            "temperature": 0.7,
            "enabled": True,
        },
        {
            "id": "seat-2",
            "model": COUNCIL_MODELS[1] if len(COUNCIL_MODELS) > 1 else COUNCIL_MODELS[0],
            "role_name": "Risk & Edge-Case Extractor",
            "system_prompt": (
                "You are the Risk & Edge-Case Extractor. Focus on uncovering hidden assumptions, failure modes, "
                "security/compliance vulnerabilities, and subtle edge cases others might overlook."
            ),
            "temperature": 0.6,
            "enabled": True,
        },
        {
            "id": "seat-3",
            "model": COUNCIL_MODELS[2] if len(COUNCIL_MODELS) > 2 else COUNCIL_MODELS[0],
            "role_name": "Devil's Advocate & Critic",
            "system_prompt": (
                "You are the Devil's Advocate. Challenge conventional wisdom, stress-test premises, "
                "present counter-arguments, and ensure rigorous logical consistency."
            ),
            "temperature": 0.8,
            "enabled": True,
        },
        {
            "id": "seat-4",
            "model": COUNCIL_MODELS[3] if len(COUNCIL_MODELS) > 3 else COUNCIL_MODELS[0],
            "role_name": "Technical & Implementation Specialist",
            "system_prompt": (
                "You are the Technical & Implementation Specialist. Focus on concrete execution details, "
                "clean production code, quantitative precision, and practical feasibility."
            ),
            "temperature": 0.5,
            "enabled": True,
        },
    ]
    return default_personas


def get_default_presets() -> List[Dict[str, Any]]:
    """Return built-in Council Presets."""
    return [
        {
            "id": "preset-free-council",
            "name": "Free Test Council",
            "description": "Balanced 4-seat council using fast free-tier OpenRouter models in Consensus mode.",
            "reconciliation_mode": "consensus",
            "chairman_model": CHAIRMAN_MODEL,
            "chairman_role_name": "Chief Justice / Synthesizer",
            "chairman_system_prompt": DEFAULT_CHAIRMAN_SYSTEM_PROMPT,
            "chairman_temperature": 0.5,
            "zero_data_retention": False,
            "members": get_default_seats(),
        },
        {
            "id": "preset-legal-review",
            "name": "Legal Contract Review",
            "description": "Risk-Preservation (Union Risk) council tailored for contract scrutiny, clause extraction, and liability detection.",
            "reconciliation_mode": "union_risk",
            "chairman_model": CHAIRMAN_MODEL,
            "chairman_role_name": "Managing Partner / Chief Legal Synthesizer",
            "chairman_system_prompt": (
                "You are the Managing Partner synthesizing a legal & risk review. "
                "Preserve EVERY unique risk, liability, ambiguity, or missing clause flagged by any council member. "
                "Organize findings by Severity (Critical, High, Medium, Low) and provide exact redline language."
            ),
            "chairman_temperature": 0.3,
            "zero_data_retention": True,
            "members": [
                {
                    "id": "legal-seat-1",
                    "model": COUNCIL_MODELS[0],
                    "role_name": "Senior Commercial Counsel",
                    "system_prompt": "Analyze commercial terms, obligations, deliverables, and termination rights.",
                    "temperature": 0.4,
                    "enabled": True,
                },
                {
                    "id": "legal-seat-2",
                    "model": COUNCIL_MODELS[1] if len(COUNCIL_MODELS) > 1 else COUNCIL_MODELS[0],
                    "role_name": "Risk & Clause Extractor",
                    "system_prompt": "Extract every indemnification, limitation of liability, IP ownership, and warranty risk.",
                    "temperature": 0.3,
                    "enabled": True,
                },
                {
                    "id": "legal-seat-3",
                    "model": COUNCIL_MODELS[2] if len(COUNCIL_MODELS) > 2 else COUNCIL_MODELS[0],
                    "role_name": "Loophole & Litigation Hunter",
                    "system_prompt": "Read the text adversarially to find ambiguous phrasing, loopholes, and dispute triggers.",
                    "temperature": 0.6,
                    "enabled": True,
                },
                {
                    "id": "legal-seat-4",
                    "model": COUNCIL_MODELS[3] if len(COUNCIL_MODELS) > 3 else COUNCIL_MODELS[0],
                    "role_name": "Regulatory & Privacy Auditor",
                    "system_prompt": "Check data protection, confidentiality, compliance, and governing law clauses.",
                    "temperature": 0.4,
                    "enabled": True,
                },
            ],
        },
        {
            "id": "preset-deep-research",
            "name": "Deep Research & Adversarial",
            "description": "Adversarial peer-review council that aggressively hunts for weak assumptions and stress-tests arguments.",
            "reconciliation_mode": "adversarial",
            "chairman_model": CHAIRMAN_MODEL,
            "chairman_role_name": "Principal Research Director",
            "chairman_system_prompt": (
                "You are the Principal Research Director. Synthesize only verified, battle-tested arguments "
                "that survived Stage 2 adversarial peer review. Explicitly call out debunked claims and open questions."
            ),
            "chairman_temperature": 0.5,
            "zero_data_retention": False,
            "members": [
                {
                    "id": "res-seat-1",
                    "model": COUNCIL_MODELS[0],
                    "role_name": "Primary Domain Researcher",
                    "system_prompt": "Provide an exhaustive, evidence-backed deep dive into the topic.",
                    "temperature": 0.7,
                    "enabled": True,
                },
                {
                    "id": "res-seat-2",
                    "model": COUNCIL_MODELS[1] if len(COUNCIL_MODELS) > 1 else COUNCIL_MODELS[0],
                    "role_name": "First-Principles Analyst",
                    "system_prompt": "Deconstruct the problem from first principles and mathematical/logical foundations.",
                    "temperature": 0.6,
                    "enabled": True,
                },
                {
                    "id": "res-seat-3",
                    "model": COUNCIL_MODELS[2] if len(COUNCIL_MODELS) > 2 else COUNCIL_MODELS[0],
                    "role_name": "Methodology & Citation Skeptic",
                    "system_prompt": "Scrutinize claims for logical fallacies, unverified assumptions, or overgeneralizations.",
                    "temperature": 0.7,
                    "enabled": True,
                },
                {
                    "id": "res-seat-4",
                    "model": COUNCIL_MODELS[3] if len(COUNCIL_MODELS) > 3 else COUNCIL_MODELS[0],
                    "role_name": "Systems & Synthesis Architect",
                    "system_prompt": "Connect cross-disciplinary insights and practical real-world implications.",
                    "temperature": 0.6,
                    "enabled": True,
                },
            ],
        },
    ]


def get_default_council_config() -> Dict[str, Any]:
    """Build the default persistent council configuration."""
    return {
        "members": get_default_seats(),
        "chairman_model": CHAIRMAN_MODEL,
        "chairman_role_name": "Chief Justice / Synthesizer",
        "chairman_system_prompt": DEFAULT_CHAIRMAN_SYSTEM_PROMPT,
        "chairman_temperature": 0.5,
        "reconciliation_mode": "consensus",  # consensus | union_risk | adversarial
        "zero_data_retention": False,
        "presets": get_default_presets(),
    }


def load_council_config() -> Dict[str, Any]:
    """Load council configuration from data/council_config.json, seeding defaults if missing."""
    Path("data").mkdir(parents=True, exist_ok=True)
    if not os.path.exists(COUNCIL_CONFIG_PATH):
        default_cfg = get_default_council_config()
        save_council_config(default_cfg)
        return default_cfg

    try:
        with open(COUNCIL_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Ensure all required keys exist
        defaults = get_default_council_config()
        for k, v in defaults.items():
            if k not in data:
                data[k] = v
        return data
    except Exception as e:
        print(f"Error loading council config, falling back to defaults: {e}")
        return get_default_council_config()


def save_council_config(config_data: Dict[str, Any]) -> Dict[str, Any]:
    """Persist council configuration to data/council_config.json."""
    Path("data").mkdir(parents=True, exist_ok=True)
    defaults = get_default_council_config()

    # Preserve existing presets if not passed in update
    existing_presets = defaults["presets"]
    if os.path.exists(COUNCIL_CONFIG_PATH):
        try:
            with open(COUNCIL_CONFIG_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
                existing_presets = existing.get("presets", existing_presets)
        except Exception:
            pass

    normalized_members = []
    for m in config_data.get("members", defaults["members"]):
        normalized_members.append({
            "id": m.get("id") or f"seat-{uuid.uuid4().hex[:8]}",
            "model": (m.get("model") or COUNCIL_MODELS[0]).strip(),
            "role_name": (m.get("role_name") or "Council Member").strip(),
            "system_prompt": m.get("system_prompt") or "",
            "temperature": float(m.get("temperature", 0.7)),
            "enabled": bool(m.get("enabled", True)),
        })

    reconciliation_mode = config_data.get("reconciliation_mode", "consensus")
    if reconciliation_mode not in ("consensus", "union_risk", "adversarial"):
        reconciliation_mode = "consensus"

    saved = {
        "members": normalized_members,
        "chairman_model": (config_data.get("chairman_model") or CHAIRMAN_MODEL).strip(),
        "chairman_role_name": (config_data.get("chairman_role_name") or "Chief Justice / Synthesizer").strip(),
        "chairman_system_prompt": config_data.get("chairman_system_prompt", DEFAULT_CHAIRMAN_SYSTEM_PROMPT),
        "chairman_temperature": float(config_data.get("chairman_temperature", 0.5)),
        "reconciliation_mode": reconciliation_mode,
        "zero_data_retention": bool(config_data.get("zero_data_retention", False)),
        "presets": config_data.get("presets", existing_presets),
    }

    with open(COUNCIL_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(saved, f, indent=2)

    return saved


def save_council_preset(name: str, description: str = "", config_snapshot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Save a named Council Preset into council_config.json."""
    current = load_council_config()
    source = config_snapshot or current
    new_preset = {
        "id": f"preset-{uuid.uuid4().hex[:8]}",
        "name": name.strip(),
        "description": description.strip() or f"Custom preset ({source.get('reconciliation_mode', 'consensus')})",
        "reconciliation_mode": source.get("reconciliation_mode", "consensus"),
        "chairman_model": source.get("chairman_model", CHAIRMAN_MODEL),
        "chairman_role_name": source.get("chairman_role_name", "Chief Justice / Synthesizer"),
        "chairman_system_prompt": source.get("chairman_system_prompt", DEFAULT_CHAIRMAN_SYSTEM_PROMPT),
        "chairman_temperature": float(source.get("chairman_temperature", 0.5)),
        "zero_data_retention": bool(source.get("zero_data_retention", False)),
        "members": source.get("members", []),
    }
    presets = current.get("presets", [])
    # Update if same name exists, else append
    updated = False
    for idx, p in enumerate(presets):
        if p.get("name", "").lower() == new_preset["name"].lower():
            new_preset["id"] = p["id"]
            presets[idx] = new_preset
            updated = True
            break
    if not updated:
        presets.append(new_preset)

    current["presets"] = presets
    return save_council_config(current)


def delete_council_preset(preset_id: str) -> Dict[str, Any]:
    """Delete a Council Preset by ID."""
    current = load_council_config()
    current["presets"] = [p for p in current.get("presets", []) if p.get("id") != preset_id]
    return save_council_config(current)


def get_default_prompts() -> List[Dict[str, Any]]:
    """Default slash-command prompt templates."""
    return [
        {
            "id": "tpl-contract-audit",
            "command": "/contract-audit",
            "title": "Deep Contract & Risk Audit",
            "category": "Legal & Risk",
            "content": (
                "Perform a comprehensive risk audit of the attached/provided document. "
                "Identify all one-sided clauses, uncapped liabilities, ambiguous obligations, "
                "and missing protections. Output a structured severity table and recommended redlines."
            ),
        },
        {
            "id": "tpl-executive-brief",
            "command": "/executive-brief",
            "title": "Executive Decision Brief (PDF Artifact)",
            "category": "Strategy",
            "content": (
                "Synthesize a board-ready Executive Decision Brief on the following topic. "
                "Include Executive Summary, Key Options Compared, Risk Matrix, and Final Recommendation. "
                "Also generate a downloadable PDF report using an <artifact type=\"pdf\" title=\"Executive_Decision_Brief\"> tag."
            ),
        },
        {
            "id": "tpl-code-architecture",
            "command": "/code-review",
            "title": "Principal Architecture & Security Review",
            "category": "Engineering",
            "content": (
                "Review the following code or architecture design for scalability bottlenecks, "
                "race conditions, security vulnerabilities, and maintainability. Provide refactored production code."
            ),
        },
        {
            "id": "tpl-adversarial-stress",
            "command": "/stress-test",
            "title": "Pre-Mortem & Red-Team Stress Test",
            "category": "Analysis",
            "content": (
                "Assume this plan/proposal has failed catastrophically 12 months from now. "
                "Conduct a rigorous pre-mortem analysis identifying every technical, operational, and market failure mode."
            ),
        },
        {
            "id": "tpl-export-spreadsheet",
            "command": "/export-table",
            "title": "Generate Structured CSV/Excel Dataset",
            "category": "Data & Exports",
            "content": (
                "Analyze the request and compile a clean structured dataset wrapped in "
                "<artifact type=\"csv\" title=\"Council_Analysis_Dataset\"> with clear column headers and rows."
            ),
        },
    ]


def load_prompts() -> List[Dict[str, Any]]:
    """Load reusable slash-command prompt templates."""
    Path("data").mkdir(parents=True, exist_ok=True)
    if not os.path.exists(PROMPTS_PATH):
        defaults = get_default_prompts()
        save_prompts(defaults)
        return defaults
    try:
        with open(PROMPTS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return get_default_prompts()


def save_prompts(prompts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Save reusable slash-command prompt templates."""
    Path("data").mkdir(parents=True, exist_ok=True)
    with open(PROMPTS_PATH, "w", encoding="utf-8") as f:
        json.dump(prompts, f, indent=2)
    return prompts
