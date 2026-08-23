import QRCode from 'qrcode';

/**
 * The verification QR (§2, D-016).
 *
 * **SVG, not a raster data URI.** The code ends up vector in the PDF, so it
 * stays sharp at any print size — which matters because the only thing a QR has
 * to do is survive being printed small and scanned in bad light. The spike
 * decoded it back out of the rendered PDF at 72, 144 and 288 dpi; the 72 dpi
 * pass is the one that says it will work off paper.
 *
 * Error-correction level M: it recovers ~15% damage, which covers a folded or
 * smudged certificate without inflating the module count the way H would.
 */
export async function qrSvgFor(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#111927', light: '#FFFFFF' },
  });
}

/** Joins the configured base with the id without doubling or dropping a slash. */
export function verificationUrlFor(baseUrl: string, verificationId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${verificationId}`;
}
