/**
 * tern-scene.js — 燕鸥招引的海岛全景
 *
 * 重做后这幅画要撑满整个展台：
 *   岛在画面中央偏左，海铺满下方，天占上半。
 *   假鸟真的站在岛顶（数量跟档位对应）；
 *   真鸟来了就从天上落下来，落在岛上，一圈一圈地盘。
 *   放声音用一圈一圈扩散的波纹表示，从岛向外走。
 */

import { inkStroke, hexA, mulberry32, mistBand, seal } from './brush.js';
import { water } from './inkfig.js';

/** 岛的轮廓，按 id 给出不同形状 */
function islandShape(id, w, h) {
  const seaY = h * 0.63;
  if (id === 'reef') {
    // 海蚀礁岩：顶平肩圆，像被浪啃过的石头
    return {
      seaY,
      pts: reefOutline(w, h, seaY),
      top: { x: w * 0.46, y: h * 0.362, span: w * 0.24 },
    };
  }
  if (id === 'sandbar') {
    return {
      seaY,
      pts: [
        [w * 0.13, seaY + 12],
        [w * 0.22, seaY + 2],
        [w * 0.34, seaY - 5],
        [w * 0.47, seaY - 8],
        [w * 0.6, seaY - 5],
        [w * 0.72, seaY + 1],
        [w * 0.84, seaY + 12],
      ],
      top: { x: w * 0.47, y: seaY - 6, span: w * 0.2 },
    };
  }
  // 鱼塘埂：极窄的一条，两侧都是水
  return {
    seaY,
    pts: [
      [w * 0.1, seaY + 20],
      [w * 0.28, seaY + 10],
      [w * 0.46, seaY + 7],
      [w * 0.64, seaY + 8],
      [w * 0.8, seaY + 4],
      [w * 0.9, seaY + 20],
    ],
    top: { x: w * 0.45, y: seaY + 4, span: w * 0.22 },
  };
}

/**
 * @param {object} s
 *   island  'reef'|'sandbar'|'pond'|null
 *   decoy   档位 id
 *   sound   档位 id
 *   birds   本季到岛的真鸟数
 *   nests   筑巢
 *   phase   choose | waiting | result | end
 *   round   第几季 0-4
 *   t       秒
 */
export function drawTernPanorama(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(rect.width, 320);
  const H = Math.max(rect.height, 260);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const {
    island = null,
    decoy = null,
    sound = null,
    birds = 0,
    nests = 0,
    phase = 'choose',
    round = 0,
    t = 0,
  } = s;

  const rnd = mulberry32(4401);

  // ── 天色：随繁殖季推移，从春天到盛夏
  const seasonT = Math.min(1, round / 4);
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.66);
  sky.addColorStop(0, hexA(mix('#e6ecdf', '#e8e4d4', seasonT), 0.92));
  sky.addColorStop(0.6, hexA('#f0ebdd', 0.5));
  sky.addColorStop(1, hexA('#f4efe4', 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.68);

  // 云：横向长条，压住天际
  mistBand(ctx, { x: 0, y: H * 0.06, w: W, h: H * 0.2 }, { alpha: 0.5, seed: 4403, bands: 3 });

  // ── 远岛：海平线上几点淡影，把空间推开
  for (let i = 0; i < 3; i++) {
    const bx = W * (0.05 + rnd() * 0.9);
    const bw = W * (0.06 + rnd() * 0.09);
    const bh = H * (0.01 + rnd() * 0.014);
    inkStroke(
      ctx,
      [
        [bx - bw, H * 0.585],
        [bx - bw * 0.4, H * 0.585 - bh],
        [bx + bw * 0.12, H * 0.585 - bh * 0.7],
        [bx + bw, H * 0.585],
      ],
      {
        color: '#5a625b',
        width: 1,
        alpha: 0.22,
        seed: 4421 + i * 11,
        wobble: 0.7,
        dry: 0.2,
        layers: 1,
        taper: false,
      }
    );
  }

  // ── 海
  const seaY = H * 0.62;
  const sea = ctx.createLinearGradient(0, seaY, 0, H);
  sea.addColorStop(0, hexA('#6d8f8a', 0.26));
  sea.addColorStop(0.55, hexA('#6d8f8a', 0.15));
  sea.addColorStop(1, hexA('#6d8f8a', 0.05));
  ctx.fillStyle = sea;
  ctx.fillRect(0, seaY, W, H - seaY);

  // 海平线
  inkStroke(ctx, [[0, seaY], [W, seaY]], {
    color: '#6d8f8a',
    width: 0.9,
    alpha: 0.2,
    seed: 4407,
    layers: 1,
    dry: 0.42,
    taper: false,
  });

  // 波纹：缓慢右移
  const wr = mulberry32(4405);
  for (let i = 0; i < 16; i++) {
    const y = seaY + (H - seaY) * ((i + 0.5) / 16);
    const amp = 1.1 + wr() * 2.2;
    const span = W * 0.26;
    const speed = 7 + wr() * 9;
    const off = ((t * speed) % (W + span * 2)) - span;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      pts.push([off + span * u, y + Math.sin(u * 6.4 + i + t * 0.9) * amp]);
    }
    inkStroke(ctx, pts, {
      color: '#6d8f8a',
      width: 0.9,
      alpha: 0.16 + (1 - i / 16) * 0.1,
      seed: 5000 + i * 7,
      wobble: 0.4,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }

  // ── 岛
  if (island) {
    const sh = islandShape(island, W, H);

    // 岛体填色
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sh.pts[0][0], sh.pts[0][1]);
    for (let i = 1; i < sh.pts.length; i++) ctx.lineTo(sh.pts[i][0], sh.pts[i][1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.28, 0, sh.seaY);
    g.addColorStop(0, hexA(island === 'reef' ? '#8d948a' : '#b1813f', 0.2));
    g.addColorStop(1, hexA(island === 'reef' ? '#8d948a' : '#b1813f', 0.1));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    inkStroke(ctx, sh.pts, {
      color: '#3a3f38',
      width: 2,
      alpha: 0.58,
      seed: 4411,
      dry: 0.14,
      layers: 2,
    });

    // 岩层线
    if (island === 'reef') {
      for (let i = 0; i < 6; i++) {
        const y = H * (0.36 + i * 0.042);
        const halfW = W * (0.1 + i * 0.016);
        inkStroke(
          ctx,
          [
            [W * 0.44 - halfW, y],
            [W * 0.44, y + (i % 2 ? 1.6 : -1.6)],
            [W * 0.44 + halfW * 0.92, y + 1],
          ],
          {
            color: '#5a625b',
            width: 0.9,
            alpha: 0.22,
            seed: 4413 + i * 7,
            wobble: 0.5,
            dry: 0.3,
            layers: 1,
            taper: false,
          }
        );
      }
    }

    // ── 假鸟：站在岛顶，数量对应档位
    const n = decoy === 'few' ? 3 : decoy === 'mid' ? 12 : decoy === 'many' ? 28 : 0;
    for (let i = 0; i < n; i++) {
      const r2 = mulberry32(4500 + i * 13);
      const px = sh.top.x - sh.top.span / 2 + r2() * sh.top.span;
      const py = sh.top.y - r2() * H * 0.02;
      glyph(ctx, px, py, 0.62, '#8d948a', 0.72);
    }

    // ── 声音：从岛向外扩散的弧
    if (sound) {
      const rings = sound === 'day' ? 2 : sound === 'dusk' ? 4 : 6;
      const reach = sound === 'day' ? 0.1 : sound === 'dusk' ? 0.19 : 0.28;
      // 夜晚档位才画，白天档只在近处
      const cx = sh.top.x;
      const cy = sh.top.y + H * 0.05;
      for (let i = 0; i < rings; i++) {
        const ph = (t * 0.22 + i / rings) % 1;
        const rr = W * reach * ph;
        ctx.save();
        ctx.strokeStyle = hexA('#6d8f8a', 0.3 * (1 - ph));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 真鸟
    if (birds > 0) {
      const show = Math.min(birds, 40);
      for (let i = 0; i < show; i++) {
        const r3 = mulberry32(4700 + i * 17);
        const grounded = i < Math.min(nests, show);
        let px;
        let py;
        if (grounded) {
          // 落在岛上
          px = sh.top.x - sh.top.span / 2 + r3() * sh.top.span;
          py = sh.top.y - r3() * H * 0.03;
        } else {
          // 在天上盘旋，越靠上越远
          const ang = r3() * Math.PI * 2 + t * 0.34;
          const rad = W * (0.12 + r3() * 0.26);
          px = sh.top.x + Math.cos(ang) * rad;
          py = sh.top.y - H * 0.14 + Math.sin(ang) * rad * 0.4;
        }
        glyph(ctx, px, py, 0.74 + r3() * 0.3, '#3a3f38', 0.52 + r3() * 0.34);
      }
    }
  }

  // 还没选岛
  if (!island) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#5a625b';
    ctx.font = '14px "Kaiti SC", KaiTi, 楷体, serif';
    ctx.textAlign = 'center';
    ctx.fillText('先选一座岛', W / 2, H * 0.2);
    ctx.restore();
  }

  // 角章
  seal(ctx, W - 46, H - 44, {
    size: 42,
    text: '守',
    color: '#9d3a30',
    alpha: 0.26,
    seed: 4801,
    rotate: -0.05,
  });
}

/** 一只燕鸥：两段弧做翅膀，一点做身体 */
export function glyph(ctx, x, y, scale = 1, color = '#3a3f38', alpha = 0.7) {
  const s = 7 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.7, 1.2 * scale);
  ctx.beginPath();
  ctx.moveTo(x - s * 1.5, y + s * 0.24);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.5, x, y);
  ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.5, x + s * 1.5, y + s * 0.24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s * 0.8);
  ctx.stroke();
  ctx.restore();
}

/** 两个十六进制色按 t 混合 */
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ra = (pa >> 16) & 255;
  const ga = (pa >> 8) & 255;
  const ba = pa & 255;
  const rb = (pb >> 16) & 255;
  const gb = (pb >> 8) & 255;
  const bb = pb & 255;
  const k = Math.max(0, Math.min(1, t));
  const to = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${to(ra + (rb - ra) * k)}${to(ga + (gb - ga) * k)}${to(ba + (bb - ba) * k)}`;
}

/**
 * 礁岩轮廓：左端进水，右端出水，顶面几乎是平的。
 * 参数化生成，避免在源码里堆一长串坐标。
 */
function reefOutline(w, h, seaY) {
  const left = w * 0.16;
  const right = w * 0.75;
  const topY = h * 0.36;
  // 左肩、右肩各两个控制点，中间顶面留平
  const pts = [];
  pts.push([left, seaY + 6]);
  pts.push([left + w * 0.012, h * 0.56]);
  pts.push([left + w * 0.035, h * 0.47]);
  pts.push([left + w * 0.08, h * 0.415]);
  pts.push([left + w * 0.145, h * 0.383]);
  pts.push([left + w * 0.23, h * 0.368]);
  // 顶面：平直，略微起伏
  pts.push([left + w * 0.31, topY + h * 0.004]);
  pts.push([left + w * 0.39, topY]);
  pts.push([left + w * 0.47, topY + h * 0.002]);
  pts.push([left + w * 0.55, topY + h * 0.006]);
  // 右肩脱下
  pts.push([left + w * 0.63, h * 0.385]);
  pts.push([left + w * 0.685, h * 0.44]);
  pts.push([left + w * 0.72, h * 0.512]);
  pts.push([left + w * 0.745, h * 0.575]);
  pts.push([left + w * 0.762, h * 0.608]);
  pts.push([right, seaY + 2]);
  return pts;
}
