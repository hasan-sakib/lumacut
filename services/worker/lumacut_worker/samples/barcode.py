"""Machine-readable frame-number barcode burned into sample videos.

Layout (bottom strip of the frame, STRIP_FRACTION of the height, split into CELLS equal cells):
  cell 0          always white  (start marker)
  cells 1..16     frame number, most significant bit first (white = 1, black = 0)
  cell 17         always black  (end marker)

The frame number is the decoder's frame index `n` (0-based). M2's frame-exact seek test reads the
same barcode in the browser, so this layout is a contract: change it only together with that test.
"""

CELLS = 18
BITS = 16
STRIP_FRACTION = 1 / 12
WHITE = 255
BLACK = 0
THRESHOLD = 128


def strip_height(frame_height: int) -> int:
    """Strip height in pixels, kept even for 4:2:0 chroma subsampling."""
    return max(2, round(frame_height * STRIP_FRACTION) // 2 * 2)


def geq_luma_expression() -> str:
    """FFmpeg `geq` luma expression drawing the barcode for frame N on a strip of width W."""
    cell = f"floor(X*{CELLS}/W)"
    bit = f"mod(floor(N/pow(2,{BITS}-{cell})),2)"
    return f"if(eq({cell},0),{WHITE},if(eq({cell},{CELLS - 1}),{BLACK},{WHITE}*{bit}))"


def cell_centers(width: int) -> list[int]:
    return [int((c + 0.5) * width / CELLS) for c in range(CELLS)]


def encode_row(frame: int, width: int) -> bytes:
    """Reference rendering of one barcode row (pure Python; mirrors geq_luma_expression)."""
    if not 0 <= frame < 2**BITS:
        raise ValueError(f"frame {frame} does not fit in {BITS} bits")
    row = bytearray(width)
    for x in range(width):
        cell = x * CELLS // width
        if cell == 0:
            row[x] = WHITE
        elif cell == CELLS - 1:
            row[x] = BLACK
        else:
            row[x] = WHITE * ((frame >> (BITS - cell)) & 1)
    return bytes(row)


class BarcodeError(ValueError):
    """The strip does not contain a valid barcode (wrong markers or unreadable)."""


def decode_row(row: bytes) -> int:
    """Read the frame number from one row of luma samples crossing the strip."""
    width = len(row)
    bits = [row[x] >= THRESHOLD for x in cell_centers(width)]
    if not bits[0] or bits[-1]:
        raise BarcodeError("start/end markers not found; is this a Lumacut sample frame?")
    value = 0
    for bit in bits[1:-1]:
        value = (value << 1) | int(bit)
    return value


def decode_frame(gray: bytes, width: int, height: int) -> int:
    """Decode the barcode from a full 8-bit grayscale frame (row-major, width*height bytes)."""
    if len(gray) != width * height:
        raise BarcodeError(f"expected {width * height} bytes, got {len(gray)}")
    y = height - strip_height(height) // 2
    return decode_row(gray[y * width : (y + 1) * width])
