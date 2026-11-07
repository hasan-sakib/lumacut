import pytest

from lumacut_api.routes.uploads import guess_kind


@pytest.mark.parametrize(
    ("mime", "name", "kind"),
    [
        ("video/mp4", "a.mp4", "video"),
        ("audio/wav", "a.wav", "audio"),
        ("image/png", "a.png", "image"),
        ("application/octet-stream", "look.cube", "lut"),
        ("text/plain", "LOOK.CUBE", "lut"),
        ("application/octet-stream", "notes.txt", None),
        ("application/pdf", "a.pdf", None),
    ],
)
def test_guess_kind(mime: str, name: str, kind: str | None) -> None:
    assert guess_kind(mime, name) == kind


def test_guess_kind_works_without_a_name() -> None:
    assert guess_kind("video/mp4") == "video"
