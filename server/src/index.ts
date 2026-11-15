/**
 * 服务入口。
 * 复用 VPS 上已有的 PostgreSQL 与 Redis，用 systemd 托管，不容器化。
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { migrate, pool } from './db.js';
import { redis } from './session.js';
import {
  loadUser,
  guestLogin,
  register,
  login,
  logout,
  me,
} from './auth.js';
import {
  drawBird,
  myBirds,
  submitLedger,
  submitTern,
  myStats,
  leaderboard,
  publicSites,
} from './api.js';

const app = new Hono();

app.use('*', logger());

// 同域部署时不需要 CORS，但保留给本地开发用
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin ?? '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);

// 所有请求都尝试解析会话
app.use('/api/*', loadUser);

/* ────────────────────────── 健康检查 ────────────────────────── */

app.get('/api/health', async (c) => {
  const checks: Record<string, string> = {};
  try {
    await pool.query('SELECT 1');
    checks.db = 'ok';
  } catch (e) {
    checks.db = 'fail';
  }
  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch (e) {
    checks.redis = 'fail';
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  return c.json({ ok, checks, ts: new Date().toISOString() }, ok ? 200 : 503);
});

/* ────────────────────────── 认证 ────────────────────────── */

app.post('/api/auth/guest', guestLogin);
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', me);

/* ────────────────────────── 业务 ────────────────────────── */

app.post('/api/birds/draw', drawBird);
app.get('/api/birds/mine', myBirds);
app.post('/api/ledger/submit', submitLedger);
app.post('/api/tern/submit', submitTern);
app.get('/api/stats/mine', myStats);
app.get('/api/leaderboard', leaderboard);
app.get('/api/sites', publicSites);

/* ────────────────────────── 启停 ────────────────────────── */

const PORT = Number(process.env.PORT || 8902);

async function main() {
  await migrate();
  serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
    console.log(`[server] listening on http://127.0.0.1:${info.port}`);
  });
}

const shutdown = async (signal: string) => {
  console.log(`[server] ${signal} received, closing`);
  await pool.end().catch(() => {});
  await redis.quit().catch(() => {});
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});
