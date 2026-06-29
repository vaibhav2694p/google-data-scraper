#!/usr/bin/env python3
"""Google Maps Email Scraper Pro — entry point."""
import os
from dotenv import load_dotenv
load_dotenv()

from app.server import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=port, debug=debug)
