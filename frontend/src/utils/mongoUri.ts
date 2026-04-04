/** Strip BOM / zero-width chars Atlas sometimes copies in. */
export function normalizePastedUri(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/** Loose check for Atlas / Compass-style connection strings (not full URI validation). */
export function looksLikeMongoUri(value: string): boolean {
  const t = normalizePastedUri(value);
  if (t.length < 12) return false;
  const head = t.slice(0, 32).toLowerCase();
  return head.startsWith('mongodb://') || head.startsWith('mongodb+srv://');
}

/** Mask password in a URI for safe display (best-effort). */
export function maskPasswordInUri(uriStr: string): string {
  const t = normalizePastedUri(uriStr);
  if (!t) return '';
  return t.replace(
    /^(mongodb(?:\+srv)?:\/\/)([^@/]+?)(@)/i,
    (_, proto: string, auth: string, at: string) => {
      if (!auth.includes(':')) return `${proto}${auth}${at}`;
      const user = auth.split(':')[0];
      return `${proto}${user}:***${at}`;
    },
  );
}

/** One-line preview for connection cards. */
export function summarizeUriForDisplay(uriStr: string, maxLen = 52): string {
  const masked = maskPasswordInUri(uriStr);
  if (masked.length <= maxLen) return masked;
  return `${masked.slice(0, maxLen - 1)}…`;
}

/** Derive a short display name from the host in a MongoDB URI. */
export function defaultNameFromMongoUri(uriStr: string): string {
  const t = normalizePastedUri(uriStr);
  const stripped = t.replace(/^mongodb\+srv:\/\//i, '').replace(/^mongodb:\/\//i, '');
  const afterAuth = stripped.includes('@') ? (stripped.split('@').pop() ?? stripped) : stripped;
  const host = afterAuth.split('/')[0].split(':')[0].split('?')[0].trim();
  if (!host) return 'MongoDB';
  const short = host.replace(/\.mongodb\.net$/i, '');
  return short || host;
}
