/**
 * scenes.js —— 追加：燕鸥海岛的动态场景
 *
 * 这一部分服务于 tern.js 的小游戏：
 * 岛的样子、假鸟的数量、真鸟来的多少，都会实时改变画面。
 */

import {
  inkStroke,
  rockCluster,
  waterLines,
  hexA,
  mulberry32,
  mistBand,
  seal,
} from './brush.js';

/**
 * 画燕鸥招引岛的场景。每帧调用，所以要保持轻量。
 * @param {HTMLCanvasElement} canvas
 * @param {object} s
 *   island   岛屿 id（'reef' | 'sandbar' | 'pond' | null）
 *   decoy    假鸟档位 id
 *   birds    真鸟数量
 *   nests    巢数
 *   phase    当前阶段
 *   t        时间（秒），用于动画
 */
export function drawTernIsland(canvas, s = {}) {
  if (!canvas || !canvas.isConnected) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 300);
  const h = Math.max(rect.height, 220);

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { island = null, decoy = null, birds = 0, nests = 0, phase = 'choose', t = 0 } = s;

  // 天色：随阶段与时间流动
  const skyH = h * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, skyH);
  if (phase === 'result' && birds > 0) {
    sky.addColorStop(0, '#e8eee9');
    sky.addColorStop(1, '#f4efe4');
  } else {
    sky.addColorStop(0, '#e4e2d8');
    sky.addColorStop(1, '#f4efe4');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, skyH);

  // 云
  mistBand(ctx, { x: 0, y: 0, w, h: skyH * 0.9 }, { alpha: 0.5, seed: 4401, bands: 3 });

  // 海
  const seaY = h * 0.62;
  const sea = ctx.createLinearGradient(0, seaY, 0, h);
  sea.addColorStop(0, hexA('#6d8f8a', 0.24));
  sea.addColorStop(0.6, hexA('#6d8f8a', 0.14));
  sea.addColorStop(1, hexA('#6d8f8a', 0.06));
  ctx.fillStyle = sea;
  ctx.fillRect(0, seaY, w, h - seaY);

  // 波纹：随 t 缓慢移动
  const rnd = mulberry32(4403);
  for (let i = 0; i < 14; i++) {
    const y = seaY + (h - seaY) * ((i + 0.5) / 14);
    const amp = 1.2 + rnd() * 2.2;
    const span = w * 0.3;
    const speed = 6 + rnd() * 8;
    const offset = ((t * speed) % (w + span * 2)) - span;
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      pts.push([offset + span * u, y + Math.sin(u * 6.4 + i + t * 0.9) * amp]);
    }
    inkStroke(ctx, pts, {
      color: '#6d8f8a',
      width: 0.9,
      alpha: 0.2 + (1 - i / 14) * 0.1,
      seed: 5000 + i * 7,
      wobble: 0.4,
      dry: 0.3,
      layers: 1,
      taper: false,
      step: 4,
    });
  }

  // 岛屿
  if (island) {
    const drawIslandShape = () => {
      if (island === 'reef') {
        // 海蚀礁岩：顶部平缓，肩部圆钝，像被浪啃过的石头，不是山峰
        return [
          [w * 0.26, seaY + 4],
          [w * 0.3, h * 0.52],
          [w * 0.33, h * 0.4],
          [w * 0.38, h * 0.34],
          [w * 0.44, h * 0.32],
          [w * 0.5, h * 0.33],
          [w * 0.56, h * 0.36],
          [w * 0.61, h * 0.42],
          [w * 0.65, h * 0.5],
          [w * 0.68, h * 0.58],
          [w * 0.72, seaY + 4],
        ];
      }
      if (island === 'sandbar') {
        // 低平沙洲：几乎贴着水面
        return [
          [w * 0.18, seaY + 10],
          [w * 0.27, seaY + 1],
          [w * 0.39, seaY - 3],
          [w * 0.5, seaY - 5],
          [w * 0.62, seaY - 3],
          [w * 0.74, seaY + 2],
          [w * 0.84, seaY + 10],
        ];
      }
      // 鱼塘埂：极窄的一条，两侧是水
      return [
        [w * 0.14, seaY + 16],
        [w * 0.3, seaY + 8],
        [w * 0.45, seaY + 6],
        [w * 0.6, seaY + 7],
        [w * 0.78, seaY + 4],
        [w * 0.88, seaY + 16],
      ];
    };

    const shape = drawIslandShape();

    // 填色
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(shape[0][0], shape[0][1]);
    for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i][0], shape[i][1]);
    ctx.closePath();
    ctx.fillStyle = hexA(island === 'reef' ? '#8d948a' : '#b1813f', 0.14);
    ctx.fill();
    ctx.restore();

    inkStroke(ctx, shape, {
      color: '#3a3f38',
      width: 1.8,
      alpha: 0.55,
      seed: 4411,
      dry: 0.16,
      layers: 2,
    });

    // 礁石细节：沿岩壁的横向岩层线
    if (island === 'reef') {
      for (let i = 0; i < 5; i++) {
        const y = h * (0.4 + i * 0.045);
        const halfW = w * (0.09 + i * 0.018);
        inkStroke(
          ctx,
          [
            [w * 0.45 - halfW, y],
            [w * 0.45, y + (i % 2 ? 1.5 : -1.5)],
            [w * 0.45 + halfW * 0.9, y + 1],
          ],
          {
            color: '#5a625b',
            width: 0.9,
            alpha: 0.26,
            seed: 4413 + i * 7,
            wobble: 0.5,
            dry: 0.3,
            layers: 1,
            taper: false,
          }
        );
      }
      // 岩石竖向裂痕
      inkStroke(
        ctx,
        [
          [w * 0.42, h * 0.35],
          [w * 0.41, h * 0.46],
          [w * 0.43, h * 0.56],
        ],
        { color: '#5a625b', width: 0.8, alpha: 0.24, seed: 4451, layers: 1, dry: 0.34 }
      );
    }

    // 假鸟：站在岛的平顶上
    const decoyCount = decoy === 'few' ? 3 : decoy === 'mid' ? 12 : decoy === 'many' ? 28 : 0;
    for (let i = 0; i < decoyCount; i++) {
      const r2 = mulberry32(4500 + i * 13);
      const px = w * 0.34 + r2() * w * 0.34;
      const py = h * 0.32 + r2() * h * 0.06;
      drawTernGlyph(ctx, px, py, 0.5, '#8d948a', 0.55);
    }

    // 真鸟：从天上落到岛上
    if (birds > 0) {
      const show = Math.min(birds, 46);
      for (let i = 0; i < show; i++) {
        const r3 = mulberry32(4700 + i * 17);
        // 前几只落在岛上，其余在空中盘旋
        const onGround = i < Math.min(nests, show);
        let px;
        let py;
        if (onGround) {
          px = w * 0.34 + r3() * w * 0.34;
          py = h * 0.32 + r3() * h * 0.07;
        } else {
          const ang = r3() * Math.PI * 2 + t * 0.28;
          const rad = w * (0.16 + r3() * 0.24);
          px = w * 0.46 + Math.cos(ang) * rad;
          py = h * 0.26 + Math.sin(ang) * rad * 0.42;
        }
        drawTernGlyph(ctx, px, py, 0.72 + r3() * 0.34, '#3a3f38', 0.5 + r3() * 0.4);
      }
    }
  }

  // 空岛时期：文字提示
  if (!island) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#5a625b';
    ctx.font = '13px "Kaiti SC", KaiTi, 楷体, serif';
    ctx.textAlign = 'center';
    ctx.fillText('选一座岛，把假鸟摆上去', w / 2, h * 0.22);
    ctx.restore();
  }

  // 角章
  seal(ctx, w - 30, h - 30, {
    size: 34,
    text: '守',
    color: '#9d3a30',
    alpha: 0.34,
    seed: 4801,
    rotate: -0.05,
  });
}

/**
 * 一只燕鸥的简笔：两条弧线做翅膀，一个小三角做身体
 * @param {number} scale 相对大小
 */
export function drawTernGlyph(ctx, x, y, scale = 1, color = '#3a3f38', alpha = 0.7) {
  const s = 7 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, 1.15 * scale);
  ctx.lineCap = 'round';

  // 翅膀：两段弧
  ctx.beginPath();
  ctx.moveTo(x - s * 1.5, y + s * 0.24);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.5, x, y);
  ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.5, x + s * 1.5, y + s * 0.24);
  ctx.stroke();

  // 身体：一个短竖
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + s * 0.8);
  ctx.stroke();

  ctx.restore();
}
