<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261118015347-6685455c","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261118015347-6685455c","ReservedCode2":"null"}-->
（人工智能生成）

<div align="center">

# 两山二十年

**一张可以走进去的浙江生态地图**

`https://2026.crina.at`

</div>

---

## 这是什么

「绿水青山就是金山银山」提出二十年。宏大的提法容易飘在半空，所以这份作业把它落在**六个具体的村子和六件具体的账**上：一座被关掉的矿、一条从劣Ⅴ类治回Ⅲ类的河、一片被让出来的林、一层层没有荒掉的田、一个从穷山村变成民宿村的山坳，以及一块被城里人认养的菜地。

站里有三个尺度看同一件事：

| 尺度 | 内容 | 形式 |
|---|---|---|
| 空间 | 六处浙江点位的转化史 | 水墨长卷，拖动展卷，每站带出处 |
| 二十年 | 一座山从开矿到关矿再到复绿 | 可玩的推演，关矿是不可逆选择 |
| 一年一季 | 迁徙、台风与招引 | 观鸟手账、中华凤头燕鸥招引推演 |

加上一页 **3D 展台**：每处点位一件微缩地形模型，可以拖、可以转、可以逐件看。

---

## 目录

```
map-site/
├── site/                  静态前端，直接部署，无需构建
│   ├── index.html         首屏 + 长卷 + 尾页
│   ├── atlas.html         3D 展台
│   ├── css/               base（设计令牌）/ scroll / extra / auth / atlas
│   ├── js/
│   │   ├── points.js      ★ 全站唯一的文案与数据来源
│   │   ├── app.js         入口
│   │   ├── scroll.js      长卷交互
│   │   ├── scenes.js      水墨场景绘制
│   │   ├── inkfig.js      水墨图元库
│   │   ├── atlas3d.js     3D 展台
│   │   ├── ledger.js      一亩山的账本
│   │   ├── birding.js     观鸟手账
│   │   ├── tern.js        燕鸥招引
│   │   └── ...
│   ├── data/              浙江省行政边界、鸟种、贴纸
│   ├── assets/models/     地形模型（只存压缩后的 *.min.glb）
│   └── vendor/three/      Three.js 及扩展
├── server/                Hono + TypeScript 后端（账号、战绩、榜单）
├── docs/                  工程文档，见下方索引
├── tools/                 生成、压缩、检查、部署脚本
└── data-verified.json     已核实的数字与其出处
```

---

## 本地跑起来

静态站不需要构建：

```bash
python ../tools/serve.py          # 起在 http://127.0.0.1:8123/
```

或者任意静态服务器：

```bash
cd site && python -m http.server 8080
```

> [!WARNING]
> 必须走 HTTP，不能直接双击 `index.html`。ES Module 与 `fetch` 在 `file://` 下会被 CORS 拦掉。

带后端的完整环境（账号、战绩、排行榜）：

```bash
cd server
npm install
npm run dev
```

---

## 数据纪律

站里每个数字都标了出处，写在对应数据行的下方。三条规矩，不可违反：

1. 每个数字必须能在 `docs/research/` 或 `data-verified.json` 找到出处
2. 领导人引语必须逐字核对原文，标出处精确到讲话或文章名与时间
3. 本组自撰的句子不许伪装成引语，必须显式标注

核不到的东西，宁可不写，也不写成估算值。

> [!NOTE]
> 云和梯田只有「中国重要农业文化遗产」，**不是**全球重要农业文化遗产（GIAHS）。站内按核实结果写，未采用宣传口径。

---

## 地形模型怎么来的

六到九件微缩地形由 [Aholo Lux3D](https://api.aholo.cn) 文生 3D 生成，10 万面级，经 `gltf-transform` 压成 WebP 纹理 + meshopt：

```bash
node tools/sync_models.mjs        # 同步 + 压缩，原始件 110MB+ 落到 7MB 上下
```

原始 GLB 不进仓库（`.gitignore` 已排除），只留 `*.min.glb`。

> [!TIP]
> 提示词里必须显式写「满覆盖植被、水面反射、写实彩色、不是白色石膏」。只写地形结构，生成出来会是白色素模。

---

## 部署

```bash
python tools/deploy_site.py
```

静态站由服务器上的 Caddy 直接 file_server，`/api/*` 反代到后端。详见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

线上：`https://2026.crina.at`（A 记录 `38.76.172.131`，Let's Encrypt 证书由 Caddy 自动续期）

---

## 工程文档

| 文档 | 作用 |
|---|---|
| [`docs/STATE.md`](docs/STATE.md) | 当前进度、已知陷阱、上下文恢复锚点 |
| [`docs/PRD.md`](docs/PRD.md) | 需求与验收标准 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 设计系统：色彩、字体、版式、动效 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 前端架构、目录结构、数据流 |
| [`docs/BACKEND.md`](docs/BACKEND.md) | 后端接口与数据模型 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 关键决策与理由 |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | 部署运维手册 |
| [`docs/AI_USAGE.md`](docs/AI_USAGE.md) | AI 使用分工说明 |

---

## 分工

选题立意、资料核实与文字表述由本人完成。地图、3D 展台、交互与视觉渲染由编程实现，AI 参与的具体范围见 [`docs/AI_USAGE.md`](docs/AI_USAGE.md)。

<div align="center">

杭州电子科技大学 · 外国语学院 · 陈镜宇

《习近平新时代中国特色社会主义思想概论》（2026-2027-1）课程实践作业

子主题 5 · 赓续伟大长征精神，建成美丽的现代化强国

</div>
