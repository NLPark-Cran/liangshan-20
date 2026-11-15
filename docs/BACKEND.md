<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115183958-02abf75c","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115183958-02abf75c","ReservedCode2":"null"}-->
（人工智能生成）

# BACKEND · 后端设计

> 改后端之前读这一页。
> 更新时间：2026-11-16 02:45

---

## 一、为什么加后端

最初是纯静态站。加后端的理由有三个：

1. **成绩要能留下来。** 观鸟翻到过什么鸟、账本推演成什么样、岛上飞出过几只雏鸟，只存在 localStorage 里，换设备就没了，也没法比较。
2. **抽签要在服务端做。** 稀有鸟种的判定放在前端，任何人打开控制台改一行代码就能刷出「中华凤头燕鸥」。
3. **要能看别人的成绩。** 排行榜需要服务端。

## 二、技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 运行时 | Node 24 | 服务器上已有 |
| 框架 | Hono | 轻、快、类型好；服务器上已有的 farm-server 用的就是它 |
| 语言 | TypeScript | 全栈 TS，前后端共享类型认知 |
| 数据库 | PostgreSQL 17 | 服务器上已有 |
| 会话 | Redis db 12 | 服务器上已有；滑动过期由 Redis 管，不用写清理任务 |
| 密码 | Node 内置 scrypt | 不引入原生编译依赖（argon2 需要 node-gyp） |
| 进程 | systemd | 和已有服务一致，不容器化 |

**为什么不用 Prisma/Drizzle**：只有一个数据库，八张表以内，直接写 SQL 更清楚，也少一层构建。

## 三、数据模型

```sql
users
  id            主键
  kind          'guest' | 'member'
  handle        唯一，登录名
  nickname      显示名
  password_hash scrypt 格式字符串，游客为 NULL
  created_at / last_seen_at

bird_logs        一条观测记录
  user_id, site_id, site_name, species, rarity,
  count_text, observed_at, weather, wind, typhoon, created_at

ledger_runs      一局账本推演
  user_id, closed_year, final_year, final_cash,
  final_mountain, years_json (JSONB)

tern_runs        一轮燕鸥招引
  user_id, seasons, total_chicks, success_years, detail_json
```

**设计取舍**：`years_json` 与 `detail_json` 用 JSONB 而不是拆成明细表。理由是这些是「一局的过程记录」，只整体读、不单独查；拆表会让写入变成几十条 INSERT，收益很小。

## 四、认证

三条路径：

```
POST /api/auth/guest     一键生成游客账号，立刻发 cookie
POST /api/auth/register  注册；若当前是游客，就地升级为 member 并保留 id
POST /api/auth/login     登录；若当前是游客，把游客数据合并到目标账号后删除游客
POST /api/auth/logout    删会话
GET  /api/auth/me        看当前身份
```

**游客就地升级**是最关键的设计。升级时 `UPDATE users SET kind='member'`，id 不变，所以所有外键记录自动跟着走，不用迁移数据。

**游客数据合并**只在「已经是游客，又去登录另一个已有账号」时发生。合并后删除游客行，靠外键 `ON DELETE CASCADE` 清掉残留。

**会话**：32 字节随机串，存 Redis `sess:<token>` → userId，TTL 30 天，每次访问滑动续期。Cookie 是 `httpOnly` + `SameSite=Lax`，HTTPS 下加 `Secure`。

**限流**：注册每小时 10 次/IP，登录每 15 分钟 12 次/IP+账号，游客创建每小时 30 次/IP。用 Redis INCR + EXPIRE 实现，不做精确滑动窗口。

## 五、接口清单

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 公开 | 返回 db/redis 状态 |
| GET | `/api/sites` | 公开 | 地点列表 |
| POST | `/api/auth/guest` | 公开 | 创建游客 |
| POST | `/api/auth/register` | 公开 | 注册/升级 |
| POST | `/api/auth/login` | 公开 | 登录 |
| POST | `/api/auth/logout` | 公开 | 退出 |
| GET | `/api/auth/me` | 公开 | 当前身份 |
| POST | `/api/birds/draw` | 登录 | 抽一条观测记录（服务端判定） |
| GET | `/api/birds/mine` | 登录 | 我的图鉴 |
| POST | `/api/ledger/submit` | 仅 member | 提交一局账本 |
| POST | `/api/tern/submit` | 仅 member | 提交一轮燕鸥 |
| GET | `/api/stats/mine` | 登录 | 我的战绩 |
| GET | `/api/leaderboard` | 公开 | 三个榜前 10 |

## 六、降级策略

前端 `api.js` 里有一个 `auth.online` 标志。后端不可用时：

- 身份条显示「本地模式」
- 抽签退回本地 `data/birds.js` 的算法
- 成绩只存 localStorage
- 战绩页显示「后端没连上」

**原则：后端挂了，页面照样能玩。** 这不是可选项——老师或评审打开的时候，服务器万一有问题，至少还能看到内容。

## 七、文件

```
server/
  package.json
  tsconfig.json
  src/
    index.ts     入口、路由挂载、启停
    db.ts        连接池 + 迁移
    session.ts   Redis 会话与限流
    password.ts  scrypt 散列
    auth.ts      认证逻辑
    api.ts       业务接口 + 服务端抽签数据
```

## 八、部署

```bash
# 1. 上传源码（跳过 node_modules）
python tools/push_server.py

# 2. 服务器上装依赖、构建、重启
python tools/remote.py "cd /root/workspace/liangshan20/server && npm install && npm run build && systemctl restart liangshan-backend"

# 3. 看健康
curl https://2026.crina.at/api/health
```

**服务定义**：`deploy/liangshan-backend.service`，监听 `127.0.0.1:8902`，由 Caddy 反代 `/api/*`。

## 九、已知限制

- 没有邮箱验证，账号只能靠 handle + 密码找回
- 限流基于 IP，NAT 后面的人会共享额度
- 排行榜每次实时算，数据量大时要加缓存
- 没有删除账号的接口
