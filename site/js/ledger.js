/**
 * ledger.js — 「一亩山的账本」
 *
 * 这不是一个求最优解的游戏。
 * 真实的故事是：一座山先被炸开卖石头，村集体一年进三百多万；
 * 后来矿关了，收入掉到二十几万；再后来，山养回来了，人回来了。
 *
 * 游戏要玩家自己扛那个「掉下去」的时刻。
 * 关键设计：关矿是一个不可逆的决定，做了就不能反悔，而且当年现金立刻断崖。
 */

import { drawLedgerMountain } from './scenes.js';
import { auth, submitLedger } from './api.js';

/* ────────────────────────── 参数 ────────────────────────── */

const START_YEAR = 2005;
const END_YEAR = 2025;

/* 矿山储量。100 单位，每年采 6.2 单位，2021 年前后见底。
   储量是这个游戏的核心：矿不是取之不尽的，拖得越久越被动。 */
const RESERVE_FULL = 100;
const MINE_RATE = 6.2;

const CONFIG = {
  mine: {
    name: '开矿',
    // 收入直接跟剩余储量挂钩，越挖越少，见底后只剩零头
    income: (state) => {
      if (state.reserve <= 0) return 6;
      return Math.round(3.4 * state.reserve);
    },
    mountain: -3.2,
    desc: '石头卖得掉，一年三百多万。山在变秃，矿也在变薄，总有挖完的一天。',
  },
  bamboo: {
    name: '种竹',
    income: (state) => {
      const t = (state.year - START_YEAR) / 20;
      return Math.round(18 + t * 42 * (state.mountain / 100));
    },
    mountain: 1.4,
    desc: '短期看不见钱，五六年之后开始有笋、有竹材。山慢慢绿回来。',
  },
  eco: {
    name: '做生态',
    income: (state) => {
      if (state.mountain < 45) return 6;
      const t = (state.year - START_YEAR) / 20;
      return Math.round((state.mountain / 100) * (60 + t * 210));
    },
    mountain: 2.2,
    desc: '游客只为好山好水来。山还没养回来之前，这条路一直亏。',
  },
  restore: {
    name: '封山',
    // 封山期几乎无收入，但山恢复后村里会慢慢找到新的活路
    income: (state) => {
      if (state.mountain < 55) return 4;
      const t = (state.year - START_YEAR) / 20;
      return Math.round(4 + (state.mountain - 55) * 0.55 + t * 26);
    },
    mountain: 3.4,
    desc: '什么都不做，只是让它歇着。最快恢复，也最没有收入。',
  },
};

/* ────────────────────────── 状态 ────────────────────────── */

function newState() {
  return {
    year: START_YEAR,
    cash: 320, // 村集体年收入，万元
    mountain: 100,
    reserve: RESERVE_FULL, // 剩余矿石储量
    mode: 'mine',
    mineDepth: 0,
    pledged: false, // 是否已经做出过关矿决定
    closedMineYear: null,
    repairDebt: 0, // 关矿时一次性付出的修复欠账
    rows: [], // 账本明细
    phase: 'play', // play | decide | over
    started: false,
  };
}

let S = newState();
let canvasEl = null;
let panelEl = null;
let rafId = null;
let lastSavedKey = '';

/* ────────────────────────── 入口 ────────────────────────── */

export function openLedger() {
  const ov = document.getElementById('ledgerlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('ledger-canvas');
  panelEl = document.getElementById('ledger-panel');
  S = newState();
  S.started = true;
  lastSavedKey = '';
  renderPanel();
  startArtLoop();
}

export function closeLedger() {
  const ov = document.getElementById('ledgerlog');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  setTimeout(() => {
    ov.hidden = true;
  }, 300);
}

/* ────────────────────────── 绘制 ────────────────────────── */

function startArtLoop() {
  if (!canvasEl) return;
  let last = 0;
  const draw = (now) => {
    if (!canvasEl || !canvasEl.isConnected) {
      rafId = null;
      return;
    }
    // 30fps 足够，省电
    if (now - last > 33) {
      drawLedgerMountain(canvasEl, {
        mountain: S.mountain,
        mineDepth: S.mineDepth,
        mode: S.closedMineYear ? (S.mountain > 70 ? 'eco' : 'restore') : 'mine',
        seed: 9001,
      });
      last = now;
    }
    rafId = requestAnimationFrame(draw);
  };
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(draw);
}

/* ────────────────────────── 推进一年 ────────────────────────── */

function stepYear() {
  if (S.phase === 'over' || S.year >= END_YEAR) return;

  const cfg = CONFIG[S.mode];
  const income = cfg.income(S);

  // 年份推进
  S.year += 1;

  // 采矿消耗储量：矿会真的挖完
  if (S.mode === 'mine' && S.reserve > 0) {
    S.reserve = Math.max(0, +(S.reserve - MINE_RATE).toFixed(2));
  }

  // 结算：村集体年收入就是当年的进账，不是累积的存款
  const delta = income;
  S.cash = Math.max(0, Math.round(delta * 0.9 + S.cash * 0.1));

  // 山体
  const mDelta = cfg.mountain;
  S.mountain = Math.max(0, Math.min(100, S.mountain + mDelta));

  // 采矿会加深矿坑
  if (S.mode === 'mine') {
    S.mineDepth = Math.min(1, S.mineDepth + 0.055);
  } else {
    S.mineDepth = Math.max(0, S.mineDepth - 0.02);
  }

  S.rows.unshift({
    year: S.year,
    mode: cfg.name,
    income: delta,
    cash: S.cash,
    mountain: Math.round(S.mountain),
  });

  // 关键节点：2009 年第一次问，此后每 3 年再问一次
  if (!S.pledged) {
    const due = S.nextDecide || 2009;
    if (S.year >= due) {
      S.phase = 'decide';
    }
  }

  if (S.year >= END_YEAR) {
    S.phase = 'over';
  }

  renderPanel();
}

/* ────────────────────────── 面板 ────────────────────────── */

function renderPanel() {
  if (!panelEl) return;

  if (S.phase === 'decide') {
    renderDecision();
    return;
  }
  if (S.phase === 'over') {
    renderOver();
    return;
  }
  renderPlay();
}

function renderPlay() {
  const cfg = CONFIG[S.mode];

  panelEl.innerHTML = `
    <div class="ledger__head">
      <h2 class="ledger__title">一亩山的账本</h2>
      <p class="ledger__sub">一年一年走，看看这座山最后变成什么样</p>
    </div>

    <div class="book">
      <div class="book__year">
        <b>${S.year}</b>
        <span>年 · 这一年村里选了「${cfg.name}」</span>
      </div>

      <div class="book__rows">
        ${
          S.rows.length
            ? S.rows
                .slice(0, 12)
                .map(
                  (r) => `
              <div class="row">
                <span class="row__y">${r.year}</span>
                <span class="row__t">${r.mode}</span>
                <span class="row__v ${r.income > 60 ? 'is-up' : 'is-down'}">
                  ${r.income > 0 ? '+' : ''}${r.income} 万
                </span>
              </div>`
                )
                .join('')
            : `<p class="dim" style="padding:1rem 0;font-size:0.9rem;color:var(--ink-300)">
                 账本还没记下第一笔。按下「过一年」开始。
               </p>`
        }
      </div>
    </div>

    <div class="gauges">
      <div class="gauge">
        <div class="gauge__head">
          <span>村集体年收入</span>
          <b>${S.cash} 万元</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--cash" style="width:${Math.min(100, (S.cash / 400) * 100)}%"></div>
        </div>
      </div>
      <div class="gauge">
        <div class="gauge__head">
          <span>山还剩下多少</span>
          <b>${Math.round(S.mountain)} %</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--mountain" style="width:${S.mountain}%"></div>
        </div>
      </div>
      <div class="gauge">
        <div class="gauge__head">
          <span>矿还剩下多少</span>
          <b class="${S.reserve <= 0 ? 'is-spent' : ''}">${
            S.reserve <= 0 ? '挖完了' : Math.round((S.reserve / RESERVE_FULL) * 100) + ' %'
          }</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--ore" style="width:${
            Math.max(0, (S.reserve / RESERVE_FULL) * 100)
          }%"></div>
        </div>
      </div>
    </div>

    <div class="acts">
      <button class="btn btn--seal" id="lg-next">过一年</button>
      ${['mine', 'bamboo', 'eco', 'restore']
        .map(
          (k) => `
        <button class="btn btn--ghost ${S.mode === k ? 'is-on' : ''}" data-mode="${k}">
          ${CONFIG[k].name}
        </button>`
        )
        .join('')}
    </div>

    <p class="ledger__hint">${cfg.desc}</p>
  `;

  bindPlay();
}

function bindPlay() {
  panelEl.querySelector('#lg-next')?.addEventListener('click', stepYear);

  panelEl.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.mode;
      // 已经关过矿，不能回头开矿
      if (k === 'mine' && S.pledged) return;
      S.mode = k;
      renderPanel();
    });
  });
}

function renderDecision() {
  // 把当前要还的修复欠账算给玩家看
  const debt = Math.round((100 - S.mountain) * 2.2);
  const reserveLeft = Math.round((S.reserve / RESERVE_FULL) * 100);

  panelEl.innerHTML = `
    <div class="ledger__head">
      <h2 class="ledger__title">${S.year} 年的村民大会</h2>
      <p class="ledger__sub">桌上摆着两张纸，一张是账本，一张是治理方案</p>
    </div>

    <div class="book">
      <div class="book__year">
        <b>${S.cash}</b>
        <span>万元 · 这是去年的村集体收入</span>
      </div>
      <div class="book__rows">
        <div class="row">
          <span class="row__y">矿</span>
          <span class="row__t">还剩多少</span>
          <span class="row__v">${reserveLeft}%</span>
        </div>
        <div class="row">
          <span class="row__y">山</span>
          <span class="row__t">损伤</span>
          <span class="row__v ${S.mountain < 70 ? 'is-down' : ''}">${Math.round(100 - S.mountain)}%</span>
        </div>
        <div class="row">
          <span class="row__y">治</span>
          <span class="row__t">现在治要花</span>
          <span class="row__v is-down">${debt} 万元</span>
        </div>
      </div>
    </div>

    <div class="decision">
      <p class="decision__t">矿要不要关</p>
      <p class="decision__d">
        关掉，收入立刻掉到十位数，几十个人失业。
        ${
          reserveLeft > 40
            ? '但山才动了一点，现在治还治得起。'
            : '而且山已经挖掉一大半了，治理这笔钱，比早几年贵得多。'
        }
      </p>
      <p class="decision__d">
        不关，矿还能再撑着。可债是记着的，越往后越贵。
      </p>
      <p class="decision__d">
        这是个不可逆的决定。关了就开不回来了。
      </p>
      <div class="decision__acts">
        <button class="btn btn--seal" id="lg-close">关掉矿山</button>
        <button class="btn btn--ghost" id="lg-keep">再卖几年</button>
      </div>
    </div>
  `;

  panelEl.querySelector('#lg-close')?.addEventListener('click', () => {
    const before = S.cash;
    /* 修复欠账：山被挖掉多少，就得花多少钱治。
       这是关矿越晚越吃亏的核心机制：欠账随山体损伤线性增长。 */
    const debt = Math.round((100 - S.mountain) * 2.2);

    S.pledged = true;
    S.closedMineYear = S.year;
    S.repairDebt = debt;
    S.mode = 'restore';
    S.cash = Math.max(0, Math.round(before * 0.35) - debt + 10);

    S.rows.unshift({
      year: S.year,
      mode: `关矿（修复 ${debt} 万）`,
      income: S.cash - before,
      cash: S.cash,
      mountain: Math.round(S.mountain),
    });
    S.phase = 'play';
    renderPanel();
  });

  panelEl.querySelector('#lg-keep')?.addEventListener('click', () => {
    // 再撑三年才会重新问
    S.pledged = false;
    S.mode = 'mine';
    S.nextDecide = S.year + 3;
    S.phase = 'play';
    renderPanel();
  });
}

function renderOver() {
  const low = Math.min(...S.rows.map((r) => r.income), S.cash);
  const closed = S.closedMineYear !== null;
  const spent = S.reserve <= 0;

  panelEl.innerHTML = `
    <div class="ledger__head">
      <h2 class="ledger__title">二十年后</h2>
      <p class="ledger__sub">${S.year} 年 · 账本合上了</p>
    </div>

    <div class="gauges">
      <div class="gauge">
        <div class="gauge__head">
          <span>村集体年收入</span>
          <b>${S.cash} 万元</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--cash" style="width:${Math.min(100, (S.cash / 400) * 100)}%"></div>
        </div>
      </div>
      <div class="gauge">
        <div class="gauge__head">
          <span>山还剩下多少</span>
          <b>${Math.round(S.mountain)} %</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--mountain" style="width:${S.mountain}%"></div>
        </div>
      </div>
      <div class="gauge">
        <div class="gauge__head">
          <span>矿还剩下多少</span>
          <b class="${spent ? 'is-spent' : ''}">${
            spent ? '挖完了' : Math.round((S.reserve / RESERVE_FULL) * 100) + ' %'
          }</b>
        </div>
        <div class="gauge__track">
          <div class="gauge__fill gauge__fill--ore" style="width:${
            Math.max(0, (S.reserve / RESERVE_FULL) * 100)
          }%"></div>
        </div>
      </div>
    </div>

    <div class="verdict">
      <p class="verdict__t">
        ${
          closed
            ? S.mountain > 85
              ? '山养回来了'
              : S.mountain > 60
                ? '山还在缓'
                : '山刚缓过一口气'
            : spent
              ? '石头卖完了，山也秃了'
              : '矿还没挖完'
        }
      </p>
      <p>
        ${
          closed
            ? `你在 ${S.closedMineYear} 年把矿关了，光是把山治回能看的样子，就先掏了 ${S.repairDebt} 万。
               那一年账上最难看的数字是 ${low} 万。到这一年，山还剩 ${Math.round(S.mountain)}%，
               村集体年收入 ${S.cash} 万。`
            : `你一直没关矿。${
                spent ? '矿在 2021 年前后挖完了，' : '矿到现在也没剩多少了，'
              }山只剩 ${Math.round(S.mountain)}%，村集体年收入 ${S.cash} 万。
               挖出来的坑要修复，这笔钱村里还没算过。`
        }
      </p>
      <p class="dim" style="margin-top:0.8rem;font-size:0.84rem;color:var(--ink-300)">
        ${
          closed
            ? `那年要是再拖六年，光治理这一项就要多花 ${Math.round(
                (100 - Math.max(0, S.mountain - 6 * 3.4)) * 2.2 - S.repairDebt
              )} 万。`
            : '早关一年，要治的山就少一分。'
        }
        这是推演，不是真实数据。真实的账比这复杂得多，也慢得多。
      </p>
    </div>

    <div class="acts">
      <button class="btn btn--seal" id="lg-again">再来一次</button>
    </div>
    <p class="ledger__hint" id="lg-save"></p>
  `;

  panelEl.querySelector('#lg-again')?.addEventListener('click', () => {
    S = newState();
    S.started = true;
    lastSavedKey = '';
    renderPanel();
  });

  // 每局结束提交一次，记录最好成绩；失败不影响继续玩
  void saveRun();
}

async function saveRun() {
  const hint = panelEl?.querySelector('#lg-save');
  if (!hint) return;

  if (!auth.ready || !auth.online) {
    hint.textContent = '本地模式：这局只留在这台设备上。';
    return;
  }
  if (!auth.user) {
    hint.textContent = '登录后这局的成绩会存到账号里。';
    return;
  }
  if (auth.user.kind !== 'member') {
    hint.innerHTML = '<button class="ap__link" id="lg-tologin">注册账号</button>，这局的成绩就能存下来。';
    hint.querySelector('#lg-tologin')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('auth:need-member'));
    });
    return;
  }

  // 同一局只提交一次
  const key = `${S.year}:${S.cash}:${Math.round(S.mountain)}:${S.closedMineYear ?? 'x'}`;
  if (key === lastSavedKey) return;
  lastSavedKey = key;

  hint.textContent = '正在记录…';
  try {
    const r = await submitLedger({
      closedYear: S.closedMineYear,
      finalYear: S.year,
      finalCash: S.cash,
      finalMountain: Math.round(S.mountain),
      years: S.rows.map((x) => ({
        year: x.year,
        mode: x.mode,
        income: x.income,
        cash: x.cash,
        mountain: x.mountain,
      })),
    });
    hint.textContent = r.ok ? '这一局已经记到你的账号里。' : '记录没成功，不影响继续玩。';
  } catch (_) {
    hint.textContent = '记录没成功，不影响继续玩。';
  }
}
