<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115140101-10716275","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115140101-10716275","ReservedCode2":"null"}-->
（人工智能生成）

# ARCHITECTURE · 技术架构

> 改代码之前读这一页。
> 更新时间：2026-11-15 22:10

---

## 一、总体

纯静态站点，零构建，零外部依赖。浏览器直接加载 ES Module。

```
浏览器
  └── index.html
        ├── css/base.css      设计令牌、排版、宣纸底
        ├── css/scroll.css    长卷与覆盖层
        ├── js/app.js         入口，装配
        ├── js/geo.js         投影与边界渲染
        ├── js/brush.js       笔触原语（程序化水墨）
        ├── js/scenes.js      六个点位的场景绘制脚本
        ├── js/scroll.js      长卷拖拽与点位定位
        ├── js/overlay.js     点位详情覆盖层
        ├── js/ledger.js      账本推演游戏
        ├── js/export.js      PNG 导出（含 dpi 写入）
        ├── data/zhejiang.json   真实行政边界
        └── data/points.js       六点位内容（唯一内容源）
```

---

## 二、数据流

```
zhejiang.json ──┐
                ├─→ geo.js（投影）→ 省界路径 ──┐
data/points.js ─┘                              ├─→ brush.js（笔触）→ Canvas 图层
                                               │
                            scenes.js（分点位）┘
                                    │
                                    ↓
                            scroll.js（长卷定位）
                                    │
                                    ↓
                            overlay.js（详情展开）
```

**唯一的真相源**：`data/points.js`。任何文案、数据改动只改这一个文件。HTML 里不写内容。

---

## 三、投影

**问题**：经度约 118°-123°，纬度约 27°-31.5°。直接线性映射会因纬度造成横向拉伸失真。

**方案**：等距圆柱投影加纬度余弦补偿：

```
x = (lon - lon0) * cos(lat_mid)
y = -(lat - lat0)
```

其中 `lat_mid` 取浙江中部纬度约 29.2°，`lon0 = 118.0`，`lat0 = 31.5`。

这个投影在 5 个纬度的范围内误差小于 0.5%，视觉上完全看不出。

---

## 四、笔触系统（brush.js）

这是视觉的核心。目标是「程序化但有手绘感」。

### 4.1 手绘感的三个来源

1. **线条抖动**：任何直线都沿法向叠加低频噪声（`sin` 叠加 + 随机相位），形成自然的弯曲
2. **墨色浓淡**：同一条笔画用 2-3 层不同透明度、不同宽度的路径叠压，模拟运笔的提按
3. **断续与飞白**：沿路径按随机间隔打断，断处留白，模拟笔枯

### 4.2 原语清单

| 函数 | 产出 |
|---|---|
| `inkStroke(ctx, pts, opts)` | 一条有笔意的主线 |
| `washFill(ctx, path, opts)` | 水墨渲染填充（多层径向渐变 + 噪声） |
| `rockCluster(ctx, x, y, opts)` | 山石组，用短折线叠出皴法 |
| `waterLines(ctx, rect, opts)` | 水波纹，平行的断续弧线 |
| `treeClump(ctx, x, y, opts)` | 树丛，墨点聚散 |
| `house(ctx, x, y, opts)` | 屋舍，极简的坡顶线条 |
| `terrace(ctx, rect, opts)` | 梯田，层层等高弧线 |
| `pit(ctx, x, y, opts)` | 矿坑，环绕的阶梯状切口 |
| `seal(ctx, x, y, text)` | 印章，朱砂方框加竖排字 |

### 4.3 噪声

用一个确定性伪随机（seed 固定），保证每次渲染结果一致——这样截图对比和导出都可复现。

```js
function mulberry32(a) { return function() { ... } }
```

---

## 五、渲染分层

Canvas 分三层，避免重复绘制：

| 层 | 内容 | 重绘时机 |
|---|---|---|
| `terrain` | 省界、地形、水系、皴法 | 只在尺寸变化时 |
| `marks` | 六点位标记、路径、标注 | 每次展卷（跟随偏移） |
| `fx` | 悬停高亮、粒子、动效 | 每帧 |

导出走独立的离屏渲染管线，不复用屏幕上的层。

---

## 六、长卷交互（scroll.js）

- 容器 `overflow: hidden`，内部一个宽度为 `N × viewport` 的画布
- 通过 `transform: translateX` 移动
- 指针拖拽、滚轮（`deltaY` 映射到横向）、方向键、触摸滑动
- 惯性衰减：`velocity *= 0.92` 每帧
- 吸附：松手后若接近某个点位（阈值 12% 屏宽），吸附过去
- 进度线：底部一条细线，六个小点标出点位位置

**可达性**：`tabindex="0"`，方向键移动，点位可用 Tab 聚焦，Enter 展开。

---

## 七、覆盖层（overlay.js）

- 全屏 `<div role="dialog" aria-modal="true">`
- 打开时把焦点移入，关闭时归还
- `Esc` 关闭
- 禁止背景滚动
- 内容由 `points.js` 的数据渲染

---

## 八、账本游戏（ledger.js）

**状态**

```js
{
  year: 2005,
  cash: 320,          // 万元，村集体年收入
  mountain: 100,      // 山体健康度 0-100
  mode: 'mine',       // mine | bamboo | eco | mixed
  history: [],        // 每年快照
  decided: false      // 是否已做关矿决策
}
```

**每年推进**

```
cash   += income(mode, mountain, year)
mountain += (mode === 'mine' ? -3 : +restoreRate(mountain))
```

**关键设计**：关矿之后 cash 会先掉到很低的水平，需要撑过去。这对应真实的余村。

**山体视觉**：左侧一个 Canvas，山色随 `mountain` 从赭黄渐变到青绿，矿坑随开采加深、随恢复愈合。

---

## 九、导出（export.js）

1. 创建离屏 Canvas 3600×2400
2. 用 4 倍缩放重绘地形层（不含 UI 元素）
3. `canvas.toBlob('image/png')`
4. 读 ArrayBuffer，找到 `IHDR` 之后的 `pHYs` 块位置，若不存在则插入
   - `pHYs` 结构：长度 9，类型 `pHYs`，ppuX=11811（300dpi = 300/0.0254 = 11811.02），ppuY 同，unit=1（米）
   - CRC32 需要自己算
5. 下载

**注意**：`toBlob` 的 PNG 通常不含 pHYs。必须手写注入。CRC32 表要预先算好。

---

## 十、性能

| 措施 | 说明 |
|---|---|
| 边界路径缓存 | 投影只算一次，`Path2D` 复用 |
| 静态层离屏 | 地形绘制到 OffscreenCanvas，滚动时只贴图 |
| 噪声预生成 | 噪声纹理生成一次，重复使用 |
| 动效节流 | `requestAnimationFrame` + 变化检测 |
| 图片无 | 全站零位图，体积自然小 |

**目标**：首屏 JS+CSS < 200KB，GeoJSON 91KB，总计 < 400KB。

---

## 十一、兼容

| 目标 | 版本 |
|---|---|
| Chrome / Edge | 最近两年 |
| Safari | 15+ |
| Firefox | 最近两年 |
| 移动端 | iOS 15+ / Android Chrome |

用到的现代特性：ES Module、CSS 自定义属性、`OffscreenCanvas`（有 fallback）、`clamp()`、`aspect-ratio`。
`OffscreenCanvas` 不支持时降级为普通 Canvas 缓存层。
