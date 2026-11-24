/**
 * river.js — 浦江清溪推演
 *
 * 这是教学模型，不是浦江历年统计数据的复刻。
 * 真实背景只有已核实的事实：当地曾集中整治水晶污染，再寻找产业出路。
 * 玩法的数值为解释取舍而设，页面内明确标注，不伪装成现实测算。
 */

const ACTIONS = {
  enforce: {
    name: '整治散乱污作坊',
    hint: '先截住直排。见效快，但家庭收入会先受伤。',
    tag: '治标的魄力',
    cost: 14,
    effect: { water: 15, pollution: -19, livelihood: -11, jobs: -4, fish: 5 },
  },
  treatment: {
    name: '集中治污与园区改造',
    hint: '把分散加工迁进能治污的园区，保住一部分生计。',
    tag: '给转型留接口',
    cost: 22,
    effect: { water: 11, pollution: -13, livelihood: 3, jobs: 2, fish: 5 },
  },
  habitat: {
    name: '修复河岸与湿地',
    hint: '让水不只看起来清，也有地方让鱼和鸟住下来。',
    tag: '恢复栖息地',
    cost: 12,
    effect: { water: 6, pollution: -4, livelihood: 0, jobs: 1, fish: 17 },
  },
  industry: {
    name: '扶持文创与乡村旅游',
    hint: '水越好，新业态越能站住。脏水里长不出好生意。',
    tag: '培养新收入',
    cost: 17,
    effect: { water: 1, pollution: -1, livelihood: 8, jobs: 11, fish: 0 },
  },
  maintenance: {
    name: '社区巡河与自然休养',
    hint: '不新增工程开支，靠日常巡护和自然恢复慢慢往前。',
    tag: '低成本管护',
    cost: 0,
    effect: { water: 2, pollution: -1, livelihood: -2, jobs: 0, fish: 3 },
  },
};

const EVENTS = [
  { title: '第一年的账本', text: '整治刚开始，岸上的人比水里的鱼更先感受到变化。关停之后，收入从哪里来，必须一起回答。', effect: {} },
  { title: '连续降雨', text: '雨把岸边积存的污染物重新冲进河里。只治企业、不养河岸，反复会更明显。', effect: { water: -5, pollution: 5 } },
  { title: '产业园开始招商', text: '集中生产让治污设施真正转起来。已经做过园区改造的年份，会在这里留下后劲。', effect: { jobs: 5, livelihood: 4 } },
  { title: '游客来了，又走了', text: '水不清，宣传只能带来一次客流。水面之下没有恢复，生意也很难留下。', effect: {} },
  { title: '鱼群回到浅滩', text: '鱼和鸟不是景观装饰。连续修复栖息地，它们才有地方产卵、觅食和躲避。', effect: {} },
  { title: '基层管护出现缺口', text: '工程结束不等于治理结束。留下一笔管护费，比重新修一次便宜。', effect: { treasury: -7 } },
  { title: '返乡的人开了新店', text: '水岸空间开始有了新用途。产业培育越早，能接住的人越多。', effect: { jobs: 4, livelihood: 5 } },
  { title: '第八年，回河边看看', text: '最后一笔账不看某项最高分，看水、鱼和人的收入能不能同时站住。', effect: {} },
];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** 纯函数，供单元测试与 UI 共用。 */
export function applyRiverTurn(state, actionId) {
  const action = ACTIONS[actionId];
  if (!action || state.turn >= 8) return state;
  const event = EVENTS[state.turn];
  const s = { ...state, ...state.values, history: [...state.history] };
  s.treasury -= action.cost;
  for (const [key, delta] of Object.entries(action.effect)) s[key] += delta;

  // 连续投入形成能力，不靠随机事件给玩家硬塞输赢。
  s.enforcement = state.enforcement + (actionId === 'enforce' ? 1 : 0);
  s.treatmentYears = state.treatmentYears + (actionId === 'treatment' ? 1 : 0);
  s.habitatYears = state.habitatYears + (actionId === 'habitat' ? 1 : 0);
  s.industryYears = state.industryYears + (actionId === 'industry' ? 1 : 0);

  if (actionId === 'industry') {
    const suitability = Math.max(0.2, Math.min(1.2, s.water / 70));
    s.livelihood += Math.round(8 * suitability) - 8;
    s.jobs += Math.round(10 * suitability) - 10;
  }
  if (actionId === 'habitat' && s.pollution > 55) s.fish -= 5;
  if (actionId === 'treatment') s.pollution -= Math.min(6, s.treatmentYears * 2);

  for (const [key, delta] of Object.entries(event.effect)) s[key] += delta;
  if (state.turn === 4 && s.habitatYears >= 2 && s.pollution < 50) s.fish += 12;
  if (state.turn === 3 && s.water < 48) s.livelihood -= 6;
  if (state.turn === 6 && s.industryYears >= 2 && s.water >= 60) {
    s.livelihood += 10;
    s.jobs += 10;
  }

  // 老污染会按治理进度自然衰减，不治理则缓慢回弹。
  s.pollution += s.treatmentYears > 0 ? -2 : 2;
  s.water = clamp(s.water - s.pollution * 0.025 + s.habitatYears * 0.5);
  s.pollution = clamp(s.pollution);
  s.livelihood = clamp(s.livelihood);
  s.jobs = clamp(s.jobs);
  s.fish = clamp(s.fish);
  s.turn += 1;
  s.history.push({ year: 2013 + state.turn, actionId, title: action.name, event: event.title, water: s.water, livelihood: s.livelihood, fish: s.fish });
  return {
    turn: s.turn,
    treasury: s.treasury,
    enforcement: s.enforcement,
    treatmentYears: s.treatmentYears,
    habitatYears: s.habitatYears,
    industryYears: s.industryYears,
    history: s.history,
    values: { water: s.water, pollution: s.pollution, livelihood: s.livelihood, jobs: s.jobs, fish: s.fish },
  };
}

export function newRiverState() {
  return {
    turn: 0,
    treasury: 120,
    enforcement: 0,
    treatmentYears: 0,
    habitatYears: 0,
    industryYears: 0,
    history: [],
    values: { water: 24, pollution: 82, livelihood: 65, jobs: 20, fish: 12 },
  };
}

let state = newRiverState();
let selected = null;
let bound = false;

export function openRiver() {
  const root = document.getElementById('riverlog');
  if (!root) return;
  state = newRiverState();
  selected = null;
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => root.classList.add('is-open'));
  bind();
  render();
}

export function closeRiver() {
  const root = document.getElementById('riverlog');
  if (!root) return;
  root.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { root.hidden = true; }, 280);
}

function bind() {
  if (bound) return;
  bound = true;
  document.getElementById('river-close')?.addEventListener('click', closeRiver);
  document.getElementById('river-restart')?.addEventListener('click', () => {
    state = newRiverState();
    selected = null;
    render();
  });
  document.querySelectorAll('[data-river-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.turn >= 8) return;
      selected = button.dataset.riverAction;
      document.querySelectorAll('[data-river-action]').forEach((b) => b.classList.toggle('is-on', b === button));
      document.getElementById('river-commit').disabled = false;
      document.getElementById('river-selection').textContent = ACTIONS[selected].hint;
      preview();
    });
  });
  document.getElementById('river-commit')?.addEventListener('click', () => {
    if (!selected || state.turn >= 8) return;
    const before = state.values;
    state = applyRiverTurn(state, selected);
    selected = null;
    render();
    if (state.turn < 8) {
      const event = EVENTS[state.turn - 1];
      const note = document.getElementById('river-event');
      if (note) note.innerHTML = `<strong>${event.title}</strong><p>${event.text}</p><small>${deltaText(before, state.values)}</small>`;
      note?.classList.add('is-visible');
    }
  });
  window.addEventListener('resize', () => {
    if (!document.getElementById('riverlog')?.hidden) drawRiver();
  });
}

function deltaText(a, b) {
  return `水质 ${signed(b.water - a.water)} · 污染 ${signed(b.pollution - a.pollution)} · 民生 ${signed(b.livelihood - a.livelihood)} · 鱼类 ${signed(b.fish - a.fish)}`;
}
function signed(n) { return n > 0 ? `+${n}` : `${n}`; }

function render() {
  const root = document.getElementById('riverlog');
  if (!root) return;
  const over = state.turn >= 8;
  const year = over ? 2020 : 2013 + state.turn;
  root.querySelector('.river__year').textContent = year;
  root.querySelector('.river__round').textContent = over ? '八年结果' : `第 ${state.turn + 1} 年，共 8 年`;
  root.querySelector('.river__treasury').textContent = `${state.treasury} 万`;
  root.querySelector('#river-commit').disabled = true;
  root.querySelector('#river-commit').textContent = over ? '本局已结束' : '执行这一年的方案';
  root.querySelector('#river-selection').textContent = over ? '每一种方案都留下了后果。可以换个顺序再试一次。' : '先选一项，再执行。今年的选择会影响后面几年。';
  root.querySelector('#river-event').classList.toggle('is-visible', over || state.turn === 0);
  if (state.turn === 0) {
    root.querySelector('#river-event').innerHTML = '<strong>先把这条河接过来</strong><p>你手上有 120 万元可支配资金和八年时间。模型中的数值仅用于呈现取舍，不代表浦江真实年度统计。</p>';
  }
  if (over) showResult();
  document.querySelectorAll('[data-river-action]').forEach((b) => {
    b.classList.remove('is-on');
    b.disabled = over || state.treasury < ACTIONS[b.dataset.riverAction].cost;
  });
  for (const key of ['water', 'pollution', 'livelihood', 'jobs', 'fish']) {
    const n = root.querySelector(`[data-river-value="${key}"]`);
    if (n) n.textContent = state.values[key];
  }
  const dots = root.querySelector('.river__timeline');
  dots.innerHTML = Array.from({ length: 8 }, (_, i) => {
    const h = state.history[i];
    return `<span class="${h ? 'is-done' : ''}" title="${h ? `${h.year} ${h.title}` : `${2013 + i} 年`}">${2013 + i}</span>`;
  }).join('');
  requestAnimationFrame(drawRiver);
}

function preview() {
  if (!selected) return;
  const next = applyRiverTurn(state, selected);
  document.getElementById('river-preview').textContent = deltaText(state.values, next.values);
}

function showResult() {
  const v = state.values;
  const balanced = v.water >= 65 && v.fish >= 55 && v.livelihood >= 55 && state.treasury >= 0;
  const score = Math.round(v.water * 0.28 + v.fish * 0.24 + v.livelihood * 0.25 + v.jobs * 0.13 + Math.min(100, Math.max(0, state.treasury)) * 0.1);
  const title = balanced ? '河水清了，人也留下来了' : v.water >= 65 ? '水清了，账上还有一道题' : '这条河还会反复';
  const body = balanced
    ? '你没有只追求水面颜色。治污、栖息地和新收入接上了，河流才不只是完成了一个工程。'
    : v.water >= 65
      ? '水质达标只是前半张答卷。试试更早安排产业转型，让沿岸的人也能分享到治理带来的机会。'
      : '单点治理很容易按下葫芦浮起瓢。试试先截污，再连续做园区和河岸修复，最后培育新收入。';
  const best = Math.max(score, Number(localStorage.getItem('liangshan.river.best') || 0));
  localStorage.setItem('liangshan.river.best', String(best));
  document.getElementById('river-event').innerHTML = `<span class="river__resultkicker">本局 ${score} 分 · 最好 ${best} 分</span><strong>${title}</strong><p>${body}</p><ol class="river__history">${state.history.map((h) => `<li><b>${h.year}</b><span>${h.title}</span><i>水质 ${h.water}</i></li>`).join('')}</ol>`;
}

function drawRiver() {
  const cv = document.getElementById('river-canvas');
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(320, rect.width);
  const h = Math.max(260, rect.height);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const v = state.values;
  const purity = v.water / 100;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#eee9db');
  sky.addColorStop(0.6, purity > 0.6 ? '#d6e3dc' : '#ded7c2');
  sky.addColorStop(1, '#b7b49d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 三层山影，透明度随水质恢复而清晰。
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const t = x / w;
      const y = h * (0.28 + layer * 0.085) - Math.sin(t * 7 + layer * 2.1) * h * 0.075 - Math.sin(t * 17 + layer) * h * 0.025;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(57,76,60,${0.1 + layer * 0.065})`;
    ctx.fill();
  }

  const riverTop = h * 0.52;
  const grad = ctx.createLinearGradient(0, riverTop, 0, h);
  grad.addColorStop(0, purity > 0.62 ? '#7fa9a2' : '#999985');
  grad.addColorStop(1, purity > 0.62 ? '#315f60' : '#726e55');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, riverTop + h * 0.04);
  ctx.bezierCurveTo(w * 0.24, riverTop - 18, w * 0.46, riverTop + h * 0.15, w, riverTop + 12);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 1;
  for (let i = 0; i < 42; i++) {
    const y = riverTop + 25 + (i / 42) * (h - riverTop - 25);
    const x = ((i * 127 + state.turn * 43) % Math.max(1, w - 90));
    const len = 26 + (i % 5) * 16;
    ctx.strokeStyle = `rgba(246,242,222,${0.12 + purity * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
    ctx.stroke();
  }

  // 河岸植物和鱼随指标增加，画的是变化，不是装饰贴纸。
  ctx.strokeStyle = '#455f45';
  ctx.lineWidth = 1.2;
  const reeds = Math.round(14 + v.fish * 0.3);
  for (let i = 0; i < reeds; i++) {
    const x = ((i * 83 + 17) % Math.max(1, w));
    const y = riverTop + Math.sin(x / w * Math.PI * 3) * 18 + 12;
    const len = 8 + (i % 4) * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 2, y - len, x + (i % 2 ? 4 : -3), y - len * 1.4);
    ctx.stroke();
  }
  const fish = Math.round(v.fish / 8);
  for (let i = 0; i < fish; i++) {
    const x = 35 + ((i * 151 + 28) % Math.max(50, w - 90));
    const y = riverTop + 50 + ((i * 47) % Math.max(50, h - riverTop - 70));
    const size = 3 + (i % 3);
    ctx.strokeStyle = 'rgba(25,52,48,.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.6, size * 0.6, 0, 0, Math.PI * 2);
    ctx.moveTo(x - size * 1.6, y);
    ctx.lineTo(x - size * 2.6, y - size * 0.8);
    ctx.lineTo(x - size * 2.6, y + size * 0.8);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(38,48,42,.72)';
  ctx.font = '12px "Noto Serif SC", serif';
  ctx.fillText('示意画面，变化由本局模型驱动', 20, h - 18);
}
