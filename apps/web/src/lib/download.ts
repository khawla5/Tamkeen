import { CSV_CONTENT_TYPE } from '@tamkeen/types';

/**
 * A string the browser saves as a file, without a round trip.
 *
 * Shared because both of §4C.8's exports are rendered in the browser rather
 * than by the API: every column of them is Arabic copy, and that lives in the
 * message catalogue (TAM-138). Two copies of six lines is how one of them ends
 * up without the object URL revoked.
 */
export function downloadFile(
  filename: string,
  content: string,
  type: string = CSV_CONTENT_TYPE,
): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
