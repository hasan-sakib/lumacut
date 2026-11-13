"""Server-sent events: live asset state for the signed-in user.

On connect the client gets a `snapshot` of every asset that is not yet ready (subscribed first,
so nothing can slip between snapshot and stream), then one `asset` event per state change.
Events carry full state, so reconnect + snapshot always converges.
"""

import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sse_starlette import EventSourceResponse, ServerSentEvent

from lumacut_api.assets_service import state_event
from lumacut_api.auth.tokens import InvalidTokenError
from lumacut_api.deps import UNAUTHORIZED, ResourcesDep, TokenServiceDep
from lumacut_api.errors import error_responses
from lumacut_core.db import Asset, User
from lumacut_core.events import user_assets_channel, user_exports_channel

router = APIRouter(tags=["events"])
_bearer = HTTPBearer(auto_error=False)

HEARTBEAT_S = 15
UNFINISHED = ("uploading", "queued", "processing", "failed")


async def stream_user_id(
    resources: ResourcesDep,
    tokens: TokenServiceDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    """Authenticate with a short-lived session: a stream must not pin a pooled DB connection."""
    if credentials is None:
        raise UNAUTHORIZED
    try:
        user_id = tokens.user_id_from_access(credentials.credentials)
    except InvalidTokenError:
        raise UNAUTHORIZED from None
    async with resources.sessions() as session:
        if await session.get(User, user_id) is None:
            raise UNAUTHORIZED
    return user_id


@router.get(
    "/api/events",
    response_class=EventSourceResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "snapshot + asset events + export events",
        },
        **error_responses(401),
    },
)
async def events(
    request: Request,
    resources: ResourcesDep,
    user_id: Annotated[str, Depends(stream_user_id)],
) -> EventSourceResponse:
    """Live asset and export state (SSE). Events: `snapshot` (JSON list of assets), then `asset`
    and `export` (JSON objects) as they change."""

    async def stream() -> AsyncIterator[ServerSentEvent]:
        pubsub = resources.redis.pubsub()
        assets_channel = user_assets_channel(user_id)
        await pubsub.subscribe(assets_channel, user_exports_channel(user_id))
        try:
            async with resources.sessions() as session:
                rows = await session.scalars(
                    select(Asset).where(Asset.owner_id == user_id, Asset.status.in_(UNFINISHED))
                )
                snapshot = [state_event(a).model_dump(mode="json") for a in rows]
            yield ServerSentEvent(event="snapshot", data=json.dumps(snapshot))
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is not None:
                    data = message["data"]
                    channel = message["channel"]
                    name = channel.decode() if isinstance(channel, bytes) else str(channel)
                    yield ServerSentEvent(
                        event="asset" if name == assets_channel else "export",
                        data=data.decode() if isinstance(data, bytes) else data,
                    )
        finally:
            await pubsub.unsubscribe()
            await pubsub.aclose()  # type: ignore[no-untyped-call]  # untyped in redis-py

    return EventSourceResponse(
        stream(),
        ping=HEARTBEAT_S,
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
