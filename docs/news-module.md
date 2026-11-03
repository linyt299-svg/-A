# 消息面模块

## 数据流

`同花顺重要快讯/外部新闻 API -> 字段标准化 -> 产业链映射 -> 来源权重/时间衰减 -> 综合研判分 -> 前端展示/Copilot`

标准模型见 `docs/news-data-model.schema.json`。Python 参考实现在 `backend/news_intelligence.py`，现有 Node 服务使用同规则的 `news-engine.js`。

## 综合研判公式

```text
综合研判分 = 技术面 × 35% + 资金面 × 25% + 机构面 × 20% + 消息面 × 20%
时间衰减 = 0.5 ^ (新闻年龄天数 / 1天半衰期)
```

消息面原始影响为 `-100~100`，聚合后映射到 `0~100`，其中 `50` 为中性。交易所/监管/公司公告权重 `1.0`，主流财经媒体 `0.8`，其他来源 `0.3`。未经证实的自媒体利好使用 `-0.2`，使“小作文”不能抬高综合分。

## 定时任务

Linux Cron 示例位于 `deploy/news-ingestion.cron`。本地单次执行：

```powershell
$env:NEWS_API_URL = 'https://example.com/api/news'
$env:NEWS_API_KEY = 'replace-me'
python -m backend.news_pipeline
```

未配置 `NEWS_API_URL` 时，Node 服务默认读取同花顺“重要”快讯 15 条，并适配其 `data.list`、`ctime`、`import`、`stock` 与 `field` 字段。设置 `NEWS_PROVIDER=local` 可改用 `data/news.json` 本地样本。

跨市场事件允许映射到 A 股产业链，但必须标记为“间接”、给出置信度与作用链条。比如迈威尔收购 Lumentum 会映射到光通信/高速通信 PCB，并把东山精密列为低置信度的产业链间接关联；在公告或订单证实前，不把它表述为确定受益。

## Vue3 组件

`examples/TodayCatalysts.vue` 是可直接迁入 Vue3 项目的“今日重磅催化”组件。板块标签通过 `sectorSelected` 事件交给父组件执行筛选或路由跳转。
