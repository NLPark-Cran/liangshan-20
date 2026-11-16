/**
 * tern.js — 「等一只鸟回来」：中华凤头燕鸥招引推演
 *
 * 机制取自真实做法：
 *   在海岛上摆假鸟 + 用太阳能设备回放叫声，把远洋的燕鸥吸引到岛上繁殖。
 *   这套办法在浙江象山的韭山列岛做过，是这个物种从灭绝边缘被拉回来的关键。
 *
 * 游戏的核心不是赢，是等。
 * 玩家能做的只有三件事：选岛、摆假鸟、放声音。鸟来不来，不由玩家决定。
 */

import { drawTernIsland } from './tern-scene.js';
import { auth, submitTern } from './api.js';

/* ────────────────────────── 配置 ────────────────────────── */

const ISLANDS = [
  {
    id: 'reef',
    name: '礁岩小岛',
    desc: '高高露出海面的礁石，四周浪大，船靠不上去。燕鸥喜欢这种地方，人不好打扰。',
    base: 0.16,
    risk: 0.06,
    note: '鸟类天然偏好：开阔、无哺乳类天敌、接近觅食海域',
  },
  {
    id: 'sandbar',
    name: '沙洲',
    desc: '低平的沙洲，涨潮时会淹掉一半。省事，但卵容易被浪卷走。',
    base: 0.12,
    risk: 0.14,
    note: '巢位容易受潮位影响，繁殖失败率高',
  },
  {
    id: 'pond',
    name: '鱼塘埂',
    desc: '养殖塘之间的窄埂，靠近人的活动。鸟会来，但待不长。',
    base: 0.08,
    risk: 0.18,
    note: '人为干扰大，适合过渡不适合长期繁殖',
  },
];

/* 每个繁殖季的电力与人力预算。
   这是游戏的核心约束：摆假鸟和放声音都要耗电，
   预算不够两者同时拉满，必须取舍。 */
const BUDGET = 4;

const DECOYS = [
  { id: 'few', name: '摆 3 只', value: 0.34, cost: 1, desc: '太少，鸟群看不见' },
  { id: 'mid', name: '摆 12 只', value: 0.62, cost: 2, desc: '一个能引起注意的小群' },
  { id: 'many', name: '摆 30 只', value: 0.86, cost: 3, desc: '像模像样的一群，效果最好' },
];

const SOUNDS = [
  { id: 'day', name: '只在白天放', value: 0.3, cost: 1, desc: '省电，但夜里回岛的鸟听不到' },
  { id: 'dusk', name: '黄昏到入夜', value: 0.72, cost: 2, desc: '燕鸥多在傍晚归岛，这个时段最有效' },
  { id: 'all', name: '整夜不停', value: 0.9, cost: 3, desc: '效果最好，耗电也最多，需要备电' },
];

const MONTHS = ['四月', '五月', '六月', '七月', '八月'];

/* ────────────────────────── 状态 ────────────────────────── */

function newGame() {
  return {
    round: 0, // 第几个繁殖季
    island: null,
    decoy: null,
    sound: null,
    phase: 'choose', // choose | waiting | result | season-end | end
    birds: 0, // 今年到岛上的燕鸥数
    nests: 0, // 筑巢数
    chicks: 0, // 出飞雏鸟数
    totalChicks: 0,
    seasons: [],
    lastRoll: 0,
  };
}

let S = newGame();
let canvasEl = null;
let panelEl = null;
let rafId = null;
let lastTernKey = '';

/* ────────────────────────── 入口 ────────────────────────── */

export function openTern() {
  const ov = document.getElementById('ternlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));

  canvasEl = document.getElementById('tern-canvas');
  panelEl = document.getElementById('tern-panel');
  S = newGame();
  lastTernKey = '';
  renderPanel();
  startArtLoop();
}

export function closeTern() {
  const ov = document.getElementById('ternlog');
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

/* ────────────────────────── 绘制循环 ────────────────────────── */

function startArtLoop() {
  if (!canvasEl) return;
  const draw = () => {
    if (!canvasEl || !canvasEl.isConnected) {
      rafId = null;
      return;
    }
    drawTernIsland(canvasEl, {
      island: S.island,
      decoy: S.decoy,
      birds: S.birds,
      nests: S.nests,
      phase: S.phase,
      t: performance.now() / 1000,
    });
    rafId = requestAnimationFrame(draw);
  };
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(draw);
}

/* ────────────────────────── 面板 ────────────────────────── */

function renderPanel() {
  if (!panelEl) return;

  if (S.phase === 'choose' || S.phase === 'waiting') {
    renderSetup();
  } else if (S.phase === 'result') {
    renderResult();
  } else if (S.phase === 'season-end') {
    renderSeasonEnd();
  } else {
    renderEnd();
  }
}

function renderSetup() {
  const decoy = DECOYS.find((d) => d.id === S.decoy);
  const sound = SOUNDS.find((s) => s.id === S.sound);
  const spent = (decoy?.cost || 0) + (sound?.cost || 0);
  const over = spent > BUDGET;
  const canGo = S.island && S.decoy && S.sound && !over;

  panelEl.innerHTML = `
    <div class="tern">
      <div class="tern__head">
        <h2 class="tern__title">等一只鸟回来</h2>
        <p class="tern__sub">第 ${S.round + 1} 个繁殖季 · ${MONTHS[Math.min(S.round, 4)]}</p>
      </div>

      <div class="tern__intro">
        <p>五月，海上的一座小岛。护鸟的人在礁石上摆好假鸟，接上太阳能电池，把叫声放出去。</p>
        <p>剩下的事，得等。</p>
      </div>

      <div class="tern__budget ${over ? 'is-over' : ''}">
        <span>这个季度的电力和人力</span>
        <b>${spent} / ${BUDGET}</b>
        <i>${over ? '超了，得省一样' : '摆假鸟和放声音都要耗电'}</i>
      </div>

      <div class="tern__step">
        <h3 class="tern__st">一 · 选岛</h3>
        <div class="tern__opts">
          ${ISLANDS.map(
            (it) => `
            <button class="opt ${S.island === it.id ? 'is-on' : ''}" data-group="island" data-id="${it.id}">
              <span class="opt__n">${it.name}</span>
              <span class="opt__d">${it.desc}</span>
              <span class="opt__note">${it.note}</span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="tern__step">
        <h3 class="tern__st">二 · 摆假鸟 <em class="tern__cost">耗电 1—3</em></h3>
        <div class="tern__opts tern__opts--row">
          ${DECOYS.map(
            (it) => `
            <button class="opt opt--sm ${S.decoy === it.id ? 'is-on' : ''}" data-group="decoy" data-id="${it.id}">
              <span class="opt__n">${it.name}<em>${it.cost}</em></span>
              <span class="opt__d">${it.desc}</span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="tern__step">
        <h3 class="tern__st">三 · 放声音 <em class="tern__cost">耗电 1—3</em></h3>
        <div class="tern__opts tern__opts--row">
          ${SOUNDS.map(
            (it) => `
            <button class="opt opt--sm ${S.sound === it.id ? 'is-on' : ''}" data-group="sound" data-id="${it.id}">
              <span class="opt__n">${it.name}<em>${it.cost}</em></span>
              <span class="opt__d">${it.desc}</span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="tern__acts">
        <button class="btn btn--seal" id="tern-wait" ${canGo ? '' : 'disabled'}>
          等一个繁殖季
        </button>
        ${
          over
            ? '<span class="tern__tip is-warn">钱只够一样拉满，另一样得省着用</span>'
            : !canGo
              ? '<span class="tern__tip">三样都选好才能开始</span>'
              : ''
        }
      </div>

      <p class="tern__tip tern__tip--flow">
        上一季的选择会留着。想换，点一下已选中的项取消，再选别的。
      </p>
    </div>
  `;

  bindSetup();
}

function bindSetup() {
  panelEl.querySelectorAll('.opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.dataset.group;
      const id = btn.dataset.id;
      if (g === 'island') S.island = S.island === id ? null : id;
      if (g === 'decoy') S.decoy = S.decoy === id ? null : id;
      if (g === 'sound') S.sound = S.sound === id ? null : id;
      renderSetup();
    });
  });

  const waitBtn = panelEl.querySelector('#tern-wait');
  waitBtn?.addEventListener('click', () => runSeason());
}

/* ────────────────────────── 推演一个繁殖季 ────────────────────────── */

function runSeason() {
  const island = ISLANDS.find((i) => i.id === S.island);
  const decoy = DECOYS.find((d) => d.id === S.decoy);
  const sound = SOUNDS.find((s) => s.id === S.sound);
  if (!island || !decoy || !sound) return;
  // 预算这道闸门在 render 里已经拦过，这里再校验一次，
  // 防止状态被别处改到超支还继续跑
  if (decoy.cost + sound.cost > BUDGET) return;

  S.phase = 'waiting';
  renderPanel();

  // 成功率：岛的底子 × 假鸟与声音的合力，再乘上随机性。
  // 用加法再取幂，让「一端拉满 + 一端省着」与「两样都中等」都有竞争力；
  // 纯乘法会让两样中等永远占优，选择就失去了意义。
  const mix = decoy.value + sound.value; // 0.64 ~ 1.86
  const p = Math.min(0.92, island.base * Math.pow(mix, 2.1) * 2.6);
  const roll = Math.random();
  S.lastRoll = roll;

  // 「等」的仪式感：三秒后揭晓
  setTimeout(() => {
    const arrived = roll < p;

    if (arrived) {
      // 来了多少只
      const base = 8 + Math.round(roll * 40);
      S.birds = base;
      S.nests = Math.round(base * (0.3 + Math.random() * 0.3));

      // 巢的存活：受岛的风险系数影响
      const hatch = 0.62 + Math.random() * 0.28 - island.risk;
      S.chicks = Math.max(0, Math.round(S.nests * hatch * 0.72));
      S.totalChicks += S.chicks;
    } else {
      S.birds = 0;
      S.nests = 0;
      S.chicks = 0;
    }

    S.seasons.push({
      round: S.round,
      island: island.name,
      decoy: decoy.name,
      sound: sound.name,
      p,
      arrived,
      birds: S.birds,
      nests: S.nests,
      chicks: S.chicks,
    });

    S.phase = 'result';
    renderPanel();
  }, 2200);
}

function renderResult() {
  const last = S.seasons[S.seasons.length - 1];
  if (!last) return;

  const arrived = last.arrived;

  panelEl.innerHTML = `
    <div class="tern">
      <div class="tern__head">
        <h2 class="tern__title">${arrived ? '来了' : '没有来'}</h2>
        <p class="tern__sub">${MONTHS[Math.min(S.round, 4)]} · ${last.island}</p>
      </div>

      ${
        arrived
          ? `<div class="tern__result">
               <div class="tern__stats">
                 <div class="tr"><span>到岛</span><b>${S.birds}</b><i>只</i></div>
                 <div class="tr"><span>筑巢</span><b>${S.nests}</b><i>巢</i></div>
                 <div class="tr"><span>出飞</span><b>${S.chicks}</b><i>雏</i></div>
               </div>
               <p class="tern__resnote">
                 它们落在礁石上，先是几只，然后一片白。护鸟的人退到观测棚里，
                 数巢、记环志、不敢大声说话。
               </p>
             </div>`
          : `<div class="tern__result">
               <p class="tern__resnote">
                 这一季的礁石上只有假鸟。它们站在那儿，一直站到八月结束。
               </p>
               <p class="tern__resnote dim">
                 招引从来不是一次就能成的事。真实项目里，有的岛试了好几年。
               </p>
             </div>`
      }

      <div class="tern__calc">
        <span>这一季的判断概率</span>
        <b>${Math.round(last.p * 100)}%</b>
      </div>

      <div class="tern__acts">
        <button class="btn btn--seal" id="tern-next">
          ${S.round >= 4 ? '看看这些年' : '下一个繁殖季'}
        </button>
      </div>
    </div>
  `;

  panelEl.querySelector('#tern-next')?.addEventListener('click', () => {
    S.round += 1;
    S.birds = 0;
    S.nests = 0;
    S.chicks = 0;
    if (S.round >= 5) {
      S.phase = 'end';
    } else {
      S.phase = 'choose';
    }
    renderPanel();
  });
}

function renderSeasonEnd() {
  S.phase = 'choose';
  renderPanel();
}

function renderEnd() {
  const total = S.seasons.reduce((a, s) => a + s.chicks, 0);
  const successYears = S.seasons.filter((s) => s.arrived).length;

  panelEl.innerHTML = `
    <div class="tern">
      <div class="tern__head">
        <h2 class="tern__title">五年过去了</h2>
        <p class="tern__sub">${successYears} 个繁殖季有鸟落下</p>
      </div>

      <div class="tern__result">
        <p class="tern__resnote">
          ${
            total > 0
              ? `这五季，这座岛上总共飞出 ${total} 只雏鸟。`
              : '这五季，一只也没飞出来。假鸟在礁石上，站了五年。'
          }
        </p>
        <p class="tern__resnote">
          这个物种在野外只剩很小的种群。它们一年只产一枚卵，孵不成就得再等一年。
          所以每一只出飞的雏鸟，都算得上是一次侥幸。
        </p>
        <p class="tern__resnote tern__resnote--fact">
          象山韭山列岛从 2013 年开始招引，到 2025 年累计孵出 214 只雏鸟，
          占全球繁殖总量的八成以上。幼鸟成活率从三成升到了五成。
        </p>
      </div>

      <div class="tern__timeline">
        ${S.seasons
          .map(
            (s) => `
            <div class="tl">
              <span class="tl__y">第 ${s.round + 1} 季</span>
              <span class="tl__r ${s.arrived ? 'is-yes' : 'is-no'}">${s.arrived ? '鸟来了' : '空岛'}</span>
              <span class="tl__n">${s.arrived ? `${s.chicks} 只雏鸟` : '—'}</span>
            </div>`
          )
          .join('')}
      </div>

      <div class="tern__acts">
        <button class="btn btn--seal" id="tern-again">再守五年</button>
      </div>
      <p class="ledger__hint" id="tern-save"></p>
    </div>
  `;

  panelEl.querySelector('#tern-again')?.addEventListener('click', () => {
    S = newGame();
    renderPanel();
  });

  void saveTernRun();
}

async function saveTernRun() {
  const hint = panelEl?.querySelector('#tern-save');
  if (!hint) return;

  if (!auth.ready || !auth.online) {
    hint.textContent = '本地模式：这五季只留在这台设备上。';
    return;
  }
  if (!auth.user) {
    hint.textContent = '登录后这次的记录会存到账号里。';
    return;
  }
  if (auth.user.kind !== 'member') {
    hint.innerHTML = '<button class="ap__link" id="tern-tologin">注册账号</button>，这次的记录就能存下来。';
    hint.querySelector('#tern-tologin')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('auth:need-member'));
    });
    return;
  }

  const key = S.seasons.map((s) => `${s.round}:${s.chicks}`).join('|');
  if (key === lastTernKey) return;
  lastTernKey = key;

  hint.textContent = '正在记录…';
  try {
    const r = await submitTern({ seasons: S.seasons });
    if (r.ok) {
      hint.textContent = r.isNewBest
        ? `这是你的最好成绩：${r.totalChicks} 只雏鸟。`
        : `已经记下了。你的最好成绩是 ${r.prevBest} 只。`;
    } else {
      hint.textContent = '记录没成功，不影响继续玩。';
    }
  } catch (_) {
    hint.textContent = '记录没成功，不影响继续玩。';
  }
}
