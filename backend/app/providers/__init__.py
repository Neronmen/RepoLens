from app.config import Settings
from app.providers.base import LLMProvider
from app.providers.gemini import GeminiProvider


def build_provider(settings: Settings) -> LLMProvider:
    return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
