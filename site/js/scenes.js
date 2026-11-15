/**
 * scenes.js — 六个点位的手绘场景
 *
 * 构图语言：南宋山水的做法，大块面、少元素、多留白。
 * 不用点阵撒树，用笔勾形，这样宽画幅上也不会糊成散沙。
 *
 * 每个场景都在「虚拟画布」里绘制（纵向固定 700 单位），
 * 横向按实际宽高比推算，所以屏幕多大都保持同样的比例关系。
 */

import { inkStroke, rockCluster, pit, terrace, mulberry32, hexA } from './brush.js';
import { mountain, ridge, treeShape, haze, water, hut, cloudBand } from './inkfig.js';

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

/* ══════════════════════════════════════════════════════════
   通用：远景三层
   ══════════════════════════════════════════════════════════ */

function backdrop(ctx, w, h, o = {}) {
  const { seed = 1, baseY = h * 0.46, peaks = 2.4, tone = '#7c9160' } = o;

  // 最远一层：只有线，最淡
  const far = ridge(w, baseY - h * 0.1, h * 0.11, seed + 47, peaks * 1.3);
  inkStroke(ctx, far, {
    color: '#5a625b',
    width: 1.1,
    alpha: 0.2,
    seed: seed + 11,
    wobble: 1.1,
    jitter: 0.3,
    dry: 0.18,
    layers: 1,
    taper: false,
    step: 5,
  });

  // 中景：有线有块面
  mountain(ctx, w, h, {
    seed: seed + 3,
    ridgeY: baseY - h * 0.045,
    amp: h * 0.14,
    y0: h * 0.72,
    peaks,
    tone,
    toneAlpha: 0.1,
    lineColor: '#3a3f38',
    lineAlpha: 0.38,
    lineWidth: 1.5,
    texture: 2,
  });

  // 近山：块面更重，脊线更明确
  mountain(ctx, w, h, {
    seed: seed + 7,
    ridgeY: baseY + h * 0.05,
    amp: h * 0.1,
    y0: h * 0.86,
    peaks: peaks * 1.5,
    tone,
    toneAlpha: 0.15,
    lineColor: '#2b2f2b',
    lineAlpha: 0.52,
    lineWidth: 2,
    texture: 3,
  });

  // 山腰的雾
  haze(ctx, w, baseY + h * 0.09, { alpha: 0.72, seed: seed + 21, height: h * 0.08 });

  // 天上两朵云
  cloudBand(ctx, w * 0.12, h * 0.14, w * 0.3, { alpha: 0.55, seed: seed + 61 });
  cloudBand(ctx, w * 0.55, h * 0.09, w * 0.26, { alpha: 0.45, seed: seed + 63 });
}

/* ══════════════════════════════════════════════════════════
   一 · 安吉余村：一半是矿，一半是山
   ══════════════════════════════════════════════════════════ */

export function sceneYucun(ctx, w, h, seed = 1001) {
  const rnd = mulberry32(seed);

  // 天
  cloudBand(ctx, w * 0.1, h * 0.12, w * 0.34, { alpha: 0.55, seed: seed + 5 });

  // 左：被开采过的山，赭石，脊线破碎
  mountain(ctx, w, h, {
    seed: seed + 11,
    ridgeY: h * 0.44,
    amp: h * 0.15,
    y0: h * 0.8,
    peaks: 1.8,
    tone: '#b1813f',
    toneAlpha: 0.19,
    lineColor: '#5c4526',
    lineAlpha: 0.55,
    lineWidth: 2.2,
    texture: 3,
  });

  // 矿坑与碎石
  pit(ctx, w * 0.19, h * 0.69, { r: w * 0.1, depth: 0.9, seed: seed + 31, alpha: 0.5 });
  rockCluster(ctx, w * 0.1, h * 0.76, { w: w * 0.08, h: h * 0.032, seed: seed + 41, alpha: 0.34 });
  rockCluster(ctx, w * 0.29, h * 0.79, { w: w * 0.07, h: h * 0.026, seed: seed + 43, alpha: 0.28 });

  haze(ctx, w, h * 0.79, { alpha: 0.8, seed: seed + 51, height: h * 0.06 });

  // 右：复绿的山，圆润，竹
  mountain(ctx, w, h, {
    seed: seed + 61,
    ridgeY: h * 0.46,
    amp: h * 0.12,
    y0: h * 0.9,
    peaks: 2.1,
    tone: '#7c9160',
    toneAlpha: 0.2,
    lineColor: '#2b2f2b',
    lineAlpha: 0.58,
    lineWidth: 2,
    texture: 2,
  });

  // 右坡上的几棵树，大小错落
  const trees = [
    [0.58, 0.72, 52],
    [0.66, 0.75, 64],
    [0.74, 0.71, 46],
    [0.82, 0.76, 58],
    [0.9, 0.73, 42],
  ];
  trees.forEach(([tx, ty, ts], i) => {
    treeShape(ctx, w * tx, h * ty, {
      size: ts,
      seed: seed + 100 + i * 17,
      color: '#3a3f38',
      alpha: 0.6,
      canopy: '#4d5c3d',
      canopyAlpha: 0.16,
      shape: i % 3 === 0 ? 'pine' : 'round',
    });
  });

  // 前景：新房与小河
  hut(ctx, w * 0.62, h * 0.88, { size: 34, seed: seed + 201, alpha: 0.55 });
  hut(ctx, w * 0.71, h * 0.91, { size: 28, seed: seed + 203, alpha: 0.46, flip: true });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.95);
  ctx.quadraticCurveTo(w * 0.62, h * 0.92, w * 0.96, h * 0.96);
  ctx.lineTo(w * 0.96, h);
  ctx.lineTo(w * 0.34, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * 0.93, 0, h);
  g.addColorStop(0, hexA('#6d8f8a', 0.1));
  g.addColorStop(1, hexA('#6d8f8a', 0.22));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  water(ctx, w * 0.38, h * 0.94, h * 0.99, { seed: seed + 91, rows: 3, alpha: 0.24 });

  // 一条山道
  inkStroke(
    ctx,
    [
      [w * 0.02, h * 0.95],
      [w * 0.16, h * 0.9],
      [w * 0.3, h * 0.94],
      [w * 0.48, h * 0.9],
      [w * 0.6, h * 0.95],
    ],
    { color: '#8d948a', width: 1.1, alpha: 0.3, seed: seed + 71, dry: 0.34, layers: 1 }
  );

  void rnd;
}

/* ══════════════════════════════════════════════════════════
   二 · 下姜村：一条溪穿过村子
   ══════════════════════════════════════════════════════════ */

export function sceneXiajiang(ctx, w, h, seed = 2001) {
  const rnd = mulberry32(seed);

  cloudBand(ctx, w * 0.55, h * 0.1, w * 0.32, { alpha: 0.5, seed: seed + 5 });

  backdrop(ctx, w, h, { seed: seed + 11, baseY: h * 0.42, peaks: 2.2 });

  // 溪：从右上蜿蜒到左下
  const stream = [];
  for (let i = 0; i <= 34; i++) {
    const t = i / 34;
    stream.push([
      w * (0.52 + t * 0.5),
      h * (0.4 + t * 0.56 + Math.sin(t * 4.2) * 0.03),
    ]);
  }
  inkStroke(ctx, stream, {
    color: '#6d8f8a',
    width: 2.6,
    alpha: 0.34,
    seed: seed + 31,
    dry: 0.08,
    layers: 2,
  });

  haze(ctx, w, h * 0.6, { alpha: 0.62, seed: seed + 41, height: h * 0.07 });

  // 沿溪的屋子，高低错落
  const huts = [
    [0.28, 0.63, 30, 0],
    [0.4, 0.67, 26, 1],
    [0.18, 0.72, 24, 0],
    [0.32, 0.77, 28, 1],
    [0.44, 0.81, 22, 0],
    [0.22, 0.86, 26, 0],
    [0.36, 0.91, 21, 1],
  ];
  huts.forEach(([hx, hy, hs, flip], i) => {
    hut(ctx, w * hx, h * hy, {
      size: hs,
      seed: seed + 400 + i * 7,
      alpha: 0.55,
      flip: !!flip,
    });
  });

  // 屋后的树
  for (let i = 0; i < 4; i++) {
    treeShape(ctx, w * (0.14 + i * 0.11), h * (0.58 + rnd() * 0.05), {
      size: 40 + rnd() * 22,
      seed: seed + 500 + i * 13,
      alpha: 0.5,
      canopyAlpha: 0.14,
    });
  }

  // 溪面波光
  water(ctx, w * 0.5, h * 0.88, h * 0.99, { seed: seed + 61, rows: 4, alpha: 0.22 });

  // 前景老樟
  treeShape(ctx, w * 0.075, h * 0.96, {
    size: 128,
    seed: seed + 71,
    color: '#2b2f2b',
    alpha: 0.62,
    canopy: '#3f4a38',
    canopyAlpha: 0.18,
  });
}

/* ══════════════════════════════════════════════════════════
   三 · 钱江源：林深水长
   ══════════════════════════════════════════════════════════ */

export function sceneQianjiangyuan(ctx, w, h, seed = 3001) {
  const rnd = mulberry32(seed);

  // 云压得低
  cloudBand(ctx, w * 0.06, h * 0.1, w * 0.36, { alpha: 0.6, seed: seed + 5 });
  cloudBand(ctx, w * 0.58, h * 0.07, w * 0.3, { alpha: 0.5, seed: seed + 7 });

  // 最远一层：淡线，不做飞白，避免断成虚线
  const far = ridge(w, h * 0.24, h * 0.1, seed + 47, 3.4);
  inkStroke(ctx, far, {
    color: '#5a625b',
    width: 1.2,
    alpha: 0.24,
    seed: seed + 11,
    wobble: 0.9,
    jitter: 0.2,
    dry: 0,
    layers: 1,
    taper: false,
    step: 4,
  });

  // 中景山：块面收到雾线
  mountain(ctx, w, h, {
    seed: seed + 21,
    ridgeY: h * 0.38,
    amp: h * 0.13,
    y0: h * 0.6,
    peaks: 2.4,
    tone: '#4d5c3d',
    toneAlpha: 0.16,
    lineColor: '#3a3f38',
    lineAlpha: 0.46,
    lineWidth: 1.8,
    texture: 3,
  });

  // 中景林：贴着山脚长，不要浮在空中
  const clusters = [
    [0.03, 0.62, 44, 3],
    [0.15, 0.64, 58, 4],
    [0.27, 0.6, 38, 2],
    [0.38, 0.63, 50, 3],
    [0.5, 0.6, 36, 2],
    [0.63, 0.64, 54, 4],
    [0.76, 0.61, 42, 3],
    [0.88, 0.64, 56, 4],
    [0.97, 0.61, 34, 2],
  ];
  clusters.forEach(([cx, cy, cs, n], ci) => {
    for (let i = 0; i < n; i++) {
      const ox = (rnd() - 0.5) * cs * 1.2;
      const oy = (rnd() - 0.5) * cs * 0.22;
      // 同一簇的树，主干长度接近，冠也接近，看起来才像一片林
      const base = cs * (0.75 + rnd() * 0.4);
      treeShape(ctx, w * cx + ox, h * cy + oy, {
        size: base,
        seed: seed + 600 + ci * 37 + i * 11,
        color: '#2f3a29',
        alpha: 0.52,
        canopy: '#44523a',
        canopyAlpha: 0.2,
        shape: rnd() > 0.72 ? 'pine' : 'round',
        trunkRatio: 0.52,
      });
    }
  });

  haze(ctx, w, h * 0.68, { alpha: 0.92, seed: seed + 81, height: h * 0.075 });

  // 源头细流：从雾里下山
  const spring = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    spring.push([w * (0.44 + Math.sin(t * 3.1) * 0.045), h * (0.48 + t * 0.46)]);
  }
  inkStroke(ctx, spring, {
    color: '#6d8f8a',
    width: 1.6,
    alpha: 0.46,
    seed: seed + 31,
    dry: 0.16,
    layers: 2,
  });

  // 前景潭
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.99);
  ctx.quadraticCurveTo(w * 0.5, h * 0.855, w * 0.94, h * 0.99);
  ctx.lineTo(w * 0.94, h);
  ctx.lineTo(w * 0.06, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * 0.87, 0, h);
  g.addColorStop(0, hexA('#6d8f8a', 0.12));
  g.addColorStop(1, hexA('#6d8f8a', 0.26));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  water(ctx, w * 0.14, h * 0.93, h * 0.995, { seed: seed + 41, rows: 4, alpha: 0.3 });

  // 前景两角的树，压住画面
  treeShape(ctx, w * 0.05, h * 1.0, {
    size: 150,
    seed: seed + 901,
    color: '#242d20',
    alpha: 0.6,
    canopy: '#333f2c',
    canopyAlpha: 0.24,
    trunkRatio: 0.56,
  });
  treeShape(ctx, w * 0.95, h * 0.985, {
    size: 130,
    seed: seed + 903,
    color: '#242d20',
    alpha: 0.54,
    canopy: '#333f2c',
    canopyAlpha: 0.21,
    trunkRatio: 0.56,
  });

  rockCluster(ctx, w * 0.23, h * 0.94, { w: w * 0.06, h: h * 0.024, seed: seed + 51, alpha: 0.36 });
  rockCluster(ctx, w * 0.75, h * 0.96, { w: w * 0.05, h: h * 0.02, seed: seed + 53, alpha: 0.3 });

  // 山腰的云，把中间的空补上
  haze(ctx, w, h * 0.46, { alpha: 0.62, seed: seed + 91, height: h * 0.05 });

  // 一只鸟
  inkStroke(
    ctx,
    [
      [w * 0.7, h * 0.14],
      [w * 0.723, h * 0.118],
      [w * 0.746, h * 0.14],
    ],
    { color: '#2b2f2b', width: 1, alpha: 0.42, seed: seed + 61, layers: 1, dry: 0, taper: false }
  );
}

/* ══════════════════════════════════════════════════════════
   四 · 云和梯田：等高线的秩序
   ══════════════════════════════════════════════════════════ */

export function sceneYunhe(ctx, w, h, seed = 4001) {
  const rnd = mulberry32(seed);

  cloudBand(ctx, w * 0.08, h * 0.08, w * 0.4, { alpha: 0.62, seed: seed + 5 });
  cloudBand(ctx, w * 0.62, h * 0.13, w * 0.26, { alpha: 0.44, seed: seed + 7 });

  // 远山
  mountain(ctx, w, h, {
    seed: seed + 11,
    ridgeY: h * 0.27,
    amp: h * 0.09,
    y0: h * 0.48,
    peaks: 2.6,
    tone: '#7c9160',
    toneAlpha: 0.1,
    lineColor: '#5a625b',
    lineAlpha: 0.28,
    lineWidth: 1.2,
    texture: 1,
  });

  haze(ctx, w, h * 0.46, { alpha: 0.78, seed: seed + 21, height: h * 0.06 });

  // 梯田：层层等高弧
  terrace(ctx, { x: w * 0.02, y: h * 0.3, w: w * 0.96, h: h * 0.6 }, {
    seed: seed + 31,
    rows: 20,
    alpha: 0.42,
    color: '#7c9160',
    width: 1.05,
  });

  // 第二层错位的田，让密度不均匀
  terrace(ctx, { x: w * 0.18, y: h * 0.36, w: w * 0.5, h: h * 0.4 }, {
    seed: seed + 33,
    rows: 10,
    alpha: 0.2,
    color: '#5a625b',
    width: 0.7,
  });

  // 田埂水光
  for (let i = 0; i < 16; i++) {
    const x = w * (0.12 + rnd() * 0.74);
    const y = h * (0.34 + rnd() * 0.44);
    inkStroke(
      ctx,
      [
        [x, y],
        [x + 5 + rnd() * 10, y + (rnd() - 0.5) * 1.2],
      ],
      { color: '#6d8f8a', width: 0.8, alpha: 0.24, seed: seed + 700 + i, layers: 1, dry: 0.2 }
    );
  }

  // 田间小屋
  hut(ctx, w * 0.25, h * 0.64, { size: 24, seed: seed + 41, alpha: 0.5 });
  hut(ctx, w * 0.32, h * 0.68, { size: 20, seed: seed + 43, alpha: 0.44, flip: true });
  hut(ctx, w * 0.4, h * 0.72, { size: 22, seed: seed + 45, alpha: 0.48 });

  haze(ctx, w, h * 0.88, { alpha: 0.6, seed: seed + 51, height: h * 0.05 });

  // 右下几棵树
  treeShape(ctx, w * 0.86, h * 0.88, { size: 70, seed: seed + 61, alpha: 0.5, canopyAlpha: 0.16 });
  treeShape(ctx, w * 0.93, h * 0.92, { size: 58, seed: seed + 63, alpha: 0.44, canopyAlpha: 0.14 });

  // 田间小路
  inkStroke(
    ctx,
    [
      [w * 0.56, h * 0.98],
      [w * 0.64, h * 0.9],
      [w * 0.58, h * 0.83],
      [w * 0.68, h * 0.76],
    ],
    { color: '#8d948a', width: 1.4, alpha: 0.34, seed: seed + 71, dry: 0.3, layers: 1 }
  );
}

/* ══════════════════════════════════════════════════════════
   五 · 浦江：治水之后的河
   ══════════════════════════════════════════════════════════ */

export function scenePujiang(ctx, w, h, seed = 5001) {
  const rnd = mulberry32(seed);

  cloudBand(ctx, w * 0.5, h * 0.1, w * 0.34, { alpha: 0.52, seed: seed + 5 });

  // 两岸低山
  mountain(ctx, w, h, {
    seed: seed + 11,
    ridgeY: h * 0.32,
    amp: h * 0.1,
    y0: h * 0.55,
    peaks: 1.9,
    tone: '#7c9160',
    toneAlpha: 0.11,
    lineColor: '#3a3f38',
    lineAlpha: 0.32,
    lineWidth: 1.4,
    texture: 1,
  });

  haze(ctx, w, h * 0.5, { alpha: 0.72, seed: seed + 21, height: h * 0.06 });

  // 河面
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.57);
  ctx.bezierCurveTo(w * 0.3, h * 0.52, w * 0.68, h * 0.63, w, h * 0.56);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * 0.54, 0, h);
  g.addColorStop(0, hexA('#6d8f8a', 0.24));
  g.addColorStop(0.55, hexA('#6d8f8a', 0.13));
  g.addColorStop(1, hexA('#6d8f8a', 0.06));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // 河岸线
  const bank = [];
  for (let i = 0; i <= 44; i++) {
    const t = i / 44;
    bank.push([
      w * t,
      h * 0.57 +
        Math.sin(t * Math.PI * 2.1) * h * 0.02 +
        Math.sin(t * Math.PI * 6.2) * h * 0.005,
    ]);
  }
  inkStroke(ctx, bank, {
    color: '#2b2f2b',
    width: 1.7,
    alpha: 0.52,
    seed: seed + 31,
    dry: 0.14,
    layers: 2,
    taper: false,
  });

  // 对岸的房
  const town = [
    [0.04, 0.55, 26],
    [0.13, 0.53, 30],
    [0.24, 0.56, 24],
    [0.62, 0.54, 28],
    [0.73, 0.57, 25],
    [0.86, 0.54, 27],
  ];
  town.forEach(([hx, hy, hs], i) => {
    hut(ctx, w * hx, h * hy, {
      size: hs,
      seed: seed + 800 + i * 7,
      alpha: 0.5,
      flip: i % 2 === 0,
    });
  });

  // 对岸的树，柳
  treeShape(ctx, w * 0.36, h * 0.55, { size: 56, seed: seed + 851, alpha: 0.5, canopyAlpha: 0.15, shape: 'willow' });
  treeShape(ctx, w * 0.48, h * 0.53, { size: 48, seed: seed + 853, alpha: 0.44, canopyAlpha: 0.13, shape: 'willow' });
  treeShape(ctx, w * 0.58, h * 0.55, { size: 44, seed: seed + 855, alpha: 0.4, canopyAlpha: 0.12, shape: 'willow' });

  // 水面
  water(ctx, 0, h * 0.62, h * 0.98, { seed: seed + 41, rows: 8, alpha: 0.26 });

  // 一条小船
  inkStroke(
    ctx,
    [
      [w * 0.42, h * 0.84],
      [w * 0.465, h * 0.88],
      [w * 0.51, h * 0.84],
    ],
    { color: '#2b2f2b', width: 1.3, alpha: 0.5, seed: seed + 51, dry: 0.1, layers: 2 }
  );
  inkStroke(
    ctx,
    [
      [w * 0.465, h * 0.85],
      [w * 0.468, h * 0.8],
    ],
    { color: '#2b2f2b', width: 0.9, alpha: 0.42, seed: seed + 53, layers: 1, dry: 0 }
  );

  // 倒影
  for (let i = 0; i < 7; i++) {
    const x = w * (0.08 + rnd() * 0.84);
    inkStroke(
      ctx,
      [
        [x, h * 0.62],
        [x + (rnd() - 0.5) * 2, h * (0.68 + rnd() * 0.12)],
      ],
      { color: '#8d948a', width: 0.6, alpha: 0.14, seed: seed + 950 + i, layers: 1, dry: 0.34 }
    );
  }
}

/* ══════════════════════════════════════════════════════════
   六 · 新溪桥村：菜地、大棚、远山
   ══════════════════════════════════════════════════════════ */

export function sceneXinxinqiao(ctx, w, h, seed = 6001) {
  const rnd = mulberry32(seed);

  cloudBand(ctx, w * 0.14, h * 0.1, w * 0.34, { alpha: 0.55, seed: seed + 5 });

  // 远山
  mountain(ctx, w, h, {
    seed: seed + 11,
    ridgeY: h * 0.3,
    amp: h * 0.09,
    y0: h * 0.5,
    peaks: 2.4,
    tone: '#7c9160',
    toneAlpha: 0.11,
    lineColor: '#5a625b',
    lineAlpha: 0.3,
    lineWidth: 1.3,
    texture: 1,
  });

  haze(ctx, w, h * 0.48, { alpha: 0.82, seed: seed + 21, height: h * 0.07 });

  // 菜地垄：越近越疏
  const fieldTop = h * 0.52;
  const fieldH = h * 0.42;
  for (let r = 0; r < 7; r++) {
    const t = r / 6;
    const y = fieldTop + fieldH * t;
    const seg = 16;
    const shrink = t * 0.05;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      pts.push([w * (shrink + (1 - shrink * 2) * u), y + Math.sin(u * 4 + r) * 1.2]);
    }
    inkStroke(ctx, pts, {
      color: '#5a625b',
      width: 0.85,
      alpha: 0.18 + t * 0.12,
      seed: seed + 900 + r * 11,
      wobble: 0.5,
      dry: 0.22,
      layers: 1,
      taper: false,
      step: 5,
    });
  }

  // 垄上的菜：成行的小弧，不做点阵
  for (let r = 0; r < 5; r++) {
    const y = h * (0.56 + r * 0.075);
    const cnt = 11 + r * 3;
    for (let i = 0; i < cnt; i++) {
      const x = w * (0.06 + (i / cnt) * 0.88 + (rnd() - 0.5) * 0.014);
      const s = 3 + rnd() * 3;
      inkStroke(
        ctx,
        [
          [x - s, y],
          [x, y - s * 1.2],
          [x + s, y],
        ],
        {
          color: '#4d5c3d',
          width: 0.75,
          alpha: 0.3,
          seed: seed + 1000 + r * 40 + i,
          wobble: 0.3,
          dry: 0.16,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
  }

  // 大棚：半圆拱
  const greenhouse = (cx, cy, rw, rh, sd) => {
    const arc = [];
    const seg = 26;
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI + (i / seg) * Math.PI;
      arc.push([cx + Math.cos(a) * rw, cy + Math.sin(a) * rh]);
    }
    inkStroke(ctx, arc, {
      color: '#3a3f38',
      width: 1.4,
      alpha: 0.5,
      seed: sd,
      dry: 0.1,
      layers: 2,
    });
    inkStroke(
      ctx,
      [
        [cx - rw, cy],
        [cx + rw, cy],
      ],
      { color: '#3a3f38', width: 1, alpha: 0.4, seed: sd + 1, layers: 1, dry: 0.12 }
    );
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const ax = cx - rw + rw * 2 * t;
      const ah = rh * Math.sin(Math.PI * t);
      inkStroke(
        ctx,
        [
          [ax, cy],
          [ax, cy - ah],
        ],
        { color: '#3a3f38', width: 0.6, alpha: 0.24, seed: sd + 10 + i, layers: 1, dry: 0.2 }
      );
    }
  };

  greenhouse(w * 0.17, h * 0.6, w * 0.07, h * 0.05, seed + 31);
  greenhouse(w * 0.34, h * 0.64, w * 0.055, h * 0.04, seed + 33);

  // 村舍
  hut(ctx, w * 0.64, h * 0.55, { size: 30, seed: seed + 41, alpha: 0.52 });
  hut(ctx, w * 0.73, h * 0.59, { size: 25, seed: seed + 43, alpha: 0.44, flip: true });

  // 田边小路
  inkStroke(
    ctx,
    [
      [w * 0.02, h * 0.98],
      [w * 0.24, h * 0.93],
      [w * 0.5, h * 0.97],
      [w * 0.76, h * 0.91],
      [w * 0.98, h * 0.97],
    ],
    { color: '#8d948a', width: 1.1, alpha: 0.34, seed: seed + 51, dry: 0.3, layers: 1 }
  );

  // 前景树
  treeShape(ctx, w * 0.9, h * 0.62, { size: 76, seed: seed + 61, alpha: 0.52, canopyAlpha: 0.16 });
  treeShape(ctx, w * 0.96, h * 0.7, { size: 54, seed: seed + 63, alpha: 0.44, canopyAlpha: 0.13 });

  // 一只水桶
  inkStroke(
    ctx,
    [
      [w * 0.56, h * 0.96],
      [w * 0.564, h * 0.92],
      [w * 0.582, h * 0.92],
      [w * 0.586, h * 0.96],
      [w * 0.56, h * 0.96],
    ],
    { color: '#5a625b', width: 0.9, alpha: 0.34, seed: seed + 71, layers: 1, dry: 0.1 }
  );
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
