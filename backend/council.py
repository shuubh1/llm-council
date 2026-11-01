"""3-stage LLM Council orchestration with Dynamic Roles, Reconciliation Modes, History, and Solo Bypass."""

import time
import re
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional, Union
from .openrouter import query_seats_parallel, query_model, perform_web_search
from .config import (
    load_council_config,
    COUNCIL_MODELS,
    CHAIRMAN_MODEL,
    DEFAULT_CHAIRMAN_SYSTEM_PROMPT,
)
from .context_parser import build_context_enriched_prompt


RECONCILIATION_STAGE2_INSTRUCTIONS = {
    "consensus": (
        "Evaluate each response for accuracy, depth of insight, structure, and practical usefulness. "
        "Explain what each response does well and where it falls short."
    ),
    "union_risk": (
        "RISK-PRESERVATION AUDIT MODE: Evaluate each response specifically on its ability to uncover "
        "risks, edge cases, loopholes, security/legal liabilities, and failure modes. Highlight unique "
        "warnings found by individual responses that other responses missed."
    ),
    "adversarial": (
        "ADVERSARIAL RED-TEAM MODE: Aggressively stress-test every response. Hunt for logical fallacies, "
        "hallucinated citations, unverified assumptions, hand-waving, or weak arguments. Expose every flaw "
        "before ranking the responses."
    ),
}

RECONCILIATION_STAGE3_INSTRUCTIONS = {
    "consensus": (
        "RECONCILIATION MODE: CONSENSUS SYNTHESIS.\n"
        "- Synthesize the strongest majority agreements across the council into a cohesive, authoritative answer.\n"
        "- Incorporate complementary insights from top-ranked drafts.\n"
        "- Briefly note any meaningful points of divergence or trade-offs where council members disagreed."
    ),
    "union_risk": (
        "RECONCILIATION MODE: UNION RISK (ZERO-LOSS RISK PRESERVATION).\n"
        "- CRITICAL RULE: You MUST preserve and surface EVERY unique risk, flaw, loophole, vulnerability, "
        "or edge case identified by ANY single council member in Stage 1 or Stage 2—even if only 1 model flagged it.\n"
        "- Do NOT filter out minority warnings. Group all identified risks by severity (Critical / High / Medium / Low), "
        "attribute which council role surfaced them, and provide concrete mitigations or redlines."
    ),
    "adversarial": (
        "RECONCILIATION MODE: ADVERSARIAL STRESS-TEST SYNTHESIS.\n"
        "- Prioritize claims and solutions that survived Stage 2 adversarial peer review.\n"
        "- Explicitly discard or call out weak assumptions, logical gaps, or unverified claims that peer reviewers exposed.\n"
        "- Deliver a battle-hardened final synthesis with clear caveats where uncertainty remains."
    ),
}

MODIFIER_INSTRUCTIONS = {
    "concise": "IMPORTANT MODIFIER: Make this synthesis highly concise, punchy, and executive-ready (use crisp bullet points and eliminate fluff).",
    "formal": "IMPORTANT MODIFIER: Use a formal, boardroom/legal-grade tone suitable for an official policy or client deliverable.",
    "expand": "IMPORTANT MODIFIER: Expand with exhaustive technical depth, step-by-step implementation details, and concrete examples.",
    "action_plan": "IMPORTANT MODIFIER: Structure the synthesis into a prioritized Action Plan with clear phases, owners, and risk mitigations.",
}


def build_history_messages(
    conversation_history: Optional[List[Dict[str, Any]]],
    current_user_content: Union[str, List[Dict[str, Any]]],
    max_history_turns: int = 8,
) -> List[Dict[str, Any]]:
    """
    Build OpenRouter message list including prior conversation turns for multi-turn context.
    """
    messages: List[Dict[str, Any]] = []
    if conversation_history:
        recent = conversation_history[-(max_history_turns * 2):]
        for msg in recent:
            role = msg.get("role")
            if role == "user" and msg.get("content"):
                messages.append({
                    "role": "user",
                    "content": msg["content"],
                })
            elif role == "assistant":
                s3 = msg.get("stage3") or {}
                resp_text = s3.get("response")
                if resp_text:
                    messages.append({
                        "role": "assistant",
                        "content": resp_text,
                    })

    messages.append({
        "role": "user",
        "content": current_user_content,
    })
    return messages


async def stage1_collect_responses(
    user_query: str,
    council_config: Optional[Dict[str, Any]] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    enriched_user_content: Optional[Union[str, List[Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all enabled council seats in parallel.
    Injects each seat's custom role_name, system_prompt, and temperature.
    """
    cfg = council_config or load_council_config()
    seats = cfg.get("members", [])
    zdr = bool(cfg.get("zero_data_retention", False))

    prompt_content = enriched_user_content if enriched_user_content is not None else user_query
    messages = build_history_messages(conversation_history, prompt_content)

    stage1_results = await query_seats_parallel(
        seats=seats,
        messages=messages,
        zero_data_retention=zdr,
    )
    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    council_config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each enabled council seat evaluates and ranks the anonymized Stage 1 responses.
    """
    cfg = council_config or load_council_config()
    seats = cfg.get("members", [])
    zdr = bool(cfg.get("zero_data_retention", False))
    reconciliation_mode = cfg.get("reconciliation_mode", "consensus")
    mode_instructions = RECONCILIATION_STAGE2_INSTRUCTIONS.get(
        reconciliation_mode, RECONCILIATION_STAGE2_INSTRUCTIONS["consensus"]
    )

    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Map anonymous label to readable model + role identifier
    label_to_model: Dict[str, str] = {}
    for label, result in zip(labels, stage1_results):
        model_id = result.get("model", "unknown")
        role_name = result.get("role_name")
        model_short = model_id.split("/")[-1]
        if role_name:
            display_name = f"{role_name} ({model_short})"
        else:
            display_name = model_id
        label_to_model[f"Response {label}"] = display_name

    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different council members (anonymized):

{responses_text}

Peer Review Directives ({reconciliation_mode.upper()} MODE):
{mode_instructions}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well, what it misses, and any flaws or risks.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    raw_seat_responses = await query_seats_parallel(
        seats=seats,
        messages=messages,
        zero_data_retention=zdr,
    )

    stage2_results = []
    for seat_resp in raw_seat_responses:
        full_text = seat_resp.get("response", "")
        parsed = parse_ranking_from_text(full_text)
        stage2_results.append({
            "seat_id": seat_resp.get("seat_id", ""),
            "model": seat_resp["model"],
            "role_name": seat_resp.get("role_name", "Council Reviewer"),
            "ranking": full_text,
            "parsed_ranking": parsed,
            "usage": seat_resp.get("usage", {}),
            "latency_ms": seat_resp.get("latency_ms", 0),
        })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    council_config: Optional[Dict[str, Any]] = None,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    modifier: Optional[str] = None,
    chairman_model_override: Optional[str] = None,
    enriched_user_content: Optional[Union[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response according to reconciliation_mode,
    chairman_system_prompt, and optional re-synthesis modifier.
    """
    cfg = council_config or load_council_config()
    chairman_model = (chairman_model_override or cfg.get("chairman_model") or CHAIRMAN_MODEL).strip()
    chairman_role = cfg.get("chairman_role_name") or "Chief Justice / Synthesizer"
    chairman_sys = cfg.get("chairman_system_prompt") or DEFAULT_CHAIRMAN_SYSTEM_PROMPT
    chairman_temp = float(cfg.get("chairman_temperature", 0.5))
    reconciliation_mode = cfg.get("reconciliation_mode", "consensus")
    zdr = bool(cfg.get("zero_data_retention", False))

    reconciliation_directive = RECONCILIATION_STAGE3_INSTRUCTIONS.get(
        reconciliation_mode, RECONCILIATION_STAGE3_INSTRUCTIONS["consensus"]
    )

    modifier_directive = ""
    if modifier:
        modifier_directive = "\n\n" + MODIFIER_INSTRUCTIONS.get(
            modifier, f"IMPORTANT USER REFINEMENT INSTRUCTION: {modifier}"
        )

    # Solo Bypass Mode (no Stage 1 or Stage 2 drafts)
    if not stage1_results and not stage2_results:
        prompt_content = enriched_user_content if enriched_user_content is not None else user_query
        if modifier_directive:
            if isinstance(prompt_content, str):
                prompt_content = f"{prompt_content}\n{modifier_directive}"
        messages = build_history_messages(conversation_history, prompt_content)
        combined_sys = f"Your Role: {chairman_role}.\n{chairman_sys}"
        response = await query_model(
            model=chairman_model,
            messages=messages,
            temperature=chairman_temp,
            system_prompt=combined_sys,
            zero_data_retention=zdr,
        )
        if response is None:
            return {
                "model": chairman_model,
                "role_name": chairman_role,
                "response": "Error: Unable to generate response from Chairman model.",
            }
        return {
            "model": chairman_model,
            "role_name": chairman_role,
            "reconciliation_mode": "solo",
            "modifier": modifier,
            "response": response.get("content", ""),
            "usage": response.get("usage", {}),
            "latency_ms": response.get("latency_ms", 0),
        }

    # Full 3-Stage Synthesis
    stage1_text = "\n\n".join([
        f"Seat Role: {result.get('role_name', 'Member')} | Model: {result['model']}\nResponse:\n{result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Reviewer Role: {result.get('role_name', 'Reviewer')} | Model: {result['model']}\nEvaluation & Ranking:\n{result['ranking']}"
        for result in stage2_results
    ])

    history_summary = ""
    if conversation_history:
        prior_lines = []
        for m in conversation_history[-6:]:
            if m.get("role") == "user":
                prior_lines.append(f"User: {m.get('content', '')[:400]}")
            elif m.get("role") == "assistant" and m.get("stage3"):
                prior_lines.append(f"Council Chairman: {m['stage3'].get('response', '')[:400]}")
        if prior_lines:
            history_summary = "PRIOR CONVERSATION CONTEXT:\n" + "\n".join(prior_lines) + "\n\n"

    chairman_prompt = f"""You are the {chairman_role} of an LLM Council. Multiple specialized AI council members have provided responses to the user's request, and then peer-reviewed and ranked each other's work.

{history_summary}Original User Request:
{user_query}

STAGE 1 - Individual Council Member Drafts:
{stage1_text}

STAGE 2 - Peer Evaluations & Rankings:
{stage2_text}

{reconciliation_directive}{modifier_directive}

ARTIFACT GENERATION RULE:
If the user explicitly asked to generate or export a downloadable file/document (PDF, Word DOCX, Excel XLSX, CSV, Markdown, or TXT), wrap the standalone document content inside `<artifact type="pdf|docx|xlsx|csv|md|txt" title="Document_Title">...</artifact>` tags.

Provide a clear, well-reasoned, comprehensive final synthesis that represents the council's collective wisdom:"""

    combined_sys = f"Your Role: {chairman_role}.\n{chairman_sys}"
    messages = [{"role": "user", "content": chairman_prompt}]

    response = await query_model(
        model=chairman_model,
        messages=messages,
        temperature=chairman_temp,
        system_prompt=combined_sys,
        zero_data_retention=zdr,
    )

    if response is None:
        # Graceful fallback to highest-ranked or first Stage 1 draft if Chairman times out
        fallback_text = stage1_results[0]["response"] if stage1_results else "Error: Unable to generate final synthesis."
        return {
            "model": chairman_model,
            "role_name": chairman_role,
            "reconciliation_mode": reconciliation_mode,
            "modifier": modifier,
            "response": fallback_text,
        }

    return {
        "model": chairman_model,
        "role_name": chairman_role,
        "reconciliation_mode": reconciliation_mode,
        "modifier": modifier,
        "response": response.get("content", ""),
        "usage": response.get("usage", {}),
        "latency_ms": response.get("latency_ms", 0),
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.
    """
    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            numbered_matches = re.findall(r"\d+\.\s*Response [A-Z]", ranking_section)
            if numbered_matches:
                return [re.search(r"Response [A-Z]", m).group() for m in numbered_matches]
            matches = re.findall(r"Response [A-Z]", ranking_section)
            return matches

    matches = re.findall(r"Response [A-Z]", ranking_text)
    # Deduplicate while preserving order
    seen = set()
    unique_matches = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique_matches.append(m)
    return unique_matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str],
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings and Borda count scores across all peer reviewers.
    """
    model_positions = defaultdict(list)
    model_borda = defaultdict(int)
    num_candidates = max(len(label_to_model), 1)

    for ranking in stage2_results:
        ranking_text = ranking.get("ranking", "")
        parsed_ranking = ranking.get("parsed_ranking") or parse_ranking_from_text(ranking_text)

        seen_labels = set()
        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model and label not in seen_labels:
                seen_labels.add(label)
                model_name = label_to_model[label]
                model_positions[model_name].append(position)
                borda_pts = max(0, num_candidates - position + 1)
                model_borda[model_name] += borda_pts

    aggregate = []
    for label, model_name in label_to_model.items():
        positions = model_positions.get(model_name, [])
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "label": label,
                "model": model_name,
                "average_rank": round(avg_rank, 2),
                "borda_score": model_borda[model_name],
                "rankings_count": len(positions),
            })
        else:
            aggregate.append({
                "label": label,
                "model": model_name,
                "average_rank": float(num_candidates),
                "borda_score": 0,
                "rankings_count": 0,
            })

    aggregate.sort(key=lambda x: (x["average_rank"], -x["borda_score"]))
    return aggregate


def compute_telemetry_summary(
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    stage3_result: Dict[str, Any],
    elapsed_seconds: float,
) -> Dict[str, Any]:
    """Compute total token and cost telemetry across all stages."""
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    total_cost = 0.0

    for item in [*(stage1_results or []), *(stage2_results or []), stage3_result or {}]:
        u = item.get("usage") or {}
        prompt_tokens += int(u.get("prompt_tokens", 0) or 0)
        completion_tokens += int(u.get("completion_tokens", 0) or 0)
        total_tokens += int(u.get("total_tokens", 0) or 0)
        total_cost += float(u.get("cost", 0.0) or 0.0)

    return {
        "execution_time": round(elapsed_seconds, 2),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 6),
    }


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.
    """
    clean_q = user_query[:500]
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {clean_q}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    response = await query_model("google/gemini-2.5-flash", messages, timeout=15.0, max_tokens=40)
    if response is None or not response.get("content"):
        response = await query_model("nvidia/nemotron-3.5-lightning:free", messages, timeout=15.0, max_tokens=40)

    if response is None or not response.get("content"):
        words = re.sub(r"[^\w\s]", "", clean_q).split()[:5]
        return " ".join(words).title() if words else "New Conversation"

    title = response.get("content", "New Conversation").strip().strip("\"'")
    if len(title) > 50:
        title = title[:47] + "..."
    return title or "New Conversation"


async def run_full_council(
    user_query: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
    execution_mode: str = "full_council",
    web_search: bool = False,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any], Dict[str, Any]]:
    """
    Run the complete 3-stage council process (or Fast Solo mode if execution_mode == 'solo').
    """
    start_ts = time.perf_counter()
    cfg = load_council_config()

    citations = []
    if web_search:
        citations = await perform_web_search(user_query, max_results=5)

    enriched_content = build_context_enriched_prompt(
        user_query=user_query,
        attachments=attachments,
        web_citations=citations,
    )

    if execution_mode == "solo":
        stage3_result = await stage3_synthesize_final(
            user_query=user_query,
            stage1_results=[],
            stage2_results=[],
            council_config=cfg,
            conversation_history=conversation_history,
            enriched_user_content=enriched_content,
        )
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
        return [], [], stage3_result, metadata

    # Stage 1
    stage1_results = await stage1_collect_responses(
        user_query=user_query,
        council_config=cfg,
        conversation_history=conversation_history,
        enriched_user_content=enriched_content,
    )

    if not stage1_results:
        elapsed = time.perf_counter() - start_ts
        return [], [], {
            "model": "error",
            "response": "All council models failed to respond. Please check your OpenRouter API key or selected models.",
        }, {"execution_time": round(elapsed, 2), "citations": citations}

    # Stage 2
    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query=user_query,
        stage1_results=stage1_results,
        council_config=cfg,
    )
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Stage 3
    stage3_result = await stage3_synthesize_final(
        user_query=user_query,
        stage1_results=stage1_results,
        stage2_results=stage2_results,
        council_config=cfg,
        conversation_history=conversation_history,
        enriched_user_content=enriched_content,
    )

    elapsed = time.perf_counter() - start_ts
    telemetry = compute_telemetry_summary(stage1_results, stage2_results, stage3_result, elapsed)

    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings,
        "execution_mode": "full_council",
        "reconciliation_mode": cfg.get("reconciliation_mode", "consensus"),
        "citations": citations,
        **telemetry,
    }

    return stage1_results, stage2_results, stage3_result, metadata
