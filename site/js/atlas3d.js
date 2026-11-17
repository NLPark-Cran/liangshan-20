/**
 * atlas3d.js — 3D 点位探索
 *
 * 六个村点各有一件 Lux3D 生成的微缩地形模型。这一页把它们放在同一张
 * 长长的展台上，可以横向拖动、逐个细看；点开一个会推到近景，右侧出资料。
 *
 * 设计取舍：
 * - 模型走 meshopt 压缩 + WebP 纹理，单件 1MB 上下，串行加载，先给近处的
 * - 不用 OrbitControls：这里的动作是「沿着一排出戏台往前挪」，
 *   自由轨道会让视角失序。自定义一个带阻尼的轨道，限制俯仰与距离
 * - 所有模型归一化到同一包围盒高度，保证六个点的视觉尺度可比
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three/libs/meshopt_decoder.module.js';

/* ────────────────────────── 数据 ────────────────────────── */

const POINTS = [
  { id: 'yucun', name: '余村', region: '湖州安吉', tag: '两山理念诞生地', year: '2005' },
  { id: 'xiajiang', name: '下姜村', region: '杭州淳安', tag: '从穷山村到绿富美', year: '2003' },
  { id: 'qianjiangyuan', name: '钱江源', region: '衢州开化', tag: '国家公园体制试点', year: '2016' },
  { id: 'yunhe', name: '云和梯田', region: '丽水云和', tag: '全球重要农业文化遗产', year: '2022' },
  { id: 'pujiang', name: '浦江', region: '金华浦江', tag: '五水共治起点', year: '2013' },
  { id: 'xinxinqiao', name: '新溪桥', region: '嘉兴', tag: '平原水乡的数字化', year: '2024' },
];

/* ────────────────────────── 场景 ────────────────────────── */

const canvas = document.getElementById('stage');
const hud = document.getElementById('hud');
const rail = document.getElementById('rail');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f2ece0');
scene.fog = new THREE.Fog('#f2ece0', 14, 34);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

/* 光：一盏主光带阴影，一盏背部轮廓光，半球光压住暗部 */
const key = new THREE.DirectionalLight('#fff7ea', 2.5);
key.position.set(6, 12, 8);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.camera.left = -16;
key.shadow.camera.right = 16;
key.shadow.camera.top = 16;
key.shadow.camera.bottom = -16;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
// 场景是静止的，阴影只需要算一次。模型自转时再按需打开，
// 否则每帧都要重画 430k 面的深度图，软件渲染下直接掉到个位数帧。
key.shadow.autoUpdate = false;
key.shadow.needsUpdate = true;
scene.add(key);

const rim = new THREE.DirectionalLight('#c9dde6', 0.9);
rim.position.set(-8, 5, -10);
scene.add(rim);

scene.add(new THREE.HemisphereLight('#e2ebee', '#c2b096', 0.95));
scene.add(new THREE.AmbientLight('#ffffff', 0.2));

/* 每个点位一个单独的圆形展台，比一整条长桌更像陈列，也给每件作品留出呼吸 */
const SPACING = 4.6;
const pads = [];
for (let i = 0; i < POINTS.length; i++) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.72, 1.78, 0.16, 72),
    new THREE.MeshStandardMaterial({ color: '#e6dcc8', roughness: 0.94, metalness: 0 }),
  );
  pad.position.set(i * SPACING, -0.08, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);
  pads.push(pad);

  // 台面下方一圈很淡的落影，让展台不像是浮着
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(2.15, 64),
    new THREE.MeshBasicMaterial({ color: '#d9cdb6', transparent: true, opacity: 0.3 }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(i * SPACING, -0.161, 0);
  scene.add(halo);
}

/* ────────────────────────── 加载 ────────────────────────── */

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const slots = POINTS.map(() => ({ group: null, ready: false }));

function normalize(root, target = 2.5) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z) || 1;
  const s = target / maxDim;
  root.scale.setScalar(s);
  root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (m) {
      m.envMapIntensity = 0.55;
      if (m.roughness !== undefined) m.roughness = Math.min(1, Math.max(0.62, m.roughness));
    }
  });
  return { size, tris: countTris(root) };
}

function countTris(root) {
  let t = 0;
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const idx = o.geometry.index;
      t += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
    }
  });
  return Math.round(t);
}

let totalTris = 0;
let loadedCount = 0;

function loadOne(i) {
  const p = POINTS[i];
  const t0 = performance.now();
  return new Promise((resolve) => {
    loader.load(
      `assets/models/${p.id}.min.glb`,
      (gltf) => {
        const holder = new THREE.Group();
        const info = normalize(gltf.scene);
        holder.add(gltf.scene);
        holder.position.set(i * SPACING, 0, 0);
        holder.rotation.y = -0.22 + (i % 3) * 0.12;
        scene.add(holder);

        slots[i] = { group: holder, ready: true, tris: info.tris, ms: Math.round(performance.now() - t0) };
        totalTris += info.tris;
        loadedCount++;
        updateHud();
        updateRail();
        resolve(true);
      },
      undefined,
      (err) => {
        console.warn('模型载入失败', p.id, err?.message);
        slots[i] = { group: null, ready: false, failed: true };
        loadedCount++;
        updateHud();
        updateRail();
        resolve(false);
      },
    );
  });
}

/**
 * 六件并行加载，每件到位就画。串行会让第 6 件等前 5 件全部结束，
 * 首屏要空等十几秒；并行时第一件 300ms 就能看见。
 * 浏览器对同域并发有上限，这里只有 6 个请求，不会互相挤占。
 */
async function loadAll() {
  await Promise.all(POINTS.map((_, i) => loadOne(i)));
}

/* ────────────────────────── HUD 与推进条 ────────────────────────── */

function updateHud() {
  const ok = slots.filter((s) => s.ready).length;
  const pct = Math.round((ok / POINTS.length) * 100);
  hud.innerHTML = `<span class="hud__bar"><i style="width:${pct}%"></i></span>`
    + `<b>${ok}/${POINTS.length}</b> 件就位 · <b>${(totalTris / 1000).toFixed(0)}k</b> 面`;
}

function updateRail() {
  rail.innerHTML = POINTS.map((p, i) => {
    const s = slots[i];
    const dot = s?.ready ? '●' : s?.failed ? '×' : '○';
    return `<button class="rail__item${i === active ? ' is-on' : ''}" data-i="${i}">
      <span class="rail__dot">${dot}</span>
      <span class="rail__name">${p.name}</span>
      <span class="rail__region">${p.region}</span>
    </button>`;
  }).join('');
  rail.querySelectorAll('.rail__item').forEach((el) => {
    el.addEventListener('click', () => focus(Number(el.dataset.i)));
  });
}

/* ────────────────────────── 相机 ────────────────────────── */

let active = 0;
const cam = {
  x: 0, // 目标横向位置（世界坐标）
  dist: 9.6,
  pitch: 0.46, // 俯仰，弧度
  yaw: 0,
  // 平滑量
  cx: 0, cdist: 9.6, cpitch: 0.46, cyaw: 0,
};

function focus(i) {
  active = i;
  cam.x = i * SPACING;
  cam.dist = 6.6;
  cam.pitch = 0.38;
  showInfo(i);
  updateRail();
}

function showInfo(i) {
  const p = POINTS[i];
  const s = slots[i] || {};
  const panel = document.getElementById('info');
  panel.innerHTML = `
    <div class="info__kicker">${p.region} · ${p.year}</div>
    <h2 class="info__title">${p.name}</h2>
    <p class="info__tag">${p.tag}</p>
    <dl class="info__rows">
      <div><dt>三角面</dt><dd>${s.ready ? s.tris.toLocaleString() : '未就位'}</dd></div>
      <div><dt>载入</dt><dd>${s.ready ? s.ms + ' ms' : '—'}</dd></div>
      <div><dt>来源</dt><dd>Lux3D 生成</dd></div>
    </dl>
  `;
  panel.classList.add('is-on');
}

/* 拖拽：横向移动沿展台平移，纵向改变俯仰 */
let dragging = false;
let lastX = 0;
let lastY = 0;
let moved = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  cam.x -= dx * 0.012;
  cam.pitch = Math.min(1.05, Math.max(0.08, cam.pitch + dy * 0.004));
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cam.dist = Math.min(16, Math.max(3.6, cam.dist + e.deltaY * 0.006));
  },
  { passive: false },
);

/* 键盘也能走：左右切点位 */
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') focus(Math.min(POINTS.length - 1, active + 1));
  if (e.key === 'ArrowLeft') focus(Math.max(0, active - 1));
});

/* ────────────────────────── 渲染循环 ────────────────────────── */

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
let frames = 0;
let fpsT = performance.now();
let fps = 0;
let frameNo = 0;

function tick() {
  requestAnimationFrame(tick);
  resize();

  // 阻尼趋近，位移越大追得越快，避免长距离拖拽后拖尾
  const k = (a, b, t) => a + (b - a) * t;
  cam.cx = k(cam.cx, cam.x, 0.09);
  cam.cdist = k(cam.cdist, cam.dist, 0.09);
  cam.cpitch = k(cam.cpitch, cam.pitch, 0.1);

  const t = clock.getElapsedTime();
  const bob = Math.sin(t * 0.5) * 0.04;

  // 视口窄时自动退远，避免只看得到一件作品的半边
  const aspectPull = Math.max(0, (1.5 - camera.aspect)) * 3.4;
  const dist = cam.cdist + aspectPull;

  camera.position.set(
    cam.cx,
    Math.sin(cam.cpitch) * dist + bob,
    Math.cos(cam.cpitch) * dist,
  );
  camera.lookAt(cam.cx, 0.35, 0);

  // 静止时整体不转，只有被点开的点位轻轻自转，减少无效重绘
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s?.group) continue;
    if (i === active) s.group.rotation.y += 0.0016;
  }
  // 被点开的模型在转，阴影每 8 帧补一次就够，肉眼看不出来
  if (++frameNo % 8 === 0) key.shadow.needsUpdate = true;

  renderer.render(scene, camera);

  frames++;
  const now = performance.now();
  if (now - fpsT > 1000) {
    fps = Math.round((frames * 1000) / (now - fpsT));
    frames = 0;
    fpsT = now;
    window.__fps = fps;
  }
}

/* ────────────────────────── 启动 ────────────────────────── */

updateHud();
updateRail();
focus(0);
addEventListener('resize', resize);
resize();
tick();

window.__atlas = {
  get ready() { return loadedCount; },
  get total() { return POINTS.length; },
  get tris() { return totalTris; },
  get fps() { return fps; },
  focus,
};

if (document.getElementById('boot')) {
  setTimeout(() => document.getElementById('boot')?.classList.add('is-done'), 260);
}

loadAll().then(() => {
  updateHud();
  focus(0);
  window.__atlasDone = true;
});
