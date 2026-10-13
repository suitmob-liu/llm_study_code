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

    # 与国际因子的相关性（日度变化）
    corr = {}
    for name in ("dxy", "tnx", "silver", "oil", "vix"):
        s = _daily_close(daily, name)
        if s is None:
            continue
        df = pd.concat([g, s], axis=1, keys=["g", "x"]).dropna()
        gx = np.log(df["g"]).diff()
        xx = df["x"].diff() if name == "tnx" else np.log(df["x"]).diff()
        corr[name] = float(gx.corr(xx))

    # 分阶段
    peak_ret = (g.max() / g.iloc[0] - 1) * 100
    since_peak = (g.iloc[-1] / g.max() - 1) * 100

    trend = []
    trend.append("多头排列" if ma[20] > ma[50] > ma[200] else ("空头排列" if ma[20] < ma[50] < ma[200] else "均线交织"))
    trend.append(f"价格{'高于' if last > ma[200] else '低于'}200日均线（{(last / ma[200] - 1) * 100:+.1f}%）")
    trend.append("RSI 超买" if rsi > 70 else ("RSI 超卖" if rsi < 30 else f"RSI {rsi:.0f} 中性"))

    stats = {
        "last": last, "start": float(g.iloc[0]), "start_date": f"{g.index[0]:%Y-%m-%d}",
        "year_chg": float(g.iloc[-1] / g.iloc[0] - 1) * 100,
        "high": float(g.max()), "high_date": f"{hi_d:%Y-%m-%d}", "low": float(g.min()), "low_date": f"{lo_d:%Y-%m-%d}",
        "since_peak": float(since_peak), "max_dd": float(dd.min()) * 100,
        "ann_vol": float(ret.std() * np.sqrt(252)) * 100,
        "ma": {str(k): v for k, v in ma.items()}, "rsi": rsi, "corr": corr, "fx": fx, "trend": trend,
        "monthly": [{"month": f"{d:%Y-%m}", "close": float(v), "change_pct": None if pd.isna(mchg.get(d)) else float(mchg.get(d))}
                    for d, v in monthly.items()],
    }

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
    tips = {"dxy": "负相关越强，美元对金价压制越明显", "tnx": "负相关代表实际利率/机会成本逻辑有效",
            "silver": "贵金属板块联动", "oil": "通胀交易联动", "vix": "正相关代表避险属性在发挥作用"}
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
