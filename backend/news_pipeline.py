"""外部新闻 API -> LLM 分析 -> JSONL 落库的 Cron Job 框架。"""

from __future__ import annotations

import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.news_intelligence import analyze_news


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "data" / "ingested-news.json"


def fetch_external_news(api_url: str, api_key: str = "") -> list[dict[str, Any]]:
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(api_url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("items", payload.get("data", []))
    return rows if isinstance(rows, list) else []


def run_news_ingestion(
    *,
    api_url: str,
    api_key: str = "",
    output_file: Path = OUTPUT_FILE,
) -> list[dict[str, Any]]:
    existing: list[dict[str, Any]] = []
    if output_file.exists():
        existing = json.loads(output_file.read_text(encoding="utf-8"))
    by_id = {str(item["id"]): item for item in existing if item.get("id")}

    for raw in fetch_external_news(api_url, api_key):
        item_id = str(raw.get("id", "")).strip()
        title = str(raw.get("title", "")).strip()
        content = str(raw.get("content", raw.get("summary", ""))).strip()
        if not item_id or not title or item_id in by_id:
            continue
        analysis = analyze_news(f"标题：{title}\n正文：{content}")
        by_id[item_id] = {
            "id": item_id,
            "title": title,
            "content": content,
            "publish_time": raw.get("publish_time") or datetime.now(timezone.utc).isoformat(),
            "source": str(raw.get("source", "未知来源")),
            **analysis,
            "url": str(raw.get("url", "")),
        }

    result = sorted(by_id.values(), key=lambda item: item["publish_time"], reverse=True)[:5000]
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output_file.parent, delete=False) as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        temp_path = Path(handle.name)
    temp_path.replace(output_file)
    return result


if __name__ == "__main__":
    url = os.environ.get("NEWS_API_URL", "")
    if not url:
        raise SystemExit("请设置 NEWS_API_URL")
    rows = run_news_ingestion(api_url=url, api_key=os.environ.get("NEWS_API_KEY", ""))
    print(f"新闻入库完成：{len(rows)} 条")
