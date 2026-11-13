"""Asset state events: worker/API publish them on Valkey, the API relays them over SSE.

Events carry the full processing state (never deltas), so a client that reconnects and receives
the snapshot again can never end up inconsistent.
"""

from typing import Literal

from lumacut_core.camel import CamelModel

AssetStatus = Literal["uploading", "queued", "processing", "ready", "failed"]
AssetKind = Literal["video", "audio", "image", "lut"]


def user_assets_channel(user_id: str) -> str:
    return f"lumacut:user:{user_id}:assets"


def user_exports_channel(user_id: str) -> str:
    return f"lumacut:user:{user_id}:exports"


ExportStatus = Literal["queued", "running", "done", "failed", "cancelled"]


class ExportStateEvent(CamelModel):
    """Full state of one server export (never a delta)."""

    export_id: str
    project_id: str
    status: ExportStatus
    progress: float
    error_message: str | None
    deleted: bool = False


class AssetStateEvent(CamelModel):
    asset_id: str
    status: AssetStatus
    stage: str | None
    progress: float
    error_code: str | None
    error_message: str | None
    attempts: int
    deleted: bool = False
