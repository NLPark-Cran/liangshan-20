<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115144521-b37176a0","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115144521-b37176a0","ReservedCode2":"null"}-->
（人工智能生成）

# MoonBit（月兔）技术评估与赛事可行性调研

> 调研时间：2026-11-15
> 调研人：陈知远
> 用途：评估「手绘水墨风浙江生态地图 + 三个小模块」的纯静态 JS 项目是否需要／值得改用 MoonBit 参赛
> 所有结论附来源与抓取日期；无法核实的写「未能核实」，不推测赛事规则

---

## 摘要（先看这三条）

1. **JS 互操作本身不难，难的是"复杂对象过边界"**。MoonBit 编译到 `wasm-gc` 后，用 `link.wasm-gc.exports` 导出函数、JS 侧 `WebAssembly.instantiateStreaming` 接收，标量（`Int32`/`Float`/`Double`/`Bool`）零成本直传，`String` 需开 `js-string` builtin 才映射为 `externref`；数组和 struct/带参 enum 对象对 JS 都是不透明引用，必须在 MoonBit 侧写读写/拆包函数。官方有完整示例（cmark + 前端），社区已有 WebIDL 自动生成的 Canvas2D/DOM 绑定。
2. **当前有正在报名期的赛事**：2026 MoonBit 国产基础软件生态开源大赛「11 月黑客松」，官网全站横幅显示「火热报名中」（2026-11-15 抓取）。月度赛是持续的，每月一期，团队上限 3 人。
3. **但月度赛明确要求"以 MoonBit 作为项目主要实现语言"**。只把抽签算法和状态机搬到 MoonBit、其余保留原生 JS，达不到这条口径。可行的折中是：把纯逻辑做成独立的 MoonBit wasm 库（整个库都是 MoonBit），前端页面不动。

---

## 一、MoonBit 语言本身

### 1.1 版本与演进状态

| 项目 | 事实 | 来源 |
|---|---|---|
| 文档版本 | v0.10.20（docs.moonbitlang.cn 全站页脚） | docs.moonbitlang.cn（2026-11-15 抓取） |
| 最新编译器发布 | moonc v0.10.19+97801ee1b，发布 2026-11-02 | GitHub moonbitlang/moonbit-compiler releases（2026-11-15 查） |
| 最新变更日志 | 对应 moonc v0.10.19，2026-11-05 | moonbitlang.cn/updates/ |
| 1.0 计划 | 官方 roadmap 称「2026 年上半年」发布 1.0（该文写于 2025-07-24）；社区 Meetup 记录提到 2026 年 9 月推 1.0（口径不一致，待确认） | moonbitlang.com/blog/roadmap/ |

**注意：语言仍在快速演进且有 breaking change。** 2026-11-05 的更新里，`Int`/`UInt` 改名为 `Int32`/`UInt32`（旧名保留为别名），`derive(...)` 语法迁移为 `#derive(...)` 属性，`compare` 对 NaN 的语义调整。写比赛项目时锁版本很重要。

### 1.2 语法与语言特性

- ML/Haskell 血统 + Rust 影响：`struct` / `enum` / 穷尽模式匹配 / `trait` / 泛型 / 高阶函数
- 错误处理：`raise`、`suberror`、`try?` 返回 `Result`
- 视图类型（view types）：`StringView` / `BytesView` / `ArrayView[T]`，`s[:]` 零拷贝切片
- `async`：已有语法与基础原语，1.0 计划补结构化并发与任务取消（roadmap）
- `#valtype` 值类型（1.0 计划）
- 无 GC 停顿顾虑：wasm/native 后端用引用计数，wasm-gc/js 后端复用宿主 GC

### 1.3 编译目标与内存管理

官方 FFI 文档列明五个后端：

| 后端 | 产物 | 内存管理 |
|---|---|---|
| `wasm` | 线性内存的 .wasm（含批量内存、多值、引用类型提案） | 编译器优化的引用计数 |
| `wasm-gc` | 使用 Wasm GC 提案的 .wasm（struct/array 引用类型，默认不用线性内存；支持 JS string builtins） | 复用宿主 GC |
| `js` | .js（esm / cjs / iife）+ .js.map + .d.ts | 复用 JS GC |
| `native` | C 后端或新 native 后端，产出可执行文件 | 引用计数 |
| `llvm` | 目标文件，**实验性，不支持 FFI** | — |

来源：[外部函数接口 (FFI)](https://docs.moonbitlang.cn/language/ffi.html)（2026-11-15 抓取）

### 1.4 Wasm 体积（官方给出的数字）

- Hello World：**27KB**（官网首页社区评价区）
- 只有字符串拼接 + println 的函数，开 js-string builtin 后：**182 字节**，wasm-opt `-Oz` 后 **117 字节**
- 同功能 Rust + wasm-bindgen：12,534 字节（优化后），官方称「MoonBit 的 60 倍」（原文如此）
- 官方口径：可生成「小至 253 字节」的 wasm

来源：[在 MoonBit 中使用 Js string builtin 提案的介绍](https://www.moonbitlang.cn/blog/js-string-builtins/)（2024-11-08）；[moonbitlang.com 首页](https://www.moonbitlang.com/)

> 本节数字来自原抓取记录，本次二次审查受「最多 5 个材料文件」限制未复核该页归档，引用前建议回看原文（待确认）。

> 结论：**wasm-gc + js-string builtin 是体积最优路径**。对本项目这种"算法模块"场景，产物量级在几十 KB，不会成为页面负担。

### 1.5 与 JavaScript 的互操作（具体 API）

#### 路径 A：编译到 wasm-gc，JS 调用 MoonBit

MoonBit 侧配置（`moon.pkg`，新版 DSL）：

```
options(
  link: {
    "wasm-gc": {
      "exports": ["render", "result_unwrap", "result_is_ok"],
      "use-js-builtin-string": true,
    },
  },
)
```

导出符号名还可用 `#export_name("add")` 属性直接标注函数。

JS 侧：

```js
const { instance } = await WebAssembly.instantiateStreaming(
  fetch("../cmarkwrap/target/wasm-gc/release/build/lib/lib.wasm"),
  {},
  { builtins: ["js-string"], importedStringConstants: "_" },
);
const { render, result_is_ok, result_unwrap } = instance.exports;
```

来源（官方博客，含完整可跑代码 + GitHub 仓库）：
[在 JavaScript 中使用 MoonBit 的高性能 Wasm 库](https://www.moonbitlang.cn/blog/call-wasm-from-js)（2025-01-22）
代码仓库：https://github.com/moonbit-community/cmark-frontend-example

**关键坑（官方原文点明）**：`Result` 这类 MoonBit 对象是 wasm 对象，对 JS「不透明」，不能直接读字段。必须在 MoonBit 侧额外导出 `result_unwrap()` / `result_is_ok()` 这种拆包函数。

#### 路径 B：编译到 JS 后端（不走 wasm）

MoonBit 直接生成 `.js` + `.js.map` + `.d.ts`，`format` 可选 `esm` / `cjs` / `iife`。`.d.ts` 让 TypeScript 消费方零手写类型。

```moonbit
extern "js" fn consoleLog(msg : String) -> Unit = "(msg) => console.log(msg)"
extern "js" fn Value::get_ffi(self : Self, key : Self) -> Self = "(obj, key) => obj[key]"
```

来源（官方「珍珠」系列长文，覆盖类型映射、错误处理、require 加载 npm 包）：
[初探 MoonBit 中的 JavaScript 交互](https://www.moonbitlang.cn/pearls/moonbit-jsffi)（2025-09-25）

`.d.ts` 产物结构另见第三方整理：[TypeScript Integration](https://github.com/mizchi/skills/blob/main/moonbit-js-binding/references/typescript-integration.md)

#### 从 MoonBit 调用 JS 环境（Canvas 2D 等）

两种写法，官方 FFI 文档原文：

```moonbit
// 写法一：模块名 + 函数名导入
fn cos(d : Double) -> Double = "math" "cos"

// 写法二：内联 wasm 指令
extern "wasm" fn identity(d : Double) -> Double =
  #|(func (param f64) (result f64))
```

在 JS 侧提供导入对象即可：

```js
{ dom: { set_css: (dom, key, value) => { dom.style[key] = value } } }
```

官方 Canvas 调用示例（早期博客，`externref` 时代写法）：[weekly 2023-08-28](https://www.moonbitlang.cn/updates/2023/08/28/weekly-08-28)

DOM 操作 + js-string builtin 的完整可跑示例：[js-string-builtins 博客](https://www.moonbitlang.cn/blog/js-string-builtins/)（2024-11-08）

回调：非捕获函数用 `FuncRef[T]`；带闭包的回调需要宿主实现 `moonbit:ffi` 模块下的 `make_closure(funcref, closure)`，官方给的实现是 `funcref.bind(null, closure)`。

### 1.6 有没有官方的 JS/TS 绑定生成工具？

| 工具 | 性质 | 说明 | 来源 |
|---|---|---|---|
| `wit-bindgen`（`wit-bindgen moonbit`） | **官方支持** | 从 WIT 定义生成 MoonBit 绑定，用于 WebAssembly 组件模型；配合 `wasm-tools` 打包 component | [组件模型教程](https://docs.moonbitlang.cn/toolchain/wasm/component-model-tutorial.html) |
| wasm-bindgen 类工具 | **官方没有** | 没有等价的「Rust → JS glue」生成器；JS 绑定主要手写 `extern "js"` / `extern "wasm"` | FFI 文档；社区实践 |
| `icyaaaww/moonbind` | 社区 | C 头文件 → MoonBit FFI 绑定 | mooncakes.io 搜索（2026-10-23 发布） |
| `pei0331/moon-wit` | 社区 | 无依赖 WIT 解析 + API 脚手架生成 | mooncakes.io（2026-08-23） |
| `bikallem/webapi` | 社区 | **从 WebIDL 自动生成** Web 平台绑定（DOM、Canvas 2D、Fetch、WebSocket、localStorage） | mooncakes.io 描述（v0.5.0） |

> 实操口径：走 wasm-gc 时，导出靠 `link.wasm-gc.exports` + `#export_name`，没有自动 glue 生成器，得自己写 10 行 JS 壳。走组件模型才需要 wit-bindgen，但组件模型在浏览器里加载还要额外 runtime，本项目没必要。

### 1.7 包管理、构建、测试

`moon` 一个命令管全部：

- 项目：`moon new`，配置 `moon.mod`（模块）+ `moon.pkg`（包，新 DSL，旧 `moon.pkg.json` 需 `moon fmt` 迁移）
- 构建：`moon build --target wasm|wasm-gc|js|native|llvm --release`，`--output-wat` 可看文本 wasm，`--no-strip` 保留符号供 profiling
- 检查/运行：`moon check`、`moon run`
- 测试：`moon test`（黑盒 `for "test"` / 白盒 `for "wbtest"` 导入，`inspect()` 快照 + `-u` 更新，`--doc` 跑文档测试）
- 基准：`moon bench`
- 覆盖率：`moon coverage analyze` / `report`
- 包管理：mooncakes.io 注册表，`moon add` / `remove` / `tree` / `publish` / `login`
- 格式化：`moon fmt`；接口文件：`moon info` 生成 `.mbti`
- 条件编译：`targets` 字段按后端分文件（`foo.wasm-gc.mbt`）

来源：[moon 的命令行帮助](https://docs.moonbitlang.cn/toolchain/moon/commands.html)、[包配置](https://docs.moonbitlang.cn/toolchain/moon/package.html)

### 1.8 标准库能力（对应本项目的四个技术需求）

| 需求 | 支持情况 |
|---|---|
| 浮点运算 | `Float`(f32) / `Double`(f64)，IEEE 语义；2026-11 起 `compare` 对 NaN 不再保证，排序/哈希场景要用 `Float::total_compare` |
| 字符串处理 | `String` + `StringView` 零拷贝切片；`#|` 多行字符串；`\{}` 插值 |
| 数组/映射 | `Array`、`FixedArray`、`ReadOnlyArray`、`Map`（可变、保持插入顺序）、`HashMap` |
| 随机数 | core 的 algorithms & tooling 组含 `random` |
| JSON | core 含 `Json`、`ToJson`、`derive(ToJson)`，且模式匹配原生支持 JSON |

来源：[moonbitlang/core README](https://github.com/moonbitlang/core)、[mooncakes.io/docs/moonbitlang/core](https://mooncakes.io/docs/moonbitlang/core)（版本 0.1.20261105+65efd5b93，Apache-2.0）

### 1.9 Canvas / DOM / 游戏方向的库与示例

官方**没有** Canvas 或 DOM 标准库，全靠社区：

| 库 | 说明 | 活跃度 |
|---|---|---|
| `peter-jerry-ye/canvas` | Canvas binding，宣称「不写一行 JS 就能画图」，标注 WIP | v0.7.0，250 次下载 |
| `bikallem/webapi` | WebIDL 自动生成，覆盖 DOM / Canvas 2D / Fetch / WebSocket / SVG | v0.5.0，645 次下载 |
| `mizchi/js_browser` | 浏览器侧绑定（DOM、canvas、IndexedDB），配套 `js_web` | v0.13.0，5,418 次下载 |
| `tiye/dom-ffi` | 类型化 DOM 绑定，含鼠标/指针/滚轮/键盘事件 | v0.5.1，4,826 次下载 |
| `mizchi/canvas` | **纯 MoonBit 的 headless 2D 光栅化器**，镜像 CanvasRenderingContext2D API，输出 PNG（无需浏览器） | v0.9.1，99 次下载 |
| `chen333w/moon-element` | Web Components 运行时 + 离屏布局引擎 | v0.2.0 |

游戏/图形框架：

- `moonbitlang/wasm4`：WASM-4 复古游戏机框架（160×160，<64K 内存），官方有中文教程
- `moonbit-community/selene`：ECS 游戏引擎 + WebGPU 渲染器（实验性，Apache-2.0）
- `moonbitlang/pixel-adventure.mbt`：官方 2D 游戏框架
- `rabbita` / `rabbit-tea`：MoonBit 的 Web UI 框架（mooncakes.io 官网自己就用它）

来源：mooncakes.io 搜索 API（2026-11-15 调用）、[selene 仓库](https://github.com/moonbit-community/selene)、[Wasm4 教程](https://www.moonbitlang.cn/blog/wasm4)

> 顺带一提：`mizchi/canvas` 是纯 MoonBit 实现的 Canvas2D，能在无浏览器环境跑并输出 PNG。对本项目来说，它的价值不是渲染网页，而是**给绘图逻辑写可回归的测试**。

---

## 二、MoonBit 黑客松赛事

### 2.1 官方赛事全景（截至 2026-11-15）

| 赛事 | 性质 | 状态 | 关键时间 |
|---|---|---|---|
| **2026 MoonBit 国产基础软件生态开源大赛（月度黑客松）** | 官方主赛事，按月滚动 | **报名中（11 月赛）** | 每月一期；集中开发期 11-01 至 11-30、项目验收 11-30（seiguan 页面正文；同页顶部卡片标「开始 2026-11-10」，两处口径不一），官方口径为"以官方通知为准" |
| 2026 软件合成挑战赛（2026 SCC） | 官方专项赛，个人赛 | 已结束 | 2-09 启动 / 3-20 申报截止 / 4-21 评选截止 / 4-27 答辩 |
| 2025 MGPIC 全球编程创新挑战赛 | 官方年度大赛（编译赛道 + 游戏赛道） | 2025 届已结束 | 2025-11-13 报名截止 / 11-23 深圳决赛 |
| 2026 MGPIC | 官方年度大赛 | **未能核实是否举办** | 官网未见 2026 届页面 |
| 开源之夏 OSPP | 第三方（中科院软件所）暑期开源活动，MoonBit 社区参与 | 一年一届 | MoonBit 社区为第三次参与；学生项目制，有劳务报酬 |
| 官方 bounty / 悬赏计划 | — | **未能核实** | 本站归档的 14 个 MoonBit 相关目录中没有相关页面，不能据此断定官方没有该计划 |

### 2.2 2026 月度黑客松：规则细节

官方赛事站：https://moonbitlang.github.io/Hackathon2026/
源码仓库（可逐条核对文案）：https://github.com/moonbitlang/Hackathon2026（`src/App.tsx`）
中文主站横幅：「2026 MoonBit 11 月黑客松 火热报名中！个人最高奖金 7.2 万元」（原抓取记录；本次审查时官网 page.md 归档只有标题，横幅文案待确认；「报名中」另可由 seiguan 页面独立佐证）

**赛程结构**

- 月度循环：报名申报 → 资格审核（滚动）→ 集中开发 → 项目验收 → 季度评选
- 赛季度划分：8-10 月 / 11 月-次年 1 月 / 2-4 月 / 5-7 月
- 半年度：8 月-次年 1 月 / 2-7 月；年度：8 月-次年 7 月
- 8-10 月季度赛现场安排（官方站点文案）：11-18 线上评选并公布三等奖、公布一/二等奖候选；**11-28 深圳现场终评**，含「MoonBit 1.0 技术分享」（抓取当日官网只返回标题，具体日程本次未在归档中复核到，待确认）

**两条赛道（进入同一季度评选池）**

1. 新项目方向：当月新申报，走月度申报-开发-验收，拿月度奖励，验收后进季度评选
2. 社区项目方向：持续维护的已有项目，直接报名季度评选，不参与月度奖励

**参赛形式**

- 个人：单月最多申报 3 个项目
- 团队：每队不超过 3 人，队长统一提交，队员各自报名且 GitHub 仓库链接一致；**2 人队奖金每人 1/2，3 人队每人 1/3**
- 不限学生或在职

**奖励**

| 层级 | 金额 | 说明 |
|---|---|---|
| 月度启动支持 | 150 元 | 申报审核通过后发放（仅新项目方向） |
| 月度完成支持 | 350 元 | 开发完成并通过本期审核 |
| 季度一等奖 | 12,000 元（1-2 名） | 季度奖金池总计 80,000 元 |
| 季度二等奖 | 6,000 元（3-4 名） | |
| 季度三等奖 | 3,000 元（5 名） | |
| 半年度一等奖 | 24,000 元 | |
| 年度一等奖 | 36,000 元 | 半年度与年度档位来自赛事站源码；全年个人奖金池累计上限 72,000 元（seiguan 页面原文） |
| 推荐奖励 | 50 元/人，上限 5 人 | 被推荐人须填推荐人 GitHub ID |
| MVP 计划 | 补贴 2k-5k/月 | 晋级季度决赛可获 MVP 免笔试资格 |

**提交要求**

- 公开仓库，保留连续可追踪的 commits / Issues / PR
- README + 可运行示例 + 必要测试
- 使用 OSI 认证开源许可证；移植项目须说明来源与许可证
- 必须加入赛事交流群并把群昵称改成 GitHub ID，否则影响发奖金

**评审维度（官方原文）**

- 验收六条：`MoonBit 为主` / `仓库公开` / `能够运行` / `工作有效` / `开源合规` / `AI 可解释`
- 明确写「重复提交、拆分项目或仅做简单修改，不计入验收与奖励」

来源：[官方赛事页](https://moonbitlang.github.io/Hackathon2026/)、[仓库 App.tsx](https://github.com/moonbitlang/Hackathon2026/blob/main/src/App.tsx)、[moonbitlang.cn 首页横幅](https://www.moonbitlang.cn/)

> [!NOTE]
> 本节「提交要求」「评审维度」「赛季度／半年度／年度划分」出自赛事站源码 App.tsx。本次审查时，本地归档的官网 `page.md` 只有标题、GitHub 归档 `page.md` 只有 README 三行（未含 App.tsx 正文），上述条目在归档中无法逐字复核，标注为待确认。已能在归档中核到的硬数据是：团队每队最多 3 人、启动支持 150 元、完成支持 350 元、季度一等奖 12,000 元、全年个人奖金池 72,000 元、推荐奖励 50 元/人上限 5 人、MVP 补贴 2k-5k/月。

**关于 11 月赛截止日期的两个口径**

- 官方站点与仓库源码：「11 月赛季 · 报名与验收日期以官方通知为准」（未写死日期）
- 第三方赛事聚合站 seiguan.com：开始 2026-11-10，投稿截止 2026-11-30，评审 2026-11-30
- **判定：11-30 是第三方转述，官方页面未确认，按「待确认」处理。** 报名前必须进官方飞书表单/交流群核对。

来源：[MoonBit 国产基础软件生态开源大赛｜黑客松报名开启](https://seiguan.com/comp/7846.html)（第三方，页面标注投稿截止 2026-11-30）

**报名入口（官方仓库写的原文）**

- 飞书报名表单：https://bxup9uklfcb.feishu.cn/share/base/form/shrcnWUMlgpbwHaXgzV7HmNhNhg
- 章程 wiki：https://bxup9uklfcb.feishu.cn/wiki/Dx4Bwd6D1i3GfHkajQCcF7SznEd
- 两个飞书链接都需要登录，本次未能读取正文（跳转登录页）

### 2.3 2026 软件合成挑战赛（已结束，但规则有参考价值）

- 时间：2026-02-09 申报启动 / 03-20 申报截止 / 04-21 评选截止 / 04-27 深圳线下答辩
- **仅个人参赛，不设团队赛**
- 主题：AI 原生软件工厂，强调"大模型 + MoonBit 工具链协同"产出工程级软件
- 方向参考里明确包含：**2D 绘图、原型设计工具**、静态网站生成器、游戏引擎内核、电子表格内核、数据库内核
- **规模参考：建议有效 MoonBit 代码量至少 10,000 行**（原文强调「仅作为工程量级参考，不以代码行数作为重点评价依据」）
- 激励：预答辩通过 + 两周内 100 commits → 1,500 元/人启动支持；奖金池 15 万，特等 15,000 / 一等 10,000 / 二等 8,000×2 / 三等 6,000×3 / 优异 4,000×15
- 评审：完成度 25% / 工程质量 25% / 可解释性 25%（须交开发历程文章）/ 用户体验 25%

来源：[2026 软件合成挑战赛](https://www.moonbitlang.cn/2026-scc/)（2026-11-15 抓取）

### 2.4 2025 MGPIC（往届，规则可作为"混合技术栈"先例）

游戏赛道原文要求：

> 游戏为静态 HTML 5 游戏，至少支持桌面端 Chrome 浏览器 135 及以后版本……
> **游戏核心逻辑应当用 MoonBit 开发**，优先推荐使用官方游戏框架：pixel-adventure.mbt、Wasm-4、Selene 等。

其他要点：

- 静态 HTML5 交付，`index.html` 作为入口，README + 不少于 1 分钟介绍视频（B 站，带 `#MoonBit 2025编程挑战赛` 标签）
- 团队 ≤5 人（月度黑客松是 ≤3 人，不同赛事）
- 初赛：前 50 名每队 500 元；早鸟前 20 队 100 元京东卡 + 10 分；特别单元奖 1,000 元×4（最佳中华文化表达 / 最佳高校团队 / 最佳社会价值功能 /「怪」好玩）
- 决赛（深圳）：一等 10,000 / 二等 5,000×2 / 三等 3,000×3 / 优异 2,000×3
- 跨平台兼容性加分：每多支持一个有效平台 +10 分，最高 50 分

来源：[2025 MGPIC 游戏赛道](https://www.moonbitlang.cn/2025-mgpic-game)（页面内容为 2025 届，横幅已替换为 11 月赛）

**往届获奖方向**

- 2025 MGPIC 于 2025-11-23 在深圳河套深港科技创新合作区收官，主办方为粤港澳大湾区数字经济研究院基础软件中心；有港科大（广州）本科生获一等奖的报道（仅见标题级信息，具体作品方向未能核实）
- 2026 SCC 官方列出的示范项目：`fastcc`（用 Codex 合成的 C 语言编译器）、`wasmoon`（支持 JIT 的 WebAssembly 运行时，性能对标 wasmtime）
- 技术水平判断：官方推崇的方向偏「系统级 / 工具链级」（编译器、运行时、内核），而不是前端小游戏

来源：[港科大（广州）本科生获2025 MoonBit全球编程创新挑战赛一等奖](http://mp.weixin.qq.com/s?__biz=Mzg5ODkwNjk1Ng==&mid=2247498332&idx=1&sn=f72cd52a2275a5ae5ef9222990de22aa)（微信，未能抓取正文，仅摘要）

---

## 三、关键判定：是否必须"主要用 MoonBit 编写"

### 3.1 官方口径原文

2026 月度黑客松验收标准第一条：

> **MoonBit 为主**：以 MoonBit 作为项目主要实现语言。

注意事项里重复了一遍：

> 验收项目需以 MoonBit 为主要实现语言，并提供清晰 README、可运行示例与必要测试。

FAQ：

> **可以提交已有项目吗？** 可以，也可维护非本人创建的旧有项目（如 MoonBit 官方项目）。验收只计算本期新增的实质工作；重复、拆分或简单修改不符合要求。

来源：[Hackathon2026 仓库 src/App.tsx](https://github.com/moonbitlang/Hackathon2026/blob/main/src/App.tsx)（`requirements.items`、`notice.items`、`faq.items`）

### 3.2 有没有"代码占比 / 行数"的硬规则？

| 赛事 | 是否有硬性占比 | 原文 |
|---|---|---|
| 2026 月度黑客松 | **没有量化指标**，只有「主要实现语言」的定性表述 | 见上 |
| 2026 SCC | 有「建议」而非门槛：有效 MoonBit 代码量至少 10,000 行 | 「仅作为工程量级参考……不以代码行数作为重点评价依据」 |
| 2025 MGPIC 游戏赛道 | 定性：「游戏核心逻辑应当用 MoonBit 开发」 | 未规定比例 |

### 3.3 是否允许混合技术栈？

- **2025 MGPIC 游戏赛道明确允许**：交付物是「静态 HTML5 游戏」，HTML/CSS/JS 外壳 + MoonBit 核心逻辑，这是官方推荐形态。
- **2026 月度黑客松没有明文禁止混合**，但「以 MoonBit 作为项目主要实现语言」这条会卡住"只搬两个模块"的做法。评审是人工的，弹性在「主要」二字上，但没有书面保证。
- 2026 SCC 的方向里有「2D 绘图、原型设计工具」，这类项目天然是 MoonBit 内核 + 其他语言外壳，说明团队对混合形态不排斥。

> 判定：**混合技术栈不被禁止，但"主要"这条必须有实质支撑**。安全线是：MoonBit 承担核心算法与数据结构，前端只是渲染壳；危险线是：MoonBit 只做一层薄封装、绝大多数逻辑仍在 JS。

---

## 四、实操评估：把抽签 + 状态机重写成 MoonBit wasm 嵌进现有页面

### 4.1 推荐路径（路径 A：wasm-gc 纯函数导出）

**架构**

```
现有 index.html / app.js（完全不动，Canvas 绘制与拖拽保持原生 JS）
        │
        ├── fetch + WebAssembly.instantiateStreaming  ← 加载
        │
        └── core.wasm（MoonBit 编译，wasm-gc）
              ├── draw_lot(weights: Array[Double], seed: Int) -> Int
              ├── ledger_step(state: Int, action: Int, year: Int) -> Int
              └── tern_decision(round: Int, pop: Int, ...) -> Int
```

**MoonBit 侧**

```moonbit
// core/weighted.mbt
pub fn draw_lot(weights : Array[Double], r : Double) -> Int {
  let mut acc = 0.0
  let mut i = 0
  for w in weights {
    acc = acc + w
    if r < acc { return i }
    i = i + 1
  }
  i - 1
}
```

`core/moon.pkg`：

```
options(
  link: {
    "wasm-gc": {
      "exports": ["draw_lot", "ledger_step", "tern_decision"],
    },
  },
)
```

**构建**：`moon build --target wasm-gc --release` → `target/wasm-gc/release/build/core/core.wasm`

**JS 侧（约 15 行）**

```js
const wasm = await WebAssembly.instantiateStreaming(fetch("./core.wasm"), {});
const { draw_lot } = wasm.instance.exports;
const idx = draw_lot(new Float64Array([0.3, 0.5, 0.2]), Math.random());
```

> 注意：`Array[Double]` 跨 wasm-gc 边界是否能直接传 `Float64Array` 取决于导出签名，稳妥做法是**只导出标量参数**（`r : Double`、`board : Int`），或额外导出 `push_weight(w: Double)` / `reset()` 这类分批写入函数。这是本项目最容易踩的坑。

### 4.2 工作量估算（仅搬两个模块）

| 环节 | 估时 | 说明 |
|---|---|---|
| 装工具链 + 跑通 hello world | 0.5 天 | `moon new` / `moon build` 即可，Windows 支持良好 |
| 抽签算法移植 + 单元测试（`moon test`） | 0.5-1 天 | 100 行以内，纯函数，好测 |
| 账本状态机移植（含枚举 + 模式匹配） | 1-1.5 天 | MoonBit 的 `enum` + 穷尽匹配比 JS 的 switch 更安全，但要重写状态转移表 |
| wasm 加载与胶水 | 0.5 天 | 注意 `file://` 打不开，必须起 http server |
| 回归对照测试（同一 seed 下 JS 版与 MoonBit 版结果一致） | 0.5 天 | 建议做，评审看"可复现" |
| **合计** | **3-4 个工作日** | 不含燕鸥模拟和地图渲染 |

### 4.3 复杂数据结构传递：方便还是不方便？

| 数据 | 方式 | 评价 |
|---|---|---|
| `Int32` / `UInt32` / `Float` / `Double` / `Bool` | 直接映射到 i32/f32/f64，零成本 | 方便 |
| `String` | 开 `use-js-builtin-string` 后，`String` = JS `externref` 字符串，零拷贝 | 方便，但 JS 侧 `instantiateStreaming` 必须传 `{ builtins: ["js-string"], importedStringConstants: "_" }`，漏了会直接实例化失败 |
| `Array[Double]` / `FixedArray[T]` | wasm-gc 下是 GC 数组引用，JS 拿到的是不透明引用 | **不方便**，需要 MoonBit 侧提供索引读写函数 |
| `struct` / 带参 `enum` | 对 JS 完全不透明 | **不方便**，官方标准做法是导出 `get_field()` / `unwrap()` 这类拆解函数（cmark 示例就是这么写的） |
| JSON | 在 MoonBit 侧序列化成 String 再传 | 中等，文本协议最省事 |
| 回调（JS 函数传进 MoonBit） | `FuncRef[T]` 用于非捕获函数；有闭包时宿主须实现 `moonbit:ffi.make_closure` | 别扭，能避则避 |
| `Int64` / `UInt64` | JS 侧是 `bigint` | 要注意，`number` 和 `bigint` 混用会抛错 |

> 一句话：**标量随便传，结构体要写拆包函数，回调尽量别用**。这也是为什么"算法模块化"比"整页渲染搬过去"现实得多。

### 4.4 环境与兼容性风险

- **wasm-gc 浏览器基线**：Chrome 119+ / Firefox 120+ / Safari 18.2+（第三方实测总结）；2025 MGPIC 要求 Chrome 135+，本项目用户若在校园机房老浏览器上跑要注意
- **必须走 http(s)**：`fetch` + `instantiateStreaming` 在 `file://` 下会被 CORS 拦，本地预览得起个静态服务器
- **语言 breaking change**：2026-11 刚把 `Int` 改名 `Int32`，锁工具链版本（记下 `moon version --all`）写进 README，否则评审复现时可能编不过
- **社区 Canvas 库成熟度**：`peter-jerry-ye/canvas` 自己标 WIP；两条路都有踩坑成本

### 4.5 对本项目的价值判断

**如果目标只是"蹭一个参赛资格"**：不划算。月度赛验的是"以 MoonBit 为主要实现语言"，搬两个模块（合计可能 300-600 行）撑不起这个口径；而且要求公开仓库、连续提交、README、测试、可复现演示，这套材料成本比移植本身还高。

**如果目标是"顺手学 MoonBit + 冲季度奖"**：有一条路成立，把三个模块抽成一个**独立的纯逻辑 MoonBit 库**（抽签 + 状态机 + 决策模拟），发布到 mooncakes.io，前端页面作为它的 demo 站。这样：

- 库本体 100% 是 MoonBit，「主要实现语言」这条自然满足
- 符合官方方向里的「工具库」「数据处理」
- 前端已有的水墨地图不用改一行，作为"真实应用场景"写进 README（评审看"解决实际应用问题"）
- 工作量约 1-2 周（含测试与文档），比全量重写地图渲染低一个数量级
- 风险：评审会问"这个库除了你自己谁用"。抽签/加权随机、有限状态机这类通用件确实有人用，但要有像样的 API 设计和测试覆盖，不能是玩具

**不建议**：把 Canvas 水墨绘制也搬到 MoonBit。要走社区 canvas/webapi 库，库本身 WIP，调试成本高，而且水墨笔触这种视觉调校对迭代速度要求极高，换语言等于自断反馈回路。

---

## 五、给这支队伍的下一步建议

1. **先确认赛事口径**（1 天内）：进官方飞书报名表单与交流群，问清三件事：11 月赛确切截止日、当前是否接受"库 + 独立 demo 站"的形态、"主要实现语言"如何判定。官方站点写的是"以官方通知为准"，第三方站的 11-30 不能当准数。
2. **锁版本**：记录 `moon version --all` 输出，写进 README，避免评审环境编译失败。
3. **做最小可行性验证**（半天）：只导出 `draw_lot(weights_len, r)` 一个函数，打通 `moon build --target wasm-gc` → 页面 `instantiateStreaming` → Canvas 里显示抽到的鸟种。这一步过了，再决定要不要投人。
4. **如果验证通过**：按「独立库 + 现有页面做 demo」的形态做，别碰地图渲染。
5. **如果验证不通过或时间不够**：群核科技那条线单独评估（另有大坑与机会，不在本报告范围）。

---

## 六、归档资料索引

| 来源 | 本地路径 | 图片 |
|---|---|---|
| 2026 SCC 赛事页 | `references/moonbitlang.cn/MoonBit_2026-11-15T14-25-23/` | 0 |
| 在 JavaScript 中使用 MoonBit 的高性能 Wasm 库 | `references/moonbitlang.cn/在 JavaScript 中使用 MoonBit 的高性能 Wasm 库_2026-11-15T14-25-23/` | 2 |
| MoonBit 贡献者页（含 11 月赛横幅） | `references/moonbitlang.cn/MoonBit_2026-11-15T14-25-30/` | 10 |
| 外部函数接口 (FFI) 文档 | `references/docs.moonbitlang.cn/外部函数接口 (FFI) — MoonBit 月兔 v0.10.20 文档_2026-11-15T14-25-36/` | 0 |
| 2025 MGPIC 游戏赛道 | `references/moonbitlang.cn/MoonBit_2026-11-15T14-28-10/` | 5 |
| 2026 黑客松官方仓库 README | `references/github.com/GitHub - moonbitlang_Hackathon2026_ MoonBit September Hackathon 2026 official we_2026-11-15T14-25-47/` | 0 |
| 11 月赛报名信息（第三方） | `references/seiguan.com/MoonBit 国产基础软件生态开源大赛｜黑客松报名开启_2026-11-15T14-25-54/` | 1 |
| 包配置文档 | `references/docs.moonbitlang.cn/包配置 — MoonBit 月兔 v0.10.20 文档_2026-11-15T14-26-52/` | 0 |
| MoonBit 下载页 | `references/moonbitlang.cn/MoonBit_2026-11-15T14-27-16/` | 3 |
| 工具链索引 | `references/docs.moonbitlang.cn/工具链 — MoonBit 月兔 v0.10.20 文档_2026-11-15T14-27-31/` | 0 |
| weekly 2023-08-28（Canvas 示例） | `references/moonbitlang.cn/weekly 2023-08-28_2026-11-15T14-27-42/` | 3 |
| 1.0 Roadmap | `references/moonbitlang.com/MoonBit Programming Language 1.0 Roadmap Preview_2026-11-15T14-27-56/` | 1 |
| WebAssembly 集成文档 | `references/docs.moonbitlang.cn/WebAssembly 集成 — MoonBit 月兔 v0.10.20 文档_2026-11-15T14-28-48/` | 0 |
| TypeScript 集成（mizchi skill） | `references/github.com/skills_moonbit-js-binding_references_typescript-integration.md at main · mizchi__2026-11-15T14-29-03/` | 0 |

> 归档路径相对本会话工作区根目录（`D:\workspace\杭电英语\习概\`）。

---

## 七、待确认事项

| 事项 | 原因 |
|---|---|
| 11 月赛确切报名与验收截止日 | 官方页面写「以官方通知为准」；11-30 仅见第三方聚合站 |
| 11 月赛是否接受「MoonBit 库 + 独立 JS demo 站」形态 | 官方只写「以 MoonBit 作为项目主要实现语言」，无判定细则 |
| 「主要实现语言」的具体判定标准 | 无公开量化规则；2026 SCC 的 10,000 行是「建议」且属另一赛事 |
| 2026 届 MGPIC 是否举办 | 官网无 2026 届页面，sitemap 里只有 2024 / 2025 的 mgpic 页面 |
| 官方是否有 bounty / 悬赏计划 | 官网与 GitHub 组织均未见公开页面 |
| 飞书报名表单与章程正文 | 需要登录，web_fetch 跳转登录页，未能读取 |
| 2025 MGPIC 获奖作品的完整名单与技术方向 | 仅见微信标题级报道，正文被风控拦截 |
| 1.0 发布时间 | roadmap 写 2026 上半年；社区 Meetup 记录提 2026 年 9 月；2026-11 仍未发布 |

## 八、信息局限性

- 微信公众平台文章普遍有风控，多篇官方公众号推文（9 月/10 月/11 月赛细则、秋招同步）未能读取正文，只能依赖官网与 GitHub 仓库源码
- 飞书文档（赛事章程 wiki、报名表单）需登录，未能核实原始条款
- 未找到任何"如何判定 MoonBit 代码占比"的官方细则；本报告的判定基于官网文字与 2025 游戏赛道的先例推断，已在正文标明
- wasm-gc 浏览器兼容基线来自第三方技术博客，非官方声明
