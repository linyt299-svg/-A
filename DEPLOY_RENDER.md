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

> 不要上传 `.env`。`render.yaml` 会生成独立的 `APP_ENCRYPTION_KEY`，用于加密每位用户保存的 AI API Key。

## 2. 在 Render 建 Blueprint

1. 登录 [Render Dashboard](https://dashboard.render.com/)。
2. 点击 **New → Blueprint**。
3. 连接 GitHub，选择刚才的 `stocklens` 仓库。
4. Render 会自动读取根目录的 `render.yaml`，并挂载 `/var/data` 持久磁盘。账号、加密后的 AI Key、提醒收件箱和投递日志都保存在该磁盘，重新部署不会丢失。
5. 确认服务名、`starter` 计划、区域 `singapore`，点击 **Apply**。正式环境需要持久磁盘保存账号和加密配置，因此不再使用无持久磁盘保障的免费计划。

Blueprint 会要求填写 `SUPER_ADMIN_PASSWORD`。该密码只在首次创建持久化数据目录时用于初始化手机号 `15759863163`，请设置至少 8 位的高强度密码并妥善保管。

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

## 4. 线上实例说明

- `starter` 实例不会因免费套餐休眠而产生首次访问冷启动。
- 512MB 内存足够运行当前服务；1GB 持久磁盘用于账号、提醒与加密配置。不能删除磁盘配置后继续用于正式环境，否则重新部署会丢失这些数据。
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
- 当前 Blueprint 使用支持持久化数据的常驻实例；访问量或 SLA 要求提升后再按监控结果扩容。
- 服务自带登录鉴权。超级管理员手机号为 `15759863163`，可在右上角头像 → 个人信息中新增子账号；子账号只能修改自己的 AI 设置。
- AI API Key 使用 AES-256-GCM 加密后落盘，浏览器只返回末四位掩码。不要删除或轮换 `APP_ENCRYPTION_KEY`，否则已保存的 Key 将无法解密。
- 站内量化提醒始终启用；如需接入企业微信、飞书或自有消息网关，可在 Render 环境变量中设置 `ALERT_WEBHOOK_URL`。Webhook 失败会重试 3 次，结果写入持久化投递日志。
- 行情接口来自东方财富 / 腾讯 / 新浪，可能受来源 IP 限流；项目本身已做缓存和降级。
