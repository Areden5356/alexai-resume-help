#!/usr/bin/env python3
"""Generate the site's raster images: apple-touch-icon.png (180x180) and social.png (1200x630).

assets/icon.svg is the hand-written source of the mark. This script draws the same geometry
with Pillow so the PNG matches it. No stock imagery: the social image is type on paper.

Usage:
    python scripts/make_images.py

Needs Pillow (pip install pillow) and two fonts that ship with Windows: Georgia Bold and
Segoe UI. Pass --font-dir to use another folder that holds georgiab.ttf and segoeui.ttf.
Run it again only when the wording or colors change, then commit the PNGs.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - message path
    sys.exit("Pillow is required: pip install pillow")

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# Same values as the light-theme tokens in assets/style.css.
PAPER = "#f6f1e6"
INK = "#1c2230"
MUTED = "#4a5163"
ACCENT = "#b02a20"

SOCIAL_TITLE = "AlexAI Resume Help"
SOCIAL_LINE = "Free resume and cover letter checks. A rewritten pack for $39."
SCALE = 4  # draw large, then shrink, for smooth edges


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        sys.exit(f"Font not found: {path}. Use --font-dir to point at a folder with it.")
    return ImageFont.truetype(str(path), size)


def fit(path: Path, text: str, start: int, max_width: int) -> ImageFont.FreeTypeFont:
    """Largest font size, stepping down from start, whose text fits max_width pixels."""
    size = start
    while size > 8:
        f = font(path, size)
        if f.getlength(text) <= max_width:
            return f
        size -= SCALE
    sys.exit(f"Text does not fit: {text}")


def draw_mark(draw: ImageDraw.ImageDraw, size: int) -> None:
    """The 'A' with a pencil underline, on a 64 unit grid (matches assets/icon.svg)."""
    u = size / 64
    draw.rectangle([0, 0, size, size], fill=PAPER)
    w = round(7 * u)
    draw.line([(14 * u, 48 * u), (32 * u, 12 * u)], fill=INK, width=w)
    draw.line([(32 * u, 12 * u), (50 * u, 48 * u)], fill=INK, width=w)
    draw.line([(21 * u, 36 * u), (43 * u, 36 * u)], fill=INK, width=round(5 * u))
    draw.line([(10 * u, 56 * u), (54 * u, 56 * u)], fill=ACCENT, width=round(5 * u))
    # round the ends of the strokes
    for (x, y, r) in [(14, 48, 3.5), (32, 12, 3.5), (50, 48, 3.5)]:
        draw.ellipse([(x - r) * u, (y - r) * u, (x + r) * u, (y + r) * u], fill=INK)
    for (x, y) in [(10, 56), (54, 56)]:
        r = 2.5
        draw.ellipse([(x - r) * u, (y - r) * u, (x + r) * u, (y + r) * u], fill=ACCENT)


def make_touch_icon(out: Path) -> None:
    big = 180 * SCALE
    img = Image.new("RGB", (big, big), PAPER)
    draw_mark(ImageDraw.Draw(img), big)
    img.resize((180, 180), Image.LANCZOS).save(out, optimize=True)


def make_social(out: Path, font_dir: Path) -> None:
    w, h = 1200 * SCALE, 630 * SCALE
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    left = 90 * SCALE
    room = w - 2 * left
    title_font = fit(font_dir / "georgiab.ttf", SOCIAL_TITLE, 104 * SCALE, room)
    line_font = fit(font_dir / "segoeui.ttf", SOCIAL_LINE, 40 * SCALE, room)
    d.text((left, 190 * SCALE), SOCIAL_TITLE, font=title_font, fill=INK)
    d.rectangle([left, 345 * SCALE, left + 220 * SCALE, 353 * SCALE], fill=ACCENT)
    d.text((left, 395 * SCALE), SOCIAL_LINE, font=line_font, fill=MUTED)
    img.resize((1200, 630), Image.LANCZOS).save(out, optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    args = ap.parse_args()
    ASSETS.mkdir(exist_ok=True)
    make_touch_icon(ASSETS / "apple-touch-icon.png")
    make_social(ASSETS / "social.png", args.font_dir)
    print("wrote", ASSETS / "apple-touch-icon.png", "and", ASSETS / "social.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
