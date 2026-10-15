"""按 日 / 周 / 月 查询行情（北京时间自然日、自然周[周一~周日]、自然月）。

优先使用小时线（精确到高低点出现时刻），小时线覆盖不到的更早时间用日线补齐。
"""
from datetime import date, datetime

import numpy as np
import pandas as pd

from . import data
from .config import OZ_TO_GRAM

BJ = "Asia/Shanghai"
KINDS = ("day", "week", "month")
MACROS = ("dxy", "tnx", "real10", "bei10", "silver", "oil", "spx", "vix", "cot")


def bounds(kind: str, d: date) -> tuple[pd.Timestamp, pd.Timestamp, str]:
    """返回 [start, end) 北京时间区间与标签。"""
    if kind == "day":
        s = pd.Timestamp(d)
        e = s + pd.Timedelta(days=1)
        label = f"{s:%Y-%m-%d}（周{'一二三四五六日'[s.weekday()]}）"
    elif kind == "week":
        s = pd.Timestamp(d) - pd.Timedelta(days=d.weekday())
        e = s + pd.Timedelta(days=7)
        iso = s.isocalendar()
        label = f"{iso[0]}年第{iso[1]}周（{s:%m-%d} ~ {e - pd.Timedelta(days=1):%m-%d}）"
    elif kind == "month":
        s = pd.Timestamp(d.year, d.month, 1)
        e = s + pd.offsets.MonthBegin(1)
        label = f"{s:%Y年%m月}"
    else:
        raise ValueError(kind)
    return s.tz_localize(BJ), e.tz_localize(BJ), label


def _bars(con, name: str, start=None, end=None) -> pd.DataFrame:
    """小时线 + 小时线覆盖不到的日线（更早的历史，或备用源只有日线时的近期数据），统一为北京时间索引。"""
    h = data.read(con, name, "1h", start, end) if name in data.HOURLY else pd.DataFrame()
    d = data.read(con, name, "1d", start, end)
    if not h.empty and not d.empty:
        d = d[(d.index < h.index[0]) | (d.index > h.index[-1])]
    parts = [x for x in (d, h) if not x.empty]
    df = pd.concat(parts).sort_index() if len(parts) > 1 else (parts[0] if parts else d)
    if df.empty:
        return df
    df = df.copy()
    df["open"] = df["open"].fillna(df["close"])
    df["high"] = df["high"].fillna(df["close"])
    df["low"] = df["low"].fillna(df["close"])
    df.index = df.index.tz_convert(BJ)
    return df


def _key(idx: pd.DatetimeIndex, kind: str) -> pd.Series:
    day = idx.tz_localize(None).normalize()
    if kind == "day":
        k = day
    elif kind == "week":
        k = day - pd.to_timedelta(day.weekday, unit="D")
    else:
        k = day.to_period("M").to_timestamp()
    return pd.Series(k, index=idx)


def _agg(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    g = df.groupby(_key(df.index, kind).to_numpy())
    out = pd.DataFrame({
        "open": g["open"].first(), "close": g["close"].last(),
        "high": g["high"].max(), "low": g["low"].min(),
        "high_time": g["high"].idxmax(), "low_time": g["low"].idxmin(),
        "bars": g["close"].size(),
    })
    out["prev_close"] = out["close"].shift(1)
    out["change"] = out["close"] - out["prev_close"]
    out["change_pct"] = out["change"] / out["prev_close"] * 100
    out["amplitude_pct"] = (out["high"] - out["low"]) / out["prev_close"].fillna(out["open"]) * 100
    return out


def _fmt_row(k: pd.Timestamp, r, kind: str, fx: float | None) -> dict:
    s, e, label = bounds(kind, k.date())
    nan = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else v  # noqa: E731
    return {
        "key": k.strftime("%Y-%m-%d"), "label": label, "start": s.isoformat(), "end": e.isoformat(),
        "open": r.open, "close": r.close, "high": r.high, "low": r.low,
        "high_time": r.high_time.isoformat(), "low_time": r.low_time.isoformat(),
        "prev_close": nan(r.prev_close), "change": nan(r.change), "change_pct": nan(r.change_pct),
        "amplitude_pct": nan(r.amplitude_pct), "bars": int(r.bars),
        "close_cny_g": r.close * fx / OZ_TO_GRAM if fx else None,
    }


def _fx_at(con, t: pd.Timestamp) -> float | None:
    fx = data.read(con, "usdcny", "1d", end=t)
    return float(fx["close"].iloc[-1]) if not fx.empty else None


def list_periods(con, kind: str, months: int = 12) -> list[dict]:
    """最近 months 个月内每个 日/周/月 的汇总（倒序）。"""
    start = pd.Timestamp.now(tz=BJ) - pd.DateOffset(months=months) - pd.Timedelta(days=40)
    df = _bars(con, "gold", start=start)
    if df.empty:
        return []
    agg = _agg(df, kind)
    first = bounds(kind, (pd.Timestamp.now() - pd.DateOffset(months=months)).date())[0].tz_localize(None)
    agg = agg[agg.index >= first]
    fx = _fx_at(con, pd.Timestamp.now(tz="UTC"))
    return [_fmt_row(k, r, kind, fx) for k, r in agg.iloc[::-1].iterrows()]


def period_detail(con, kind: str, d: date) -> dict:
    s, e, label = bounds(kind, d)
    # 多取一段，用于计算“较上期”
    lookback = {"day": 10, "week": 21, "month": 70}[kind]
    df = _bars(con, "gold", start=s - pd.Timedelta(days=lookback), end=e)
    df = df[df.index < e]
    cur = df[df.index >= s]
    if cur.empty:
        return {"kind": kind, "label": label, "start": s.isoformat(), "end": e.isoformat(), "empty": True,
                "message": "该时间段没有交易数据（休市或超出数据范围）"}
    agg = _agg(df, kind)
    key = _key(cur.index[:1], kind).iloc[0]
    fx = _fx_at(con, e.tz_convert("UTC"))
    summary = _fmt_row(key, agg.loc[key], kind, fx)
    summary["usdcny"] = fx

    # 细分：日 → 每小时；周 → 每天；月 → 每天 + 每周
    breakdown = {}
    if kind == "day":
        breakdown["hours"] = [{"time": t.isoformat(), "open": r.open, "high": r.high, "low": r.low,
                               "close": r.close} for t, r in cur.iterrows()]
    else:
        dd = _agg(df, "day")
        dd = dd[dd.index >= s.tz_localize(None)]
        breakdown["days"] = [_fmt_row(k, r, "day", fx) for k, r in dd.iterrows()]
        if kind == "month":
            ww = _agg(df[df.index >= s - pd.Timedelta(days=14)], "week")
            ww = ww[ww.index + pd.Timedelta(days=7) > s.tz_localize(None)]
            breakdown["weeks"] = [_fmt_row(k, r, "week", fx) for k, r in ww.iterrows()]

    # 同期国际因子变化
    macros = {}
    for m in MACROS:
        md = _bars(con, m, start=s - pd.Timedelta(days=lookback), end=e)
        if md.empty:
            continue
        before, inside = md[md.index < s], md[(md.index >= s) & (md.index < e)]
        if inside.empty:
            continue
        b = float(before["close"].iloc[-1]) if not before.empty else float(inside["open"].iloc[0])
        a = float(inside["close"].iloc[-1])
        macros[m] = {"name": data.NAMES_CN[m], "start": b, "end": a,
                     "change": a - b, "change_pct": (a / b - 1) * 100 if b else None}

    # 图表数据
    chart = [[int(t.timestamp() * 1000), r.open, r.close, r.low, r.high] for t, r in cur.iterrows()]

    # 该时段内做出的预测
    preds = [dict(r) for r in con.execute(
        "SELECT id, horizon, base_time, base_price, usdcny, target_time, pred_price, lower, upper, direction, prob_up, "
        "status, actual_price, error_usd, direction_hit, in_interval FROM predictions "
        "WHERE base_time >= ? AND base_time < ? ORDER BY base_time",
        (s.tz_convert("UTC").isoformat(), e.tz_convert("UTC").isoformat())).fetchall()]

    return {"kind": kind, "label": label, "start": s.isoformat(), "end": e.isoformat(), "empty": False,
            "summary": summary, "breakdown": breakdown, "macros": macros, "chart": chart,
            "predictions": preds,
            "prev": (s - pd.Timedelta(days=1)).strftime("%Y-%m-%d"), "next": e.strftime("%Y-%m-%d")}


def parse_date(s: str | None) -> date:
    if not s:
        return datetime.now().date()
    s = s.strip()
    if len(s) == 7:  # YYYY-MM
        s += "-01"
    return datetime.strptime(s[:10], "%Y-%m-%d").date()
