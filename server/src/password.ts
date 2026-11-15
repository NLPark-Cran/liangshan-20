/**
 * 密码散列：用 Node 内置 scrypt，不引入原生编译依赖。
 * N=32768 在这台机器上约 250ms，够慢，也够快。
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 32768;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: MAXMEM });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const rr = Number(parts[2]);
  const pp = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (!Number.isFinite(n) || !salt.length || !expected.length) return false;

  const actual = scryptSync(password, salt, expected.length, {
    N: n,
    r: rr,
    p: pp,
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
