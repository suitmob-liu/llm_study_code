"""近一年金价走势复盘 + 与国际因子的相关性。"""
from datetime import datetime

import numpy as np
import pandas as pd

from .config import OZ_TO_GRAM, REPORT_DIR
from .context import describe
from .data import NAMES_CN
from .features import _rsi


def _daily_close(daily: dict, name: str) -> pd.Series | None:
    if name not in daily:
        return None
    s = daily[name]["close"].copy()
    s.index = s.index.tz_convert("America/New_York").normalize().tz_localize(None)
    return s[~s.index.duplicated(keep="last")]


def _series_stats(s_all: pd.Series, end: pd.Timestamp, last: float) -> dict:
    """某一计价单位下的近一年统计（美元/盎司 或 人民币/克）。"""
    s = s_all[s_all.index > end - pd.DateOffset(years=1)]
    ret = s.pct_change().dropna()
    ma = {n: float(s_all.rolling(n).mean().iloc[-1]) for n in (20, 50, 200)}
    rsi = float(_rsi(s_all).iloc[-1])
    monthly = s.resample("ME").last()
    mchg = monthly.pct_change() * 100
    trend = [
        "多头排列" if ma[20] > ma[50] > ma[200] else ("空头排列" if ma[20] < ma[50] < ma[200] else "均线交织"),
        f"价格{'高于' if last > ma[200] else '低于'}200日均线（{(last / ma[200] - 1) * 100:+.1f}%）",
        "RSI 超买" if rsi > 70 else ("RSI 超卖" if rsi < 30 else f"RSI {rsi:.0f} 中性"),
    ]
    return {
        "last": last, "start": float(s.iloc[0]), "start_date": f"{s.index[0]:%Y-%m-%d}",
        "year_chg": float(s.iloc[-1] / s.iloc[0] - 1) * 100,
        "high": float(s.max()), "high_date": f"{s.idxmax():%Y-%m-%d}",
        "low": float(s.min()), "low_date": f"{s.idxmin():%Y-%m-%d}",
        "since_peak": float(s.iloc[-1] / s.max() - 1) * 100, "max_dd": float((s / s.cummax() - 1).min()) * 100,
        "ann_vol": float(ret.std() * np.sqrt(252)) * 100,
        "ma": {str(k): v for k, v in ma.items()}, "rsi": rsi, "trend": trend,
        "monthly": [{"month": f"{d:%Y-%m}", "close": float(v),
                     "change_pct": None if pd.isna(mchg.get(d)) else float(mchg.get(d))} for d, v in monthly.items()],
    }


def analyze(daily: dict, hourly: dict, ctx: dict) -> tuple[str, dict]:
    g_all = _daily_close(daily, "gold")
    end = g_all.index[-1]
    g = g_all[g_all.index > end - pd.DateOffset(years=1)]
    last = float(hourly["gold"]["close"].iloc[-1])
    cny = _daily_close(daily, "usdcny")
    fx = float(cny.iloc[-1]) if cny is not None else None

    ret = g.pct_change().dropna()
    dd = g / g.cummax() - 1
    hi_d, lo_d = g.idxmax(), g.idxmin()
    ma = {n: float(g_all.rolling(n).mean().iloc[-1]) for n in (20, 50, 200)}
    rsi = float(_rsi(g_all).iloc[-1])
    monthly = g.resample("ME").last()
    mchg = monthly.pct_change() * 100

    # 与国际因子的相关性（日度变化；CFTC 持仓为周度数据，按周计算）
    corr = {}
    for name in ("real10", "dxy", "tnx", "bei10", "silver", "oil", "spx", "vix", "cot"):
        s = _daily_close(daily, name)
        if s is None:
            continue
        df = pd.concat([g, s], axis=1, keys=["g", "x"])
        if name == "cot":
            df = df.ffill().resample("W-FRI").last().dropna()
        else:
            df = df.dropna()
        if len(df) < 10:
            continue
        gx = np.log(df["g"]).diff()
        xx = df["x"].diff() if name in ("tnx", "real10", "bei10", "cot") else np.log(df["x"]).diff()
        c = gx.corr(xx)
        if pd.notna(c):
            corr[name] = float(c)

    # 分阶段
    peak_ret = (g.max() / g.iloc[0] - 1) * 100
    since_peak = (g.iloc[-1] / g.max() - 1) * 100

    trend = []
    trend.append("多头排列" if ma[20] > ma[50] > ma[200] else ("空头排列" if ma[20] < ma[50] < ma[200] else "均线交织"))
    trend.append(f"价格{'高于' if last > ma[200] else '低于'}200日均线（{(last / ma[200] - 1) * 100:+.1f}%）")
    trend.append("RSI 超买" if rsi > 70 else ("RSI 超卖" if rsi < 30 else f"RSI {rsi:.0f} 中性"))

    stats = {**_series_stats(g_all, end, last), "corr": corr, "fx": fx}
    if cny is not None:
        # 人民币/克 序列：每日金价 × 当日汇率。人民币计价的高低点、涨跌、回撤可能与美元计价不同
        fxa = cny.reindex(cny.index.union(g_all.index)).ffill().bfill().reindex(g_all.index)
        stats["cny"] = _series_stats(g_all * fxa / OZ_TO_GRAM, end, last * fx / OZ_TO_GRAM)

    L = [f"# 黄金近一年走势分析（{datetime.now():%Y-%m-%d %H:%M}）", ""]
    L += ["## 概览", "",
          f"- 最新价：**${last:,.1f}/盎司**" + (f"（约 ¥{last * fx / OZ_TO_GRAM:,.1f}/克，汇率 {fx:.4f}）" if fx else ""),
          f"- 一年前（{g.index[0]:%Y-%m-%d}）：${g.iloc[0]:,.1f}，一年涨跌 **{stats['year_chg']:+.1f}%**",
          f"- 年内最高：${g.max():,.1f}（{hi_d:%Y-%m-%d}），从一年前起涨 {peak_ret:+.1f}%",
          f"- 年内最低：${g.min():,.1f}（{lo_d:%Y-%m-%d}）",
          f"- 距高点回撤：{since_peak:.1f}%，年内最大回撤 {stats['max_dd']:.1f}%",
          f"- 年化波动率：{stats['ann_vol']:.1f}%",
          f"- 均线：MA20 {ma[20]:,.0f} / MA50 {ma[50]:,.0f} / MA200 {ma[200]:,.0f} → " + "，".join(trend), ""]
    L += ["## 月度走势", "", "| 月份 | 月末收盘 | 月涨跌 |", "|---|---|---|"]
    for d, v in monthly.items():
        c = mchg.get(d)
        L.append(f"| {d:%Y-%m} | {v:,.1f} | {'' if pd.isna(c) else f'{c:+.1f}%'} |")
    L += ["", "## 与国际因子的日度相关性（近一年）", "", "| 因子 | 相关系数 | 解读 |", "|---|---|---|"]
    tips = {"dxy": "负相关越强，美元对金价压制越明显", "tnx": "名义利率上行压制金价",
            "real10": "负相关越强，实际利率（机会成本）逻辑越主导", "bei10": "正相关代表抗通胀需求在发挥作用",
            "silver": "贵金属板块联动", "oil": "通胀交易联动", "vix": "正相关代表避险属性在发挥作用",
            "spx": "负相关代表避险资金在股金之间轮动", "cot": "周度：正相关代表投机资金推动行情"}
    for k, v in corr.items():
        L.append(f"| {NAMES_CN[k]} | {v:+.2f} | {tips[k]} |")
    L += ["", "## 国际基本面情景", "", "```", describe(ctx), "```", ""]
    if ctx.get("summary"):
        L += [ctx["summary"], ""]
    if ctx.get("upcoming_events"):
        L += ["**近期关注事件**：", ""] + [f"- {e}" for e in ctx["upcoming_events"]] + [""]
    text = "\n".join(L)
    path = REPORT_DIR / f"analysis_{datetime.now():%Y%m%d}.md"
    path.write_text(text, encoding="utf-8")
    return text, {"path": str(path), **stats}
