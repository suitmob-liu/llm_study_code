"""行情数据抓取与存储（Yahoo Finance chart 接口 → SQLite prices 表，Yahoo 不可用时自动切换备用源）。

- 小时线：首次拉取最近 730 天，之后增量拉取最近 5 天并 upsert，历史会越积越长
- 日线：首次拉取 2 年，之后增量覆盖最近 1 个月
- DATA_SOURCE 环境变量：auto（默认，Yahoo 失败自动用备用源）/ yahoo / backup（只用备用源，见 sources.py）
所有时间戳均为 UTC。
"""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import pandas as pd
import requests

from . import sources, store
from .config import RAW_DIR

log = logging.getLogger("gold.data")
DATA_SOURCE = os.environ.get("DATA_SOURCE", "auto").strip().lower()
YAHOO_RETRY_SECONDS = 6 * 3600  # Yahoo 被封后，隔多久再试一次
_yahoo_blocked_until = 0.0

URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

SYMBOLS = {
    "gold": "GC=F",  # COMEX 黄金期货（主力）
    "dxy": "DX-Y.NYB",  # 美元指数
    "tnx": "^TNX",  # 10 年期美债收益率（%）
    "silver": "SI=F",  # 白银期货
    "oil": "CL=F",  # WTI 原油
    "vix": "^VIX",  # 恐慌指数
    "usdcny": "CNY=X",  # 美元兑人民币
}
# 扩展因子：只有日/周数据，始终从官方来源获取（美国财政部 / CBOE / CFTC），与 DATA_SOURCE 无关
AUX = ["real10", "bei10", "spx", "cot"]
NAMES_CN = {
    "gold": "黄金期货", "dxy": "美元指数", "tnx": "10年美债收益率", "silver": "白银",
    "oil": "WTI原油", "vix": "VIX恐慌指数", "usdcny": "美元/人民币",
    "real10": "10年实际利率(TIPS)", "bei10": "10年通胀预期", "spx": "标普500", "cot": "CFTC基金净多头",
}
ALL_NAMES = list(SYMBOLS) + AUX
HOURLY = ["gold", "dxy", "tnx", "silver", "oil", "vix"]
COLS = ["open", "high", "low", "close", "volume"]


def fetch_chart(symbol: str, rng: str, interval: str, retries: int = 3) -> pd.DataFrame:
    last_err = None
    for i in range(retries):
        try:
            r = requests.get(URL.format(symbol=quote(symbol)),
                             params={"range": rng, "interval": interval},
                             headers=HEADERS, timeout=30)
            if r.status_code == 429:  # 被限流/封 IP，重试无意义
                raise RuntimeError("429 Too Many Requests（Yahoo 拒绝了本机 IP）")
            r.raise_for_status()
            chart = r.json()["chart"]
            if chart.get("error"):
                raise RuntimeError(chart["error"])
            res = chart["result"][0]
            ts = res.get("timestamp") or []
            q = res["indicators"]["quote"][0]
            df = pd.DataFrame({k: q.get(k) for k in COLS}, index=pd.to_datetime(ts, unit="s", utc=True))
            df = df.dropna(subset=["close"]).astype(float)
            return df[~df.index.duplicated(keep="last")].sort_index()
        except Exception as e:  # noqa: BLE001
            last_err = e
            if "429" in str(e):
                break
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"获取 {symbol} {interval} 失败: {last_err}")


# —— SQLite 存取 ——

def _write(con, name: str, interval: str, df: pd.DataFrame, replace_from: pd.Timestamp | None = None):
    if df.empty:
        return
    if replace_from is not None:  # 日线：用新数据整体覆盖该时间段（实时 K 线的时间戳会变化）
        con.execute("DELETE FROM prices WHERE symbol=? AND interval=? AND ts>=?",
                    (name, interval, int(replace_from.timestamp())))
    rows = [(name, interval, int(t.timestamp()), *[None if pd.isna(v) else float(v) for v in r])
            for t, r in zip(df.index, df[COLS].itertuples(index=False))]
    con.executemany("INSERT OR REPLACE INTO prices (symbol, interval, ts, open, high, low, close, volume) "
                    "VALUES (?,?,?,?,?,?,?,?)", rows)
    con.commit()


def read(con, name: str, interval: str, start: pd.Timestamp | None = None,
         end: pd.Timestamp | None = None) -> pd.DataFrame:
    sql = "SELECT ts, open, high, low, close, volume FROM prices WHERE symbol=? AND interval=?"
    args: list = [name, interval]
    if start is not None:
        sql += " AND ts>=?"
        args.append(int(pd.Timestamp(start).timestamp()))
    if end is not None:
        sql += " AND ts<=?"
        args.append(int(pd.Timestamp(end).timestamp()))
    df = pd.read_sql_query(sql + " ORDER BY ts", con, params=args)
    df.index = pd.to_datetime(df.pop("ts"), unit="s", utc=True)
    df.index.name = None
    return df


def _count(con, name, interval) -> int:
    return con.execute("SELECT COUNT(*) FROM prices WHERE symbol=? AND interval=?", (name, interval)).fetchone()[0]


def _migrate_csv(con):
    """把旧版 CSV 缓存导入数据库（只执行一次）。"""
    for p in RAW_DIR.glob("*_*.csv"):
        name, interval = p.stem.rsplit("_", 1)
        if name in SYMBOLS and _count(con, name, interval) == 0:
            df = pd.read_csv(p, index_col=0)
            df.index = pd.to_datetime(df.index, utc=True)
            _write(con, name, interval, df)


def _parallel(fn, jobs: dict) -> dict:
    """并发执行 {key: args}，返回 {key: DataFrame 或 Exception}。"""
    out = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {k: ex.submit(fn, *v) for k, v in jobs.items()}
    for k, f in futs.items():
        try:
            out[k] = f.result()
        except Exception as e:  # noqa: BLE001
            out[k] = e
    return out


def refresh(con=None, full: bool | None = None, verbose: bool = False) -> dict:
    """从网络更新行情。full=None 时自动判断：库里没数据就全量，否则增量。返回每个品种的状态。"""
    global _yahoo_blocked_until
    own = con is None
    con = con or store.connect()
    _migrate_csv(con)
    keys, is_full = [], {}
    for name in ALL_NAMES:
        for interval in ("1h", "1d"):
            if interval == "1h" and name not in HOURLY:
                continue
            keys.append((name, interval))
            is_full[(name, interval)] = full if full is not None else _count(con, name, interval) == 0

    results: dict = {}   # key -> (DataFrame, 来源)
    errors: dict = {}    # key -> 错误信息
    use_yahoo = DATA_SOURCE == "yahoo" or (DATA_SOURCE == "auto" and time.time() >= _yahoo_blocked_until)
    if use_yahoo:
        jobs = {}
        for name, interval in keys:
            if name in AUX:
                continue
            f = is_full[(name, interval)]
            rng = ("730d" if interval == "1h" else "2y") if f else ("5d" if interval == "1h" else "1mo")
            jobs[(name, interval)] = (SYMBOLS[name], rng, interval)
        for k, v in _parallel(fetch_chart, jobs).items():
            if isinstance(v, Exception):
                errors[k] = str(v)
            else:
                results[k] = (v, "Yahoo")
        if DATA_SOURCE == "auto" and ("gold", "1h") in errors:
            _yahoo_blocked_until = time.time() + YAHOO_RETRY_SECONDS
            log.warning("Yahoo 不可用（%s），切换备用源，%d 小时后再尝试 Yahoo",
                        errors[("gold", "1h")], YAHOO_RETRY_SECONDS // 3600)

    # 备用源 / 官方来源：DATA_SOURCE=yahoo 时只用于扩展因子
    skipped = {}
    pending = [k for k in keys if k not in results and (DATA_SOURCE != "yahoo" or k[0] in AUX)]
    jobs = {k: (k[0], k[1], is_full[k]) for k in pending if k[1] in sources.SUPPORTED.get(k[0], ())}
    for k in pending:
        if k not in jobs:
            skipped[k] = "备用源只有日线，小时数据由日线补齐"
    for k, v in _parallel(sources.fetch, jobs).items():
        if isinstance(v, Exception):
            errors[k] = f"{errors[k]}；备用源：{v}" if k in errors else f"备用源：{v}"
        else:
            results[k] = (v, sources.SOURCE_NAME.get(k[0], "备用源"))
            errors.pop(k, None)

    status = {}
    for name, interval in keys:
        key = f"{name}_{interval}"
        if (name, interval) in results:
            df, src = results[(name, interval)]
            try:
                if interval == "1h":
                    df.index = df.index.floor("h")  # 实时报价并入所在小时
                    df = df[~df.index.duplicated(keep="last")]
                    _write(con, name, interval, df)
                else:
                    _write(con, name, interval, df, replace_from=df.index[0])
                status[key] = {"ok": True, "rows": len(df), "last": df.index[-1].isoformat(), "source": src}
                continue
            except Exception as e:  # noqa: BLE001
                errors[(name, interval)] = f"写库失败：{e}"
        if (name, interval) in skipped:
            status[key] = {"ok": True, "rows": 0, "skipped": True, "note": skipped[(name, interval)]}
        else:
            status[key] = {"ok": False, "error": errors.get((name, interval), "未知错误")}
            if verbose:
                print(f"[警告] {key}: {status[key]['error']}")
    store.set_meta(con, "last_refresh", {"at": store.now_iso(), "status": status})
    if own:
        con.close()
    return status


def _extend_with_daily(h: pd.DataFrame | None, d: pd.DataFrame | None) -> pd.DataFrame | None:
    """小时线之后（或没有小时线时）用日线补齐：日线按纽约收盘时刻（约 21:00 UTC）放入，避免提前看到当天数据。"""
    if d is None or d.empty:
        return h
    d = d.copy()
    d.index = d.index + pd.Timedelta(hours=17)
    if h is not None and not h.empty:
        d = d[d.index > h.index[-1]]
        if d.empty:
            return h
        return pd.concat([h, d])
    return d


def load(refresh_data: bool = True, verbose: bool = True, con=None) -> tuple[dict, dict]:
    """返回 (hourly, daily) 两个 dict[name -> DataFrame]，数据来自数据库。"""
    own = con is None
    con = con or store.connect()
    if refresh_data:
        refresh(con, verbose=verbose)
    else:
        _migrate_csv(con)
    hourly, daily = {}, {}
    for name in ALL_NAMES:
        df = read(con, name, "1d")
        if not df.empty:
            daily[name] = df
        if name in HOURLY or name in AUX:
            h = read(con, name, "1h") if name in HOURLY else pd.DataFrame()
            if name != "gold":  # 外部因子：小时线断档（或只有日/周数据）时用日线补齐
                h = _extend_with_daily(h if not h.empty else None, daily.get(name))
            if h is not None and not h.empty:
                hourly[name] = h
    if own:
        con.close()
    if "gold" not in hourly:
        raise RuntimeError("数据库中没有黄金行情，请检查网络后重试")
    if verbose:
        g = hourly["gold"]
        print(f"行情：黄金小时线 {len(g)} 条（{g.index[0]:%Y-%m-%d} ~ {g.index[-1]:%Y-%m-%d %H:%M} UTC），"
              f"日线 {len(daily.get('gold', []))} 条")
    return hourly, daily


def import_prices(con, src_db: str) -> dict:
    """从另一个 gold.db 导入行情（已有的记录不覆盖），用于给新部署补充历史数据。"""
    con.execute("ATTACH DATABASE ? AS src", (src_db,))
    try:
        before = dict(con.execute("SELECT symbol || '_' || interval, COUNT(*) FROM prices GROUP BY 1").fetchall())
        con.execute("INSERT OR IGNORE INTO prices SELECT symbol, interval, ts, open, high, low, close, volume "
                    "FROM src.prices")
        con.commit()
        after = dict(con.execute("SELECT symbol || '_' || interval, COUNT(*) FROM prices GROUP BY 1").fetchall())
    finally:
        con.execute("DETACH DATABASE src")
    return {k: after[k] - before.get(k, 0) for k in sorted(after)}


def asof(df: pd.DataFrame | None, t: pd.Timestamp, col: str = "close"):
    """t 时刻（含）之前最近一个值。"""
    if df is None or df.empty:
        return None
    s = df[col].loc[:t]
    return None if s.empty else float(s.iloc[-1])
