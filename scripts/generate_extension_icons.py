"""Generate dependency-free PNG icons for the Chrome extension."""

import binascii
import struct
import zlib
from pathlib import Path


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)
    )


def render_icon(size: int) -> bytes:
    scale = 4
    canvas_size = size * scale
    radius = canvas_size * 0.27
    clock_radius = canvas_size * 0.27
    center = canvas_size / 2
    pixels = bytearray()

    for output_y in range(size):
        row = bytearray([0])
        for output_x in range(size):
            samples = []
            for sample_y in range(scale):
                for sample_x in range(scale):
                    x = output_x * scale + sample_x + 0.5
                    y = output_y * scale + sample_y + 0.5
                    corner_x = min(x, canvas_size - x)
                    corner_y = min(y, canvas_size - y)
                    inside_background = (
                        corner_x >= radius
                        or corner_y >= radius
                        or (corner_x - radius) ** 2 + (corner_y - radius) ** 2 <= radius**2
                    )
                    distance = ((x - center) ** 2 + (y - center) ** 2) ** 0.5
                    ring_width = canvas_size * 0.055
                    on_ring = abs(distance - clock_radius) <= ring_width
                    on_hour_hand = (
                        abs(x - center) <= ring_width
                        and center - clock_radius * 0.58 <= y <= center + ring_width
                    )
                    hand_end_x = center + clock_radius * 0.5
                    hand_end_y = center + clock_radius * 0.28
                    line_dx = hand_end_x - center
                    line_dy = hand_end_y - center
                    line_length_sq = line_dx**2 + line_dy**2
                    projection = max(
                        0,
                        min(1, ((x - center) * line_dx + (y - center) * line_dy) / line_length_sq),
                    )
                    nearest_x = center + projection * line_dx
                    nearest_y = center + projection * line_dy
                    on_minute_hand = (
                        (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= ring_width**2
                    )

                    if on_ring or on_hour_hand or on_minute_hand:
                        samples.append((255, 255, 255, 255))
                    elif inside_background:
                        samples.append((49, 87, 213, 255))
                    else:
                        samples.append((0, 0, 0, 0))

            row.extend(sum(sample[channel] for sample in samples) // len(samples) for channel in range(4))
        pixels.extend(row)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(pixels), 9))
        + png_chunk(b"IEND", b"")
    )


output_directory = Path(__file__).resolve().parents[1] / "public" / "icons"
output_directory.mkdir(parents=True, exist_ok=True)

for icon_size in (16, 32, 48, 128):
    (output_directory / f"icon-{icon_size}.png").write_bytes(render_icon(icon_size))
