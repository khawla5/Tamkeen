"""Rasterise the spike PDFs so the rendering can be inspected by eye.

Shaping correctness is a *visual* property. Extracting text from a PDF proves
the ToUnicode map is right, which is necessary but not sufficient: a PDF whose
Arabic letters are all drawn in isolated form still extracts as the correct
string. So the PDFs are rendered to PNG through PDFium — the same engine
Chromium ships — and looked at.

    python spike/pdf/rasterize.py <out-dir>
"""

import sys
from pathlib import Path

import pypdfium2 as pdfium

SCALE = 2.0  # ~144 dpi: enough to judge letter joins without huge files


def main() -> int:
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    pdfs = sorted(out_dir.glob("*.pdf"))

    if not pdfs:
        print(f"No PDFs in {out_dir}")
        return 1

    for pdf_path in pdfs:
        doc = pdfium.PdfDocument(str(pdf_path))
        for index, page in enumerate(doc):
            image = page.render(scale=SCALE).to_pil()
            suffix = "" if len(doc) == 1 else f"-p{index + 1}"
            png_path = pdf_path.with_name(f"{pdf_path.stem}{suffix}.png")
            image.save(png_path)
            print(f"{png_path.name:34} {image.width}x{image.height}")
        doc.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
