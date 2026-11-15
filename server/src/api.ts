/**
 * 业务接口：观鸟观测记录、账本推演成绩、燕鸥招引成绩。
 *
 * 服务端的抽签逻辑与前端 data/birds.js 保持一致，
 * 否则玩家能靠改前端代码刷稀有种。所以抽签在服务端做。
 */
import type { Context } from 'hono';
import { pool } from './db.js';
import type { AuthUser } from './auth.js';

/* ────────────────────────── 抽签数据 ────────────────────────── */

const RARITY_WEIGHT: Record<string, number> = {
  C: 100,
  U: 38,
  R: 9,
  M: 1.6,
  X: 0.18,
};

type Species = { s: string; en: string; r: string; n: string; tip: string };

const SITE_TABLE: Record<string, { name: string; region: string; species: Species[] }> = {
  jiulongshan: {
    name: '九龙山',
    region: '丽水遂昌',
    species: [
      { s: '凤头蜂鹰', en: 'Crested Honey Buzzard', r: 'U', n: '数十只一批', tip: '头小颈长，翅膀宽，迁徙时常成群借上升气流盘旋' },
      { s: '松雀鹰', en: 'Besra', r: 'U', n: '数只', tip: '体型小，扇翅快，常在林缘突袭' },
      { s: '灰脸鵟鹰', en: 'Grey-faced Buzzard', r: 'U', n: '成群', tip: '脸颊灰色，迁徙集群' },
      { s: '赤腹鹰', en: 'Chinese Sparrowhawk', r: 'U', n: '数只', tip: '翼尖黑色，雄鸟胸腹栗红' },
      { s: '白颈长尾雉', en: "Elliot's Pheasant", r: 'R', n: '偶见', tip: '中国特有种，林下活动' },
      { s: '黄腹角雉', en: "Cabot's Tragopan", r: 'X', n: '极难见', tip: '国家一级保护，林下隐蔽' },
    ],
  },
  qingshanhu: {
    name: '青山湖',
    region: '杭州临安',
    species: [
      { s: '绿眉鸭', en: 'American Wigeon', r: 'R', n: '1', tip: '雄鸟头顶奶白、眼后一道绿' },
      { s: '鸳鸯', en: 'Mandarin Duck', r: 'C', n: '数十只', tip: '雄鸟帆羽醒目' },
      { s: '普通鸬鹚', en: 'Great Cormorant', r: 'C', n: '成群', tip: '站树桩上晾翅' },
      { s: '白鹭', en: 'Little Egret', r: 'C', n: '常见', tip: '黑喙黑腿黄脚' },
      { s: '苍鹭', en: 'Grey Heron', r: 'C', n: '数只', tip: '一动不动站很久' },
      { s: '中华秋沙鸭', en: 'Scaly-sided Merganser', r: 'R', n: '偶见', tip: '国家一级保护' },
    ],
  },
  nanhu: {
    name: '南湖公园',
    region: '杭州余杭',
    species: [
      { s: '白鹡鸰', en: 'White Wagtail', r: 'C', n: '常见', tip: '尾巴不停上下摆' },
      { s: '北红尾鸲', en: 'Daurian Redstart', r: 'C', n: '常见', tip: '雄鸟橙腹黑脸白翅斑' },
      { s: '小䴙䴘', en: 'Little Grebe', r: 'C', n: '数只', tip: '受惊直接沉下去' },
      { s: '扇尾沙锥', en: 'Common Snipe', r: 'U', n: '数只', tip: '泥滩上扎下去觅食' },
      { s: '短耳鸮', en: 'Short-eared Owl', r: 'R', n: '偶见', tip: '黄昏在开阔地低飞' },
      { s: '东方白鹳', en: 'Oriental Stork', r: 'X', n: '极罕见', tip: '国家一级保护' },
    ],
  },
  xixi: {
    name: '西溪湿地',
    region: '杭州西湖区',
    species: [
      { s: '白头鹎', en: 'Light-vented Bulbul', r: 'C', n: '极常见', tip: '后脑一块白' },
      { s: '棕背伯劳', en: 'Long-tailed Shrike', r: 'C', n: '常见', tip: '眼罩黑色，尾长' },
      { s: '黑水鸡', en: 'Common Moorhen', r: 'C', n: '常见', tip: '额甲红色' },
      { s: '普通翠鸟', en: 'Common Kingfisher', r: 'U', n: '偶见', tip: '蓝绿闪光，贴水面直线飞' },
      { s: '震旦鸦雀', en: 'Reed Parrotbill', r: 'R', n: '小群', tip: '芦苇丛里，黄色喙' },
      { s: '白胸翡翠', en: 'White-throated Kingfisher', r: 'R', n: '偶见', tip: '胸腹大片栗红' },
    ],
  },
  hangzhouwan: {
    name: '杭州湾湿地',
    region: '宁波慈溪',
    species: [
      { s: '黑脸琵鹭', en: 'Black-faced Spoonbill', r: 'R', n: '数只', tip: '匙状长喙左右扫水' },
      { s: '卷羽鹈鹕', en: 'Dalmatian Pelican', r: 'R', n: '偶见', tip: '体型巨大' },
      { s: '反嘴鹬', en: 'Pied Avocet', r: 'C', n: '成群', tip: '喙上翘' },
      { s: '黑腹滨鹬', en: 'Dunlin', r: 'C', n: '数千只', tip: '滩涂上像流动的云' },
      { s: '遗鸥', en: 'Relict Gull', r: 'M', n: '罕见', tip: '繁殖羽头全黑' },
      { s: '黄嘴白鹭', en: 'Chinese Egret', r: 'R', n: '偶见', tip: '喙黄色' },
    ],
  },
  jiushan: {
    name: '韭山列岛',
    region: '宁波象山',
    species: [
      { s: '中华凤头燕鸥', en: 'Chinese Crested Tern', r: 'X', n: '数十只', tip: '黄色喙尖、黑色冠羽，全球极危' },
      { s: '大凤头燕鸥', en: 'Greater Crested Tern', r: 'C', n: '数百只', tip: '与中华凤头混群' },
      { s: '黑尾鸥', en: 'Black-tailed Gull', r: 'C', n: '成群', tip: '尾端黑带' },
      { s: '褐翅燕鸥', en: 'Bridled Tern', r: 'U', n: '数只', tip: '翅上褐色' },
      { s: '白额鹱', en: 'Streaked Shearwater', r: 'R', n: '偶见', tip: '贴海面滑翔' },
      { s: '岩鹭', en: 'Pacific Reef Heron', r: 'R', n: '偶见', tip: '深灰色型常见' },
    ],
  },
  nanji: {
    name: '南麂列岛',
    region: '温州平阳',
    species: [
      { s: '黑尾鸥', en: 'Black-tailed Gull', r: 'C', n: '成群', tip: '码头附近最多' },
      { s: '褐翅燕鸥', en: 'Bridled Tern', r: 'U', n: '数只', tip: '夜间也会叫' },
      { s: '白额鹱', en: 'Streaked Shearwater', r: 'U', n: '数只', tip: '清晨海面成列滑翔' },
      { s: '鹗', en: 'Osprey', r: 'R', n: '偶见', tip: '悬停后扎水抓鱼' },
      { s: '游隼', en: 'Peregrine Falcon', r: 'R', n: '偶见', tip: '俯冲速度极快' },
    ],
  },
  tianmushan: {
    name: '天目山',
    region: '杭州临安',
    species: [
      { s: '白鹇', en: 'Silver Pheasant', r: 'U', n: '数只', tip: '雄鸟白黑相间，尾长' },
      { s: '勺鸡', en: 'Koklass Pheasant', r: 'R', n: '偶见', tip: '叫声像拉锯' },
      { s: '红嘴蓝鹊', en: 'Red-billed Blue Magpie', r: 'C', n: '成群', tip: '长尾拖曳' },
      { s: '棕噪鹛', en: 'Rufous Laughingthrush', r: 'U', n: '小群', tip: '中国特有' },
      { s: '白颈长尾雉', en: "Elliot's Pheasant", r: 'R', n: '偶见', tip: '中国特有种' },
      { s: '仙八色鸫', en: 'Fairy Pitta', r: 'R', n: '偶见', tip: '八种颜色' },
    ],
  },
  wuyanling: {
    name: '乌岩岭',
    region: '温州泰顺',
    species: [
      { s: '黄腹角雉', en: "Cabot's Tragopan", r: 'R', n: '偶见', tip: '雄鸟肉角与肉裙求偶时展开' },
      { s: '白鹇', en: 'Silver Pheasant', r: 'C', n: '数只', tip: '林下宽阔处活动' },
      { s: '灰胸竹鸡', en: 'Chinese Bamboo Partridge', r: 'C', n: '常见', tip: '叫声「你——嫂子」' },
      { s: '栗头鹟莺', en: 'Chestnut-crowned Warbler', r: 'U', n: '数只', tip: '动作极快' },
      { s: '丽星鹩鹛', en: 'Spotted Wren-Babbler', r: 'R', n: '偶见', tip: '藏于密林底层' },
    ],
  },
};

const TYPHOON_POOL: Species[] = [
  { s: '白斑军舰鸟', en: 'Lesser Frigatebird', r: 'M', n: '1', tip: '雄鸟喉囊鲜红，翼展惊人' },
  { s: '白额鹱', en: 'Streaked Shearwater', r: 'R', n: '数只', tip: '额头白色，贴水滑翔' },
  { s: '褐鲣鸟', en: 'Brown Booby', r: 'M', n: '1', tip: '胸腹纯白，头背褐色' },
  { s: '红脚鲣鸟', en: 'Red-footed Booby', r: 'M', n: '1', tip: '脚鲜红，尾楔形' },
  { s: '中贼鸥', en: 'Pomarine Jaeger', r: 'M', n: '1', tip: '尾羽中央延长' },
  { s: '白燕鸥', en: 'White Tern', r: 'M', n: '1', tip: '通体纯白，黑眼圈' },
];

const TYPHOON_NAMES = ['海葵', '杜苏芮', '灿都', '梅花', '泰利', '小犬', '普拉桑', '康妮'];

/* ────────────────────────── 抽签 ────────────────────────── */

function pick<T>(arr: T[]): T {
  const v = arr[Math.floor(Math.random() * arr.length)];
  if (v === undefined) throw new Error('empty_pool');
  return v;
}

function drawSpecies(pool: Species[], luck: number): Species {
  const boost = 0.35 + luck * 2.4;
  const weights = pool.map((sp) => {
    const base = RARITY_WEIGHT[sp.r] ?? 10;
    const isRare = sp.r === 'R' || sp.r === 'M' || sp.r === 'X';
    return isRare ? base * boost : base;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) {
      const sp = pool[i];
      if (sp) return sp;
    }
  }
  const last = pool[pool.length - 1];
  if (!last) throw new Error('empty_pool');
  return last;
}

const WEATHERS = {
  typhoon: ['暴雨', '大雨', '阴有暴雨'],
  normal: ['晴', '多云', '阴', '小雨', '雾'],
};

const WINDS = {
  typhoon: ['偏东 9 级', '东南 10 级', '偏南 8 级'],
  normal: ['东北 3 级', '北 2 级', '东风 4 级', '微风', '静风'],
};

function randomDate(): string {
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const year = month > 11 ? 2025 : 2026;
  return `${year} 年 ${month} 月 ${day} 日`;
}

/* ────────────────────────── 接口 ────────────────────────── */

/** 抽一条观测记录（服务端判定稀有度，前端只负责展示） */
export async function drawBird(c: Context) {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body?.siteId ?? '');
  const typhoon = Boolean(body?.typhoon);

  const site = SITE_TABLE[siteId];
  if (!site) return c.json({ ok: false, error: 'unknown_site' }, 400);

  const luck = Math.random();
  const sp = typhoon ? pick(TYPHOON_POOL) : drawSpecies(site.species, luck);

  const record = {
    siteId,
    siteName: site.name,
    region: site.region,
    species: sp.s,
    speciesEn: sp.en,
    rarity: sp.r,
    count: sp.n,
    tip: sp.tip,
    typhoon,
    date: randomDate(),
    weather: pick(typhoon ? WEATHERS.typhoon : WEATHERS.normal),
    wind: pick(typhoon ? WINDS.typhoon : WINDS.normal),
    typhoonName: typhoon ? pick(TYPHOON_NAMES) : null,
  };

  // 游客也记录，注册时并入正式账号；这样「先试玩再注册」不会丢进度
  await pool.query(
    `INSERT INTO bird_logs
     (user_id, site_id, site_name, species, rarity, count_text, observed_at, weather, wind, typhoon)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      user.id,
      record.siteId,
      record.siteName,
      record.species,
      record.rarity,
      record.count,
      record.date,
      record.weather,
      record.wind,
      record.typhoon,
    ]
  );

  return c.json({ ok: true, record });
}

/** 我的观测图鉴（注册用户） */
export async function myBirds(c: Context) {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) return c.json({ ok: false, error: 'unauthorized' }, 401);

  const { rows: speciesRows } = await pool.query<{ species: string; n: string }>(
    `SELECT species, count(*)::text AS n FROM bird_logs WHERE user_id = $1 GROUP BY species`,
    [user.id]
  );
  const { rows: recent } = await pool.query(
    `SELECT site_name, species, rarity, count_text, observed_at, weather, wind, typhoon, created_at
     FROM bird_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [user.id]
  );

  const seen: Record<string, number> = {};
  for (const r of speciesRows) seen[r.species] = Number(r.n);

  return c.json({ ok: true, seen, recent, total: Object.keys(seen).length });
}

/** 提交一局账本推演 */
export async function submitLedger(c: Context) {
  const user = c.get('user') as AuthUser;
  if (user.kind !== 'member') return c.json({ ok: false, error: 'need_member' }, 403);

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.years)) return c.json({ ok: false, error: 'bad_body' }, 400);
  if (body.years.length > 40) return c.json({ ok: false, error: 'too_long' }, 400);

  const years = body.years.map((y: unknown) => {
    const o = y as Record<string, unknown>;
    return {
      year: Number(o.year) || 0,
      mode: String(o.mode ?? '').slice(0, 8),
      income: Number(o.income) || 0,
      cash: Number(o.cash) || 0,
      mountain: Number(o.mountain) || 0,
    };
  });

  const finalYear = Number(body.finalYear) || 0;
  const finalCash = Number(body.finalCash) || 0;
  const finalMountain = Number(body.finalMountain) || 0;
  const closedYear = body.closedYear == null ? null : Number(body.closedYear);

  const { rows } = await pool.query(
    `INSERT INTO ledger_runs (user_id, closed_year, final_year, final_cash, final_mountain, years_json)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [user.id, closedYear, finalYear, finalCash, finalMountain, JSON.stringify(years)]
  );

  return c.json({ ok: true, id: rows[0]?.id });
}

/** 提交一局燕鸥招引 */
export async function submitTern(c: Context) {
  const user = c.get('user') as AuthUser;
  if (user.kind !== 'member') return c.json({ ok: false, error: 'need_member' }, 403);

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.seasons)) return c.json({ ok: false, error: 'bad_body' }, 400);
  if (body.seasons.length > 20) return c.json({ ok: false, error: 'too_long' }, 400);

  const detail: Array<{
    round: number;
    island: string;
    decoy: string;
    sound: string;
    arrived: boolean;
    birds: number;
    nests: number;
    chicks: number;
  }> = body.seasons.map((s: unknown) => {
    const o = s as Record<string, unknown>;
    return {
      round: Number(o.round) || 0,
      island: String(o.island ?? '').slice(0, 12),
      decoy: String(o.decoy ?? '').slice(0, 12),
      sound: String(o.sound ?? '').slice(0, 12),
      arrived: Boolean(o.arrived),
      birds: Number(o.birds) || 0,
      nests: Number(o.nests) || 0,
      chicks: Number(o.chicks) || 0,
    };
  });

  const totalChicks = detail.reduce((a, s) => a + s.chicks, 0);
  const successYears = detail.filter((s) => s.arrived).length;

  // 历史最佳
  const { rows: best } = await pool.query<{ best: string | null }>(
    'SELECT max(total_chicks)::text AS best FROM tern_runs WHERE user_id = $1',
    [user.id]
  );
  const prevBest = Number(best[0]?.best ?? 0);

  const { rows } = await pool.query(
    `INSERT INTO tern_runs (user_id, seasons, total_chicks, success_years, detail_json)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [user.id, detail.length, totalChicks, successYears, JSON.stringify(detail)]
  );

  return c.json({
    ok: true,
    id: rows[0]?.id,
    totalChicks,
    successYears,
    prevBest,
    isNewBest: totalChicks > prevBest,
  });
}

/** 个人战绩汇总 */
export async function myStats(c: Context) {
  const user = c.get('user') as AuthUser;

  const { rows: b } = await pool.query<{ c: string }>(
    'SELECT count(DISTINCT species)::text AS c FROM bird_logs WHERE user_id = $1',
    [user.id]
  );
  const { rows: l } = await pool.query<{ c: string; best: string | null }>(
    'SELECT count(*)::text AS c, max(final_cash)::text AS best FROM ledger_runs WHERE user_id = $1',
    [user.id]
  );
  const { rows: t } = await pool.query<{ c: string; best: string | null }>(
    'SELECT count(*)::text AS c, max(total_chicks)::text AS best FROM tern_runs WHERE user_id = $1',
    [user.id]
  );

  return c.json({
    ok: true,
    stats: {
      species: Number(b[0]?.c ?? 0),
      ledgerRuns: Number(l[0]?.c ?? 0),
      ledgerBestCash: Number(l[0]?.best ?? 0),
      ternRuns: Number(t[0]?.c ?? 0),
      ternBestChicks: Number(t[0]?.best ?? 0),
    },
  });
}

/** 排行榜：全局前 20 */
export async function leaderboard(c: Context) {
  const { rows: birdRank } = await pool.query(
    `SELECT u.nickname, count(DISTINCT b.species)::int AS n
     FROM bird_logs b JOIN users u ON u.id = b.user_id
     GROUP BY u.id, u.nickname ORDER BY n DESC LIMIT 10`
  );
  const { rows: ternRank } = await pool.query(
    `SELECT u.nickname, max(t.total_chicks)::int AS n
     FROM tern_runs t JOIN users u ON u.id = t.user_id
     GROUP BY u.id, u.nickname HAVING max(t.total_chicks) > 0
     ORDER BY n DESC LIMIT 10`
  );
  const { rows: ledgerRank } = await pool.query(
    `SELECT u.nickname, max(l.final_cash)::int AS n
     FROM ledger_runs l JOIN users u ON u.id = l.user_id
     GROUP BY u.id, u.nickname ORDER BY n DESC LIMIT 10`
  );

  return c.json({ ok: true, birdRank, ternRank, ledgerRank });
}

/** 服务端静态数据：给前端校验与展示用 */
export function publicSites(c: Context) {
  const sites = Object.entries(SITE_TABLE).map(([id, v]) => ({
    id,
    name: v.name,
    region: v.region,
    count: v.species.length,
  }));
  return c.json({ ok: true, sites });
}

/** 轻量埋点：记录打开与玩过什么，用于了解哪块内容被看得多 */
const TRACK_WHITELIST = new Set([
  'open:ledger',
  'open:birds',
  'open:tern',
  'open:stats',
  'open:site',
  'export:png',
  'scroll:end',
]);

export async function track(c: Context) {
  const user = c.get('user') as AuthUser | undefined;
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false }, 400);

  const event = String(body.event ?? '');
  if (!TRACK_WHITELIST.has(event)) return c.json({ ok: false, error: 'unknown_event' }, 400);

  const detail =
    body.detail && typeof body.detail === 'object'
      ? JSON.stringify(body.detail).slice(0, 400)
      : null;

  await pool.query(
    'INSERT INTO events (user_id, event, detail) VALUES ($1, $2, $3::jsonb)',
    [user?.id ?? null, event, detail]
  );

  return c.json({ ok: true });
}
