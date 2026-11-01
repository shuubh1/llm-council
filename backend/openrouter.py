"""OpenRouter API client and Web Grounding helper for making LLM requests."""

import time
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL


async def query_model(
    model: str,
    messages: List[Dict[str, Any]],
    timeout: float = 120.0,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    system_prompt: Optional[str] = None,
    zero_data_retention: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API with persona, temperature, and ZDR support.

    Args:
        model: OpenRouter model identifier
        messages: List of message dicts with 'role' and 'content' (str or multimodal list)
        timeout: Request timeout in seconds
        max_tokens: Optional maximum tokens to generate
        temperature: Optional sampling temperature (0.0 to 1.5)
        system_prompt: Optional system instructions prepended for this seat/model
        zero_data_retention: Whether to enforce OpenRouter data_collection: "deny"

    Returns:
        Response dict with 'content', 'reasoning_details', 'usage', and 'latency_ms', or None if failed
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "LLM Council Console",
    }

    final_messages: List[Dict[str, Any]] = []
    if system_prompt and system_prompt.strip():
        final_messages.append({
            "role": "system",
            "content": system_prompt.strip(),
        })

    for m in messages:
        if m.get("role") == "system" and final_messages:
            # Merge with existing system message
            final_messages[0]["content"] = f"{final_messages[0]['content']}\n\n{m.get('content', '')}"
        else:
            final_messages.append(m)

    payload: Dict[str, Any] = {
        "model": model,
        "messages": final_messages,
    }

    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    if temperature is not None:
        payload["temperature"] = float(temperature)

    if zero_data_retention:
        payload["provider"] = {
            "data_collection": "deny"
        }

    start_ts = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload,
            )
            # If provider ZDR filter caused 404/400 on a specific free provider, retry once without provider filter
            if response.status_code in (400, 404) and zero_data_retention and "provider" in payload:
                payload.pop("provider", None)
                response = await client.post(
                    OPENROUTER_API_URL,
                    headers=headers,
                    json=payload,
                )

            response.raise_for_status()

            latency_ms = int((time.perf_counter() - start_ts) * 1000)
            data = response.json()
            choice = data.get("choices", [{}])[0]
            message = choice.get("message", {})
            content = message.get("content")
            # Fallback to reasoning text if content is empty
            if not content and message.get("reasoning"):
                content = message.get("reasoning")

            usage = data.get("usage", {})
            annotations = message.get("annotations", [])

            return {
                "content": content or "",
                "reasoning_details": message.get("reasoning_details") or message.get("reasoning"),
                "usage": {
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "total_tokens": usage.get("total_tokens", 0),
                    "cost": usage.get("cost", 0.0),
                },
                "annotations": annotations,
                "latency_ms": latency_ms,
            }

    except asyncio.CancelledError:
        raise
    except Exception as e:
        print(f"Error querying model {model}: {e}")
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, Any]],
    max_tokens: Optional[int] = None,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel (legacy helper).
    """
    tasks = [query_model(model, messages, max_tokens=max_tokens) for model in models]
    responses = await asyncio.gather(*tasks, return_exceptions=False)
    return {model: response for model, response in zip(models, responses)}


async def query_seats_parallel(
    seats: List[Dict[str, Any]],
    messages: List[Dict[str, Any]],
    zero_data_retention: bool = False,
    max_tokens: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Query enabled council member seats in parallel, injecting each seat's
    individual role_name, system_prompt, and temperature.
    """
    enabled_seats = [s for s in seats if s.get("enabled", True)]

    async def _query_seat(seat: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        role_name = seat.get("role_name") or "Council Member"
        seat_sys = seat.get("system_prompt") or ""
        combined_sys = f"Your Council Role: {role_name}.\n{seat_sys}".strip()
        resp = await query_model(
            model=seat["model"],
            messages=messages,
            max_tokens=max_tokens,
            temperature=seat.get("temperature", 0.7),
            system_prompt=combined_sys,
            zero_data_retention=zero_data_retention,
        )
        if resp is None:
            return None
        return {
            "seat_id": seat.get("id", ""),
            "model": seat["model"],
            "role_name": role_name,
            "temperature": seat.get("temperature", 0.7),
            "response": resp.get("content", ""),
            "reasoning_details": resp.get("reasoning_details"),
            "usage": resp.get("usage", {}),
            "latency_ms": resp.get("latency_ms", 0),
        }

    tasks = [_query_seat(seat) for seat in enabled_seats]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return [r for r in results if r is not None]


async def perform_web_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """
    Run an async web search for live grounding citations.
    Uses duckduckgo_search (DDGS) if available, with graceful fallback to DuckDuckGo Lite/HTML API.
    Returns list of dicts with 'title', 'url', 'snippet'.
    """
    def _sync_ddg_search(q: str, limit: int) -> List[Dict[str, str]]:
        try:
            from duckduckgo_search import DDGS
            results = []
            with DDGS() as ddgs:
                for r in ddgs.text(q, max_results=limit):
                    results.append({
                        "title": r.get("title", "Web Source"),
                        "url": r.get("href") or r.get("url", ""),
                        "snippet": r.get("body") or r.get("snippet", ""),
                    })
            if results:
                return results
        except Exception as e:
            print(f"DDGS search warning: {e}")
        return []

    results = await asyncio.to_thread(_sync_ddg_search, query, max_results)
    if results:
        return results

    # Fallback lightweight Instant Answer / Wikipedia open search if DDGS is rate-limited
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "format": "json",
                    "srlimit": max_results,
                },
                headers={"User-Agent": "LLMCouncil/2.0"},
            )
            if resp.status_code == 200:
                data = resp.json()
                search_items = data.get("query", {}).get("search", [])
                import re
                fallback_results = []
                for item in search_items:
                    title = item.get("title", "")
                    snippet = re.sub(r"<[^>]+>", "", item.get("snippet", ""))
                    url = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
                    fallback_results.append({
                        "title": f"{title} - Wikipedia",
                        "url": url,
                        "snippet": snippet,
                    })
                return fallback_results
    except Exception as e:
        print(f"Fallback web search error: {e}")

    return []
