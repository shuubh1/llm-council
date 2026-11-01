"""Configuration for the LLM Council."""

import os
from dotenv import load_dotenv

# Ensure .env overrides any pre-existing environment variables
load_dotenv(override=True)

# OpenRouter API key
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# Council members - list of OpenRouter model identifiers (verified active free tier)
COUNCIL_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-super-vl:free",
    "nvidia/nemotron-3.5-lightning:free",
    "cohere/north-mini-code:free",
]

CHAIRMAN_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"
