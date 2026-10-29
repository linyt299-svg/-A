# 外网访问指南

当前应用默认只监听 `127.0.0.1:4173`，所以只有本机可以访问。下面按“临时演示 → 局域网 → 长期公网”三种场景说明。

## 1. 最快：临时公网地址

在项目目录执行：

```powershell
npx --yes localtunnel --port 4173
```

终端会输出一个 `https://xxxx.loca.lt` 地址。把这个地址发给别人即可。

注意：

- 本机 Node 服务必须一直运行，终端关闭后隧道失效。
- 地址每次重启都会变化。
- 这是临时演示方案，不适合长期对外服务。
- 访问者打开的是你的电脑上的应用；持仓数据仍分别保存在各自浏览器里。

## 2. 同一个 Wi-Fi / 局域网访问

让服务监听所有网卡：

```powershell
$env:HOST='0.0.0.0'
npm start
```

然后同一局域网的人访问：

```text
http://192.168.2.30:4173
```

如果打不开，在 Windows 防火墙中放行 TCP `4173` 端口：

```powershell
New-NetFirewallRule -DisplayName "Guanlan StockLens 4173" -Direction Inbound -Protocol TCP -LocalPort 4173 -Action Allow
```

路由器如果开启了“AP 隔离 / 客户端隔离”，需要关闭，否则设备之间不能互访。

## 3. 长期公网：Cloudflare Tunnel（推荐）

适合没有公网 IP、没有云服务器的情况。

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:4173
```

命令会输出一个 `https://....trycloudflare.com` 临时地址。

如果要有固定域名和长期地址：

```powershell
cloudflared tunnel login
cloudflared tunnel create guanlan
cloudflared tunnel route dns guanlan stock.example.com
cloudflared tunnel run guanlan
```

再按 Cloudflare Zero Trust 文档把 Tunnel 配置为 Windows 服务，就能开机自动运行。长期公开时建议加 Cloudflare Access 或应用自身密码，避免任何人随意调用数据接口。

## 4. 长期公网：Docker / 云服务器

项目已提供 `Dockerfile`，没有 npm 依赖，构建后直接运行：

```powershell
docker build -t guanlan-stocklens .
docker run -d --name guanlan-stocklens -p 4173:4173 guanlan-stocklens
```

云服务器上再用 Nginx / Caddy 反向代理到 `127.0.0.1:4173`，配置 HTTPS 即可。也可以把仓库直接部署到 Render、Railway、Fly.io 等支持 Docker 的平台。

项目已附带 `render.yaml`，在 Render 新建 Blueprint 即可按免费计划部署；免费实例 15 分钟无访问会休眠，首次打开约需 1 分钟冷启动。部署平台通常会自动注入 `PORT` 环境变量；本项目已读取 `process.env.PORT`，无需改代码。

## 5. 公开前的注意事项

- 公网地址等于把数据代理开放给访问者，建议加访问密码或 Cloudflare Access。
- 东方财富、腾讯、新浪接口都按来源 IP 限流；公开访问量增大后可能触发限流，项目会自动降级，但不能保证高并发。
- 自选股和持仓数据保存在浏览器 `localStorage`，不同设备/浏览器不共享，服务端不保存个人持仓。
- 页面已标注“不构成投资建议”，公开部署时请保留该声明。
