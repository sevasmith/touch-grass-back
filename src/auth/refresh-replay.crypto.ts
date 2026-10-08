import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { REFRESH_REPLAY_HKDF_INFO } from './auth.constants';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(oldId: string, oldSecret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', oldSecret, oldId, REFRESH_REPLAY_HKDF_INFO, 32),
  );
}

export function sealRefreshToken(
  oldId: string,
  oldSecret: string,
  newRefreshToken: string,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(oldId, oldSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(newRefreshToken, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function openRefreshToken(
  oldId: string,
  oldSecret: string,
  sealed: string,
): string | null {
  try {
    const data = Buffer.from(sealed, 'base64url');
    if (data.length <= IV_LENGTH + TAG_LENGTH) return null;

    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(oldId, oldSecret),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
