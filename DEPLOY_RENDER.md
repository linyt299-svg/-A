# 部署到 Render Free（一步步）

本项目已经准备好 `Dockerfile`、`render.yaml` 和 `.dockerignore`，Render 可以直接识别为 Blueprint。

## 1. 把项目推到 GitHub

在 `stocklens` 目录执行：

```powershell
git init
git add .
git commit -m "feat: 观澜投研 StockLens"
```

然后在 GitHub 新建一个空仓库，按 GitHub 页面提示执行：

```powershell
git branch -M main
git remote add origin https://github.com/你的用户名/stocklens.git
git push -u origin main
```

> 不需要上传 `.env`，项目没有服务端密钥。

## 2. 在 Render 建 Blueprint

1. 登录 [Render Dashboard](https://dashboard.render.com/)。
2. 点击 **New → Blueprint**。
3. 连接 GitHub，选择刚才的 `stocklens` 仓库。
4. Render 会自动读取根目录的 `render.yaml`。
5. 确认服务名、免费计划 `free`、区域 `singapore`，点击 **Apply**。

首次构建会拉取 `node:22-alpine`，通常 1–3 分钟。

## 3. 拿到公网地址

构建完成后，Render 会给一个类似下面的地址：

```text
https://guanlan-stocklens.onrender.com
```

打开后先测试健康检查：

```text
https://guanlan-stocklens.onrender.com/api/health
```

应返回：

```json
{"ok":true,"market":{...},"cacheEntries":0}
```

如果服务名被占用，Render 会自动加后缀，以 Dashboard 显示的 URL 为准。

## 4. 免费实例的真实体验

- 15 分钟没有访问会休眠。
- 休眠后第一次打开需要约 30–60 秒冷启动。
- 每个 workspace 每月 750 小时免费实例时长，单个服务足够用。
- 512MB 内存，跑这个项目足够（无数据库、无构建依赖）。
- 自动提供 HTTPS 和 `onrender.com` 子域名，不需要买域名。

## 5. 更新代码

以后只需要：

```powershell
git add .
git commit -m "update"
git push
```

Render 会自动重新部署。

## 6. 注意事项

- `render.yaml` 里设置了 `region: singapore`，更适合访问国内行情接口。如果该区域对免费实例不可用，把这一行删掉，Render 会使用默认区域。
- Render 免费实例不适合高并发或商业 SLA。访问量上来后，建议升级到 $7/月的 512MB 常驻实例。
- 服务是公开的，任何拿到 URL 的人都能访问。若需要访问密码，可以在后续加一层 Basic Auth 或 Cloudflare Access。
- 行情接口来自东方财富 / 腾讯 / 新浪，可能受来源 IP 限流；项目本身已做缓存和降级。
