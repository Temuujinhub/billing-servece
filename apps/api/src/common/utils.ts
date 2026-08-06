import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

/** Normalize a Mongolian mobile number to `+976XXXXXXXX`. Returns null when invalid. */
export function normalizeMnPhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/[\s\-()]/g, '');
  const m = digits.match(/^(?:\+?976)?(\d{8})$/);
  if (!m) return null;
  // MN mobile prefixes are 5x/6x/7x/8x/9x — reject obviously-landline junk like 0/1.
  if (!/^[5-9]/.test(m[1])) return null;
  return `+976${m[1]}`;
}

const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/**
 * Count SMS segments the way providers bill them (PRD §4.1): GSM-7 texts split
 * at 160/153 chars, anything else (e.g. Cyrillic Mongolian) is UCS-2 at 70/67.
 */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const isGsm = [...text].every((c) => GSM7.includes(c));
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

/** Opaque, unguessable public token for payment short links. */
export function newPublicToken(): string {
  return randomBytes(16).toString('base64url');
}

/** Raw tokens are never stored — only their SHA-256 (PRD §8.2). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Field-level crypto for provider credentials that MUST be recoverable (API
 * calls need the plaintext) — AES-256-GCM keyed by ENCRYPTION_KEY (64 hex).
 * Format: base64(iv).base64(tag).base64(ciphertext).
 */
export function encryptSecret(keyHex: string, plaintext: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(keyHex: string, stored: string): string {
  const [iv, tag, data] = stored.split('.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Format integer MNT for logs/messages: 1234567 → "1,234,567₮". */
export function formatMnt(amount: number): string {
  return `${amount.toLocaleString('en-US')}₮`;
}

/** UTC start of the current calendar month (billing cycle boundary). */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
