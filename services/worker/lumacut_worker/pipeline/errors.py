from typing import Literal

ErrorCode = Literal[
    "unsupported_format",
    "corrupt_file",
    "no_media_streams",
    "image_too_large",
    "invalid_lut",
    "processing_failed",
]

MESSAGES: dict[ErrorCode, str] = {
    "unsupported_format": "This file type isn't supported. Upload a video (MP4, MOV, MKV, WebM…), "
    "audio (WAV, MP3, AAC, FLAC…), image (JPEG, PNG, WebP, GIF, TIFF, AVIF…) "
    "or colour look-up table (.cube).",
    "corrupt_file": "The file is damaged or incomplete, so it can't be processed. "
    "Try exporting or copying it again, then re-upload.",
    "no_media_streams": "The file contains no video or audio we can use.",
    "image_too_large": "The image is too large to open (over 400 megapixels). "
    "Resize it below 20000 x 20000 px and upload it again.",
    "invalid_lut": "This isn't a usable .cube look-up table. Export it again from your grading "
    "tool as a .cube file (1D or 3D, size up to 65) and re-upload.",
    "processing_failed": "Processing failed unexpectedly. Retry; if it keeps failing, "
    "the file may use a feature we don't support yet.",
}


class ProcessingError(Exception):
    """A user-facing failure: `code` is stable for the UI, `message` says what to do."""

    def __init__(self, code: ErrorCode, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code: ErrorCode = code
        self.message = MESSAGES[code]
        self.detail = detail
