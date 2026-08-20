"""Decode the QR out of the rendered certificate PDF.

A QR that *looks* like a QR proves nothing — the certificate is worthless if a
phone cannot read it off paper. So the PDF is rasterised at a few scales and the
code is decoded back, which tests the whole chain at once: SVG in the HTML,
vector in the PDF, and enough resolution to survive printing.

    python spike/pdf/decode_qr.py <pdf-path> <expected-url>
"""

import sys
from pathlib import Path

import pypdfium2 as pdfium
import zxingcpp

# ~72, 150 and 300 dpi. The low end matters most: it stands in for a small QR on
# a page someone scans in a hurry.
SCALES = (1.0, 2.0, 4.0)


def main() -> int:
    pdf_path = Path(sys.argv[1])
    expected = sys.argv[2]

    doc = pdfium.PdfDocument(str(pdf_path))
    page = doc[0]

    failures = 0
    for scale in SCALES:
        image = page.render(scale=scale).to_pil()
        results = zxingcpp.read_barcodes(image)
        dpi = round(72 * scale)

        if not results:
            print(f"  {dpi:>4} dpi  ({image.width}x{image.height})  NO CODE FOUND")
            failures += 1
            continue

        text = results[0].text
        ok = text == expected
        failures += 0 if ok else 1
        print(
            f"  {dpi:>4} dpi  ({image.width}x{image.height})  "
            f"{'MATCH  ' if ok else 'WRONG  '}{text}"
        )

    doc.close()
    print(f"\nexpected: {expected}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
