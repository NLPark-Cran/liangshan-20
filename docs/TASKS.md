<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115140212-886456af","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115140212-886456af","ReservedCode2":"null"}-->
（人工智能生成）

# TASKS · 任务状态机

> 状态取值：`TODO` / `DOING` / `BLOCKED` / `DONE`
> 每次任务状态变更立即更新这张表，不要攒。
> 更新时间：2026-11-15 22:15

---

## Phase 1 · 地基与调研

| ID | 任务 | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| P1-01 | 读课程材料，确定成果形式 | DONE | PRD.md | 选定手绘数字地图 |
| P1-02 | 服务器环境侦察 | DONE | STATE.md 第二节 | Caddy + /srv/sites |
| P1-03 | 获取浙江真实边界数据 | DONE | site/data/zhejiang.json | DataV 91KB |
| P1-04 | 工程文档骨架 | DONE | docs/*.md | 10 份 |
| P1-05 | 调研 A：安吉余村 | DOING | docs/research/yucun.md | 后台 |
| P1-06 | 调研 B：下姜村/钱江源/云和/浦江 | DOING | docs/research/sites.md | 后台 |
| P1-07 | 调研 C：理论原文 | DOING | docs/research/theory.md | 后台 |
| P1-08 | git init 与首次提交 | TODO | — | — |

## Phase 2 · 设计与内容

| ID | 任务 | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| P2-01 | 设计系统定稿 | DONE | DESIGN.md | 水墨长卷方向 |
| P2-02 | 六点位内容定稿 | BLOCKED | data/points.js | 等调研回收 |
| P2-03 | 点位精确经纬度 | BLOCKED | data/points.js | 等调研 |
| P2-04 | 文案与引文核对 | BLOCKED | CONTENT.md | 等调研 C |
| P2-05 | 手绘场景脚本设计 | TODO | js/scenes.js | 六幅小景 |

## Phase 3 · 实现

| ID | 任务 | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| P3-01 | 笔触原语库 | TODO | js/brush.js | 核心 |
| P3-02 | 投影与边界渲染 | TODO | js/geo.js | — |
| P3-03 | 长卷拖拽与吸附 | TODO | js/scroll.js | — |
| P3-04 | 六点位场景绘制 | TODO | js/scenes.js | — |
| P3-05 | 点位详情覆盖层 | TODO | js/overlay.js | — |
| P3-06 | 账本推演游戏 | TODO | js/ledger.js | — |
| P3-07 | PNG 导出（300dpi） | TODO | js/export.js | 硬指标 |
| P3-08 | 响应式与可达性 | TODO | css/*.css | — |
| P3-09 | 首屏与题跋 | TODO | index.html | — |

## Phase 4 · 验证

| ID | 任务 | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| P4-01 | 本地起服务 | TODO | — | python http.server |
| P4-02 | 逐屏截图核对 | TODO | screenshots/ | 桌面+移动 |
| P4-03 | 导出 PNG 规格验证 | TODO | — | 尺寸/dpi/alpha |
| P4-04 | 离线打开验证 | TODO | — | 断网测试 |

## Phase 5 · 交付与部署

| ID | 任务 | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| P5-01 | 设计说明文档 | TODO | docs/设计说明.md | 必须交付件 |
| P5-02 | AI 使用说明 | TODO | docs/AI_USAGE.md | — |
| P5-03 | GitHub 仓库与推送 | TODO | — | — |
| P5-04 | 服务器部署 | TODO | /srv/sites/2026.crina.at | — |
| P5-05 | Caddy 配置与 SSL | TODO | sites.d/*.caddy | 自动证书 |
| P5-06 | 线上验证 | TODO | — | https 可访问 |
| P5-07 | 交付清单与使用说明 | TODO | — | — |

---

## 依赖关系

```
P1-05/06/07（调研）
    ↓
P2-02/03/04（内容定稿）
    ↓
P3-04（场景绘制）  P3-05（详情页）  P3-06（游戏）
    ↓
P3-01/02/03（基础设施，可并行先行）
    ↓
P4（验证）
    ↓
P5（交付）
```

**可以立刻并行开工的**：P1-08、P3-01、P3-02、P3-03、P3-09（不依赖内容数据）。
