/** quiz.js — 十站行旅：从长卷内容生成了 24 道带出处讲解的观察题。 */
import POINTS from './points.js';

const QUESTIONS = [
  ['qianjiangyuan', '截至 2026 年 7 月，钱江源的国家公园身份是什么？', ['国家公园候选区', '已正式设立国家公园', '国家级风景名胜区', '世界自然遗产'], 0, '当时仍称「钱江源与百山祖国家公园候选区」，尚未正式挂牌。'],
  ['qianjiangyuan', '2016 年钱江源国家公园体制试点区的面积约为多少？', ['25.2 平方公里', '252 平方公里', '2520 平方公里', '9744 平方公里'], 1, '试点区约 252 平方公里，涉及 4 个乡镇、19 个行政村、9744 人。'],
  ['qianjiangyuan', '钱江源故事里的「先让出来」主要指什么？', ['让出景区门票', '让出城市建设用地', '限制砍伐和开矿，保护上游', '把村庄整体搬走'], 2, '这里优先保护江源生态，限制能直接带来收入的砍伐和开矿活动。'],
  ['xiajiang', '下姜村转型前，哪些环境问题被直接写进了村庄记忆？', ['台风和海平面上升', '矿山塌陷和沙漠化', '冰川退缩', '砍树、猪圈近屋和溪水浑浊'], 3, '变化从改厕、改灶、改路和清理整条溪开始，并不是突然建起一个景区。'],
  ['xiajiang', '2024 年下姜村村民人均可支配收入是多少？', ['54931 元', '9072 元', '134.4 万元', '207.65 万元'], 0, '2024 年为 54931 元。9072 万元是同年旅游收入，口径不同。'],
  ['xiajiang', '下姜村后来带起周边村庄一起做什么？', ['统一采矿', '共同发展', '全部改种水稻', '集中养蚕'], 1, '下姜村的发展延伸到周边村庄，重点在于共同发展，而非单村流量。'],
  ['yucun', '「绿水青山就是金山银山」在余村提出的日期是？', ['2003 年 4 月', '2005 年 8 月 15 日', '2015 年 10 月', '2020 年 3 月'], 1, '2005 年 8 月 15 日，这一理念在余村提出。'],
  ['yucun', '余村最后一座矿山关停的时间是？', ['1993 年', '2003 年底', '2005 年 3 月底', '2015 年'], 2, '2003 年决定分两步关停矿山和水泥厂，2005 年 3 月底最后一座矿山关停。'],
  ['yucun', '关矿后的转型可以被概括成哪条曲线？', ['收入立即增长', '先承受收入下跌，再慢慢恢复', '始终没有任何代价', '只靠矿价上涨'], 1, '2004 年村集体收入降至 21 万元，之后经历了漫长的恢复期，不能略过中间的阵痛。'],
  ['xinxinqiao', '新溪桥村认养模式改变的核心是什么？', ['把菜换成更重的大米', '只把菜价翻倍', '把一次买卖延长成一段关系', '要求认养人天天来劳动'], 2, '菜从按斤卖变成按季认养，变化也发生在土地、村民与认养人的关系中。'],
  ['xinxinqiao', '长卷中关于新溪桥村数字的主要来源是？', ['本组实地调研与村级反馈', '外国遥感数据', '小说情节', '游戏虚构'], 0, '该村的数据来自本组实地调研及村级调研反馈表。'],
  ['pujiang', '浦江水晶污染治理前，出境断面连续 8 年是什么水质？', ['Ⅰ类', 'Ⅱ类', 'Ⅲ类', '劣Ⅴ类'], 3, '治理前为连续 8 年劣Ⅴ类，治理后出境断面提升到Ⅲ类。'],
  ['pujiang', '浦江治理采取的做法更接近哪一种？', ['只换河道颜色', '关停整治、集中入园和长期治水', '停止所有产业', '把污水转移到邻县'], 1, '整治低小散加工户的同时保留企业集中入园，治理和产业调整同时发生。'],
  ['pujiang', '关于浦江关停户数，站内为什么保留两个口径？', ['为了凑数据', '不同阶段与范围有不同统计口径', '因为小数点写错', '两个数字都是随机生成'], 1, '资料中有 2.2 万余家与阶段性 1.8 万余家的口径，站内标明差异，不强行混成一个数字。'],
  ['yunhe', '云和梯田的农业文化遗产身份应当怎样准确表述？', ['2015 年入选中国重要农业文化遗产', '2015 年已入选全球重要农业文化遗产', '从未获得农业文化遗产认定', '只属于工业遗产'], 0, '云和梯田 2015 年入选中国重要农业文化遗产，站内资料中尚未获 GIAHS 认定。'],
  ['yunhe', '梯田抛荒为什么会影响蓄水？', ['梯田颜色改变', '田坎失修坍塌', '鱼会吃掉田坎', '游客减少导致蒸发'], 1, '田荒后田坎失修坍塌，蓄水能力随之受损，所以保护的是一套仍在运转的系统。'],
  ['yunhe', '稻、鱼与梯田之间形成怎样的关系？', ['彼此完全无关', '只供游客观赏', '鱼吃虫、鱼粪肥田，形成循环', '鱼和稻争水后必须清除鱼'], 2, '稻鱼共生把生产与生态放在同一个系统里。'],
  ['xixi', '西溪湿地在 2005 年获得的身份是？', ['全国第一个国家湿地公园', '世界自然遗产', '国家公园', '国家级矿山公园'], 0, '2005 年成为全国第一个国家湿地公园，2009 年列入国际重要湿地名录。'],
  ['xixi', '截至 2024 年底，西溪湿地记录到多少种鸟类？', ['69 种', '155 种', '224 种', '971 种'], 2, '鸟类为 224 种；971 种是维管束植物数量，918 种是昆虫数量。'],
  ['xixi', '西溪的保护方式更接近哪一种？', ['完全封闭，没有任何缓冲', '全改成商业街区', '抽干所有鱼塘', '分区保护并保留水网和鱼塘系统'], 3, '核心区保护，外围留缓冲，水网、鱼塘和漾荡仍保持成片相接。'],
  ['dachendao', '2023 年大陈岛浙江省首笔海洋蓝碳交易的标的是什么？', ['2223 吨贝类碳汇', '2223 吨煤炭', '10.5 万吨柴油', '426 吨塑料'], 0, '2223 吨贝类碳汇成交 10.05 万元，是浙江省首笔海洋蓝碳交易。'],
  ['dachendao', '大陈岛的生态修复包含哪些实际措施？', ['只安装宣传牌', '修砂质岸线、投鱼礁、恢复植被和增殖放流', '围填全部海域', '取消所有渔业'], 1, '蓝碳交易之前，岛上已开展岸线、鱼礁、植被与增殖放流等修复工作。'],
  ['sangji', '桑基鱼塘中，塘泥回到哪里去？', ['倒入垃圾填埋场', '壅到桑树下作肥料', '烧成水泥', '直接排入河道'], 1, '塘泥壅桑、桑叶喂蚕、蚕沙养鱼、鱼粪肥塘，各环节互相衔接。'],
  ['tengtou', '滕头村在 1993 年建立的环保制度有什么特点？', ['村级环保委员会对污染项目一票否决', '任何项目都不审查', '只检查村外企业', '只限制游客数量'], 0, '村级环保委员会对有污染的项目一票否决，体现了村庄主动给自己立规矩。'],
];

let run = [];
let index = 0;
let score = 0;
let answered = false;
let bound = false;

export function openQuiz() {
  const root = document.getElementById('quizlog');
  if (!root) return;
  run = shuffle([...QUESTIONS]).slice(0, 8);
  index = 0;
  score = 0;
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => root.classList.add('is-open'));
  bind();
  render();
}

export function closeQuiz() {
  const root = document.getElementById('quizlog');
  if (!root) return;
  root.classList.remove('is-open');
  document.body.style.overflow = '';
  setTimeout(() => { root.hidden = true; }, 280);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bind() {
  if (bound) return;
  bound = true;
  document.getElementById('quiz-close')?.addEventListener('click', closeQuiz);
  document.getElementById('quiz-next')?.addEventListener('click', () => {
    if (!answered) return;
    index += 1;
    render();
  });
  document.getElementById('quiz-restart')?.addEventListener('click', openQuiz);
}

function render() {
  answered = false;
  const root = document.getElementById('quizlog');
  const done = index >= run.length;
  root.querySelector('.quiz__count').textContent = done ? '本卷完成' : `第 ${index + 1} 题 / ${run.length}`;
  root.querySelector('.quiz__score').textContent = `${score} 分`;
  root.querySelector('.quiz__progress').style.width = `${Math.min(100, (index / run.length) * 100)}%`;
  root.querySelector('#quiz-restart').hidden = !done;
  root.querySelector('#quiz-next').hidden = done;
  root.querySelector('#quiz-next').disabled = true;
  root.querySelector('#quiz-options').innerHTML = '';
  if (done) {
    const best = Math.max(score, Number(localStorage.getItem('liangshan.quiz.best') || 0));
    localStorage.setItem('liangshan.quiz.best', String(best));
    root.querySelector('.quiz__eyebrow').textContent = `本轮 ${score} / ${run.length} · 最好 ${best} / ${run.length}`;
    root.querySelector('.quiz__question').textContent = score === run.length ? '十站没白走，这些细节你都记住了。' : '错题值得回到长卷里再看一眼。';
    root.querySelector('.quiz__explain').innerHTML = `每轮从 24 道题中抽取 8 道。再开一卷，会遇到不同的地点和统计口径。<br>这不是知识竞赛的终点，题后给出的站名都能回到原站核对。`;
    return;
  }

  const q = run[index];
  const pointIndex = POINTS.findIndex((p) => p.id === q[0]);
  const point = POINTS[pointIndex];
  root.querySelector('.quiz__eyebrow').textContent = `第 ${String(pointIndex + 1).padStart(2, '0')} 站 · ${point.region} · ${point.name}`;
  root.querySelector('.quiz__question').textContent = q[1];
  root.querySelector('.quiz__explain').textContent = '选一个答案。每题都会说明依据，答错也会保留讲解。';
  q[2].forEach((label, i) => {
    const button = document.createElement('button');
    button.className = 'quiz__option';
    button.innerHTML = `<span>${String.fromCharCode(65 + i)}</span><b>${label}</b>`;
    button.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const right = i === q[3];
      if (right) score += 1;
      root.querySelectorAll('.quiz__option').forEach((b, k) => {
        b.disabled = true;
        if (k === q[3]) b.classList.add('is-right');
        if (k === i && !right) b.classList.add('is-wrong');
      });
      root.querySelector('.quiz__score').textContent = `${score} 分`;
      root.querySelector('.quiz__explain').innerHTML = `<strong>${right ? '答对了' : '再记一下'}</strong>${q[4]}<br><small>出处：${point.data[0]?.source || point.source}。可回到长卷「${point.name}」站核对。</small>`;
      root.querySelector('#quiz-next').disabled = false;
      root.querySelector('#quiz-next').textContent = index === run.length - 1 ? '看本轮结果' : '下一题';
    });
    root.querySelector('#quiz-options').appendChild(button);
  });
}
