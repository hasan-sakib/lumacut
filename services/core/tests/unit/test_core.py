import re

from lumacut_core.events import AssetStateEvent, user_assets_channel
from lumacut_core.ids import ID_LENGTH, new_id
from lumacut_core.settings import CoreSettings
from lumacut_core.storage import AssetKeys

SCHEMA_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")  # packages/schema Id


def test_ids_match_schema_pattern_and_are_unique() -> None:
    ids = {new_id() for _ in range(2000)}
    assert len(ids) == 2000
    assert all(SCHEMA_ID.match(i) and len(i) == ID_LENGTH for i in ids)


def test_asset_key_layout() -> None:
    keys = AssetKeys(owner_id="u1", asset_id="a1")
    assert keys.prefix == "users/u1/assets/a1/"
    assert keys.original(".MP4") == "users/u1/assets/a1/original.mp4"
    assert keys.original("") == "users/u1/assets/a1/original"
    assert keys.rendition("thumbs/index.json") == "users/u1/assets/a1/thumbs/index.json"


def test_public_endpoint_defaults_to_internal_endpoint() -> None:
    assert CoreSettings(s3_endpoint_url="http://s3:8333").s3_public_endpoint_url == "http://s3:8333"
    explicit = CoreSettings(s3_endpoint_url="http://s3:8333", s3_public_endpoint_url="http://x:1")
    assert explicit.s3_public_endpoint_url == "http://x:1"


def test_event_channel_and_payload() -> None:
    assert user_assets_channel("u1") == "lumacut:user:u1:assets"
    event = AssetStateEvent(
        asset_id="a1",
        status="processing",
        stage="proxy",
        progress=0.4,
        error_code=None,
        error_message=None,
        attempts=1,
    )
    wire = event.model_dump(mode="json")
    assert wire["assetId"] == "a1" and wire["errorCode"] is None and wire["deleted"] is False
    assert AssetStateEvent.model_validate(wire) == event


def test_bucket_cors_exposes_range_headers_for_media_playback() -> None:
    from lumacut_core.storage import bucket_cors_rules

    (rule,) = bucket_cors_rules(("http://localhost:8080",))["CORSRules"]
    assert rule["AllowedOrigins"] == ["http://localhost:8080"]
    assert {"GET", "HEAD", "PUT"} <= set(rule["AllowedMethods"])
    # The media engine reads proxies by HTTP range request and needs these to be readable.
    assert {"Content-Range", "Accept-Ranges", "Content-Length", "ETag"} <= set(
        rule["ExposeHeaders"]
    )


def test_cors_origins_are_configurable() -> None:
    assert "http://localhost:8080" in CoreSettings().cors_allowed_origins
    custom = CoreSettings(cors_allowed_origins=("https://studio.example.com",))
    assert custom.cors_allowed_origins == ("https://studio.example.com",)
