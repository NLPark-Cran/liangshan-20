/**
 * inkfig.js — 水墨图元 v2
 *
 * 这一版的三个根本改变：
 *
 * 1. 雾不再是「画上去的白」。
 *    整个场景先画在一层透明墨层上，雾是用 destination-out 把墨擦掉。
 *    宣纸自己承担雾，所以永远没有白色硬边。
 *
 * 2. 山形不再随机生成。
 *    随机只能得到「丘陵」。每座山由控制点剖面（knots）单调三次插值成形，
 *    构图由场景决定：哪边是断崖、哪边化进雾里，都写在剖面里。
 *
 * 3. 树用点叶法。
 *    干与枝是渐细的带（ribbon），叶是从枝梢散出的成组短点。
 *    叶点压住枝梢，冠与干自然长在一起，不会「一根棍顶一团棉花」。
 */

import { inkStroke, mulberry32, hexA } from './brush.js';

/* ────────────────────────── 剖面 ────────────────────────── */

/**
 * 单调三次插值（Fritsch–Carlson），不会过冲。
 * knots: [[t, h, 'lin'?], ...]  t 递增，h 为相对高度
 * 第三个元素写 'lin' 时，从**前一个**控制点到本点的这一段是直线（做断崖用）
 */
export function sampleProfile(knots, n = 140) {
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const N = xs.length;
  if (N === 1) return Array.from({ length: n + 1 }, (_, i) => [i / n, ys[0]]);

  const d = [];
  for (let i = 0; i < N - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-6);
  const m = new Array(N);
  m[0] = d[0];
  m[N - 1] = d[N - 2];
  for (let i = 1; i < N - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < N - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }

  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let i = 0;
    while (i < N - 2 && t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i] || 1e-6;
    const u = Math.max(0, Math.min(1, (t - xs[i]) / h));
    let v;
    if (knots[i + 1][2] === 'lin') {
      v = ys[i] + (ys[i + 1] - ys[i]) * u;
    } else {
      const u2 = u * u;
      const u3 = u2 * u;
      v =
        (2 * u3 - 3 * u2 + 1) * ys[i] +
        (u3 - 2 * u2 + u) * h * m[i] +
        (-2 * u3 + 3 * u2) * ys[i + 1] +
        (u3 - u2) * h * m[i + 1];
    }
    out.push([t, v]);
  }
  return out;
}

/** 剖面转画布点列 */
export function profilePts(knots, vw, baseY, amp, n = 150) {
  return sampleProfile(knots, n).map(([t, h]) => [vw * t, baseY - h * amp]);
}

/** 沿程浓淡：fade = [[t, factor], ...]，线性过渡 */
function fadeAt(t, fade) {
  if (!fade || !fade.length) return 1;
  if (t <= fade[0][0]) return fade[0][1];
  for (let i = 0; i < fade.length - 1; i++) {
    const a = fade[i];
    const b = fade[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0] || 1e-6);
      return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k);
    }
  }
  return fade[fade.length - 1][1];
}

function slopeAt(pts, i) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return (b[1] - a[1]) / (b[0] - a[0] || 1e-6);
}

/* ────────────────────────── 山体 ────────────────────────── */

/**
 * 一块山。
 *
 * 只有块面、脊线、皴、苔点四样东西。脊线按 fade 分段画，
 * 淡的那一段会化进纸里——这是南宋山水的「远」，不是靠加白色。
 */
export function mass(ctx, o = {}) {
  const {
    vw,
    baseY,
    amp,
    knots,
    footY = baseY + amp * 1.5,
    tone = '#7c9160',
    toneAlpha = 0.15,
    lineColor = '#2b2f2b',
    lineAlpha = 0.5,
    lineWidth = 1.8,
    dry = 0.12,
    layers = 1,
    fade = null,
    cun = 0,
    cunLen = 0.3,
    cunAlpha = 0.3,
    moss = 0,
    seed = 1,
    footFade = 0,
    shade = null,
  } = o;

  const pts = profilePts(knots, vw, baseY, amp, 150);
  const rnd = mulberry32(seed);

  /* 块面 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(pts[pts.length - 1][0], footY);
  ctx.lineTo(pts[0][0], footY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, baseY - amp, 0, footY);
  g.addColorStop(0, hexA(tone, toneAlpha * 1.5));
  g.addColorStop(0.3, hexA(tone, toneAlpha * 0.95));
  g.addColorStop(0.66, hexA(tone, toneAlpha * 0.5));
  g.addColorStop(1, hexA(tone, toneAlpha * 0.06));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  /* 阴面：一侧压深，山才有体积 */
  if (shade) {
    const [t0, t1, amt] = shade;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[pts.length - 1][0], footY);
    ctx.lineTo(pts[0][0], footY);
    ctx.closePath();
    ctx.clip();
    const x0 = vw * t0;
    const x1 = vw * t1;
    const sg = ctx.createLinearGradient(x0, 0, x1, 0);
    sg.addColorStop(0, hexA(lineColor, amt));
    sg.addColorStop(1, hexA(lineColor, 0));
    ctx.fillStyle = sg;
    const top = baseY - amp * 1.1;
    ctx.fillRect(x0 - (x1 - x0) * 0.2, top, (x1 - x0) * 1.4, footY - top);
    ctx.restore();
  }

  /* 脊线：分段，各有浓淡 */
  const segs = 16;
  for (let k = 0; k < segs; k++) {
    const i0 = Math.floor(((pts.length - 1) * k) / segs);
    const i1 = Math.min(pts.length - 1, Math.floor(((pts.length - 1) * (k + 1)) / segs) + 2);
    const a = lineAlpha * fadeAt((k + 0.5) / segs, fade);
    if (a < 0.015) continue;
    inkStroke(ctx, pts.slice(i0, i1 + 1), {
      color: lineColor,
      width: lineWidth * (0.85 + 0.3 * fadeAt((k + 0.5) / segs, fade)),
      alpha: a,
      seed: seed + k * 17,
      wobble: Math.max(0.5, lineWidth * 0.55),
      jitter: 0.25,
      dry,
      layers,
      taper: false,
      step: 4,
    });
  }

  /* 皴：成组，不匀撒 */
  if (cun > 0) {
    const groups = Math.max(1, Math.round(cun / 3));
    for (let gi = 0; gi < groups; gi++) {
      const ct = 0.08 + (gi + rnd() * 0.6) / groups;
      const cnt = Math.max(2, Math.round(cun / groups));
      for (let i = 0; i < cnt; i++) {
        const t = Math.min(1, Math.max(0, ct + (rnd() - 0.5) * 0.14));
        const idx = Math.round(t * (pts.length - 1));
        const p = pts[idx];
        const sl = slopeAt(pts, idx);
        const len = amp * cunLen * (0.7 + rnd() * 0.8);
        const f = fadeAt(t, fade);
        if (f < 0.12) continue;
        const dx = sl * len * 0.55 + (rnd() - 0.5) * len * 0.2;
        inkStroke(
          ctx,
          [
            [p[0] + (rnd() - 0.5) * 3, p[1] + 2],
            [p[0] + dx * 0.55, p[1] + len * 0.55],
            [p[0] + dx, p[1] + len],
          ],
          {
            color: lineColor,
            width: Math.max(0.7, lineWidth * 0.5),
            alpha: lineAlpha * cunAlpha * f * (0.6 + rnd() * 0.7),
            seed: seed + 300 + gi * 31 + i * 7,
            wobble: 0.5,
            jitter: 0.2,
            dry: 0.34,
            layers: 1,
            taper: false,
            step: 3,
          }
        );
      }
    }
  }

  /* 苔点：压在脊线上，聚一丛最有神 */
  if (moss > 0) {
    const mt = 0.3 + rnd() * 0.35;
    for (let i = 0; i < moss; i++) {
      const t = Math.min(0.97, Math.max(0.03, mt + (rnd() - 0.5) * 0.3));
      const idx = Math.round(t * (pts.length - 1));
      const p = pts[idx];
      const f = fadeAt(t, fade);
      if (f < 0.35) continue;
      ctx.save();
      ctx.fillStyle = hexA(lineColor, lineAlpha * 0.85 * f);
      ctx.beginPath();
      ctx.ellipse(
        p[0] + (rnd() - 0.5) * 5,
        p[1] - 1 + (rnd() - 0.5) * 3,
        1.7 + rnd() * 1.6,
        1.3 + rnd() * 1.1,
        rnd() * 3,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  /* 山脚化开 */
  if (footFade > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const yy = baseY + (footY - baseY) * 0.55;
    const gg = ctx.createLinearGradient(0, yy, 0, footY);
    gg.addColorStop(0, `rgba(0,0,0,0)`);
    gg.addColorStop(1, `rgba(0,0,0,${footFade})`);
    ctx.fillStyle = gg;
    ctx.fillRect(0, yy, vw, footY - yy);
    ctx.restore();
  }
}

/** 旧接口：随机山脊（账本与兼容用） */
export function ridge(w, y, amp, seed, peaks = 3, seg = 96) {
  const rnd = mulberry32(seed);
  const knots = [[0, 0.05]];
  const n = Math.max(2, Math.round(peaks));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    knots.push([t - 0.14, 0.28 + rnd() * 0.22]);
    knots.push([t, 0.55 + rnd() * 0.45]);
    knots.push([t + 0.14, 0.3 + rnd() * 0.24]);
  }
  knots.push([1, 0.06]);
  knots.sort((a, b) => a[0] - b[0]);
  return sampleProfile(knots, seg).map(([t, h]) => [w * t, y - h * amp]);
}

/** 旧接口：通用山体（账本用） */
export function mountain(ctx, w, h, o = {}) {
  const {
    seed = 1,
    ridgeY = h * 0.45,
    amp = h * 0.16,
    y0 = h,
    peaks = 2.6,
    tone = '#7c9160',
    toneAlpha = 0.16,
    lineColor = '#2b2f2b',
    lineAlpha = 0.6,
    lineWidth = 1.8,
    texture = 3,
  } = o;
  const rnd = mulberry32(seed);
  const knots = [[0, 0.04]];
  const n = Math.max(2, Math.round(peaks));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.55) / n;
    knots.push([t - 0.16, 0.2 + rnd() * 0.2]);
    knots.push([t, 0.5 + rnd() * 0.5]);
    knots.push([t + 0.16, 0.24 + rnd() * 0.22]);
  }
  knots.push([1, 0.05]);
  knots.sort((a, b) => a[0] - b[0]);
  mass(ctx, {
    vw: w,
    baseY: ridgeY,
    amp,
    knots,
    footY: y0,
    tone,
    toneAlpha,
    lineColor,
    lineAlpha,
    lineWidth,
    cun: texture * 2,
    seed,
    footFade: 0.35,
  });
}

/* ────────────────────────── 树 ────────────────────────── */

/** 一条渐细的墨带：树干、树枝都用它 */
function ribbon(ctx, pts, w0, w1, o = {}) {
  const { color = '#2b2f2b', alpha = 0.7, edge = null } = o;
  if (!pts || pts.length < 2) return;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(next[1] - prev[1]);
    let ny = next[0] - prev[0];
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    const t = i / (pts.length - 1);
    const hw = (w0 + (w1 - w0) * Math.pow(t, 0.7)) * 0.5;
    left.push([p[0] + nx * hw, p[1] + ny * hw]);
    right.push([p[0] - nx * hw, p[1] - ny * hw]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = hexA(color, alpha);
  ctx.fill();
  ctx.restore();
  if (edge) {
    inkStroke(ctx, right, {
      color,
      width: Math.max(0.6, w0 * 0.16),
      alpha: edge,
      seed: Math.round(w0 * 97 + pts[0][0]),
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.18,
      layers: 1,
      taper: false,
      step: 3,
    });
  }
}

/** 叶点批量填充：一次 path 一笔色 */
function leafDots(ctx, dots, color, baseAlpha) {
  if (!dots.length) return;
  const buckets = [[], [], []];
  for (const d of dots) {
    const b = Math.min(2, Math.max(0, Math.floor((d.a ?? 1) * 2.999)));
    buckets[b].push(d);
  }
  for (let b = 0; b < 3; b++) {
    if (!buckets[b].length) continue;
    ctx.save();
    ctx.beginPath();
    for (const d of buckets[b]) {
      ctx.ellipse(d.x, d.y, d.rx, d.ry, d.ang, 0, Math.PI * 2);
    }
    ctx.fillStyle = hexA(color, baseAlpha * (0.62 + b * 0.19));
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 一棵树。
 *
 * shape: round 阔叶 / pine 松 / willow 柳 / bamboo 竹 / scrub 灌木
 * 干与枝先画，叶压在上面，叶是从枝梢散出的，所以不会脱节。
 */
export function treeShape(ctx, x, y, o = {}) {
  const {
    size = 40,
    seed = 1,
    color = '#3a3f38',
    alpha = 0.62,
    canopy = '#4d5c3d',
    canopyAlpha = 0.2,
    shape = 'round',
    trunkRatio = 0.55,
    lean = 0,
    flip = 1,
  } = o;
  const s = size;
  const rnd = mulberry32(seed);
  const barkW = Math.max(1.6, s * 0.075);
  const leafColor = canopy;
  const leafA = Math.min(0.95, canopyAlpha * 2.6 + alpha * 0.34);

  const trunkBase = [x, y];
  const H = s * trunkRatio;
  const leanX = (lean || (rnd() - 0.5) * 0.16) * s;
  const top = [x + leanX, y - H];

  const trunkPts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const bend = Math.sin(t * Math.PI) * s * 0.03 * (rnd() - 0.5) * 2;
    trunkPts.push([
      x + leanX * t + bend,
      y - H * t + (t > 0.6 ? 0 : 0),
    ]);
  }

  if (shape === 'bamboo') {
    bambooClump(ctx, x, y, { s, seed, color, alpha, canopy, canopyAlpha: leafA, rnd });
    return;
  }

  if (shape === 'willow') {
    ribbon(ctx, trunkPts, barkW * 1.15, barkW * 0.5, { color, alpha: alpha * 0.92, edge: alpha * 0.35 });
    const dots = [];
    const tips = [];
    const nBr = 4;
    for (let i = 0; i < nBr; i++) {
      const t = 0.5 + i * 0.16;
      const side = i % 2 === 0 ? 1 : -1;
      const bx = x + leanX * t;
      const by = y - H * t;
      const len = s * (0.3 + rnd() * 0.18);
      const pts = [
        [bx, by],
        [bx + side * len * 0.55, by - s * 0.05 - rnd() * s * 0.05],
        [bx + side * len, by + s * 0.03],
      ];
      ribbon(ctx, pts, barkW * 0.5, barkW * 0.2, { color, alpha: alpha * 0.7 });
      tips.push([bx + side * len, by + s * 0.03, side]);
    }
    // 垂枝：从横枝端点往下垂
    for (const [tx, ty, side] of tips) {
      const strands = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < strands; i++) {
        const sx = tx + (rnd() - 0.5) * s * 0.16;
        inkStroke(
          ctx,
          [
            [sx, ty],
            [sx + side * s * 0.02 + (rnd() - 0.5) * s * 0.03, ty + s * 0.16],
            [sx + (rnd() - 0.5) * s * 0.06, ty + s * (0.24 + rnd() * 0.16)],
          ],
          {
            color: leafColor,
            width: Math.max(0.7, s * 0.012),
            alpha: leafA * 0.8,
            seed: seed + 900 + i * 7 + Math.round(tx),
            wobble: 0.4,
            dry: 0.2,
            layers: 1,
            taper: false,
            step: 3,
          }
        );
      }
      // 冠部一小簇
      for (let i = 0; i < 6; i++) {
        const a = -0.4 + rnd() * 1.4;
        dots.push({
          x: tx + (rnd() - 0.5) * s * 0.2,
          y: ty - rnd() * s * 0.06,
          rx: Math.max(1.5, s * 0.035),
          ry: Math.max(0.9, s * 0.012),
          ang: a,
          a: 0.5 + rnd() * 0.5,
        });
      }
    }
    leafDots(ctx, dots, leafColor, leafA * 0.75);
    return;
  }

  if (shape === 'pine') {
    // 干：略弯，松树皮用断笔点到
    ribbon(ctx, trunkPts, barkW * 1.25, barkW * 0.42, { color, alpha: alpha * 0.95, edge: alpha * 0.4 });
    const tiers = s > 46 ? 4 : 3;
    const dots = [];
    for (let i = 0; i < tiers; i++) {
      const t = 0.42 + (i / tiers) * 0.55;
      const bx = x + leanX * t;
      const by = y - H * t;
      const side = i % 2 === 0 ? 1 : -1;
      const len = s * (0.34 - i * 0.05) * (0.85 + rnd() * 0.4);
      const branch = [
        [bx, by],
        [bx + side * len * 0.6, by - s * 0.02],
        [bx + side * len, by + s * 0.02],
      ];
      ribbon(ctx, branch, barkW * 0.45, barkW * 0.16, { color, alpha: alpha * 0.72 });
      // 针叶：从枝端向内散
      const fanN = s > 46 ? 9 : 6;
      for (let k = 0; k < fanN; k++) {
        const u = k / (fanN - 1);
        const px = bx + side * len * (0.45 + u * 0.55);
        const py = by + s * 0.02;
        for (let j = 0; j < 3; j++) {
          const ang = -Math.PI / 2 + side * (0.35 + j * 0.42) + (rnd() - 0.5) * 0.2;
          const ll = s * (0.05 + rnd() * 0.035);
          inkStroke(
            ctx,
            [
              [px, py],
              [px + Math.cos(ang) * ll * 0.6, py + Math.sin(ang) * ll * 0.6],
              [px + Math.cos(ang) * ll, py + Math.sin(ang) * ll],
            ],
            {
              color: leafColor,
              width: Math.max(0.65, s * 0.011),
              alpha: leafA * (0.55 + rnd() * 0.5),
              seed: seed + 400 + i * 37 + k * 5 + j,
              wobble: 0.2,
              jitter: 0.15,
              dry: 0.1,
              layers: 1,
              taper: false,
              step: 2,
            }
          );
        }
      }
    }
    // 树梢一撮
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
      const ll = s * (0.05 + rnd() * 0.04);
      inkStroke(
        ctx,
        [
          top,
          [top[0] + Math.cos(ang) * ll * 0.6, top[1] + Math.sin(ang) * ll * 0.6],
          [top[0] + Math.cos(ang) * ll, top[1] + Math.sin(ang) * ll],
        ],
        {
          color: leafColor,
          width: Math.max(0.6, s * 0.01),
          alpha: leafA * (0.5 + rnd() * 0.5),
          seed: seed + 700 + i * 9,
          wobble: 0.2,
          dry: 0.1,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
    leafDots(ctx, dots, leafColor, leafA * 0.4);
    return;
  }

  /* ── 阔叶：干 + 三四根分枝 + 从枝梢散出的叶组 ── */
  ribbon(ctx, trunkPts, barkW * 1.1, barkW * 0.4, { color, alpha: alpha * 0.92, edge: alpha * 0.4 });

  const branches = [];
  const nBr = s > 60 ? 4 : 3;
  for (let i = 0; i < nBr; i++) {
    const t = 0.52 + (i / nBr) * 0.46 + (rnd() - 0.5) * 0.08;
    const side = (i % 2 === 0 ? 1 : -1) * (rnd() > 0.85 ? -1 : 1) * flip;
    const bx = x + leanX * t;
    const by = y - H * t;
    const len = s * (0.3 - i * 0.035) * (0.8 + rnd() * 0.5);
    const rise = s * (0.06 + rnd() * 0.14);
    const pts = [
      [bx, by],
      [bx + side * len * 0.5, by - rise * 0.5],
      [bx + side * len * 0.86, by - rise],
      [bx + side * len, by - rise * 1.05],
    ];
    ribbon(ctx, pts, barkW * 0.42, barkW * 0.13, { color, alpha: alpha * 0.72 });
    branches.push({ tip: pts[3], mid: pts[2], side, len });
  }

  const dots = [];
  const clusterAt = (cx, cy, r, n, a0) => {
    for (let i = 0; i < n; i++) {
      const ang = a0 + (i / Math.max(1, n - 1) - 0.5) * 2.3 + (rnd() - 0.5) * 0.3;
      const rr = r * (0.3 + rnd() * 0.95);
      const px = cx + Math.cos(ang + Math.PI / 2) * rr * 0.85 + (rnd() - 0.5) * r * 0.25;
      const py = cy + Math.sin(ang - 0.2) * rr * 0.4 + (rnd() - 0.5) * r * 0.22;
      dots.push({
        x: px,
        y: py,
        rx: Math.max(1.7, s * (0.038 + rnd() * 0.022)),
        ry: Math.max(1.0, s * (0.013 + rnd() * 0.008)),
        ang: ang * 0.55 + (rnd() - 0.5) * 0.4,
        a: 0.35 + rnd() * 0.65,
      });
    }
  };

  for (const br of branches) {
    clusterAt(br.tip[0], br.tip[1] + s * 0.015, s * 0.16, s > 55 ? 9 : 6, -0.2 * br.side);
    clusterAt(br.mid[0], br.mid[1] + s * 0.02, s * 0.11, s > 55 ? 5 : 3, 0.3 * br.side);
  }
  // 冠顶与冠底各一小簇，把轮廓撑开
  clusterAt(top[0] + s * 0.02, top[1] - s * 0.03, s * 0.15, s > 55 ? 8 : 5, 0);
  clusterAt(x + leanX * 0.5, y - H * 0.5, s * 0.1, 4, 0.6);

  leafDots(ctx, dots, leafColor, leafA);
}

/** 竹丛：几竿细竹，节点横断，叶在梢头 */
function bambooClump(ctx, x, y, o) {
  const { s, seed, color, alpha, canopy, canopyAlpha, rnd } = o;
  const culms = 3 + Math.floor(rnd() * 3);
  const dots = [];
  for (let i = 0; i < culms; i++) {
    const bx = x + (i - culms / 2) * s * 0.15 + (rnd() - 0.5) * s * 0.08;
    const hh = s * (0.75 + rnd() * 0.5);
    const bend = (rnd() - 0.5) * s * 0.08;
    const pts = [
      [bx, y],
      [bx + bend * 0.4, y - hh * 0.4],
      [bx + bend, y - hh * 0.75],
      [bx + bend * 1.4, y - hh],
    ];
    ribbon(ctx, pts, Math.max(1.1, s * 0.026), Math.max(0.8, s * 0.012), {
      color,
      alpha: alpha * 0.85,
    });
    // 节
    const nodes = 5;
    for (let k = 1; k < nodes; k++) {
      const t = k / nodes;
      const px = bx + bend * t * 1.2;
      const py = y - hh * t;
      inkStroke(
        ctx,
        [
          [px - s * 0.022, py],
          [px + s * 0.022, py],
        ],
        {
          color,
          width: Math.max(0.6, s * 0.01),
          alpha: alpha * 0.5,
          seed: seed + 500 + i * 13 + k,
          wobble: 0.1,
          dry: 0,
          layers: 1,
          taper: false,
          step: 2,
        }
      );
    }
    // 叶：梢头散出，两三片一组
    const tipX = bx + bend * 1.4;
    const tipY = y - hh;
    for (let g = 0; g < 3; g++) {
      const gx = tipX + (rnd() - 0.5) * s * 0.2;
      const gy = tipY + s * (0.04 + rnd() * 0.22);
      for (let k = 0; k < 3; k++) {
        const ang = (rnd() - 0.5) * 2.6 + (rnd() > 0.5 ? 0.7 : -0.7);
        dots.push({
          x: gx + Math.cos(ang) * s * 0.045,
          y: gy + Math.sin(ang) * s * 0.03,
          rx: Math.max(1.6, s * 0.05),
          ry: Math.max(1.0, s * 0.012),
          ang,
          a: 0.4 + rnd() * 0.6,
        });
      }
    }
  }
  leafDots(ctx, dots, canopy, canopyAlpha);
}

/* ────────────────────────── 雾 ────────────────────────── */

/**
 * 雾：擦掉墨，不画白。
 * 多个低强度、椭圆、羽化极大的渐变叠加，接缝不可见。
 */
export function mist(ctx, o = {}) {
  const { x = 0, y = 0, w = 400, h = 80, seed = 7, strength = 0.9, blobs = 5, tilt = 0 } = o;
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < blobs; i++) {
    const cx = x + w * (0.12 + rnd() * 0.76);
    const cy = y + (rnd() - 0.5) * h * 0.55;
    const rx = w * (0.2 + rnd() * 0.3);
    const ry = h * (0.5 + rnd() * 0.75);
    const st = strength * (0.3 + rnd() * 0.35);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt * (rnd() - 0.5));
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0,0,0,${st})`);
    g.addColorStop(0.45, `rgba(0,0,0,${st * 0.72})`);
    g.addColorStop(0.75, `rgba(0,0,0,${st * 0.28})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}

/** 旧接口：haze(ctx, w, y, ...) */
export function haze(ctx, w, y, o = {}) {
  const { alpha = 0.8, seed = 7, height = 40, bands = 4 } = o;
  mist(ctx, {
    x: -w * 0.05,
    y,
    w: w * 1.1,
    h: height,
    seed,
    strength: Math.min(0.95, alpha * 0.9),
    blobs: Math.max(3, bands),
  });
}

/* ────────────────────────── 水 ────────────────────────── */

/** 水面：几道断续的短弧，位置错落，绝不排成横条 */
export function water(ctx, w, y0, y1, o = {}) {
  const { color = '#6d8f8a', alpha = 0.3, seed = 11, rows = 6, width = 1, x0 = 0, x1 = 1 } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = rows === 1 ? 0.5 : r / (rows - 1);
    const y = y0 + (y1 - y0) * Math.pow(t, 1.15);
    const span = w * (0.1 + rnd() * 0.26) * (1 - t * 0.35);
    const st = w * (x0 + (x1 - x0) * rnd() * 0.88);
    const pts = [];
    const seg = 6;
    const ph = rnd() * 6.283;
    const amp = 0.8 + rnd() * 1.8;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      pts.push([st + span * u, y + Math.sin(u * 4.6 + ph) * amp]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.8 + rnd() * 0.5),
      alpha: alpha * (0.5 + t * 0.6) * (0.7 + rnd() * 0.5),
      seed: seed + r * 13,
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.34,
      layers: 1,
      taper: false,
      step: 3,
    });
  }
}

/** 一段岸线：只画一段，长短由参数定，不横贯 */
export function bankLine(ctx, o = {}) {
  const {
    x0 = 0.1,
    x1 = 0.6,
    y = 0.6,
    w,
    amp = 6,
    seed = 3,
    color = '#2b2f2b',
    alpha = 0.45,
    width = 1.5,
    dry = 0.2,
  } = o;
  const rnd = mulberry32(seed);
  const pts = [];
  const seg = 20;
  const ph = rnd() * 6.28;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    pts.push([
      w * (x0 + (x1 - x0) * u),
      w * 0 + y + Math.sin(u * 3.4 + ph) * amp + Math.sin(u * 7.7 + ph * 2) * amp * 0.4,
    ]);
  }
  inkStroke(ctx, pts, {
    color,
    width,
    alpha,
    seed,
    wobble: 0.8,
    jitter: 0.35,
    dry,
    layers: 2,
    taper: false,
    step: 4,
  });
}

/* ────────────────────────── 屋、桥、船 ────────────────────────── */

export function hut(ctx, x, y, o = {}) {
  const { size = 26, color = '#3a3f38', alpha = 0.6, seed = 9, flip = false, wall = 0.5 } = o;
  const s = size;
  const d = flip ? -1 : 1;
  // 屋顶：起翘的两笔
  inkStroke(
    ctx,
    [
      [x - s * 0.62 * d, y - s * 0.02],
      [x - s * 0.3 * d, y - s * 0.42],
      [x, y - s * 0.5],
      [x + s * 0.3 * d, y - s * 0.42],
      [x + s * 0.62 * d, y - s * 0.02],
    ],
    { color, width: Math.max(1, s * 0.055), alpha, seed: seed + 1, wobble: 0.35, dry: 0.1, layers: 2, taper: true }
  );
  // 屋身
  inkStroke(
    ctx,
    [
      [x - s * 0.4 * d, y],
      [x - s * 0.4 * d, y + s * wall],
      [x + s * 0.4 * d, y + s * wall],
      [x + s * 0.4 * d, y],
    ],
    { color, width: Math.max(0.7, s * 0.035), alpha: alpha * 0.72, seed: seed + 2, wobble: 0.25, dry: 0.1, layers: 1, taper: false }
  );
  // 门
  inkStroke(
    ctx,
    [
      [x - s * 0.07, y + s * wall],
      [x - s * 0.07, y + s * (wall - 0.26)],
    ],
    { color, width: Math.max(0.6, s * 0.026), alpha: alpha * 0.55, seed: seed + 3, wobble: 0.1, dry: 0, layers: 1, taper: false }
  );
}

/** 拱桥：一跨，桥面一道，桥洞一道 */
export function bridge(ctx, x, y, o = {}) {
  const { w = 60, h = 22, color = '#3a3f38', alpha = 0.55, seed = 11 } = o;
  const deck = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    deck.push([x - w / 2 + w * u, y - Math.sin(u * Math.PI) * h]);
  }
  inkStroke(ctx, deck, {
    color,
    width: 1.8,
    alpha,
    seed,
    wobble: 0.35,
    dry: 0.1,
    layers: 2,
    taper: false,
  });
  const arch = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    arch.push([x - w * 0.3 + w * 0.6 * u, y + Math.sin(u * Math.PI) * h * 0.1 - Math.sin(u * Math.PI) * h * 0.62]);
  }
  inkStroke(ctx, arch, {
    color,
    width: 1,
    alpha: alpha * 0.6,
    seed: seed + 3,
    wobble: 0.3,
    dry: 0.16,
    layers: 1,
    taper: false,
  });
  // 桥墩小段
  for (const px of [x - w * 0.29, x + w * 0.29]) {
    inkStroke(ctx, [[px, y], [px, y - h * 0.05]], {
      color,
      width: 0.9,
      alpha: alpha * 0.5,
      seed: seed + 7,
      layers: 1,
      dry: 0.1,
      taper: false,
    });
  }
}

/** 小船 + 一个人 */
export function boat(ctx, x, y, o = {}) {
  const { size = 30, color = '#2b2f2b', alpha = 0.55, seed = 21, figure = true } = o;
  const s = size;
  inkStroke(
    ctx,
    [
      [x - s * 0.5, y - s * 0.02],
      [x - s * 0.3, y + s * 0.12],
      [x + s * 0.32, y + s * 0.12],
      [x + s * 0.5, y - s * 0.06],
    ],
    { color, width: Math.max(1.1, s * 0.045), alpha, seed, wobble: 0.3, dry: 0.12, layers: 2, taper: false }
  );
  // 篷
  inkStroke(
    ctx,
    [
      [x - s * 0.16, y - s * 0.01],
      [x - s * 0.1, y - s * 0.16],
      [x + s * 0.06, y - s * 0.16],
      [x + s * 0.12, y - s * 0.01],
    ],
    { color, width: Math.max(0.8, s * 0.03), alpha: alpha * 0.72, seed: seed + 5, wobble: 0.2, dry: 0.1, layers: 1, taper: false }
  );
  if (figure) {
    inkStroke(
      ctx,
      [
        [x + s * 0.26, y + s * 0.04],
        [x + s * 0.26, y - s * 0.1],
      ],
      { color, width: Math.max(0.9, s * 0.035), alpha: alpha * 0.8, seed: seed + 9, wobble: 0.1, dry: 0.05, layers: 1, taper: false }
    );
    inkStroke(
      ctx,
      [
        [x + s * 0.3, y - s * 0.22],
        [x + s * 0.5, y - s * 0.5],
      ],
      { color, width: Math.max(0.6, s * 0.018), alpha: alpha * 0.55, seed: seed + 11, wobble: 0.2, dry: 0.2, layers: 1, taper: false }
    );
  }
  // 水痕
  inkStroke(
    ctx,
    [
      [x - s * 0.7, y + s * 0.2],
      [x - s * 0.2, y + s * 0.22],
    ],
    { color: '#6d8f8a', width: 0.9, alpha: alpha * 0.4, seed: seed + 13, wobble: 0.5, dry: 0.3, layers: 1, taper: false }
  );
  inkStroke(
    ctx,
    [
      [x + s * 0.1, y + s * 0.26],
      [x + s * 0.6, y + s * 0.24],
    ],
    { color: '#6d8f8a', width: 0.8, alpha: alpha * 0.3, seed: seed + 15, wobble: 0.5, dry: 0.3, layers: 1, taper: false }
  );
}

/** 一只鸟：两笔，一高一低 */
export function bird(ctx, x, y, o = {}) {
  const { size = 12, color = '#2b2f2b', alpha = 0.45, seed = 31 } = o;
  inkStroke(
    ctx,
    [
      [x - size * 0.5, y + size * 0.12],
      [x - size * 0.22, y - size * 0.14],
      [x, y],
      [x + size * 0.24, y - size * 0.16],
      [x + size * 0.52, y + size * 0.1],
    ],
    { color, width: 1, alpha, seed, wobble: 0.2, dry: 0, layers: 1, taper: false }
  );
}

/** 芦苇：两三丛细线，压住水边 */
export function reeds(ctx, x, y, o = {}) {
  const { size = 40, count = 5, color = '#3a3f38', alpha = 0.4, seed = 41, dir = 1 } = o;
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const bx = x + (rnd() - 0.5) * size * 0.5;
    const hh = size * (0.5 + rnd() * 0.6);
    const bend = dir * size * (0.12 + rnd() * 0.2);
    inkStroke(
      ctx,
      [
        [bx, y],
        [bx + bend * 0.3, y - hh * 0.55],
        [bx + bend, y - hh],
      ],
      {
        color,
        width: Math.max(0.7, size * 0.012),
        alpha: alpha * (0.6 + rnd() * 0.5),
        seed: seed + i * 7,
        wobble: 0.4,
        dry: 0.18,
        layers: 1,
        taper: true,
        step: 3,
      }
    );
  }
}

/** 云：几段极淡的水平短线，不是白团 */
export function cloudBand(ctx, x, y, w, o = {}) {
  const { alpha = 0.5, seed = 3, rows = 2 } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const yy = y + (rnd() - 0.5) * w * 0.02 + r * w * 0.018;
    const span = w * (0.2 + rnd() * 0.4);
    const sx = x + w * rnd() * 0.5;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      pts.push([sx + span * u, yy + Math.sin(u * 5 + rnd()) * w * 0.004]);
    }
    inkStroke(ctx, pts, {
      color: '#8d948a',
      width: 0.9,
      alpha: alpha * 0.28,
      seed: seed + r * 9,
      wobble: 0.4,
      dry: 0.4,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/* ────────────────────────── 梯田 ────────────────────────── */

/**
 * 梯田：绕着一处山嘴的等高带。
 * 越近越宽、越深；远端收紧化进雾里。
 */
export function terraceBands(ctx, o = {}) {
  const {
    cx,
    cy,
    span,
    top,
    bottom,
    rows = 14,
    color = '#7c9160',
    alpha = 0.4,
    seed = 13,
    width = 1,
    tilt = 0.18,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = top + (bottom - top) * Math.pow(t, 1.35);
    const half = span * (0.22 + t * 0.78);
    const ph = rnd() * 6.28;
    const sag = half * (0.1 + rnd() * 0.06);
    const pts = [];
    const seg = 22;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = cx - half + half * 2 * u;
      // 山嘴：中间鼓起，两侧向下收
      const yy = y + Math.sin(u * Math.PI) * sag - Math.sin(u * Math.PI * 2 + ph) * sag * 0.16;
      pts.push([x + (u - 0.5) * tilt * half * 0.4, yy]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.75 + t * 0.55),
      alpha: alpha * (0.34 + t * 0.8),
      seed: seed + r * 11,
      wobble: 0.55,
      jitter: 0.25,
      dry: 0.26,
      layers: 1,
      taper: false,
      step: 4,
    });
    // 田埂的积水：只给近处几层
    if (t > 0.55 && rnd() > 0.35) {
      const sx = cx - half * (0.1 + rnd() * 0.5);
      const sw = half * (0.2 + rnd() * 0.4);
      inkStroke(
        ctx,
        [
          [sx, y + sag * 0.6],
          [sx + sw, y + sag * 0.55],
        ],
        {
          color: '#6d8f8a',
          width: 0.9,
          alpha: alpha * 0.3,
          seed: seed + 300 + r * 5,
          wobble: 0.4,
          dry: 0.3,
          layers: 1,
          taper: false,
        }
      );
    }
  }
}

/* ────────────────────────── 田垄 / 大棚 ────────────────────────── */

/** 菜地垄：从近处往远处收，带一点透视 */
export function furrows(ctx, o = {}) {
  const {
    x0,
    x1,
    yNear,
    yFar,
    vanishX,
    rows = 8,
    color = '#5a625b',
    alpha = 0.24,
    seed = 17,
    width = 0.9,
  } = o;
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = yFar + (yNear - yFar) * t;
    const a = Math.pow(t, 0.7);
    const lx = vanishX + (x0 - vanishX) * (0.35 + a * 0.75);
    const rx = vanishX + (x1 - vanishX) * (0.35 + a * 0.75);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push([lx + (rx - lx) * u, y + Math.sin(u * 3 + r) * 1.1 * (0.4 + t)]);
    }
    inkStroke(ctx, pts, {
      color,
      width: width * (0.7 + t * 0.8),
      alpha: alpha * (0.35 + t * 0.9) * (0.8 + rnd() * 0.4),
      seed: seed + r * 9,
      wobble: 0.4,
      jitter: 0.2,
      dry: 0.28,
      layers: 1,
      taper: false,
      step: 4,
    });
  }
}

/** 大棚：半圆拱，几条压条 */
export function greenhouse(ctx, cx, cy, rw, rh, o = {}) {
  const { color = '#3a3f38', alpha = 0.5, seed = 31 } = o;
  const arc = [];
  const seg = 20;
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI + (i / seg) * Math.PI;
    arc.push([cx + Math.cos(a) * rw, cy + Math.sin(a) * rh]);
  }
  inkStroke(ctx, arc, { color, width: 1.6, alpha, seed, wobble: 0.3, dry: 0.1, layers: 2, taper: true });
  inkStroke(ctx, [[cx - rw, cy], [cx + rw, cy]], {
    color,
    width: 1.1,
    alpha: alpha * 0.7,
    seed: seed + 1,
    wobble: 0.2,
    dry: 0.1,
    layers: 1,
    taper: false,
  });
  for (let i = 1; i < 4; i++) {
    const u = i / 4;
    const ax = cx - rw + rw * 2 * u;
    const ah = rh * Math.sin(Math.PI * u);
    inkStroke(ctx, [[ax, cy], [ax, cy - ah]], {
      color,
      width: 0.65,
      alpha: alpha * 0.34,
      seed: seed + 10 + i,
      wobble: 0.2,
      dry: 0.2,
      layers: 1,
      taper: false,
    });
  }
}

/* ────────────────────────── 石 ────────────────────────── */

/** 一块石：轮廓一笔 + 两三笔皴 + 苔点 */
export function stone(ctx, x, y, o = {}) {
  const { w = 60, h = 34, seed = 7, color = '#3a3f38', alpha = 0.5, width = 1.3, moss = 3 } = o;
  const rnd = mulberry32(seed);
  const ridge = [];
  const seg = 7;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    ridge.push([
      x - w / 2 + w * t,
      y - Math.sin(t * Math.PI) * h * (0.72 + rnd() * 0.45) + (rnd() - 0.5) * h * 0.16,
    ]);
  }
  inkStroke(ctx, ridge, {
    color,
    width: width * 1.25,
    alpha: alpha * 0.95,
    seed: seed + 1,
    wobble: 1.1,
    dry: 0.14,
    layers: 2,
    taper: false,
  });
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + rnd() * 0.6;
    const p = ridge[Math.round(t * seg)];
    const len = h * (0.25 + rnd() * 0.45);
    inkStroke(
      ctx,
      [
        [p[0], p[1] + 1.5],
        [p[0] + (rnd() - 0.5) * 6, p[1] + len],
      ],
      {
        color,
        width: width * 0.55,
        alpha: alpha * 0.55,
        seed: seed + 20 + i * 7,
        wobble: 0.5,
        dry: 0.32,
        layers: 1,
        taper: false,
      }
    );
  }
  for (let i = 0; i < moss; i++) {
    const p = ridge[Math.round((0.2 + rnd() * 0.6) * seg)];
    ctx.save();
    ctx.fillStyle = hexA(color, alpha * 0.8);
    ctx.beginPath();
    ctx.ellipse(p[0], p[1] - 1, 1.6 + rnd() * 1.4, 1.2 + rnd(), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** 一块地面薄染，给前景坐住 */
export function groundWash(ctx, o = {}) {
  const { w, y0, y1, color = '#8d948a', alpha = 0.1, seed = 3, x0 = 0, x1 = 1 } = o;
  const rnd = mulberry32(seed);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(w * x0, y1);
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const x = w * (x0 + (x1 - x0) * u);
    const y = y0 + Math.sin(u * 3.2 + rnd() * 0.2) * (y1 - y0) * 0.06;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w * x1, y1);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hexA(color, alpha * 0.2));
  g.addColorStop(0.55, hexA(color, alpha * 0.7));
  g.addColorStop(1, hexA(color, alpha));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────── 天空 ────────────────────────── */

/** 极淡的天光：只在上三分之一，往下归纸 */
export function skyWash(ctx, w, h, o = {}) {
  const { color = '#8d948a', alpha = 0.1, from = 0, to = 0.42 } = o;
  const g = ctx.createLinearGradient(0, h * from, 0, h * to);
  g.addColorStop(0, hexA(color, alpha));
  g.addColorStop(0.6, hexA(color, alpha * 0.35));
  g.addColorStop(1, hexA(color, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, h * from, w, h * (to - from));
  ctx.restore();
}

export { ribbon, leafDots, fadeAt };
