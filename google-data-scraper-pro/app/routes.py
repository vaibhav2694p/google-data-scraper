"""REST API routes."""
from __future__ import annotations

import asyncio
import os
import threading
from typing import Optional

from flask import Blueprint, jsonify, request, send_file, render_template

from app.config import Config
from app.state import JobState
from scraper.exporters import export_csv, export_json, export_xlsx
from scraper.utils import setup_logger

log = setup_logger("routes")

bp = Blueprint("api", __name__)

# ---------------------------------------------------------------------------
# Global job state
# ---------------------------------------------------------------------------
job = JobState()
_stop_event = threading.Event()
_pause_event = threading.Event()
_worker_thread: Optional[threading.Thread] = None


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------
@bp.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@bp.route("/api/search", methods=["POST"])
def api_search():
    global _worker_thread
    body = request.get_json(force=True)
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    max_results = int(body.get("max_results", Config.MAX_RESULTS))

    if job.status == "running":
        return jsonify({"error": "A scrape is already running"}), 409

    job.query = query
    job.status = "running"
    job.total_found = 0
    job.scraped = 0
    job.emails_found = 0
    job.results = []
    job.seen_keys = set()
    job.error = ""
    _stop_event.clear()
    _pause_event.clear()

    _worker_thread = threading.Thread(
        target=_run_scraper, args=(query, max_results), daemon=True
    )
    _worker_thread.start()
    return jsonify({"ok": True, "status": "running", "query": query})


@bp.route("/api/status")
def api_status():
    return jsonify(job.snapshot())


@bp.route("/api/pause", methods=["POST"])
def api_pause():
    if job.status != "running":
        return jsonify({"error": "not running"}), 409
    _pause_event.set()
    job.status = "paused"
    return jsonify({"ok": True, "status": "paused"})


@bp.route("/api/resume", methods=["POST"])
def api_resume():
    if job.status != "paused":
        return jsonify({"error": "not paused"}), 409
    _pause_event.clear()
    job.status = "running"
    return jsonify({"ok": True, "status": "running"})


@bp.route("/api/stop", methods=["POST"])
def api_stop():
    if job.status not in ("running", "paused"):
        return jsonify({"error": "nothing to stop"}), 409
    _stop_event.set()
    _pause_event.clear()
    job.status = "done"
    job.save()
    return jsonify({"ok": True, "status": "done"})


@bp.route("/api/clear", methods=["POST"])
def api_clear():
    _stop_event.set()
    _pause_event.clear()
    job.query = ""
    job.status = "idle"
    job.total_found = 0
    job.scraped = 0
    job.emails_found = 0
    job.results = []
    job.seen_keys = set()
    job.error = ""
    path = os.path.join(os.path.dirname(__file__), "..", "data", "state.json")
    if os.path.exists(path):
        os.remove(path)
    return jsonify({"ok": True, "status": "idle"})


@bp.route("/api/export")
def api_export():
    fmt = request.args.get("format", "csv").lower()
    if not job.results:
        return jsonify({"error": "No data to export"}), 400

    tmp_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(tmp_dir, exist_ok=True)

    if fmt == "csv":
        path = os.path.join(tmp_dir, "results.csv")
        export_csv(job.results, path)
        return send_file(path, as_attachment=True, download_name="results.csv")
    elif fmt == "xlsx":
        path = os.path.join(tmp_dir, "results.xlsx")
        export_xlsx(job.results, path)
        return send_file(
            path,
            as_attachment=True,
            download_name="results.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    elif fmt == "json":
        path = os.path.join(tmp_dir, "results.json")
        export_json(job.results, path)
        return send_file(path, as_attachment=True, download_name="results.json")
    else:
        return jsonify({"error": f"Unknown format: {fmt}"}), 400


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------
def _run_scraper(query: str, max_results: int):
    try:
        from scraper.maps_scraper import scrape_google_maps

        asyncio.run(
            scrape_google_maps(
                query=query,
                max_results=max_results,
                state=job,
                stop_event=_stop_event,
                pause_event=_pause_event,
            )
        )
    except Exception as e:
        log.error("Scraper failed: %s", e)
        job.error = str(e)
    finally:
        if job.status == "running":
            job.status = "done"
        job.save()
