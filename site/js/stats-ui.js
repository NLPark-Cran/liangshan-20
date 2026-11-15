/**
 * stats-ui.js — 我的战绩与全局排行
 *
 * 放到覆盖层里，复用点位详情那套 overlay 结构。
 */

import { auth, fetchMyStats, fetchLeaderboard } from './api.js';

let ovEl = null;
let bodyEl = null;
let crumbEl = null;

export function initStats() {
  ovEl = document.getElementById('statslog');
  bodyEl = document.getElementById('stats-body');
  crumbEl = document.getElementById('stats-crumb');
  document.getElementById('stats-close')?.addEventListener('click', closeStats);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ovEl && !ovEl.hidden) closeStats();
  });
}

export async function openStats() {
  if (!ovEl) return;
  ovEl.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ovEl.classList.add('is-open'));

  if (crumbEl) crumbEl.textContent = '战绩与排行';
  if (bodyEl) {
    bodyEl.innerHTML = '<p class="rank__empty">正在读…</p>';
  }

  if (!auth.ready || !auth.online) {
    if (bodyEl) bodyEl.innerHTML = '<p class="rank__empty">后端没连上，这一页暂时打不开。</p>';
    return;
  }

  const [statsRes, rankRes] = await Promise.all([fetchMyStats(), fetchLeaderboard()]);

  const s = statsRes?.stats ?? {};
  const isMember = auth.user && auth.user.kind === 'member';

  const birdRank = rankRes?.birdRank ?? [];
  const ternRank = rankRes?.ternRank ?? [];
  const ledgerRank = rankRes?.ledgerRank ?? [];

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="rank">
        <section class="rank__sec">
          <h3>我的</h3>
          ${
            !auth.user
              ? '<p class="rank__empty">还没登录。登录之后这里的数字才会动。</p>'
              : !isMember
              ? '<p class="rank__empty">游客身份能看到当下这一局的数字，注册后才会长期累积。</p>'
              : ''
          }
          <div class="rank__row">
            <span class="rank__i">鸟</span>
            <span class="rank__n">记录到的鸟种</span>
            <span class="rank__v">${s.species ?? 0} 种</span>
          </div>
          <div class="rank__row">
            <span class="rank__i">账</span>
            <span class="rank__n">推演过的年份</span>
            <span class="rank__v">${s.ledgerRuns ?? 0} 局</span>
          </div>
          <div class="rank__row">
            <span class="rank__i">账</span>
            <span class="rank__n">最好的一局年收入</span>
            <span class="rank__v">${s.ledgerBestCash ?? 0} 万元</span>
          </div>
          <div class="rank__row">
            <span class="rank__i">鸟</span>
            <span class="rank__n">守过的繁殖季</span>
            <span class="rank__v">${s.ternRuns ?? 0} 轮</span>
          </div>
          <div class="rank__row">
            <span class="rank__i">雏</span>
            <span class="rank__n">飞出最多的一次</span>
            <span class="rank__v">${s.ternBestChicks ?? 0} 只</span>
          </div>
        </section>

        <section class="rank__sec">
          <h3>鸟种榜</h3>
          ${rankList(birdRank, '种')}
        </section>

        <section class="rank__sec">
          <h3>燕鸥榜</h3>
          ${rankList(ternRank, '只雏鸟')}
        </section>

        <section class="rank__sec">
          <h3>账本榜</h3>
          ${rankList(ledgerRank, '万元')}
        </section>
      </div>
    `;
  }
}

function rankList(rows, unit) {
  if (!rows.length) return '<p class="rank__empty">还没有人留下记录。</p>';
  return rows
    .map(
      (r, i) => `
      <div class="rank__row">
        <span class="rank__i">${String(i + 1).padStart(2, '0')}</span>
        <span class="rank__n">${esc(r.nickname)}</span>
        <span class="rank__v">${r.n} ${unit}</span>
      </div>`
    )
    .join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function closeStats() {
  if (!ovEl || ovEl.hidden) return;
  ovEl.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => {
    ovEl.hidden = true;
  }, 280);
}
