/**
 * Helpers for the per-payee QR feature. Payment QRs are Google Drive image URLs
 * pulled from the workbook's `QR_SHEET` tab (see lib/xlsx.ts). They are stored as
 * plain text and rendered with a raw <img> on the share page — never fetched
 * server-side (no `next/image` optimizer), so there is no SSRF surface.
 */

/** Hosts a QR link may point at: Drive/Docs share links + their content CDN. */
const ALLOWED_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ALLOWED_HOST_SUFFIX = '.googleusercontent.com'; // e.g. lh3.googleusercontent.com
const MAX_URL_LEN = 2048;

/**
 * Pull the Drive file id out of the common share-link shapes:
 *   .../file/d/<id>/view        .../d/<id>/...        (any `/d/<id>` path)
 *   ...?id=<id>   or   ...&id=<id>
 *   https://lh3.googleusercontent.com/d/<id>
 * Returns null when no id is found (caller falls back to a plain link).
 */
export function extractDriveId(url: string): string | null {
  if (typeof url !== 'string') return null;
  const byPath = url.match(/\/d\/([a-zA-Z0-9_-]+)/); // /file/d/<id>, /document/d/<id>, /d/<id>
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery) return byQuery[1];
  return null;
}

/**
 * Build an embeddable <img> src for a Drive link. Drive's `thumbnail` endpoint
 * serves the image bytes directly for publicly-shared files (the `/view` link is
 * an HTML page and won't render in an <img>). Returns null when no id can be
 * parsed — the UI then shows only the "open in Drive" link.
 */
export function driveImageSrc(url: string, size = 1000): string | null {
  const id = extractDriveId(url);
  if (!id) return null;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

/**
 * Gate a QR URL before we store or show it. The value comes from a spreadsheet,
 * so it is untrusted: require https, cap the length, and restrict the host to
 * Google Drive/Docs (and their CDN). This blocks using the share page to surface
 * arbitrary phishing links, and is enforced server-side in `createSession`.
 */
export function isAllowedQrUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LEN) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTS.has(host) || host.endsWith(ALLOWED_HOST_SUFFIX);
}
