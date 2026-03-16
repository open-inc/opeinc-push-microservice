import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../config.js';

const encryptionKey = Buffer.from(config.ENCRYPTION_KEY_BASE64, 'base64');

if (encryptionKey.length !== 32) {
  throw new Error('ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.');
}

const algorithm = 'aes-256-gcm';

export const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(`${config.API_KEY_SALT}:${apiKey}`).digest('hex');
};

export const encryptString = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
};

export const decryptString = (value: string): string => {
  const [ivB64, authTagB64, payloadB64] = value.split('.');

  if (!ivB64 || !authTagB64 || !payloadB64) {
    throw new Error('Invalid encrypted payload format.');
  }

  const decipher = createDecipheriv(algorithm, encryptionKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadB64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};
