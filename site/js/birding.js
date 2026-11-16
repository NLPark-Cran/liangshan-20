/**
 * birding.js — 观鸟观测手账
 *
 * 核心设定：抽卡不是抽卡，是「翻到一条真实的观测记录」。
 * 每条记录有地点、日期、天气、风速、数量和辨识要点。
 * 稀有度按真实记录频率分级。
 */

import { SITES, RARITY, HABITATS, KIND_LABEL, TYPHOON_NAMES, makeRecord, allSpecies, TOTAL_SPECIES } from '../data/birds.js';
import { inkStroke, mulberry32, hexA, seal } from './brush.js';
import { mountain, treeShape, haze, water } from './inkfig.js';
import { auth, drawBird } from './api.js';
import { loadStickerIndex, stickerUrl, stickerCredit, warmUp } from './sticker.js';

const STORE_KEY = 'liangshan20.birdlog.v1';

/** 转义，用于拼 HTML */
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * 生境的显示名。
 * 优先按 kind（地质类型，如「丘陵」）取，取不到再退回 scene（绘制场景名，如「ridge」）。
 * 两者不是一回事：平湖九龙山 kind 是丘陵，画面上用的却是 ridge 那套山形。
 */
function habitatLabel(site) {
  const byKind = KIND_LABEL[site.kind];
  if (byKind) return byKind;
  return HABITATS[site.scene]?.label || '';
}

/* ────────────────────────── 本地存档 ────────────────────────── */

function loadLog() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { records: [], seen: {} };
    const d = JSON.parse(raw);
    return { records: d.records || [], seen: d.seen || {} };
  } catch (_) {
    return { records: [], seen: {} };
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(log));
  } catch (_) {
    /* 存储不可用时静默降级，功能仍可用 */
  }
}

/* ────────────────────────── 状态 ────────────────────────── */

let log = loadLog();
let currentSite = SITES[0];
let typhoonActive = false;
let panelEl = null;

/* ────────────────────────── 入口 ────────────────────────── */

export function initBirding() {
  panelEl = document.getElementById('bird-panel');
  if (!panelEl) return;
  renderShell();
  bindShell();

  // 贴纸索引异步加载，不阻塞首屏；到了之后重绘当前画面
  loadStickerIndex().then((idx) => {
    if (idx) renderShell();
  });
}

/** 打开观鸟手账（由外部调用） */
export function openBirding() {
  const ov = document.getElementById('birdlog');
  if (!ov) return;
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => ov.classList.add('is-open'));
  loadStickerIndex().then(() => {
    renderShell();
    // 预取当前地点最容易抽到的几种，翻页时不用等
    warmUp(currentSite.species.filter((s) => s.r === 'C' || s.r === 'U').map((s) => s.s));
  });
}

export function closeBirding() {
  const ov = document.getElementById('birdlog');
  if (!ov) return;
  ov.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => {
    ov.hidden = true;
  }, 300);
}

/* ────────────────────────── 界面 ────────────────────────── */

function renderShell() {
  if (!panelEl) return;

  const seenCount = Object.keys(log.seen).length;

  panelEl.innerHTML = `
    <div class="bird">
      <aside class="bird__side">
        <div class="bird__sidehead">
          <h2 class="bird__title">观测手账</h2>
          <p class="bird__sub">挑一个地方，翻一页记录</p>
        </div>

        <div class="bird__sites" role="tablist" aria-label="观鸟地点">
          ${SITES.map(
            (s) => `
            <button class="sitechip ${s.id === currentSite.id ? 'is-on' : ''}"
                    role="tab"
                    aria-selected="${s.id === currentSite.id}"
                    data-site="${s.id}">
              <span class="sitechip__n">${s.name}</span>
              <span class="sitechip__m">${s.region} · ${habitatLabel(s)}</span>
            </button>`
          ).join('')}
        </div>

        <div class="bird__prog">
          <div class="bird__progt">
            <span>已记录</span>
            <b><span id="bird-seen">${seenCount}</span><i> / ${TOTAL_SPECIES}</i></b>
          </div>
          <div class="bird__bar"><div class="bird__barfill" id="bird-barfill" style="width:${(seenCount / TOTAL_SPECIES) * 100}%"></div></div>
          <button class="btn btn--ghost bird__allbtn" id="bird-all">看全部图鉴</button>
        </div>
      </aside>

      <main class="bird__main">
        <div class="bird__stage" id="bird-stage"></div>
      </main>
    </div>
  `;

  renderStage();
}

/**
 * 只刷新左侧的进度计数，不重建整个面板。
 * 翻一页之后必须调用，否则「已记录」会停在上一次的数字上。
 */
function updateProgress() {
  const n = Object.keys(log.seen).length;
  const seenEl = document.getElementById('bird-seen');
  const barEl = document.getElementById('bird-barfill');
  if (seenEl) seenEl.textContent = String(n);
  if (barEl) barEl.style.width = `${(n / TOTAL_SPECIES) * 100}%`;
}

function bindShell() {
  panelEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-site]');
    if (chip) {
      currentSite = SITES.find((s) => s.id === chip.dataset.site) || SITES[0];
      typhoonActive = false;
      renderShell();
      warmUp(currentSite.species.filter((s) => s.r === 'C' || s.r === 'U').map((s) => s.s));
      return;
    }

    if (e.target.closest('#bird-all')) {
      renderCodex();
      return;
    }

    if (e.target.closest('#bird-draw')) {
      void doDraw();
      return;
    }

    if (e.target.closest('#bird-typhoon')) {
      typhoonActive = true;
      void doDraw(true);
      return;
    }

    if (e.target.closest('#bird-back')) {
      renderStage();
      return;
    }
  });
}

/* ────────────────────────── 当前地点视图 ────────────────────────── */

function renderStage() {
  const stage = document.getElementById('bird-stage');
  if (!stage) return;

  const site = currentSite;

  stage.innerHTML = `
    <div class="bird__head">
      <div class="bird__kicker">
        <span>${site.region}</span>
        <span aria-hidden="true">·</span>
        <span>${habitatLabel(site)}</span>
        <span aria-hidden="true">·</span>
        <span>${site.alt}</span>
      </div>
      <h3 class="bird__place">${site.name}</h3>
      <p class="bird__note">${site.note}</p>
      <div class="bird__meta">
        <span>适宜 ${site.seasons.join(' / ')}</span>
        <span>最好 ${site.best}</span>
      </div>
    </div>

    <canvas class="bird__art" id="bird-art" aria-label="${site.name}的手绘场景"></canvas>

    <div class="bird__acts">
      <button class="btn btn--seal" id="bird-draw">翻一页记录</button>
      <button class="btn btn--ghost" id="bird-typhoon">台风过境</button>
    </div>

    <p class="bird__hint">台风过后，海鸟会被吹进内陆。这种日子观鸟人会连夜出门。</p>
  `;

  // 画场景
  const cv = document.getElementById('bird-art');
  if (cv) drawHabitat(cv, site.scene);
}

/* ────────────────────────── 抽一页 ────────────────────────── */

async function doDraw(typhoon = false) {
  const stage = document.getElementById('bird-stage');
  if (!stage) return;

  // 优先走后端判定；后端不可用时退回本地抽签，页面照常能玩
  let rec = null;
  let serverId = null;
  if (auth.ready && auth.online) {
    try {
      const r = await drawBird(currentSite.id, typhoon);
      if (r.ok && r.record) {
        rec = r.record;
        serverId = r.record.typhoonName ?? null;
      }
    } catch (_) {
      /* 落到本地 */
    }
  }

  if (!rec) {
    const luck = Math.random();
    rec = makeRecord(currentSite, { typhoon, luck });
  }

  // 本地存档：只存到这台设备，用于离线时的图鉴
  log.records.push(rec);
  const key = rec.species;
  log.seen[key] = (log.seen[key] || 0) + 1;
  saveLog(log);

  // 左侧计数必须跟着变，否则要刷新才看得到新数字
  updateProgress();

  const r = RARITY[rec.rarity] || RARITY.C;

  const typhoonLine = rec.typhoon
    ? `<div class="rec__typhoon">
         <span class="rec__typhoontag">台风「${esc(serverId || pickTyphoon())}」</span>
         <span>过境后第二天清晨</span>
       </div>`
    : '';

  stage.innerHTML = `
    <article class="rec rec--${rec.rarity}" data-rarity="${rec.rarity}">
      <div class="rec__head">
        <div class="rec__rarity" style="--rc:${r.color}">
          <span class="rec__rlabel">${r.label}</span>
          <span class="rec__rdesc">${r.desc}</span>
        </div>
        <span class="num">No. ${String(log.records.length).padStart(3, '0')}</span>
      </div>

      ${typhoonLine}

      <div class="rec__body">
        <div class="rec__artwrap">
          <img class="rec__birdpic" src="${stickerUrl(rec.species) || ''}" alt="${rec.species}" decoding="async" />
          <canvas class="rec__birdart" id="rec-bird" aria-label="${rec.species}的轮廓"></canvas>
        </div>
        <div class="rec__info">
          <h3 class="rec__name">${rec.species}</h3>
          <p class="rec__en">${rec.speciesEn}</p>
          <dl class="rec__rows">
            <div><dt>地点</dt><dd>${rec.siteName} <span class="dim">${rec.region}</span></dd></div>
            <div><dt>时间</dt><dd>${rec.date}</dd></div>
            <div><dt>天气</dt><dd>${rec.weather}，${rec.wind}</dd></div>
            <div><dt>数量</dt><dd>${rec.count}</dd></div>
            <div><dt>辨识</dt><dd>${rec.tip}</dd></div>
          </dl>
        </div>
      </div>

      <div class="rec__foot">
        <button class="btn btn--ghost" id="bird-back">回到 ${rec.siteName}</button>
        <button class="btn btn--seal" id="bird-draw">再翻一页</button>
      </div>

      ${stickerCredit() ? `<p class="rec__credit">${stickerCredit()}</p>` : ''}
    </article>
  `;

  // 贴纸优先。代码画的轮廓始终垫在底层，贴纸加载成功就盖住它；
  // 贴纸 404 或没有这一种，就露出轮廓，不至于开天窗。
  const pic = stage.querySelector('.rec__birdpic');
  const cv = document.getElementById('rec-bird');
  if (cv) drawBirdSilhouette(cv, rec.species, r.color);
  if (pic) {
    pic.addEventListener('error', () => pic.classList.add('is-off'), { once: true });
  }
}

function pickTyphoon() {
  return TYPHOON_NAMES[Math.floor(Math.random() * TYPHOON_NAMES.length)];
}

/* ────────────────────────── 图鉴 ────────────────────────── */

function renderCodex() {
  const stage = document.getElementById('bird-stage');
  if (!stage) return;

  const all = allSpecies();
  const seen = log.seen;
  const seenCount = Object.keys(seen).length;
  const byRarity = { X: [], M: [], R: [], U: [], C: [] };
  all.forEach((sp) => {
    const k = sp.r || 'C';
    if (byRarity[k]) byRarity[k].push(sp);
  });

  stage.innerHTML = `
    <div class="codex">
      <div class="codex__head">
        <h3>全部图鉴</h3>
        <p>共 ${TOTAL_SPECIES} 种，已记录 ${seenCount} 种</p>
      </div>
      ${['X', 'M', 'R', 'U', 'C']
        .map((k) => {
          const list = byRarity[k];
          if (!list.length) return '';
          const r = RARITY[k];
          return `
          <section class="codex__group">
            <h4 class="codex__gh" style="--rc:${r.color}">
              <span class="codex__gb">${r.label}</span>
              <span class="codex__gd">${r.desc}</span>
              <span class="codex__gc">${list.filter((s) => seen[s.s]).length} / ${list.length}</span>
            </h4>
            <div class="codex__grid">
              ${list
                .map((sp) => {
                  const got = !!seen[sp.s];
                  const thumb = got ? stickerUrl(sp.s) : '';
                  return `<div class="cg ${got ? 'is-got' : ''}">
                    ${
                      thumb
                        ? `<img class="cg__pic" src="${thumb}" alt="${sp.s}" decoding="async" />`
                        : `<span class="cg__pic cg__pic--none">${got ? '·' : '？'}</span>`
                    }
                    <span class="cg__n">${got ? sp.s : '？'}</span>
                    <span class="cg__s">${got ? sp.sites.slice(0, 2).join(' / ') : '未记录'}</span>
                  </div>`;
                })
                .join('')}
            </div>
          </section>`;
        })
        .join('')}
      <div class="codex__foot">
        <button class="btn btn--ghost" id="bird-back">返回手账</button>
      </div>
    </div>
  `;
}

/* ────────────────────────── 手绘：生境 ────────────────────────── */

function drawHabitat(canvas, kind) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.4);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 300);
  const h = Math.max(rect.height, 180);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, w, h);

  // 生境图统一在虚拟画布里画，比例与六站一致
  const seed = [...kind].reduce((a, c) => a + c.charCodeAt(0), 0) * 7 + 31;
  inVirtualBand(ctx, w, h, kind, seed);
}

/** 生境小图：纵向固定 260 单位 */
function inVirtualBand(ctx, w, h, kind, seed) {
  const UNIT = 260;
  const s = h / UNIT;
  const vw = w / s;
  const vh = UNIT;
  ctx.save();
  ctx.scale(s, s);
  ctx.__inkGain = Math.max(1, Math.min(2.4, s * 1.6));

  const rnd = mulberry32(seed);

  switch (kind) {
    case 'ridge': {
      // 层叠山脊
      mountain(ctx, vw, vh, {
        seed,
        ridgeY: vh * 0.46,
        amp: vh * 0.2,
        y0: vh,
        peaks: 2.4,
        tone: '#5a6b4e',
        toneAlpha: 0.1,
        lineColor: '#3a3f38',
        lineAlpha: 0.4,
        lineWidth: 1.3,
        texture: 2,
      });
      haze(ctx, vw, vh * 0.78, { alpha: 0.66, seed: seed + 21, height: vh * 0.05 });
      // 山脚的几株树，前后错开，不要排成一条线
      const grove = [
        [0.06, 0.99, 62],
        [0.19, 1.02, 48],
        [0.33, 0.97, 70],
        [0.52, 1.01, 54],
        [0.71, 0.96, 66],
        [0.88, 1.02, 50],
      ];
      grove.forEach(([gx, gy, gs], i) => {
        treeShape(ctx, vw * gx, vh * gy, {
          size: gs,
          seed: seed + 500 + i * 13,
          alpha: 0.46,
          canopyAlpha: 0.16,
          shape: i % 3 === 0 ? 'pine' : 'round',
        });
      });
      break;
    }
    case 'lake':
    case 'reed': {
      mountain(ctx, vw, vh, {
        seed,
        ridgeY: vh * 0.36,
        amp: vh * 0.14,
        y0: vh * 0.56,
        peaks: 2,
        tone: '#7c9160',
        toneAlpha: 0.09,
        lineColor: '#5a625b',
        lineAlpha: 0.28,
        lineWidth: 1.1,
        texture: 1,
      });
      haze(ctx, vw, vh * 0.54, { alpha: 0.8, seed: seed + 21, height: vh * 0.05 });
      water(ctx, 0, vh * 0.6, vh * 0.98, { seed: seed + 31, rows: 6, alpha: 0.26 });
      if (kind === 'reed') {
        for (let i = 0; i < 9; i++) {
          const x = vw * (0.04 + i * 0.11 + rnd() * 0.03);
          inkStroke(
            ctx,
            [
              [x, vh * 0.98],
              [x + (rnd() - 0.5) * 3, vh * 0.68],
              [x + (rnd() - 0.5) * 5, vh * 0.58],
            ],
            {
              color: '#5a625b',
              width: 1,
              alpha: 0.3,
              seed: seed + 700 + i * 9,
              layers: 1,
              dry: 0.2,
              taper: false,
            }
          );
        }
      }
      break;
    }
    case 'wetland': {
      mountain(ctx, vw, vh, {
        seed,
        ridgeY: vh * 0.32,
        amp: vh * 0.1,
        y0: vh * 0.46,
        peaks: 1.8,
        tone: '#7c9160',
        toneAlpha: 0.08,
        lineColor: '#5a625b',
        lineAlpha: 0.24,
        lineWidth: 1,
        texture: 1,
      });
      haze(ctx, vw, vh * 0.45, { alpha: 0.72, seed: seed + 21, height: vh * 0.05 });
      inkStroke(
        ctx,
        [
          [0, vh * 0.62],
          [vw * 0.42, vh * 0.59],
          [vw, vh * 0.64],
        ],
        { color: '#6d8f8a', width: 1.2, alpha: 0.34, seed: seed + 41, dry: 0.14, layers: 1 }
      );
      water(ctx, vw * 0.06, vh * 0.66, vh * 0.98, { seed: seed + 51, rows: 4, alpha: 0.22 });
      for (let i = 0; i < 5; i++) {
        treeShape(ctx, vw * (0.1 + i * 0.2), vh * (0.56 + rnd() * 0.05), {
          size: 22 + rnd() * 12,
          seed: seed + 800 + i * 11,
          alpha: 0.32,
          canopyAlpha: 0.11,
        });
      }
      break;
    }
    case 'tidal': {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, vh * 0.5);
      ctx.bezierCurveTo(vw * 0.3, vh * 0.45, vw * 0.7, vh * 0.57, vw, vh * 0.49);
      ctx.lineTo(vw, vh);
      ctx.lineTo(0, vh);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, vh * 0.46, 0, vh);
      g.addColorStop(0, hexA('#b1813f', 0.14));
      g.addColorStop(1, hexA('#8d948a', 0.14));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < 8; i++) {
        const y = vh * (0.56 + i * 0.05);
        inkStroke(
          ctx,
          [
            [0, y],
            [vw, y + (rnd() - 0.5) * 2],
          ],
          { color: '#8d948a', width: 0.7, alpha: 0.18, seed: seed + 900 + i, layers: 1, dry: 0.34, taper: false }
        );
      }
      break;
    }
    case 'island': {
      const seaY = vh * 0.56;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, seaY, vw, vh - seaY);
      const g = ctx.createLinearGradient(0, seaY, 0, vh);
      g.addColorStop(0, hexA('#6d8f8a', 0.14));
      g.addColorStop(1, hexA('#6d8f8a', 0.05));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      water(ctx, 0, seaY, vh * 0.98, { seed: seed + 31, rows: 6, alpha: 0.26 });
      // 岛
      inkStroke(
        ctx,
        [
          [vw * 0.2, seaY + 2],
          [vw * 0.28, vh * 0.3],
          [vw * 0.4, vh * 0.26],
          [vw * 0.5, vh * 0.38],
          [vw * 0.55, seaY + 2],
        ],
        { color: '#3a3f38', width: 1.5, alpha: 0.48, seed: seed + 41, dry: 0.12, layers: 2 }
      );
      break;
    }
    case 'forest': {
      mountain(ctx, vw, vh, {
        seed,
        ridgeY: vh * 0.4,
        amp: vh * 0.15,
        y0: vh,
        peaks: 2.2,
        tone: '#4d5c3d',
        toneAlpha: 0.15,
        lineColor: '#3a3f38',
        lineAlpha: 0.38,
        lineWidth: 1.3,
        texture: 2,
      });
      for (let i = 0; i < 6; i++) {
        treeShape(ctx, vw * (0.06 + i * 0.17 + rnd() * 0.03), vh * (0.86 + rnd() * 0.06), {
          size: 32 + rnd() * 20,
          seed: seed + 600 + i * 17,
          alpha: 0.42,
          canopyAlpha: 0.14,
          shape: i % 4 === 1 ? 'pine' : 'round',
        });
      }
      break;
    }
    default:
      water(ctx, 0, vh * 0.5, vh * 0.98, { seed: seed + 31, rows: 5, alpha: 0.22 });
  }

  ctx.__inkGain = 1;
  ctx.restore();
}
/* ────────────────────────── 手绘：鸟的剪影 ────────────────────────── */

/**
 * 画一个该鸟种的极简剪影。
 * 不追求写实辨识，只给出体形与姿态的印象。
 */
function drawBirdSilhouette(canvas, name, color) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.4);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 160);
  const h = Math.max(rect.height, 160);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.52;
  const s = Math.min(w, h) * 0.3;

  // 按名字里的特征判断体型类别
  const isRaptor = /鹰|隼|鵟|鹞|鹗|鸮/.test(name);
  const isTern = /燕鸥|贼鸥/.test(name);
  const isWader = /鹭|鹬|鹳|琵鹭|鹈鹕|鸻/.test(name);
  const isDuck = /鸭|雁|鸳鸯/.test(name);
  const isBig = /鹤|鹳|鹈鹕/.test(name);
  const isPheasant = /雉|鹇|鸡/.test(name);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = hexA(color, 0.1);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const shape = () => {
    if (isRaptor) {
      // 展翅的猛禽：M 形
      ctx.beginPath();
      ctx.moveTo(-s * 1.15, -s * 0.12);
      ctx.quadraticCurveTo(-s * 0.6, -s * 0.62, -s * 0.12, -s * 0.16);
      ctx.quadraticCurveTo(0, -s * 0.02, s * 0.12, -s * 0.16);
      ctx.quadraticCurveTo(s * 0.6, -s * 0.62, s * 1.15, -s * 0.12);
      ctx.quadraticCurveTo(s * 0.62, -s * 0.2, s * 0.16, s * 0.12);
      ctx.lineTo(s * 0.06, s * 0.4);
      ctx.lineTo(-s * 0.06, s * 0.4);
      ctx.lineTo(-s * 0.16, s * 0.12);
      ctx.quadraticCurveTo(-s * 0.62, -s * 0.2, -s * 1.15, -s * 0.12);
      ctx.closePath();
    } else if (isTern) {
      // 燕鸥：细长展翅
      ctx.beginPath();
      ctx.moveTo(-s * 1.25, -s * 0.06);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.34, 0, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.34, s * 1.25, -s * 0.06);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.16, 0, s * 0.06);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.16, -s * 1.25, -s * 0.06);
      ctx.closePath();
    } else if (isBig) {
      // 大型涉禽：长颈长腿，站立
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.42, s * 0.26, -0.16, 0, Math.PI * 2);
      ctx.closePath();
    } else if (isWader) {
      // 中小型涉禽
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.34, s * 0.22, -0.2, 0, Math.PI * 2);
      ctx.closePath();
    } else if (isDuck) {
      // 鸭：浮水侧面
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.46, s * 0.26, 0, 0, Math.PI * 2);
      ctx.closePath();
    } else if (isPheasant) {
      // 雉类：站立，长尾
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.36, s * 0.3, -0.3, 0, Math.PI * 2);
      ctx.closePath();
    } else {
      // 小型雀形目
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.36, s * 0.28, -0.12, 0, Math.PI * 2);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  };

  shape();

  // 头
  if (!isRaptor && !isTern) {
    const headX = isBig ? s * 0.42 : s * 0.28;
    const headY = isBig ? -s * 0.34 : -s * 0.24;
    ctx.beginPath();
    ctx.arc(headX, headY, s * (isBig ? 0.13 : 0.17), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 喙
    ctx.beginPath();
    if (isWader || isBig) {
      ctx.moveTo(headX + s * 0.12, headY);
      ctx.lineTo(headX + s * 0.52, headY + s * 0.06);
    } else {
      ctx.moveTo(headX + s * 0.14, headY - s * 0.02);
      ctx.lineTo(headX + s * 0.3, headY + s * 0.03);
    }
    ctx.stroke();
  }

  // 腿
  if (isWader || isBig) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, s * 0.2);
    ctx.lineTo(-s * 0.12, s * 0.66);
    ctx.moveTo(s * 0.06, s * 0.2);
    ctx.lineTo(s * 0.08, s * 0.66);
    ctx.stroke();
  } else if (isDuck) {
    // 水线
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, s * 0.24);
    ctx.lineTo(s * 0.9, s * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  // 长尾
  if (isPheasant) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.1);
    ctx.quadraticCurveTo(-s * 0.9, s * 0.4, -s * 1.2, s * 0.3);
    ctx.stroke();
  }

  ctx.restore();

  // 印章式署名
  seal(ctx, w - 26, h - 26, {
    size: 30,
    text: '录',
    color: '#9d3a30',
    alpha: 0.42,
    seed: 77,
    rotate: 0.04,
  });
}
