"""国际基本面情景（market_context.json）。

量化模型只能看到价格和宏观行情，看不到“美联储会议纪要偏鹰”“央行在买金”这类信息，
所以用一个人工/AI 维护的因子打分文件把国际趋势反馈进模型：
impact 取值 -2(强利空) ~ +2(强利多)，weight 为重要性。情景分 = Σ(impact·weight) / Σ(2·weight) ∈ [-1, 1]。
"""
import json
from datetime import date, datetime

from .config import CONTEXT_PATH


def load_context() -> dict:
    if not CONTEXT_PATH.exists():
        return {"updated_at": None, "factors": []}
    return json.loads(CONTEXT_PATH.read_text(encoding="utf-8-sig"))


def context_score(ctx: dict) -> float:
    fs = ctx.get("factors", [])
    tw = sum(abs(f.get("weight", 1)) for f in fs)
    if tw == 0:
        return 0.0
    s = sum(f["impact"] * f.get("weight", 1) for f in fs) / (2 * tw)
    return max(-1.0, min(1.0, s))


def staleness_days(ctx: dict) -> int | None:
    u = ctx.get("updated_at")
    if not u:
        return None
    return (date.today() - datetime.fromisoformat(u).date()).days


def describe(ctx: dict) -> str:
    lines = [f"国际情景更新时间：{ctx.get('updated_at')}，情景分 {context_score(ctx):+.2f}（-1 极度利空 ~ +1 极度利多）"]
    for f in ctx.get("factors", []):
        tag = {2: "强利多", 1: "利多", 0: "中性", -1: "利空", -2: "强利空"}.get(f["impact"], f["impact"])
        lines.append(f"  · [{tag}] {f['name']}（权重 {f.get('weight', 1)}）：{f.get('note', '')}")
    return "\n".join(lines)
