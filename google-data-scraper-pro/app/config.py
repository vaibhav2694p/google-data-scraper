import os


class Config:
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")

    # Ollama
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
    OLLAMA_ENABLED = os.getenv("OLLAMA_ENABLED", "false").lower() in ("1", "true", "yes")
    OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")

    # Scraper
    MAX_SCROLL_ROUNDS = int(os.getenv("MAX_SCROLL_ROUNDS", "100"))
    MAX_RESULTS = int(os.getenv("MAX_RESULTS", "500"))
    REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", "1.0"))

    # Server
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5000"))
    DEBUG = os.getenv("DEBUG", "true").lower() in ("1", "true", "yes")
