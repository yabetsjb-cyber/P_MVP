import { randomBytes, createHash } from 'node:crypto';

// 32 random bytes = 256 bits, impossible to guess
export const newToken = () => randomBytes(32).toString('base64url');

// Fast hash is fine here: the token is already high-entropy, unlike a password
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
