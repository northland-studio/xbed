import crypto from 'node:crypto';

const HEX_64 = /^[0-9a-f]{64}$/i;

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha256Hex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** 常量时间比较两段 hex（长度不同直接 false） */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomCode(length = 6): string {
  let code = '';
  while (code.length < length) {
    const byte = crypto.randomBytes(1)[0] ?? 0;
    if (byte < 250) code += String(byte % 10);
  }
  return code;
}

/** 由配置的 ENCRYPTION_KEY / SESSION_SECRET 派生 32 字节 AES key（支持 64 位 hex 直用） */
export function deriveEncryptionKey(secret: string): Buffer {
  if (HEX_64.test(secret)) return Buffer.from(secret, 'hex');
  return crypto.createHash('sha256').update(secret).digest();
}

/** AES-256-GCM 加密，格式 v1:<iv b64>:<tag b64>:<ciphertext b64> */
export function encryptString(plain: string, keySecret: string): string {
  const key = deriveEncryptionKey(keySecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptString(payload: string, keySecret: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('密文格式非法');
  const key = deriveEncryptionKey(keySecret);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 邮箱验证码哈希（HMAC，避免明文入库） */
export function hashVerificationCode(code: string, secret: string): string {
  return hmacSha256Hex(secret, `email-code:${code}`);
}

export function verifyVerificationCode(code: string, hash: string, secret: string): boolean {
  return timingSafeEqualHex(hashVerificationCode(code, secret), hash);
}
