/**
 * 会话与 Redis。
 * 会话存 Redis（滑动过期），不存库，避免会话表膨胀。
 * 复用 VPS 上已有的 Redis 实例，用 db 12 与其它项目隔离。
 */
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

export const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  db: Number(process.env.REDIS_DB || 12),
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('[redis] error', err.message);
});

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const KEY = (token: string) => `sess:${token}`;

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await redis.set(KEY(token), String(userId), 'EX', SESSION_TTL);
  return token;
}

export async function readSession(token: string): Promise<number | null> {
  if (!token) return null;
  const v = await redis.get(KEY(token));
  if (!v) return null;
  // 滑动续期
  await redis.expire(KEY(token), SESSION_TTL);
  const id = Number(v);
  return Number.isFinite(id) ? id : null;
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await redis.del(KEY(token));
}

/** 简单的计数限流，防止暴力注册/登录 */
export async function rateLimit(scope: string, who: string, limit: number, windowSec: number): Promise<boolean> {
  const k = `rl:${scope}:${who}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  return n <= limit;
}
