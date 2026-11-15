<!--AIGC: {"Label":"1","ContentProducer":"Alice-Miyang","ProduceID":"alice-doc-20261115140146-00cb4873","ReservedCode1":"null","ContentPropagator":"Alice-Miyang","PropagateID":"alice-doc-20261115140146-00cb4873","ReservedCode2":"null"}-->
（人工智能生成）

# DEPLOY · 部署运维手册

> 上线、维护、排障时读这一页。
> 更新时间：2026-11-15 22:15

---

## 一、服务器

| 项 | 值 |
|---|---|
| IP | `38.76.172.131` |
| 系统 | Debian GNU/Linux 13 (trixie) amd64 |
| 用户 | `root` |
| 密码 | 见会话记录（不写入仓库） |
| 磁盘 | 39G，已用 30%，剩 27G |
| Node | v24.21.0 |
| Web 服务器 | Caddy v2.11.4 |

**已在运行的服务（不要动）**

| 服务 | 端口 | 说明 |
|---|---|---|
| caddy | 80, 443, 2019 | 反代与静态站 |
| crina-backend | 127.0.0.1:8010 | here.crina.at 后端 |
| farm-server | 127.0.0.1:8901 | f4d.hub.tt2.li 游戏后端 |
| reunion | — | 失物招领 |
| postgresql@17 | 127.0.0.1:5432 | 数据库 |
| redis | 127.0.0.1:6379 | 缓存 |

---

## 二、Caddy 结构

```
/etc/caddy/Caddyfile
    {
        email admin@tt2.li
    }
    import /etc/caddy/sites.d/*.caddy
```

每个站点一个文件，放 `/etc/caddy/sites.d/`。

**现有站点**（13 个）
`000-default` `cfs.tt2.li` `clm` `deepseek-v41-flash.lhub.tt2.li` `demo.lhub.tt2.li` `desk-picker.lhub.tt2.li` `e2edemo.lhub.tt2.li` `f4d.hub.tt2.li` `here.crina.at` `jev-tangpu.lhub.tt2.li` `ling.tt2.li` `reunion.tt2.li` `yangjianghao.lhub.tt2.li`

---

## 三、本项目的部署方式

**静态站，无后端。**

| 项 | 值 |
|---|---|
| 站点根目录 | `/srv/sites/2026.crina.at` |
| Caddy 配置 | `/etc/caddy/sites.d/2026.crina.at.caddy` |
| 域名 | `2026.crina.at` |
| 证书 | Caddy 自动申请 Let's Encrypt |

### 3.1 Caddy 配置内容

```caddy
2026.crina.at {
    root * /srv/sites/2026.crina.at
    encode zstd gzip

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }

    @static_assets path_regexp \.(css|js|mjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|otf|mp3|mp4|webm|wasm|json)$
    header @static_assets Cache-Control "public, max-age=604800"

    handle {
        try_files {path} {path}/ /index.html
        file_server
    }
}
```

### 3.2 部署步骤

```bash
# 1. 本地打包
cd map-site
tar -czf dist.tar.gz site/

# 2. 上传
python ../tools/remote.py --put dist.tar.gz /tmp/dist.tar.gz

# 3. 服务器解压
python ../tools/remote.py "mkdir -p /srv/sites/2026.crina.at && rm -rf /srv/sites/2026.crina.at/* && tar -xzf /tmp/dist.tar.gz -C /tmp && cp -r /tmp/site/* /srv/sites/2026.crina.at/ && ls -la /srv/sites/2026.crina.at/"

# 4. 写入 Caddy 配置
python ../tools/remote.py "cat > /etc/caddy/sites.d/2026.crina.at.caddy << 'EOF' ... EOF"

# 5. 校验并重载
python ../tools/remote.py "caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy"

# 6. 验证
curl -I https://2026.crina.at
```

### 3.3 回滚

```bash
# 站点内容回滚
python ../tools/remote.py "rm -rf /srv/sites/2026.crina.at && cp -r /srv/sites/2026.crina.at.bak/* /srv/sites/2026.crina.at/"

# Caddy 配置回滚
python ../tools/remote.py "rm /etc/caddy/sites.d/2026.crina.at.caddy && systemctl reload caddy"
```

**每次部署前先备份**：
```bash
python ../tools/remote.py "cp -r /srv/sites/2026.crina.at /srv/sites/2026.crina.at.bak.$(date +%Y%m%d%H%M)"
```

---

## 四、本地开发

无需构建。任选一种起静态服务：

```bash
# Python
cd site && python -m http.server 8080

# Node
npx serve site
```

**注意**：必须用 HTTP 服务，不能直接双击 `index.html`，因为 ES Module 和 fetch 在 `file://` 协议下会被 CORS 拦。

---

## 五、排障

| 症状 | 排查 |
|---|---|
| 502 / 白屏 | `journalctl -u caddy -n 50` |
| 证书没签发 | `caddy list-certificates`；检查 DNS 解析；80 端口是否可达 |
| 中文乱码 | 检查响应头 `Content-Type: text/html; charset=utf-8` |
| ES Module 报错 | 确认是通过 http 访问而非 file:// |
| 样式全丢 | 确认 `/srv/sites/2026.crina.at/css/` 存在且权限正确 |

---

## 六、GitHub 仓库

| 项 | 值 |
|---|---|
| 账号 | `nlpark-cran` |
| 仓库名 | 待定（建议 `liangshan-20`） |
| 可见性 | 建议 public（作业可公开，便于老师查看） |
| 认证 | Fine-grained PAT（见会话记录，不写入仓库） |

**推送前检查**

- [ ] `site/` 内无任何密钥
- [ ] `.gitignore` 排除 `dist.tar.gz`、`screenshots/`、`node_modules/`
- [ ] 不提交 `tools/remote.py`（含服务器密码）—— 该文件在父目录，天然不在仓库内
- [ ] 不提交任何含密码的文件
