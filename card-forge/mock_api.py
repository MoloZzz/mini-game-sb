"""Dependency-free stdlib mock of game-api's ingest endpoint.

Lets ingest.py's idempotency be exercised (inserted=0 on a second run)
without needing the real game-api running. Only understands
POST /api/admin/cards/ingest; everything else is 404.

Usage:
    python mock_api.py [--port 3000]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

INGEST_PATH = "/api/admin/cards/ingest"

_seen_slugs: set[str] = set()


def _log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[{timestamp}] {message}")


class MockIngestHandler(BaseHTTPRequestHandler):
    server_version = "card-forge-mock-api/1.0"

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        # Silence the default stderr access log; we print our own line per request.
        pass

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - stdlib method name
        if self.path != INGEST_PATH:
            _log(f"POST {self.path} -> 404 (unknown path)")
            self._send_json(404, {"error": "not found", "path": self.path})
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw_body = self.rfile.read(length) if length else b""

        try:
            data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            _log(f"POST {self.path} -> 400 (malformed JSON: {exc})")
            self._send_json(400, {"error": f"malformed JSON body: {exc}"})
            return

        cards = data.get("cards")
        if not isinstance(cards, list):
            _log(f"POST {self.path} -> 400 (missing 'cards' array)")
            self._send_json(400, {"error": "expected body {'cards': [...]}"})
            return

        inserted = 0
        skipped = 0
        skipped_slugs: list[str] = []

        for card in cards:
            slug = card.get("slug") if isinstance(card, dict) else None
            if not slug:
                _log(f"POST {self.path} -> 400 (card missing 'slug')")
                self._send_json(400, {"error": "each card requires a 'slug'"})
                return
            if slug in _seen_slugs:
                skipped += 1
                skipped_slugs.append(slug)
            else:
                _seen_slugs.add(slug)
                inserted += 1

        _log(f"POST {self.path} -> 200 (inserted={inserted} skipped={skipped} total_seen={len(_seen_slugs)})")
        self._send_json(200, {"inserted": inserted, "skipped": skipped, "skippedSlugs": skipped_slugs})

    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        _log(f"GET {self.path} -> 404")
        self._send_json(404, {"error": "not found", "path": self.path})

    do_PUT = do_GET
    do_DELETE = do_GET
    do_PATCH = do_GET


def main() -> int:
    parser = argparse.ArgumentParser(description="Mock game-api ingest endpoint for idempotency testing.")
    parser.add_argument("--port", type=int, default=3000, help="port to listen on (default 3000)")
    args = parser.parse_args()

    server = ThreadingHTTPServer(("localhost", args.port), MockIngestHandler)
    print(f"card-forge mock_api: listening on http://localhost:{args.port}{INGEST_PATH}")
    print("Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        print("mock_api: shutting down.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
