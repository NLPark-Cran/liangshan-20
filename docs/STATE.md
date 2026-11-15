<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115135757-6872458d","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115135757-6872458d","ReservedCode2":"null"}-->
（人工智能生成）

# STATE · 当前状态与恢复锚点

> 每次有实质进展就更新这一页。**这是上下文被截断后第一个该读的文档。**
> 更新时间：2026-11-15 22:00

---

## 一、恢复锚点

```
当前阶段：Phase 6 · 全栈化（后端已上线，前端未完全接入）
最后完成：Hono + TypeScript 后端部署完成，游客/注册/登录/抽签/存档/排行全部跑通
正在做：把账本与燕鸥的成绩提交接到后端；补视觉打磨
下一步：① 验证三处提交在浏览器里真的触发 ② 周念重做水墨场景 ③ 调研回收后填数据
```

**已完成的关键事实**

- 线上地址 https://2026.crina.at 可访问，HTTP 200，证书有效
- 站点根目录 `/srv/sites/2026.crina.at`，属主 caddy:caddy
- Caddy 配置 `/etc/caddy/sites.d/2026.crina.at.caddy`，`/api/*` 反代到 127.0.0.1:8902
- 本地开发服务跑在 http://127.0.0.1:8124/（tools/serve.py）
- GitHub 仓库 https://github.com/NLPark-Cran/liangshan-20
- **后端**：systemd 服务 `liangshan-backend`，源码 `/root/workspace/liangshan20/server`
- **数据库**：PostgreSQL 17，库名 `liangshan`，用户 `liangshan`
- **会话**：Redis db 12
- 健康检查 https://2026.crina.at/api/health 返回 db/redis 均 ok

**已修掉的 bug（不要再犯）**

| 症状 | 根因 | 修法 |
|---|---|---|
| 观鸟面板文字竖排、内容挤成一列 | `#bird-panel` 本身带 `.bird` 类，`renderShell` 内部又套一层 `.bird`，双层 grid | HTML 里去掉外层 `.bird`，只留 id |
| 账本右侧山景不显示，报 `ctx.clearRect is not a function` | `drawLedgerMountain(ctx, w, h, s)` 签名与调用方不一致，调用方传的是 canvas | 改为 `drawLedgerMountain(canvas, s)`，内部自己取 ctx 和尺寸 |
| 燕鸥画面空白，报 `seal is not defined` | `tern-scene.js` 用了 `seal` 但没 import | 补 import |
| 长卷标记位置与地图对不上 | 标记用另一套写死的百分比，与投影结果无关 | 改为按段落位置计算 |
| 山脊是尖角三角、树像散沙 | `Math.abs(sin)` 生成尖角；点阵撒树 | 改用 `inkfig.js` 的钟形峰叠加与填充墨团 |

**并行中的后台任务**

| 任务 | 内容 | 输出文件 | 状态 |
|---|---|---|---|
| 调研 A | 安吉余村生态转型数据核实 | `docs/research/yucun.md` | 运行中 |
| 调研 B | 下姜村 / 钱江源 / 云和梯田 / 浦江 | `docs/research/sites.md` | 运行中 |
| 调研 C | 理论原文与官方表述 | `docs/research/theory.md` | 运行中 |

---

## 二、环境事实（已核实，可直接依赖）

**本地**
- Windows，工作目录 `D:\workspace\杭电英语\习概\map-site`
- Node v20.20.2，npm 10.8.2，git 2.47.1
- Python 3.11.15（`C:\Users\david\AppData\Roaming\alice\python\python.exe`）
- paramiko 5.0.0 已装，远程脚本在 `..\tools\remote.py`

**服务器 38.76.172.131**
- Debian 13 (trixie) amd64，磁盘 39G 已用 30%，剩 27G
- **Caddy v2.11.4** 占 80/443，配置在 `/etc/caddy/Caddyfile`，用 `import /etc/caddy/sites.d/*.caddy` 导入各站点
- 各站点根目录在 `/srv/sites/<域名>`，静态站直接 file_server
- Node v24.21.0 可用
- 已运行服务：crina-backend(8010)、farm-server(8901)、reunion、postgresql@17、redis
- **不需要 certbot**，Caddy 会自动申请和续期 Let's Encrypt 证书
- DNS：`2026.crina.at` → `38.76.172.131` 已生效

**已获取的数据**
- `site/data/zhejiang.json`：浙江省 11 个地市的真实行政边界（91KB，GeoJSON FeatureCollection，来自阿里云 DataV）
  - 杭州 MultiPolygon(1)、宁波(19)、温州(22)、嘉兴(1)、湖州(1)、绍兴(1)、金华(1)、衢州(1)、舟山(94)、台州(23)、丽水(1)

---

## 三、已完成清单

- [x] 读完全部课程材料（实践作业安排 docx / 期中要求 pptx / 调研报告模板 docx）
- [x] 服务器环境侦察（系统、Caddy、端口、磁盘、Node）
- [x] 浙江真实地理边界数据落盘
- [x] 远程执行脚本 `tools/remote.py`
- [x] 建立 `map-site/` 目录骨架
- [x] 工程文档

---

## 四、待办清单

见 [`TASKS.md`](TASKS.md)。摘要：

- [ ] 调研回收与内容定稿
- [ ] 设计系统定稿（色彩/字体/版式/动效）
- [ ] 地图引擎（手绘风 SVG 渲染）
- [ ] 六个点位详情页
- [ ] 账本推演游戏
- [ ] 设计说明文档（必须交付件）
- [ ] 本地验证（截图逐屏核对）
- [ ] Git 仓库与推送
- [ ] 部署上线与线上验证

---

## 五、已知风险与未决问题

| 风险 | 影响 | 当前处理 |
|---|---|---|
| 中文字体文件过大，无法内嵌 | 跨设备视觉不一致 | 方案：正文用系统宋体栈，标题用子集化 woff2，见 DESIGN.md |
| 六点位的精确经纬度需核实 | 地图上位置偏差 | 先按县级中心定位，调研回收后校正 |
| 课程截止时间有两处矛盾说法 | 无法确定交付紧迫度 | 待本人确认学习通实际时间 |
| AI 参与度的合规边界 | 影响成绩 | 见 DECISIONS.md 第 1 条，交付时附 AI 使用说明 |

---

## 六、修改记录

| 时间 | 动作 |
|---|---|
| 2026-11-15 22:00 | 建立全部工程文档，记录环境侦察结果，启动三路调研 |
