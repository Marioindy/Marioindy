#!/usr/bin/env python3
"""Dev-time prep for the profile graphics. Run once when fonts or the seal change.

  1. Subsets Playfair Display (OFL) and JetBrains Mono (OFL) to the glyphs the
     SVGs use and writes them as WOFF2 into scripts/fonts/. The generator embeds
     them as data URIs, so the SVGs render the same on every machine.
  2. Rasterises the ÆSHE seal master (scripts/data/seal.svg) with headless Chrome
     and writes a coverage grid to scripts/data/seal-coverage.json. The hero's
     ASCII field resolves into that grid.

Needs: fonttools, brotli, Pillow, google-chrome.
  python3 -m venv .venv && .venv/bin/pip install fonttools brotli pillow
  .venv/bin/python scripts/prep.py
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image

ROOT = Path(__file__).resolve().parent
FONTS = ROOT / "fonts"
DATA = ROOT / "data"

SRC_PLAYFAIR = os.environ.get("PLAYFAIR_DIR", "")
SRC_JBMONO = os.environ.get("JBMONO", "")

LATIN = "".join(chr(c) for c in range(0x20, 0x7F)) + "ÁÉÍÓÚÑÜáéíóúñüÆæ·—–’‘“”…→↗"
MONO = "".join(chr(c) for c in range(0x20, 0x7F)) + "·░▒▓█▁▂▃▄▅▆▇▔─│┌┐└┘├┤┬┴┼═║╔╗╚╝◆◇○●◐◑▶▷◀▲▼↗→←↑↓╱╲╳⋯∙•×◜◝◞◟▕▏Æ╭╮╯╰~"


def subset_font(src: Path, out: Path, text: str, wght: float | None = None) -> None:
    font = TTFont(src)
    if wght is not None and "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": wght})
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "lnum", "pnum"]
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(out)
    print(f"font {out.name}: {out.stat().st_size} bytes")


def seal_coverage(cols: int = 68, rows: int = 30, cell_aspect: float = 0.5) -> None:
    """Rasterise the seal at high res, then average into a cols x rows grid.

    cell_aspect is cell width / cell height for the mono font at the hero's
    line height, so the mark is not stretched when drawn as text.
    """
    svg = (DATA / "seal.svg").read_text()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        W, H = 1360, 1200
        html = tmp / "s.html"
        (tmp / "seal.svg").write_text(svg)
        html.write_text(
            f'<html><body style="margin:0;background:#000">'
            f'<img src="seal.svg" style="margin:120px;width:{W-240}px;height:{H-360}px;'
            f'object-fit:contain;filter:brightness(10)"></body></html>'
        )
        png = tmp / "s.png"
        subprocess.run(
            ["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu",
             "--hide-scrollbars", f"--window-size={W},{H}", f"--screenshot={png}",
             f"file://{html}"],
            check=True, capture_output=True,
        )
        img = Image.open(png).convert("L")
    # Fit the seal into the grid, respecting cell aspect.
    bbox = img.getbbox()
    img = img.crop(bbox)
    iw, ih = img.size
    # grid in "square units": cols*cell_aspect wide, rows tall
    gw, gh = cols * cell_aspect, rows
    scale = min(gw / iw, gh / ih) * 0.92
    tw, th = iw * scale / cell_aspect, ih * scale  # in cells
    small = img.resize((max(1, round(tw * 4)), max(1, round(th * 4))), Image.LANCZOS)
    grid = [[0.0] * cols for _ in range(rows)]
    ox, oy = (cols - tw) / 2, (rows - th) / 2
    px = small.load()
    sw, sh = small.size
    for r in range(rows):
        for c in range(cols):
            acc = n = 0
            for sy in range(4):
                for sx in range(4):
                    x = int((c - ox) * 4 + sx)
                    y = int((r - oy) * 4 + sy)
                    if 0 <= x < sw and 0 <= y < sh:
                        acc += px[x, y]
                    n += 1
            grid[r][c] = round(acc / n / 255, 3)
    (DATA / "seal-coverage.json").write_text(json.dumps({"cols": cols, "rows": rows, "grid": grid}))
    print(f"coverage {cols}x{rows}, filled cells {sum(v > .15 for row in grid for v in row)}")


def main() -> None:
    FONTS.mkdir(exist_ok=True)
    if SRC_PLAYFAIR:
        p = Path(SRC_PLAYFAIR)
        subset_font(p / "playfair-display-latin-wght-normal.woff2", FONTS / "playfair-400.woff2", LATIN, 400)
        subset_font(p / "playfair-display-latin-wght-normal.woff2", FONTS / "playfair-500.woff2", LATIN, 500)
        subset_font(p / "playfair-display-latin-wght-italic.woff2", FONTS / "playfair-400-italic.woff2", LATIN, 400)
    if SRC_JBMONO:
        subset_font(Path(SRC_JBMONO), FONTS / "jbmono-400.woff2", MONO)
    seal_coverage()


if __name__ == "__main__":
    sys.exit(main())
