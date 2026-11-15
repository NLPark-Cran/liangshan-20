/**
 * 认证：游客一键进入 + 注册登录 + 会话。
 *
 * 游客是为了降低门槛——老师或评审打开就能玩，不用先注册。
 * 注册之后可以把游客进度并入账号。
 */
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { createSession, readSession, destroySession, rateLimit } from './session.js';
import { hashPassword, verifyPassword } from './password.js';

export const SESSION_COOKIE = 'ls20_sess';

export type AuthUser = {
  id: number;
  kind: 'guest' | 'member';
  handle: string;
  nickname: string;
};

/** 从会话里读当前用户，附加到 c.set('user') */
export async function loadUser(c: Context, next: Next) {
  const token = getCookie(c, SESSION_COOKIE) ?? '';
  const userId = await readSession(token);
  if (userId) {
    const { rows } = await pool.query<AuthUser>(
      'SELECT id, kind, handle, nickname FROM users WHERE id = $1',
      [userId]
    );
    const u = rows[0];
    if (u) {
      c.set('user', u);
      // 顺带更新活跃时间，失败不影响主流程
      pool
        .query('UPDATE users SET last_seen_at = now() WHERE id = $1', [u.id])
        .catch(() => {});
    }
  }
  await next();
}

/** 必须登录 */
export async function requireUser(c: Context, next: Next) {
  const u = c.get('user') as AuthUser | undefined;
  if (!u) return c.json({ ok: false, error: 'unauthorized' }, 401);
  await next();
}

/** 必须是注册用户（游客不能写数据到长期库） */
export async function requireMember(c: Context, next: Next) {
  const u = c.get('user') as AuthUser | undefined;
  if (!u) return c.json({ ok: false, error: 'unauthorized' }, 401);
  if (u.kind !== 'member') return c.json({ ok: false, error: 'need_member' }, 403);
  await next();
}

function cookieOpts(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure,
  };
}

/** 判断是否 HTTPS（Caddy 在前面，读 X-Forwarded-Proto） */
function isSecure(c: Context): boolean {
  return (c.req.header('x-forwarded-proto') ?? '').includes('https');
}

/** 生成一个不冲突的游客 handle */
async function newGuestHandle(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const h = 'guest_' + randomBytes(5).toString('hex');
    const { rowCount } = await pool.query('SELECT 1 FROM users WHERE handle = $1', [h]);
    if (!rowCount) return h;
  }
  throw new Error('handle_collision');
}

/* ────────────────────────── 游客 ────────────────────────── */

export async function guestLogin(c: Context) {
  const ip = c.req.header('x-forwarded-for') ?? 'local';
  if (!(await rateLimit('guest', ip, 30, 3600))) {
    return c.json({ ok: false, error: 'too_many' }, 429);
  }

  const handle = await newGuestHandle();
  const { rows } = await pool.query<AuthUser>(
    `INSERT INTO users (kind, handle, nickname)
     VALUES ('guest', $1, $2)
     RETURNING id, kind, handle, nickname`,
    [handle, '过路人']
  );
  const user = rows[0];
  if (!user) return c.json({ ok: false, error: 'create_failed' }, 500);

  const token = await createSession(user.id);
  setCookie(c, SESSION_COOKIE, token, cookieOpts(isSecure(c)));
  return c.json({ ok: true, user });
}

/* ────────────────────────── 注册 ────────────────────────── */

const HANDLE_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;

export async function register(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'bad_json' }, 400);

  const handle = String(body.handle ?? '').trim();
  const nickname = String(body.nickname ?? '').trim() || handle;
  const password = String(body.password ?? '');

  if (!HANDLE_RE.test(handle)) return c.json({ ok: false, error: 'bad_handle' }, 400);
  if (password.length < 8) return c.json({ ok: false, error: 'weak_password' }, 400);
  if (nickname.length > 24) return c.json({ ok: false, error: 'long_nickname' }, 400);

  const ip = c.req.header('x-forwarded-for') ?? 'local';
  if (!(await rateLimit('register', ip, 10, 3600))) {
    return c.json({ ok: false, error: 'too_many' }, 429);
  }

  const hash = hashPassword(password);

  // 如果当前是游客，就地升级，保留已有进度
  const current = c.get('user') as AuthUser | undefined;

  try {
    if (current && current.kind === 'guest') {
      const { rows } = await pool.query<AuthUser>(
        `UPDATE users SET kind = 'member', handle = $1, nickname = $2, password_hash = $3
         WHERE id = $4
         RETURNING id, kind, handle, nickname`,
        [handle, nickname, hash, current.id]
      );
      const user = rows[0];
      if (!user) return c.json({ ok: false, error: 'upgrade_failed' }, 500);
      return c.json({ ok: true, user, upgraded: true });
    }

    const { rows } = await pool.query<AuthUser>(
      `INSERT INTO users (kind, handle, nickname, password_hash)
       VALUES ('member', $1, $2, $3)
       RETURNING id, kind, handle, nickname`,
      [handle, nickname, hash]
    );
    const user = rows[0];
    if (!user) return c.json({ ok: false, error: 'create_failed' }, 500);

    const token = await createSession(user.id);
    setCookie(c, SESSION_COOKIE, token, cookieOpts(isSecure(c)));
    return c.json({ ok: true, user });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('duplicate key')) return c.json({ ok: false, error: 'handle_taken' }, 409);
    throw e;
  }
}

/* ────────────────────────── 登录 ────────────────────────── */

export async function login(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'bad_json' }, 400);

  const handle = String(body.handle ?? '').trim();
  const password = String(body.password ?? '');

  const ip = c.req.header('x-forwarded-for') ?? 'local';
  if (!(await rateLimit('login', ip + ':' + handle, 12, 900))) {
    return c.json({ ok: false, error: 'too_many' }, 429);
  }

  const { rows } = await pool.query<AuthUser & { password_hash: string | null }>(
    'SELECT id, kind, handle, nickname, password_hash FROM users WHERE handle = $1',
    [handle]
  );
  const row = rows[0];
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    return c.json({ ok: false, error: 'bad_credentials' }, 401);
  }

  // 如果当前是游客，把游客的进度并到登录账号上
  const current = c.get('user') as AuthUser | undefined;
  if (current && current.kind === 'guest' && current.id !== row.id) {
    await mergeGuestInto(current.id, row.id);
  }

  const token = await createSession(row.id);
  setCookie(c, SESSION_COOKIE, token, cookieOpts(isSecure(c)));
  return c.json({
    ok: true,
    user: { id: row.id, kind: row.kind, handle: row.handle, nickname: row.nickname },
  });
}

export async function logout(c: Context) {
  const token = getCookie(c, SESSION_COOKIE) ?? '';
  await destroySession(token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
}

export async function me(c: Context) {
  const u = c.get('user') as AuthUser | undefined;
  return c.json({ ok: true, user: u ?? null });
}

/** 把游客的观测记录与成绩迁到正式账号，然后删除游客 */
async function mergeGuestInto(guestId: number, memberId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE bird_logs SET user_id = $1 WHERE user_id = $2', [memberId, guestId]);
    await client.query('UPDATE ledger_runs SET user_id = $1 WHERE user_id = $2', [memberId, guestId]);
    await client.query('UPDATE tern_runs SET user_id = $1 WHERE user_id = $2', [memberId, guestId]);
    await client.query('DELETE FROM users WHERE id = $1', [guestId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[auth] merge failed', e);
  } finally {
    client.release();
  }
}

export { newGuestHandle };
