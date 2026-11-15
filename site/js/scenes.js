/**
 * scenes.js — 六个点位的水墨场景 v3
 *
 * 构图按南宋山水的办法来：
 *
 *   1. 一角实、其余虚。全幅重心压在左边，右边交给纸和字。
 *      app.js 在 w*0.4 之后盖一层纸色渐隐，右侧的墨本来就该淡；
 *      构图不能把主景放到那里去。
 *   2. 主峰与次峰有高差。峰的位置和高度写进 peaks，不靠随机起伏。
 *   3. 一景只有一个重心。其余元素只做陪衬，压住画面下缘，不留死白。
 *   4. 树的疏密由落点决定。哪里成丛、哪里空着，是构图的一部分。
 *
 * 每个场景都在「虚拟画布」里绘制（纵向固定 700 单位），
 * 横向按实际宽高比推算，所以屏幕多大都保持同样的比例关系。
 */

import { inkStroke, rockCluster, pit, mulberry32, hexA } from './brush.js';
import {
  mass,
  ridge,
  mountain,
  composeRidge,
  fadeAt,
  treeShape,
  treeGroup,
  mist,
  haze,
  water,
  hut,
  cloudBand,
  boat,
  reeds,
  stone,
  groundWash,
  skyWash,
} from './inkfig.js';

/* ────────────────────────── 虚拟画布 ────────────────────────── */

const UNIT_H = 700;

function inVirtual(ctx, w, h, fn, seed, gainMul = 1) {
  const s = h / UNIT_H;
  const vw = w / s;
  const vh = UNIT_H;
  ctx.save();
  ctx.scale(s, s);
  ctx.__inkGain = Math.max(1, Math.min(2.4, s * 1.5)) * gainMul;
  fn(ctx, vw, vh, seed);
  ctx.__inkGain = 1;
  ctx.restore();
}

/* ────────────────────────── 通用零件 ────────────────────────── */

/** 一道山脊线：分段上色。fadeT 给每个点的相对 t，浓淡才不会错位 */
function ridgeLine(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const {
    color = '#5a625b',
    alpha = 0.2,
    width = 1.1,
    seed = 1,
    dry = 0,
    layers = 1,
    fade = null,
    fadeT = null,
    wobble = 1.1,
  } = o;
  const segs = Math.max(6, Math.min(20, Math.round(pts.length / 8)));
  for (let k = 0; k < segs; k++) {
    const i0 = Math.floor(((pts.length - 1) * k) / segs);
    const i1 = Math.min(pts.length - 1, Math.ceil(((pts.length - 1) * (k + 1)) / segs) + 1);
    const mid = Math.round((i0 + i1) / 2);
    const g = fadeT ? fadeT[Math.min(mid, fadeT.length - 1)] : (k + 0.5) / segs;
    const a = alpha * fadeAt(g, fade);
    if (a < 0.012) continue;
    inkStroke(ctx, pts.slice(i0, i1 + 1), {
      color,
      width,
      alpha: a,
      seed: seed + k * 13,
      wobble,
      jitter: 0.25,
      dry,
      layers,
      taper: false,
      step: 4,
    });
  }
}

/** 远山：只有一道淡线，不填色，不加皴；只画山在的那一段 */
function farRange(ctx, w, h, o = {}) {
  const {
    baseY = 0.2,
    amp = 0.05,
    peaks,
    alpha = 0.2,
    seed = 1,
    fade = [[0, 1], [0.7, 0.85], [1, 0.2]],
  } = o;
  let t0 = 1;
  let t1 = 0;
  for (const pk of peaks) {
    t0 = Math.min(t0, pk.cx - pk.half);
    t1 = Math.max(t1, pk.cx + pk.half);
  }
  const lo = Math.max(0, t0);
  const hi = Math.min(1, t1);
  const band = composeRidge(peaks, 300).filter(([t]) => t >= lo - 1e-4 && t <= hi + 1e-4);

  const pts = [];
  const fadeT = [];
  for (const [t, hh] of band) {
    pts.push([w * t, h * baseY - hh * h * amp]);
    // 按山自身这一段归一，浓淡才落在两端
    fadeT.push(hi > lo ? (t - lo) / (hi - lo) : 0);
  }
  ridgeLine(ctx, pts, { color: '#6c736a', alpha, width: 1.05, seed, fade, fadeT, dry: 0 });
}

/** 一块地面／水面的淡染：顶边不齐，底下坐实 */
function washArea(ctx, pts, o = {}) {
  const { color = '#8d948a', a0 = 0.05, a1 = 0.18, yTop, yBot } = o;
  if (pts.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, hexA(color, a0));
  g.addColorStop(0.6, hexA(color, (a0 + a1) * 0.55));
  g.addColorStop(1, hexA(color, a1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** 一条不齐的横线：返回从 x0 到 x1 的点列 */
function softEdge(x0, x1, y, amp, seed, seg = 26) {
  const rnd = mulberry32(seed);
  const pts = [];
  const ph = rnd() * 6.28;
  const ph2 = rnd() * 6.28;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    pts.push([
      x0 + (x1 - x0) * u,
      y + Math.sin(u * 3.1 + ph) * amp + Math.sin(u * 7.7 + ph2) * amp * 0.35,
    ]);
  }
  return pts;
}

/**
 * 梯田：绕着山嘴下来的等高带。
 * 上疏下密（幂次），越近越宽越深，越远越贴越淡。
 */
function terraceFan(ctx, o = {}) {
  const {
    top,
    bottom,
    cx,
    spread,
    rows = 26,
    seed = 1,
    color = '#7c9160',
    alpha = 0.36,
    width = 1,
    tilt = 0.12,
    sink = 0.16,
    seg = 20,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = Math.pow(r / (rows - 1), 1.22);
    const y = top + (bottom - top) * t + (rnd() - 0.5) * (bottom - top) * 0.006;
    const half = spread * (0.16 + t * 0.94);
    const cxr = cx + tilt * (t - 0.4) * spread * 0.5;
    const sag = half * (sink + rnd() * 0.1);
    const ph = rnd() * 6.28;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      pts.push([
        cxr - half + half * 2 * u,
        y + Math.sin(u * Math.PI) * sag - Math.sin(u * Math.PI * 2 + ph) * sag * 0.2,
      ]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.7 + t * 0.7),
      alpha: alpha * (0.28 + t * 0.85),
      seed: seed + r * 11,
      wobble: 0.55,
      jitter: 0.25,
      dry: 0.28,
      layers: 1,
      taper: false,
      step: 4,
    });

    // 近处几层田埂的积水：短横笔，不排成条
    if (t > 0.5 && rnd() > 0.45) {
      const sx = cxr - half * (0.15 + rnd() * 0.55);
      const sw = half * (0.16 + rnd() * 0.3);
      inkStroke(
        ctx,
        [
          [sx, y + sag * 0.55],
          [sx + sw, y + sag * 0.5 + (rnd() - 0.5) * 1.6],
        ],
        {
          color: '#6d8f8a',
          width: 0.9,
          alpha: alpha * 0.28,
          seed: seed + 400 + r * 5,
          wobble: 0.4,
          dry: 0.3,
          layers: 1,
          taper: false,
        }
      );
    }
  }
}

/** 菜地垄：从近往远收，收敛点偏左，才有纵深 */
function cropRows(ctx, o = {}) {
  const {
    w,
    yFar,
    yNear,
    vanishX,
    x0,
    x1,
    rows = 9,
    seed = 1,
    color = '#5a625b',
    alpha = 0.24,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = yFar + (yNear - yFar) * Math.pow(t, 0.92);
    const grow = 0.3 + Math.pow(t, 0.72) * 0.78;
    const lx = vanishX + (x0 - vanishX) * grow;
    const rx = vanishX + (x1 - vanishX) * grow;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      pts.push([lx + (rx - lx) * u, y + Math.sin(u * 4 + r * 0.7) * (0.8 + t * 1.8)]);
    }
    inkStroke(ctx, pts, {
      color,
      width: 0.75 + t * 0.75,
      alpha: alpha * (0.35 + t * 0.9),
      seed: seed + r * 9,
      wobble: 0.45,
      jitter: 0.2,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/** 一溜屋子：沿一条线排，高低不齐，间距不等 */
function houseRow(ctx, o = {}) {
  const { list, seed = 1, alpha = 0.5, tone = '#3a3f38', toneAlpha = 0.09 } = o;
  list.forEach(([x, y, s, flip], i) => {
    hut(ctx, x, y, {
      size: s,
      seed: seed + i * 7,
      alpha: alpha * (0.84 + ((i * 37) % 10) / 34),
      flip: !!flip,
      tone,
      toneAlpha: toneAlpha * (0.8 + ((i * 53) % 10) / 22),
    });
  });
}

/** 前景压角的大树：位置固定在角上，冠盖伸进画面 */
function cornerTree(ctx, w, h, o = {}) {
  const {
    x = 0.04,
    y = 1.04,
    size = 168,
    seed = 1,
    color = '#222b1f',
    canopy = '#333f2c',
    alpha = 0.48,
    canopyAlpha = 0.19,
    lean = 0.06,
    shape = 'round',
  } = o;
  treeShape(ctx, w * x, h * y, {
    size,
    seed,
    color,
    canopy,
    alpha,
    canopyAlpha,
    trunkRatio: 0.58,
    lean,
    shape,
  });
}

/* ══════════════════════════════════════════════════════════
   一 · 余村：左边是被炸开的赭石山，右边是复绿的山
   ══════════════════════════════════════════════════════════ */

export function sceneYucun(ctx, w, h, seed = 1001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.07, from: 0, to: 0.38 });

  farRange(ctx, w, h, {
    baseY: 0.16,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.1, half: 0.2, h: 1, tilt: 0.2, sharp: 1.45 },
      { cx: 0.32, half: 0.18, h: 0.66, tilt: -0.14, sharp: 1.35 },
      { cx: 0.5, half: 0.2, h: 0.4, tilt: 0.1, sharp: 1.2 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 右：复绿的山。先画，让左边的矿山压在前面。
   * 峰位收在 0.52 以内：app.js 从 w*0.4 起盖纸色渐隐。
   * 这一幅的对照全在左半幅，矿 0.03-0.27，绿 0.18-0.52。 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.44,
    amp: h * 0.185,
    footY: h * 0.7,
    tone: '#7c9160',
    toneAlpha: 0.17,
    lineColor: '#2b2f2b',
    lineAlpha: 0.36,
    lineWidth: 1.8,
    texture: 2.4,
    peaks: [
      { cx: 0.315, half: 0.14, h: 1, tilt: -0.08, crest: 1.9 },
      { cx: 0.44, half: 0.115, h: 0.64, tilt: 0.14, crest: 1.7 },
    ],
    fade: [[0, 0.12], [0.22, 0.95], [0.62, 0.6], [1, 0.08]],
    footFade: 0.55,
    veins: 2,
    moss: 7,
    inner: 0.08,
  });

  /* 左：赭石矿山。剖面里一段直线，是宕口被切平的台阶 */
  const mineKnots = [
    [0.004, 0.02],
    [0.032, 0.36],
    [0.06, 0.7],
    [0.088, 0.95],
    [0.115, 0.76],
    [0.152, 0.72, 'lin'],
    [0.19, 0.7],
    [0.219, 0.42],
    [0.245, 0.15],
    [0.265, 0.02],
  ];
  mass(ctx, {
    vw: w,
    baseY: h * 0.435,
    amp: h * 0.245,
    knots: mineKnots,
    span: [0.004, 0.265],
    footY: h * 0.86,
    tone: '#b1813f',
    toneAlpha: 0.22,
    lineColor: '#5c4526',
    lineAlpha: 0.54,
    lineWidth: 2.2,
    dry: 0.22,
    layers: 1,
    cun: 12,
    cunLen: 0.15,
    cunAlpha: 0.42,
    moss: 5,
    seed: seed + 31,
    footFade: 0.3,
    band: 0.06,
  });

  /* 宕口：阶梯环 + 坑底 */
  pit(ctx, w * 0.135, h * 0.63, {
    r: w * 0.05,
    depth: 1,
    seed: seed + 41,
    alpha: 0.55,
    color: '#8a6733',
  });

  /* 切面上几道炮孔痕：竖着拉下来，长短不一 */
  for (let i = 0; i < 5; i++) {
    const x = w * (0.108 + i * 0.016 + ((i * 17) % 5) * 0.002);
    inkStroke(
      ctx,
      [
        [x, h * (0.5 + ((i * 13) % 7) * 0.006)],
        [x + 1.2, h * 0.575],
      ],
      {
        color: '#5c4526',
        width: 0.9,
        alpha: 0.24,
        seed: seed + 500 + i,
        wobble: 0.3,
        dry: 0.34,
        layers: 1,
        taper: false,
      }
    );
  }

  rockCluster(ctx, w * 0.05, h * 0.79, { w: w * 0.06, h: h * 0.026, seed: seed + 47, alpha: 0.34 });
  rockCluster(ctx, w * 0.21, h * 0.805, { w: w * 0.05, h: h * 0.021, seed: seed + 49, alpha: 0.26 });

  /* 山谷里的雾，把两座山分开 */
  mist(ctx, { x: w * 0.14, y: h * 0.6, w: w * 0.42, h: h * 0.1, seed: seed + 51, strength: 0.9, blobs: 4 });

  /* 右坡的树：只长在复绿的那一面 */
  treeGroup(ctx, {
    x: w * 0.33,
    y: h * 0.625,
    size: 56,
    count: 4,
    spread: 0.7,
    seed: seed + 601,
    color: '#2f3a29',
    alpha: 0.4,
    canopy: '#44523a',
    canopyAlpha: 0.14,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.45,
    y: h * 0.655,
    size: 44,
    count: 2,
    spread: 0.5,
    seed: seed + 619,
    color: '#3a4632',
    alpha: 0.24,
    canopyAlpha: 0.08,
  });

  /* 谷底：一条淡染的地面，压住右侧 */
  const floorTop = softEdge(-w * 0.02, w * 0.7, h * 0.795, h * 0.012, seed + 61, 28);
  washArea(
    ctx,
    floorTop.concat([
      [w * 0.7, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#7c9160', a0: 0.03, a1: 0.13, yTop: h * 0.79, yBot: h }
  );

  houseRow(ctx, {
    seed: seed + 700,
    alpha: 0.48,
    list: [
      [w * 0.3, h * 0.848, 30, 0],
      [w * 0.365, h * 0.875, 26, 1],
      [w * 0.425, h * 0.905, 22, 0],
    ],
  });

  /* 塘：右下的一小块水，让地面不是白板 */
  const pond = softEdge(w * 0.36, w * 0.66, h * 0.93, h * 0.007, seed + 71, 20);
  washArea(
    ctx,
    pond.concat([
      [w * 0.66, h * 1.02],
      [w * 0.36, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.1, a1: 0.16, yTop: h * 0.93, yBot: h }
  );
  water(ctx, w * 0.32, h * 0.94, h * 0.99, { seed: seed + 73, rows: 2, alpha: 0.2, x0: 0.38, x1: 0.64 });

  /* 山道：从村里往左上走，接上矿山的脚 */
  inkStroke(
    ctx,
    [
      [w * 0.36, h * 0.972],
      [w * 0.315, h * 0.925],
      [w * 0.28, h * 0.878],
      [w * 0.252, h * 0.845],
    ],
    { color: '#8d948a', width: 1.2, alpha: 0.28, seed: seed + 81, dry: 0.34, layers: 1, taper: false }
  );

  /* 前景：左角竹丛，压住矿山的脚 */
  cornerTree(ctx, w, h, {
    x: 0.03,
    y: 1.02,
    size: 150,
    seed: seed + 801,
    color: '#26301f',
    alpha: 0.46,
    canopyAlpha: 0.18,
    shape: 'bamboo',
  });
  cornerTree(ctx, w, h, {
    x: 0.085,
    y: 1.06,
    size: 116,
    seed: seed + 807,
    color: '#2b3526',
    alpha: 0.3,
    canopyAlpha: 0.13,
    lean: 0.14,
    shape: 'bamboo',
  });
}

/* ══════════════════════════════════════════════════════════
   二 · 下姜村：一条溪穿过村子
   ══════════════════════════════════════════════════════════ */

export function sceneXiajiang(ctx, w, h, seed = 2001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.08, from: 0, to: 0.4 });

  farRange(ctx, w, h, {
    baseY: 0.17,
    amp: 0.05,
    alpha: 0.18,
    seed: seed + 11,
    peaks: [
      { cx: 0.08, half: 0.17, h: 1, tilt: 0.22, sharp: 1.5 },
      { cx: 0.26, half: 0.18, h: 0.64, tilt: -0.18, sharp: 1.4 },
      { cx: 0.45, half: 0.19, h: 0.38, tilt: 0.12, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.7, 0.55], [1, 0]],
  });

  /* 左边的山：主峰高，山嘴伸下来包住村子 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.4,
    amp: h * 0.25,
    footY: h * 0.72,
    tone: '#4d5c3d',
    toneAlpha: 0.18,
    lineColor: '#2b2f2b',
    lineAlpha: 0.48,
    lineWidth: 2,
    texture: 3,
    peaks: [
      { cx: 0.07, half: 0.16, h: 1, tilt: 0.3, crest: 2.4 },
      { cx: 0.215, half: 0.115, h: 0.55, tilt: -0.2, crest: 1.9 },
    ],
    fade: [[0, 1], [0.45, 0.9], [0.8, 0.34], [1, 0.05]],
    shade: [-0.03, 0.1, 0.1],
    footFade: 0.55,
    veins: 2,
    moss: 8,
    inner: 0.1,
  });

  /* 右边一座矮山，只把地平线托住，落在纸色渐隐里 */
  mountain(ctx, w, h, {
    seed: seed + 29,
    baseY: h * 0.48,
    amp: h * 0.08,
    footY: h * 0.66,
    tone: '#5d6b4b',
    toneAlpha: 0.09,
    lineColor: '#3a3f38',
    lineAlpha: 0.2,
    lineWidth: 1.2,
    texture: 1.2,
    peaks: [{ cx: 0.6, half: 0.2, h: 1, tilt: -0.1, crest: 1.6 }],
    fade: [[0, 0.2], [0.3, 0.9], [1, 0.1]],
    footFade: 0.5,
    veins: 1,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.5, w: w * 0.62, h: h * 0.08, seed: seed + 31, strength: 0.8, blobs: 5 });

  /* 溪：从左上山坳出来，往右下走，越走越宽 */
  inkStroke(
    ctx,
    [
      [w * 0.075, h * 0.44],
      [w * 0.103, h * 0.505],
      [w * 0.092, h * 0.565],
      [w * 0.125, h * 0.62],
    ],
    { color: '#6d8f8a', width: 1.6, alpha: 0.44, seed: seed + 41, dry: 0.16, layers: 2, taper: false }
  );

  /* 溪面：两侧岸线夹出一条带子，中间靠淡青 */
  const leftBank = [
    [w * 0.125, h * 0.615],
    [w * 0.152, h * 0.678],
    [w * 0.17, h * 0.735],
    [w * 0.208, h * 0.8],
    [w * 0.262, h * 0.862],
    [w * 0.34, h * 0.918],
    [w * 0.46, h * 0.972],
  ];
  const rightBank = [
    [w * 0.155, h * 0.61],
    [w * 0.192, h * 0.672],
    [w * 0.228, h * 0.732],
    [w * 0.3, h * 0.798],
    [w * 0.4, h * 0.858],
    [w * 0.53, h * 0.92],
    [w * 0.7, h * 0.975],
  ];
  washArea(ctx, leftBank.concat(rightBank.slice().reverse()), {
    color: '#6d8f8a',
    a0: 0.06,
    a1: 0.22,
    yTop: h * 0.6,
    yBot: h,
  });
  inkStroke(ctx, leftBank, {
    color: '#2b2f2b',
    width: 1.5,
    alpha: 0.42,
    seed: seed + 43,
    dry: 0.2,
    layers: 2,
    taper: false,
  });
  inkStroke(ctx, rightBank, {
    color: '#2b2f2b',
    width: 1.3,
    alpha: 0.34,
    seed: seed + 47,
    dry: 0.24,
    layers: 1,
    taper: false,
  });
  water(ctx, w * 0.7, h * 0.72, h * 0.98, { seed: seed + 53, rows: 4, alpha: 0.26, x0: 0.12, x1: 0.66 });

  /* 两岸的屋：左岸密，右岸两间，都不等高 */
  houseRow(ctx, {
    seed: seed + 400,
    alpha: 0.5,
    list: [
      [w * 0.055, h * 0.675, 30, 0],
      [w * 0.1, h * 0.712, 26, 1],
      [w * 0.045, h * 0.748, 24, 0],
      [w * 0.115, h * 0.775, 28, 0],
      [w * 0.065, h * 0.822, 26, 1],
      [w * 0.152, h * 0.848, 23, 0],
      [w * 0.108, h * 0.892, 27, 0],
    ],
  });
  houseRow(ctx, {
    seed: seed + 460,
    alpha: 0.34,
    list: [
      [w * 0.33, h * 0.855, 21, 1],
      [w * 0.4, h * 0.905, 23, 0],
    ],
  });

  /* 屋后的树，贴着坡长 */
  treeGroup(ctx, {
    x: w * 0.035,
    y: h * 0.652,
    size: 56,
    count: 3,
    spread: 0.55,
    seed: seed + 501,
    color: '#2f3a29',
    alpha: 0.42,
    canopy: '#44523a',
    canopyAlpha: 0.14,
  });
  treeGroup(ctx, {
    x: w * 0.135,
    y: h * 0.668,
    size: 46,
    count: 2,
    spread: 0.45,
    seed: seed + 517,
    color: '#37432f',
    alpha: 0.32,
    canopyAlpha: 0.1,
  });

  /* 溪上一块石板桥 */
  inkStroke(
    ctx,
    [
      [w * 0.205, h * 0.788],
      [w * 0.258, h * 0.812],
    ],
    { color: '#3a3f38', width: 2.4, alpha: 0.46, seed: seed + 61, dry: 0.12, layers: 2, taper: false }
  );
  inkStroke(ctx, [[w * 0.216, h * 0.79], [w * 0.216, h * 0.828]], {
    color: '#3a3f38',
    width: 1,
    alpha: 0.32,
    seed: seed + 63,
    layers: 1,
    dry: 0.2,
  });
  inkStroke(ctx, [[w * 0.25, h * 0.81], [w * 0.25, h * 0.85]], {
    color: '#3a3f38',
    width: 1,
    alpha: 0.28,
    seed: seed + 67,
    layers: 1,
    dry: 0.2,
  });

  /* 前景老樟：冠盖从左上压下来 */
  cornerTree(ctx, w, h, {
    x: 0.03,
    y: 1.05,
    size: 192,
    seed: seed + 701,
    color: '#1f271c',
    alpha: 0.5,
    canopy: '#2f3a29',
    canopyAlpha: 0.2,
    lean: 0.2,
  });

  /* 岸边石与草 */
  stone(ctx, w * 0.3, h * 0.885, { w: w * 0.045, h: h * 0.017, seed: seed + 81, alpha: 0.26, moss: 2 });
  reeds(ctx, w * 0.44, h * 0.93, { size: 32, count: 4, seed: seed + 87, alpha: 0.22, dir: 1 });
}

/* ══════════════════════════════════════════════════════════
   三 · 钱江源：远山叠着，林带压住山脚，前景一潭
   ══════════════════════════════════════════════════════════ */

export function sceneQianjiangyuan(ctx, w, h, seed = 3001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.09, from: 0, to: 0.42 });

  /* 远：两层淡线，越远越薄，只用线不落墨 */
  farRange(ctx, w, h, {
    baseY: 0.15,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.06, half: 0.16, h: 1, tilt: 0.34, sharp: 1.6 },
      { cx: 0.24, half: 0.18, h: 0.72, tilt: -0.2, sharp: 1.5 },
      { cx: 0.44, half: 0.2, h: 0.44, tilt: 0.14, sharp: 1.35 },
    ],
    fade: [[0, 0.9], [0.7, 0.6], [1, 0]],
  });
  farRange(ctx, w, h, {
    baseY: 0.235,
    amp: 0.07,
    alpha: 0.26,
    seed: seed + 17,
    peaks: [
      { cx: 0.09, half: 0.17, h: 1, tilt: 0.3, sharp: 1.4 },
      { cx: 0.27, half: 0.15, h: 0.6, tilt: -0.22, sharp: 1.35 },
      { cx: 0.46, half: 0.18, h: 0.34, tilt: 0.12, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.65, 0.55], [1, 0]],
  });

  /* 主山：主峰站在左边，次峰矮下去，右端化进纸 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.45,
    amp: h * 0.27,
    footY: h * 0.63,
    tone: '#4d5c3d',
    toneAlpha: 0.19,
    lineColor: '#2b2f2b',
    lineAlpha: 0.46,
    lineWidth: 2,
    texture: 3.4,
    peaks: [
      { cx: 0.1, half: 0.17, h: 1, tilt: 0.22, crest: 2.3 },
      { cx: 0.265, half: 0.13, h: 0.6, tilt: -0.2, crest: 2.0 },
      { cx: 0.385, half: 0.11, h: 0.36, tilt: 0.16, crest: 1.75 },
    ],
    fade: [[0, 1], [0.5, 0.88], [0.85, 0.3], [1, 0.05]],
    shade: [-0.02, 0.14, 0.1],
    footFade: 0.5,
    veins: 3,
    moss: 10,
    inner: 0.1,
  });

  /* 山脚雾，把山与林带分开 */
  mist(ctx, { x: -w * 0.05, y: h * 0.5, w: w * 0.6, h: h * 0.09, seed: seed + 31, strength: 0.85, blobs: 5 });

  /* 中景林：左密右疏，最右一丛只剩个影子 */
  treeGroup(ctx, {
    x: w * 0.05,
    y: h * 0.575,
    size: 58,
    count: 3,
    spread: 0.6,
    seed: seed + 101,
    color: '#2f3a29',
    alpha: 0.44,
    canopy: '#44523a',
    canopyAlpha: 0.15,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.16,
    y: h * 0.59,
    size: 74,
    count: 4,
    spread: 0.7,
    seed: seed + 117,
    color: '#2b3526',
    alpha: 0.5,
    canopy: '#3f4d36',
    canopyAlpha: 0.17,
    shape: 'mixed',
  });
  treeGroup(ctx, {
    x: w * 0.3,
    y: h * 0.605,
    size: 50,
    count: 2,
    spread: 0.6,
    seed: seed + 131,
    color: '#37432f',
    alpha: 0.32,
    canopy: '#4a5840',
    canopyAlpha: 0.1,
  });
  treeGroup(ctx, {
    x: w * 0.4,
    y: h * 0.62,
    size: 38,
    count: 2,
    spread: 0.5,
    seed: seed + 149,
    color: '#4a544a',
    alpha: 0.18,
    canopyAlpha: 0.07,
  });

  /* 源头细流，从雾里下到潭 */
  inkStroke(
    ctx,
    [
      [w * 0.2, h * 0.5],
      [w * 0.216, h * 0.56],
      [w * 0.205, h * 0.625],
      [w * 0.228, h * 0.69],
      [w * 0.222, h * 0.75],
    ],
    { color: '#6d8f8a', width: 1.5, alpha: 0.42, seed: seed + 41, dry: 0.24, layers: 2, taper: false }
  );

  /* 前景潭：左重右轻，水面在视线下方铺开 */
  const poolTop = softEdge(-w * 0.02, w * 0.82, h * 0.755, h * 0.016, seed + 51, 30);
  washArea(
    ctx,
    poolTop.concat([
      [w * 0.82, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.03, a1: 0.17, yTop: h * 0.74, yBot: h }
  );
  water(ctx, w * 0.78, h * 0.79, h * 0.99, { seed: seed + 61, rows: 5, alpha: 0.26, x0: 0.04, x1: 0.72 });

  /* 岸边石，压住潭的上缘 */
  stone(ctx, w * 0.15, h * 0.772, { w: w * 0.075, h: h * 0.026, seed: seed + 71, alpha: 0.4, moss: 4 });
  stone(ctx, w * 0.225, h * 0.79, { w: w * 0.05, h: h * 0.017, seed: seed + 73, alpha: 0.3, moss: 2 });
  rockCluster(ctx, w * 0.36, h * 0.8, { w: w * 0.05, h: h * 0.018, seed: seed + 77, alpha: 0.2 });

  /* 前景两棵树：左边这一角就是全幅的重心 */
  cornerTree(ctx, w, h, { x: 0.035, y: 1.0, size: 176, seed: seed + 901 });
  cornerTree(ctx, w, h, {
    x: 0.135,
    y: 1.03,
    size: 116,
    seed: seed + 907,
    color: '#26301f',
    alpha: 0.36,
    canopyAlpha: 0.15,
    lean: -0.12,
  });

  /* 一只鸟，落在右上那片空里 */
  inkStroke(
    ctx,
    [
      [w * 0.5, h * 0.14],
      [w * 0.516, h * 0.122],
      [w * 0.534, h * 0.14],
    ],
    { color: '#2b2f2b', width: 1, alpha: 0.32, seed: seed + 81, layers: 1, dry: 0, taper: false }
  );
}

/* ══════════════════════════════════════════════════════════
   四 · 云和梯田：等高线从山腰一层层铺下来
   ══════════════════════════════════════════════════════════ */

export function sceneYunhe(ctx, w, h, seed = 4001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.09, from: 0, to: 0.32 });

  farRange(ctx, w, h, {
    baseY: 0.135,
    amp: 0.04,
    alpha: 0.18,
    seed: seed + 11,
    peaks: [
      { cx: 0.06, half: 0.16, h: 1, tilt: 0.34, sharp: 1.6 },
      { cx: 0.24, half: 0.18, h: 0.7, tilt: -0.18, sharp: 1.45 },
      { cx: 0.44, half: 0.2, h: 0.42, tilt: 0.12, sharp: 1.3 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 梯田赖着的那座山：峰顶在左上，坡一直落到画外 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.215,
    amp: h * 0.145,
    footY: h * 0.42,
    tone: '#5d6b4b',
    toneAlpha: 0.16,
    lineColor: '#2b2f2b',
    lineAlpha: 0.42,
    lineWidth: 1.8,
    texture: 2,
    peaks: [
      { cx: 0.08, half: 0.16, h: 1, tilt: 0.32, crest: 2.3 },
      { cx: 0.24, half: 0.13, h: 0.58, tilt: -0.2, crest: 1.9 },
    ],
    fade: [[0, 1], [0.45, 0.88], [0.85, 0.3], [1, 0.05]],
    footFade: 0.65,
    veins: 2,
    moss: 8,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.3, w: w * 0.55, h: h * 0.07, seed: seed + 31, strength: 0.85, blobs: 4 });

  /* 右侧一座山的剪影：淡，只用来托住梯田的右缘 */
  mountain(ctx, w, h, {
    seed: seed + 27,
    baseY: h * 0.26,
    amp: h * 0.1,
    footY: h * 0.45,
    tone: '#5d6b4b',
    toneAlpha: 0.1,
    lineColor: '#4a544a',
    lineAlpha: 0.18,
    lineWidth: 1.1,
    texture: 0.8,
    peaks: [{ cx: 0.52, half: 0.2, h: 1, tilt: 0.1, crest: 1.7 }],
    fade: [[0, 0], [0.3, 0.8], [1, 0.05]],
    footFade: 0.65,
    veins: 0,
    moss: 0,
  });

  /* 主坡：等高带从山腰铺到画面下缘 */
  terraceFan(ctx, {
    top: h * 0.315,
    bottom: h * 1.02,
    cx: w * 0.235,
    spread: w * 0.255,
    rows: 27,
    seed: seed + 41,
    color: '#6f8055',
    alpha: 0.42,
    width: 1,
    tilt: 0.16,
    sink: 0.15,
  });

  /* 右边另一道坡：层数少，淡，接上主坡 */
  terraceFan(ctx, {
    top: h * 0.36,
    bottom: h * 0.88,
    cx: w * 0.53,
    spread: w * 0.16,
    rows: 13,
    seed: seed + 47,
    color: '#7c9160',
    alpha: 0.18,
    width: 0.8,
    tilt: -0.1,
    sink: 0.13,
  });

  /* 田间的屋：三间，散在坎上，不成排 */
  houseRow(ctx, {
    seed: seed + 600,
    alpha: 0.5,
    list: [
      [w * 0.205, h * 0.575, 24, 0],
      [w * 0.268, h * 0.648, 20, 1],
      [w * 0.163, h * 0.705, 22, 0],
    ],
  });

  /* 田边的树：只在坎沿上长几棵 */
  treeGroup(ctx, {
    x: w * 0.35,
    y: h * 0.625,
    size: 42,
    count: 2,
    spread: 0.45,
    seed: seed + 611,
    color: '#37432f',
    alpha: 0.26,
    canopyAlpha: 0.08,
  });
  treeGroup(ctx, {
    x: w * 0.42,
    y: h * 0.755,
    size: 34,
    count: 2,
    spread: 0.4,
    seed: seed + 619,
    color: '#3f4a38',
    alpha: 0.18,
    canopyAlpha: 0.06,
  });

  /* 中景的云带：横过梯田腰部，把层数断开 */
  mist(ctx, { x: w * 0.02, y: h * 0.83, w: w * 0.56, h: h * 0.055, seed: seed + 61, strength: 0.5, blobs: 3 });

  /* 前景一道坎：最下面一层田埂，压得最重 */
  inkStroke(
    ctx,
    [
      [-w * 0.02, h * 0.965],
      [w * 0.1, h * 0.948],
      [w * 0.22, h * 0.972],
      [w * 0.34, h * 0.955],
      [w * 0.46, h * 0.985],
    ],
    { color: '#2b2f2b', width: 2.2, alpha: 0.42, seed: seed + 71, wobble: 1.2, dry: 0.34, layers: 2, taper: false }
  );
  groundWash(ctx, { w, y0: h * 0.94, y1: h * 1.02, color: '#5d6b4b', alpha: 0.2, seed: seed + 73, x0: 0, x1: 0.5 });

  /* 左下角一棵树，收住整个画面 */
  cornerTree(ctx, w, h, {
    x: 0.022,
    y: 1.05,
    size: 154,
    seed: seed + 901,
    alpha: 0.46,
    canopyAlpha: 0.18,
    lean: 0.08,
  });
}

/* ══════════════════════════════════════════════════════════
   五 · 浦江：河面横贯下半幅，对岸是村镇
   ══════════════════════════════════════════════════════════ */

export function scenePujiang(ctx, w, h, seed = 5001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.08, from: 0, to: 0.38 });

  farRange(ctx, w, h, {
    baseY: 0.16,
    amp: 0.045,
    alpha: 0.16,
    seed: seed + 11,
    peaks: [
      { cx: 0.07, half: 0.17, h: 1, tilt: 0.32, sharp: 1.5 },
      { cx: 0.25, half: 0.19, h: 0.6, tilt: -0.14, sharp: 1.35 },
      { cx: 0.45, half: 0.2, h: 0.34, tilt: 0.1, sharp: 1.2 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 对岸的低山，压得很平 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.32,
    amp: h * 0.09,
    footY: h * 0.52,
    tone: '#6f8055',
    toneAlpha: 0.12,
    lineColor: '#3a3f38',
    lineAlpha: 0.3,
    lineWidth: 1.4,
    texture: 1.5,
    peaks: [
      { cx: 0.11, half: 0.2, h: 1, tilt: 0.18, crest: 1.6 },
      { cx: 0.32, half: 0.16, h: 0.54, tilt: -0.16, crest: 1.5 },
    ],
    fade: [[0, 1], [0.5, 0.8], [0.85, 0.2], [1, 0.04]],
    footFade: 0.55,
    veins: 1,
    moss: 5,
  });

  /* 对岸：一条窄的岸带 */
  const farBankY = h * 0.5;
  const bankTop = softEdge(-w * 0.02, w * 0.86, farBankY, h * 0.005, seed + 31, 30);
  washArea(
    ctx,
    bankTop.concat([
      [w * 0.86, farBankY + h * 0.04],
      [-w * 0.02, farBankY + h * 0.04],
    ]),
    { color: '#7c9160', a0: 0.18, a1: 0.06, yTop: farBankY, yBot: farBankY + h * 0.045 }
  );

  /* 对岸的村镇：左边密，往右稀 */
  houseRow(ctx, {
    seed: seed + 400,
    alpha: 0.46,
    list: [
      [w * 0.045, h * 0.487, 24, 0],
      [w * 0.098, h * 0.495, 28, 1],
      [w * 0.148, h * 0.485, 23, 0],
      [w * 0.198, h * 0.5, 26, 0],
      [w * 0.268, h * 0.492, 21, 1],
      [w * 0.352, h * 0.5, 20, 0],
      [w * 0.47, h * 0.496, 22, 1],
    ],
  });

  /* 对岸的柳与树丛 */
  treeShape(ctx, w * 0.232, h * 0.505, {
    size: 58,
    seed: seed + 501,
    color: '#37432f',
    alpha: 0.42,
    canopy: '#4a5840',
    canopyAlpha: 0.13,
    shape: 'willow',
  });
  treeShape(ctx, w * 0.3, h * 0.5, {
    size: 48,
    seed: seed + 507,
    color: '#3f4a38',
    alpha: 0.32,
    canopyAlpha: 0.1,
    shape: 'willow',
  });
  treeGroup(ctx, {
    x: w * 0.065,
    y: h * 0.5,
    size: 44,
    count: 3,
    spread: 0.5,
    seed: seed + 513,
    color: '#37432f',
    alpha: 0.3,
    canopyAlpha: 0.1,
    shape: 'mixed',
  });

  /* 河面：一大片淡青，往下越来越淡 */
  const waterTop = softEdge(-w * 0.02, w * 0.98, h * 0.528, h * 0.007, seed + 41, 32);
  washArea(
    ctx,
    waterTop.concat([
      [w * 0.98, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#6d8f8a', a0: 0.17, a1: 0.05, yTop: h * 0.52, yBot: h }
  );

  /* 水纹：中上段密，越靠近观者越稀 */
  water(ctx, w * 0.92, h * 0.56, h * 0.86, { seed: seed + 51, rows: 6, alpha: 0.26, x0: 0.02, x1: 0.9 });

  /* 河岸线：一道实笔，压住岸与水 */
  inkStroke(ctx, waterTop, {
    color: '#2b2f2b',
    width: 1.5,
    alpha: 0.42,
    seed: seed + 61,
    dry: 0.18,
    layers: 2,
    taper: false,
    step: 4,
  });

  /* 一条船：人在船上，船尾拖两道水痕 */
  boat(ctx, w * 0.34, h * 0.79, { size: 36, seed: seed + 71, alpha: 0.46 });

  /* 近岸：左下角一块湿岸 */
  const nearBank = softEdge(-w * 0.02, w * 0.44, h * 0.905, h * 0.011, seed + 81, 22);
  washArea(
    ctx,
    nearBank.concat([
      [w * 0.44, h * 1.02],
      [-w * 0.02, h * 1.02],
    ]),
    { color: '#5d6b4b', a0: 0.04, a1: 0.22, yTop: h * 0.9, yBot: h }
  );
  inkStroke(ctx, nearBank, {
    color: '#2b2f2b',
    width: 1.3,
    alpha: 0.3,
    seed: seed + 83,
    dry: 0.3,
    layers: 1,
    taper: false,
    step: 4,
  });
  reeds(ctx, w * 0.15, h * 0.93, { size: 44, count: 6, seed: seed + 87, alpha: 0.3, dir: 1 });
  stone(ctx, w * 0.24, h * 0.925, { w: w * 0.045, h: h * 0.016, seed: seed + 91, alpha: 0.24, moss: 2 });

  /* 前景大树：从左边探出来，冠盖压住河面上空 */
  cornerTree(ctx, w, h, {
    x: 0.04,
    y: 1.06,
    size: 198,
    seed: seed + 901,
    color: '#1f271c',
    alpha: 0.48,
    canopyAlpha: 0.2,
    lean: 0.26,
  });
}

/* ══════════════════════════════════════════════════════════
   六 · 新溪桥村：菜地、大棚、远山
   ══════════════════════════════════════════════════════════ */

export function sceneXinxinqiao(ctx, w, h, seed = 6001) {
  skyWash(ctx, w, h, { color: '#8d948a', alpha: 0.07, from: 0, to: 0.36 });

  farRange(ctx, w, h, {
    baseY: 0.155,
    amp: 0.04,
    alpha: 0.15,
    seed: seed + 11,
    peaks: [
      { cx: 0.08, half: 0.18, h: 1, tilt: 0.24, sharp: 1.5 },
      { cx: 0.27, half: 0.19, h: 0.64, tilt: -0.16, sharp: 1.4 },
      { cx: 0.46, half: 0.2, h: 0.38, tilt: 0.1, sharp: 1.25 },
    ],
    fade: [[0, 1], [0.7, 0.5], [1, 0]],
  });

  /* 一道近丘陵，把村子和远山隔开 */
  mountain(ctx, w, h, {
    seed: seed + 21,
    baseY: h * 0.3,
    amp: h * 0.075,
    footY: h * 0.48,
    tone: '#6f8055',
    toneAlpha: 0.11,
    lineColor: '#4a544a',
    lineAlpha: 0.26,
    lineWidth: 1.3,
    texture: 1.2,
    peaks: [
      { cx: 0.1, half: 0.18, h: 1, tilt: 0.16, crest: 1.6 },
      { cx: 0.27, half: 0.15, h: 0.55, tilt: -0.18, crest: 1.5 },
    ],
    fade: [[0, 1], [0.62, 0.4], [1, 0.02]],
    footFade: 0.6,
    veins: 1,
    moss: 4,
  });

  mist(ctx, { x: -w * 0.05, y: h * 0.44, w: w * 0.6, h: h * 0.075, seed: seed + 31, strength: 0.8, blobs: 4 });

  /* 村舍：左边三间成组，间距不齐 */
  houseRow(ctx, {
    seed: seed + 500,
    alpha: 0.5,
    list: [
      [w * 0.15, h * 0.505, 30, 0],
      [w * 0.205, h * 0.523, 25, 1],
      [w * 0.25, h * 0.508, 27, 0],
      [w * 0.09, h * 0.532, 22, 0],
    ],
  });
  treeGroup(ctx, {
    x: w * 0.055,
    y: h * 0.522,
    size: 50,
    count: 2,
    spread: 0.45,
    seed: seed + 511,
    color: '#37432f',
    alpha: 0.36,
    canopy: '#44523a',
    canopyAlpha: 0.13,
  });
  treeGroup(ctx, {
    x: w * 0.3,
    y: h * 0.532,
    size: 42,
    count: 2,
    spread: 0.45,
    seed: seed + 519,
    color: '#4a544a',
    alpha: 0.22,
    canopyAlpha: 0.08,
  });

  /* 田埂横线，把村子和菜地分开 */
  inkStroke(ctx, softEdge(-w * 0.02, w * 0.72, h * 0.548, h * 0.005, seed + 41, 24), {
    color: '#5a625b',
    width: 1,
    alpha: 0.24,
    seed: seed + 43,
    dry: 0.3,
    layers: 1,
    taper: false,
    step: 5,
  });

  /* 垄行：收敛点偏左，往画面下缘铺 */
  cropRows(ctx, {
    w,
    yFar: h * 0.565,
    yNear: h * 1.0,
    vanishX: w * 0.2,
    x0: -w * 0.1,
    x1: w * 0.82,
    rows: 10,
    seed: seed + 61,
    alpha: 0.28,
  });

  /* 垄上的菜：只画前四行，行内不等距 */
  const rnd = mulberry32(seed + 71);
  for (let r = 0; r < 4; r++) {
    const y = h * (0.625 + r * 0.1);
    const cnt = 9 + r * 4;
    const shrink = 0.32 + r * 0.14;
    for (let i = 0; i < cnt; i++) {
      const u = (i + 0.5) / cnt;
      const x = w * (0.2 - 0.2 * shrink + (0.56 + shrink * 0.4) * u * (0.9 + rnd() * 0.2));
      const s = (3.2 + rnd() * 3) * (1 + r * 0.32);
      inkStroke(
        ctx,
        [
          [x - s, y + (rnd() - 0.5) * 2],
          [x, y - s * 1.15],
          [x + s, y + (rnd() - 0.5) * 2],
        ],
        {
          color: '#4d5c3d',
          width: 0.8,
          alpha: 0.26 + r * 0.05,
          seed: seed + 800 + r * 50 + i,
          wobble: 0.3,
          dry: 0.18,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
  }

  /* 大棚：三架，大小不一，拱架朝同一个方向倒 */
  const greenhouse = (cx, cy, rw, rh, sd, alpha) => {
    const arc = [];
    const seg = 24;
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI + (i / seg) * Math.PI;
      arc.push([cx + Math.cos(a) * rw, cy + Math.sin(a) * rh]);
    }
    inkStroke(ctx, arc, {
      color: '#3a3f38',
      width: 1.5,
      alpha,
      seed: sd,
      wobble: 0.3,
      dry: 0.1,
      layers: 2,
      taper: true,
    });
    inkStroke(ctx, [[cx - rw, cy], [cx + rw, cy]], {
      color: '#3a3f38',
      width: 1,
      alpha: alpha * 0.7,
      seed: sd + 1,
      layers: 1,
      dry: 0.14,
    });
    for (let i = 1; i < 5; i++) {
      const u = i / 5;
      const ax = cx - rw + rw * 2 * u;
      const ah = rh * Math.sin(Math.PI * u);
      inkStroke(ctx, [[ax, cy], [ax + rh * 0.06, cy - ah]], {
        color: '#3a3f38',
        width: 0.6,
        alpha: alpha * 0.4,
        seed: sd + 10 + i,
        layers: 1,
        dry: 0.24,
      });
    }
  };

  greenhouse(w * 0.175, h * 0.6, w * 0.058, h * 0.042, seed + 91, 0.44);
  greenhouse(w * 0.285, h * 0.617, w * 0.046, h * 0.033, seed + 93, 0.32);
  greenhouse(w * 0.372, h * 0.642, w * 0.038, h * 0.027, seed + 97, 0.2);

  /* 田边小路，从下缘往上收 */
  inkStroke(
    ctx,
    [
      [w * 0.09, h * 1.0],
      [w * 0.15, h * 0.93],
      [w * 0.2, h * 0.862],
      [w * 0.235, h * 0.795],
    ],
    { color: '#8d948a', width: 1.4, alpha: 0.3, seed: seed + 101, dry: 0.34, layers: 1, taper: false }
  );

  /* 前景：左下角一块菜畦和一棵树，画面才站得住 */
  groundWash(ctx, { w, y0: h * 0.9, y1: h * 1.02, color: '#7c9160', alpha: 0.18, seed: seed + 111, x0: 0, x1: 0.66 });
  cornerTree(ctx, w, h, {
    x: 0.032,
    y: 1.04,
    size: 126,
    seed: seed + 121,
    alpha: 0.46,
    canopyAlpha: 0.18,
    lean: 0.1,
  });
}

/* ══════════════════════════════════════════════════════════
   场景注册表
   ══════════════════════════════════════════════════════════ */

export const SCENES = {
  yucun: sceneYucun,
  xiajiang: sceneXiajiang,
  qianjiangyuan: sceneQianjiangyuan,
  yunhe: sceneYunhe,
  pujiang: scenePujiang,
  xinxinqiao: sceneXinxinqiao,
};

/** 渲染到 canvas（等比、不拉伸） */
export function renderScene(canvas, key, dpr = 1) {
  const fn = SCENES[key];
  if (!fn) return;

  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 320);
  const h = Math.max(rect.height, 220);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, w, h);

  inVirtual(ctx, w, h, fn, key.charCodeAt(0) * 97 + 1001);
}

/** 供 app.js 直接把场景画到任意上下文 */
export function paintScene(ctx, key, w, h, seed) {
  const fn = SCENES[key];
  if (!fn) return;
  inVirtual(ctx, w, h, fn, seed ?? key.charCodeAt(0) * 97 + 1001);
}

/* ══════════════════════════════════════════════════════════
   账本游戏的山景
   ══════════════════════════════════════════════════════════ */

export function drawLedgerMountain(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;
  const { mountain: health100 = 100, mineDepth = 0, mode = 'mine', seed = 9001 } = s;
  const rnd = mulberry32(seed);
  const health = Math.max(0, Math.min(100, health100)) / 100;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(rect.width, 260);
  const H = Math.max(rect.height, 220);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f4efe4';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const sc = H / UNIT_H;
  const vw = W / sc;
  const vh = UNIT_H;
  ctx.scale(sc, sc);
  ctx.__inkGain = Math.max(1, Math.min(2.4, sc * 1.5));

  const sky = ctx.createLinearGradient(0, 0, 0, vh * 0.66);
  sky.addColorStop(0, hexA(health > 0.5 ? '#dfe8e4' : '#e6dcc6', 0.72));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, vw, vh * 0.66);

  cloudBand(ctx, vw * 0.08, vh * 0.1, vw * 0.34, {
    alpha: health > 0.6 ? 0.6 : 0.4,
    seed: seed + 5,
  });

  // 山：健康越差，脊线越碎、色越赭
  const topY = vh * 0.46;
  const amp = vh * (0.19 + (1 - health) * 0.05);
  const pts = ridge(vw, topY, amp, seed + 11, 2.2, 96);
  const broken = pts.map(([x, y], i) => {
    const t = i / (pts.length - 1);
    if (t > 0.2 && t < 0.5 && mineDepth > 0.05) {
      return [x, y + (rnd() - 0.5) * amp * 0.3 * mineDepth];
    }
    return [x, y];
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(broken[0][0], broken[0][1]);
  for (let i = 1; i < broken.length; i++) ctx.lineTo(broken[i][0], broken[i][1]);
  ctx.lineTo(vw, vh);
  ctx.lineTo(0, vh);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, topY - amp, 0, vh);
  const tone = health > 0.5 ? '#7c9160' : '#b1813f';
  g.addColorStop(0, hexA(tone, 0.07 + health * 0.15));
  g.addColorStop(0.5, hexA(tone, 0.05 + health * 0.1));
  g.addColorStop(1, hexA(tone, 0.02 + health * 0.05));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  inkStroke(ctx, broken, {
    color: health > 0.5 ? '#2b2f2b' : '#5c4526',
    width: 2,
    alpha: 0.56,
    seed: seed + 13,
    wobble: 1,
    dry: 0.12,
    layers: 2,
    taper: false,
  });

  if (mineDepth > 0.02) {
    pit(ctx, vw * 0.31, vh * 0.72, {
      r: vw * 0.12,
      depth: Math.min(1, mineDepth),
      seed: seed + 21,
      alpha: 0.5,
      color: '#8a6733',
    });
  }

  haze(ctx, vw, vh * 0.72, { alpha: 0.7, seed: seed + 31, height: vh * 0.06 });

  // 树：健康好才有
  const treeCount = Math.round(health * 6);
  for (let i = 0; i < treeCount; i++) {
    const x = vw * (0.5 + (i / Math.max(treeCount, 1)) * 0.44 + rnd() * 0.02);
    const y = vh * (0.78 + rnd() * 0.06);
    treeShape(ctx, x, y, {
      size: 34 + rnd() * 26,
      seed: seed + 100 + i * 17,
      color: '#2f3a29',
      alpha: 0.24 + health * 0.36,
      canopy: '#3f4a38',
      canopyAlpha: 0.1 + health * 0.12,
      shape: i % 3 === 0 ? 'pine' : 'round',
    });
  }

  water(ctx, vw * 0.02, vh * 0.9, vh * 0.98, {
    seed: seed + 41,
    rows: 3,
    alpha: 0.12 + health * 0.14,
  });

  ctx.save();
  ctx.fillStyle = 'rgba(90,98,91,0.5)';
  ctx.font = '11px "Kaiti SC", KaiTi, 楷体, serif';
  ctx.textAlign = 'left';
  const label =
    mode === 'mine' ? '开采中' : mode === 'restore' ? '休养中' : mode === 'bamboo' ? '竹林' : '生态产业';
  ctx.fillText(label, 14, 24);
  ctx.restore();

  ctx.restore();
}
