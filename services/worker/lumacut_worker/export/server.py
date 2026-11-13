"""The export job's local web server.

It serves the built render page (same origin as everything it loads), proxies media from storage
(`/media/<assetId>/<kind>`, with byte ranges), and takes the page's results: each frame as raw
RGBA (`POST /frame?i=N`, in order) and the mix as a WAV (`POST /audio`). Runs on 127.0.0.1 only.
"""

from __future__ import annotations

import mimetypes
import shutil
import threading
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar
from urllib.parse import parse_qs, unquote, urlparse

CHUNK = 1024 * 1024


class CancelledError(Exception):
    """The export was cancelled; the page is told to stop."""


@dataclass
class ExportIntake:
    """What the server does with the page's results (filled in by the job)."""

    #: Called with each frame, in order; raises `CancelledError` to stop the page.
    on_frame: Callable[[int, bytes], None]
    audio_path: Path
    #: assetId -> kind -> presigned (internal) URL.
    media: dict[str, dict[str, str]]
    static_dir: Path
    errors: list[str] = field(default_factory=list)
    next_frame: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)


class _Handler(BaseHTTPRequestHandler):
    intake: ClassVar[ExportIntake]

    def log_message(self, format: str, *args: object) -> None:
        return  # quiet: the job logs what matters

    def _headers(self, status: int, length: int | None = None, kind: str | None = None) -> None:
        self.send_response(status)
        # The page is cross-origin isolated, like the editor.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        if kind is not None:
            self.send_header("Content-Type", kind)
        if length is not None:
            self.send_header("Content-Length", str(length))

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path.startswith("/media/"):
            self._media(path)
            return
        self._static(path)

    def _static(self, path: str) -> None:
        root = self.intake.static_dir.resolve()
        target = (root / path.lstrip("/")).resolve()
        if path in ("", "/"):
            target = root / "index.html"
        if not target.is_relative_to(root) or not target.is_file():
            self._headers(HTTPStatus.NOT_FOUND, 0)
            self.end_headers()
            return
        kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in (".js", ".mjs"):
            kind = "text/javascript"
        size = target.stat().st_size
        self._headers(HTTPStatus.OK, size, kind)
        self.end_headers()
        with target.open("rb") as f:
            shutil.copyfileobj(f, self.wfile, CHUNK)

    def _media(self, path: str) -> None:
        parts = path.split("/")
        asset_id = parts[2] if len(parts) > 2 else ""
        kind = parts[3] if len(parts) > 3 else ""
        urls = self.intake.media.get(asset_id, {})
        url = urls.get(kind)
        if url is None and kind == "original":
            url = urls.get("video") or urls.get("audio")
        if url is None:
            self._headers(HTTPStatus.NOT_FOUND, 0)
            self.end_headers()
            return
        request = urllib.request.Request(url)
        if (wanted := self.headers.get("Range")) is not None:
            request.add_header("Range", wanted)
        try:
            with urllib.request.urlopen(request, timeout=60) as upstream:
                self.send_response(upstream.status)
                for name in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
                    if (value := upstream.headers.get(name)) is not None:
                        self.send_header(name, value)
                self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                self.end_headers()
                shutil.copyfileobj(upstream, self.wfile, CHUNK)
        except urllib.error.HTTPError as exc:
            self._headers(exc.code, 0)
            self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            if parsed.path == "/frame":
                index = int(parse_qs(parsed.query).get("i", ["-1"])[0])
                with self.intake.lock:
                    if index != self.intake.next_frame:
                        raise ValueError(
                            f"frame {index} arrived, {self.intake.next_frame} expected"
                        )
                    self.intake.on_frame(index, body)
                    self.intake.next_frame += 1
            elif parsed.path == "/audio":
                self.intake.audio_path.write_bytes(body)
            else:
                self._headers(HTTPStatus.NOT_FOUND, 0)
                self.end_headers()
                return
        except CancelledError:
            self._headers(HTTPStatus.CONFLICT, 0)
            self.end_headers()
            return
        except Exception as exc:  # the page reports it; the job reads `errors`
            self.intake.errors.append(str(exc))
            self._headers(HTTPStatus.INTERNAL_SERVER_ERROR, 0)
            self.end_headers()
            return
        self._headers(HTTPStatus.NO_CONTENT)
        self.end_headers()


class ExportServer:
    """Runs the handler on a free port of 127.0.0.1 in background threads."""

    def __init__(self, intake: ExportIntake) -> None:
        handler = type("Handler", (_Handler,), {"intake": intake})
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host!s}:{port!s}"

    def __enter__(self) -> ExportServer:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._server.shutdown()
        self._server.server_close()
