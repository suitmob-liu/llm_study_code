"""备用行情源：Yahoo Finance 不可用时（例如云服务器 IP 被封，返回 429）使用。

- 新浪财经：COMEX 黄金 / 白银 / WTI 原油（60 分钟线 + 日线），美元指数（60 分钟线 + 日线），美元兑人民币（日线）
- 美国财政部：10 年期国债收益率（日线）
- CBOE：VIX（日线）

统一返回与 data.fetch_chart 相同格式的 DataFrame：UTC 索引（K 线开始时刻），列 open/high/low/close/volume。
日线时间戳统一为纽约时间当日 0 点（与 Yahoo 日线一致）。
"""
import io
import json
import re
import time
from datetime import datetime

import pandas as pd
import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
           "Referer": "https://finance.sina.com.cn"}
COLS = ["open", "high", "low", "close", "volume"]

SINA_FUTURES = {"gold": "GC", "silver": "SI", "oil": "CL"}
SINA_FOREX = {"dxy": "DINIW", "usdcny": "fx_susdcny"}

# 备用源能提供的周期
SUPPORTED = {
    "gold": ("1h", "1d"), "silver": ("1h", "1d"), "oil": ("1h", "1d"),
    "dxy": ("1h", "1d"), "usdcny": ("1d",), "tnx": ("1d",), "vix": ("1d",),
    # 扩展因子（只有这些官方来源，Yahoo 没有）
    "real10": ("1d",), "bei10": ("1d",), "spx": ("1d",), "cot": ("1d",),
}
SOURCE_NAME = {"gold": "新浪", "silver": "新浪", "oil": "新浪", "dxy": "新浪", "usdcny": "新浪",
               "tnx": "美国财政部", "vix": "CBOE", "real10": "美国财政部", "bei10": "美国财政部",
               "spx": "CBOE", "cot": "CFTC"}


def _get(url: str, params: dict | None = None, timeout: int = 20, retries: int = 3) -> str:
    """带重试的 GET：新浪等源偶尔超时，重试通常就能成功。"""
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            return r.text
        except (requests.Timeout, requests.ConnectionError) as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def _jsonp_list(text: str) -> list:
    m = re.search(r"\((\[.*\])\)", text, re.S)
    if not m:
        raise RuntimeError(f"无法解析返回内容：{text[:80]!r}")
    return json.loads(m.group(1))


def _frame(rows: list[dict], index: pd.DatetimeIndex) -> pd.DataFrame:
    df = pd.DataFrame(rows, index=index)
    for c in COLS:
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df else float("nan")
    df = df[COLS].dropna(subset=["close"])
    df = df[df["close"] > 0]
    df.index.name = None
    return df[~df.index.duplicated(keep="last")].sort_index()


def _ny_midnight(dates) -> pd.DatetimeIndex:
    """交易日期 → 纽约时间当日 0 点（UTC），与 Yahoo 日线时间戳一致。"""
    return pd.DatetimeIndex(pd.to_datetime(list(dates))).tz_localize("America/New_York").tz_convert("UTC")


def _sina_minute(rows: list[dict]) -> pd.DataFrame:
    """新浪分钟线：北京时间、按 K 线结束时刻标注 → UTC 开始时刻。"""
    idx = (pd.DatetimeIndex(pd.to_datetime([r["d"] for r in rows])).tz_localize("Asia/Shanghai").tz_convert("UTC")
           - pd.Timedelta(hours=1))
    data = [{"open": r.get("o"), "high": r.get("h"), "low": r.get("l"), "close": r.get("c"), "volume": r.get("v")}
            for r in rows]
    return _frame(data, idx)


def sina_futures(name: str, interval: str) -> pd.DataFrame:
    sym = SINA_FUTURES[name]
    if interval == "1h":
        return _sina_minute(_jsonp_list(_get(
            f"https://gu.sina.cn/ft/api/jsonp.php/var%20_{sym}=/GlobalService.getMink", {"symbol": sym, "type": "60"})))
    rows = _jsonp_list(_get(
        f"https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_{sym}=/GlobalFuturesService.getGlobalFuturesDailyKLine",
        {"symbol": sym}))
    return _frame(rows, _ny_midnight(r["date"] for r in rows))


def sina_forex(name: str, interval: str) -> pd.DataFrame:
    sym = SINA_FOREX[name]
    base = "https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var%20_x=/NewForexService"
    if interval == "1h":
        return _sina_minute(_jsonp_list(_get(f"{base}.getOldMinKline",
                                             {"symbol": sym, "scale": "60", "datalen": "2000"}, timeout=30)))
    text = _get(f"{base}.getDayKLine", {"symbol": sym}, timeout=30)
    m = re.search(r'\("(.*)"\)', text, re.S)
    if not m:
        raise RuntimeError(f"无法解析返回内容：{text[:80]!r}")
    rows, dates = [], []
    for item in m.group(1).strip("|").split("|"):
        p = item.split(",")
        if len(p) < 5:
            continue
        dates.append(p[0])  # 字段顺序：日期, 开盘, 最低, 最高, 收盘
        rows.append({"open": p[1], "low": p[2], "high": p[3], "close": p[4]})
    return _frame(rows, _ny_midnight(dates))


def _treasury_curve(kind: str, full: bool) -> pd.Series:
    """美国财政部每日收益率曲线中的 10 年期（%）。kind: yield（名义）/ real_yield（TIPS 实际利率）。"""
    year = datetime.now().year
    frames = []
    for y in ([year - 2, year - 1, year] if full else [year]):
        text = _get(f"https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
                    f"daily-treasury-rates.csv/{y}/all",
                    {"type": f"daily_treasury_{kind}_curve", "field_tdr_date_value": str(y), "_format": "csv"})
        frames.append(pd.read_csv(io.StringIO(text)))
    df = pd.concat(frames)
    col = "10 Yr" if "10 Yr" in df else "10 YR"
    s = pd.Series(pd.to_numeric(df[col], errors="coerce").to_numpy(),
                  index=_ny_midnight(pd.to_datetime(df["Date"], format="%m/%d/%Y")))
    return s.dropna().sort_index()


def _line(s: pd.Series) -> pd.DataFrame:
    return _frame([{"open": x, "high": x, "low": x, "close": x} for x in s], s.index)


def treasury_10y(full: bool) -> pd.DataFrame:
    return _line(_treasury_curve("yield", full))


def treasury_real_10y(full: bool) -> pd.DataFrame:
    """10 年期 TIPS 实际收益率（%）：持有黄金的真实机会成本。"""
    return _line(_treasury_curve("real_yield", full))


def breakeven_10y(full: bool) -> pd.DataFrame:
    """10 年盈亏平衡通胀率（%）= 名义收益率 - 实际收益率，即市场隐含的通胀预期。"""
    nom, real = _treasury_curve("yield", full), _treasury_curve("real_yield", full)
    return _line((nom - real).dropna())


def cboe_spx() -> pd.DataFrame:
    """标普 500 指数收盘（CBOE 官方历史数据）。"""
    df = pd.read_csv(io.StringIO(_get("https://cdn.cboe.com/api/global/us_indices/daily_prices/SPX_History.csv")))
    df.columns = [c.lower() for c in df.columns]
    s = pd.Series(pd.to_numeric(df["spx"], errors="coerce").to_numpy(),
                  index=_ny_midnight(pd.to_datetime(df["date"], format="%m/%d/%Y")))
    return _line(s.dropna())


def cftc_gold_managed_money(full: bool) -> pd.DataFrame:
    """CFTC 持仓报告：COMEX 黄金期货+期权中“基金经理”（对冲基金/CTA）的净多头合约数。

    报告统计的是周二持仓、周五美东下午公布，时间戳放在公布日，避免模型提前用到数据。
    open/high/low 存放 多头/空头/总持仓，close 存放净多头。
    """
    rows = json.loads(_get("https://publicreporting.cftc.gov/resource/72hh-3qpy.json", {
        "cftc_contract_market_code": "088691",  # COMEX 黄金
        "$select": "report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all,open_interest_all",
        "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": "170" if full else "8"}, timeout=30))
    data, dates = [], []
    for r in rows:
        lg, sh = float(r["m_money_positions_long_all"]), float(r["m_money_positions_short_all"])
        dates.append(pd.Timestamp(r["report_date_as_yyyy_mm_dd"][:10]) + pd.Timedelta(days=3))
        data.append({"open": lg, "high": sh, "low": float(r["open_interest_all"]), "close": lg - sh})
    return _frame(data, _ny_midnight(dates))


def cboe_vix() -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(_get("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv")))
    df.columns = [c.lower() for c in df.columns]
    rows = df[["open", "high", "low", "close"]].to_dict("records")
    return _frame(rows, _ny_midnight(pd.to_datetime(df["date"], format="%m/%d/%Y")))


def fetch(name: str, interval: str, full: bool) -> pd.DataFrame:
    """从备用源取数据；不支持的品种/周期抛出 KeyError。"""
    if interval not in SUPPORTED.get(name, ()):
        raise KeyError(f"备用源不提供 {name} {interval}")
    if name in SINA_FUTURES:
        df = sina_futures(name, interval)
    elif name in SINA_FOREX:
        df = sina_forex(name, interval)
    elif name == "tnx":
        df = treasury_10y(full)
    elif name == "real10":
        df = treasury_real_10y(full)
    elif name == "bei10":
        df = breakeven_10y(full)
    elif name == "spx":
        df = cboe_spx()
    elif name == "cot":
        df = cftc_gold_managed_money(full)
    else:
        df = cboe_vix()
    if df.empty:
        raise RuntimeError(f"备用源返回空数据：{name} {interval}")
    if interval == "1d":  # 增量时只保留近期，全量时保留约 3 年
        keep = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=1100 if full else 45)
        df = df[df.index >= keep]
    return df
