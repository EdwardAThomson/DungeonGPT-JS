/**
 * URL validation utility for image sources.
 *
 * Validates image `src` attributes to prevent injection attacks.
 * Rejects dangerous URI schemes (javascript:, data: with non-image types, vbscript:, etc.).
 * Allows only:
 *  - Relative paths (starting with /)
 *  - HTTPS URLs
 *  - Approved data:image URIs (png, jpeg, gif, webp, svg+xml)
 */

/** Allowed data:image MIME subtypes. */
const ALLOWED_IMAGE_DATA_PREFIXES: readonly string[] = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/gif",
  "data:image/webp",
  "data:image/svg+xml",
];

/** Fallback image shown when a URL is rejected. */
const FALLBACK_IMAGE = "";

/**
 * Validate and sanitize an image URL.
 *
 * Returns the URL if it passes validation, or an empty string if rejected.
 *
 * Allowed schemes:
 *  - Relative paths starting with `/` (same-origin static assets)
 *  - `https://` URLs
 *  - `data:image/` URIs with approved MIME types
 *
 * Rejected:
 *  - `javascript:` URIs
 *  - `vbscript:` URIs
 *  - `data:` URIs with non-image MIME types
 *  - Any other scheme (ftp:, file:, etc.)
 *  - Empty or whitespace-only strings
 */
export function sanitizeImageUrl(url: string | null | undefined): string {
  if (!url) {
    return FALLBACK_IMAGE;
  }

  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return FALLBACK_IMAGE;
  }

  // Relative paths — same-origin static assets (e.g. /barbarian.webp)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // HTTPS URLs
  if (trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Approved data:image URIs
  const lowerTrimmed = trimmed.toLowerCase();
  for (const prefix of ALLOWED_IMAGE_DATA_PREFIXES) {
    if (lowerTrimmed.startsWith(prefix)) {
      return trimmed;
    }
  }

  // Reject everything else (javascript:, vbscript:, data:text/html, http://, ftp://, etc.)
  return FALLBACK_IMAGE;
}
