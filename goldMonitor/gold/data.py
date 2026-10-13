"""行情数据抓取与存储（Yahoo Finance chart 接口 → SQLite prices 表）。

- 小时线：首次拉取最近 730 天，之后增量拉取最近 5 天并 upsert，历史会越积越长
- 日线：首次拉取 2 年，之后增量覆盖最近 1 个月
所有时间戳均为 UTC。
"""
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import pandas as pd
import requests

from . import store
from .config import RAW_DIR

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
NAMES_CN = {
    "gold": "黄金期货", "dxy": "美元指数", "tnx": "10年美债收益率", "silver": "白银",
    "oil": "WTI原油", "vix": "VIX恐慌指数", "usdcny": "美元/人民币",
}
HOURLY = ["gold", "dxy", "tnx", "silver", "oil", "vix"]
COLS = ["open", "high", "low", "close", "volume"]


def fetch_chart(symbol: str, rng: str, interval: str, retries: int = 3) -> pd.DataFrame:
    last_err = None
    for i in range(retries):
        try:
            r = requests.get(URL.format(symbol=quote(symbol)),
                             params={"range": rng, "interval": interval},
                             headers=HEADERS, timeout=30)
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


def refresh(con=None, full: bool | None = None, verbose: bool = False) -> dict:
    """从网络更新行情。full=None 时自动判断：库里没数据就全量，否则增量。返回每个品种的状态。"""
    own = con is None
    con = con or store.connect()
    _migrate_csv(con)
    jobs = {}
    for name, sym in SYMBOLS.items():
        for interval in ("1h", "1d"):
            if interval == "1h" and name not in HOURLY:
                continue
            is_full = full if full is not None else _count(con, name, interval) == 0
            rng = ("730d" if interval == "1h" else "2y") if is_full else ("5d" if interval == "1h" else "1mo")
            jobs[(name, interval)] = (sym, rng, interval)
    # 并发抓取，串行写库
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {k: ex.submit(fetch_chart, *v) for k, v in jobs.items()}
    status = {}
    for (name, interval), fut in futs.items():
        key = f"{name}_{interval}"
        try:
            df = fut.result()
            if interval == "1h":
                df.index = df.index.floor("h")  # 实时报价并入所在小时
                df = df[~df.index.duplicated(keep="last")]
                _write(con, name, interval, df)
            else:
                _write(con, name, interval, df, replace_from=df.index[0])
            status[key] = {"ok": True, "rows": len(df), "last": df.index[-1].isoformat()}
        except Exception as e:  # noqa: BLE001
            status[key] = {"ok": False, "error": str(e)}
            if verbose:
                print(f"[警告] {e}")
    store.set_meta(con, "last_refresh", {"at": store.now_iso(), "status": status})
    if own:
        con.close()
    return status


def load(refresh_data: bool = True, verbose: bool = True, con=None) -> tuple[dict, dict]:
    """返回 (hourly, daily) 两个 dict[name -> DataFrame]，数据来自数据库。"""
    own = con is None
    con = con or store.connect()
    if refresh_data:
        refresh(con, verbose=verbose)
    else:
        _migrate_csv(con)
    hourly, daily = {}, {}
    for name in SYMBOLS:
        if name in HOURLY:
            df = read(con, name, "1h")
            if not df.empty:
                hourly[name] = df
        df = read(con, name, "1d")
        if not df.empty:
            daily[name] = df
    if own:
        con.close()
    if "gold" not in hourly:
        raise RuntimeError("数据库中没有黄金行情，请检查网络后重试")
    if verbose:
        g = hourly["gold"]
        print(f"行情：黄金小时线 {len(g)} 条（{g.index[0]:%Y-%m-%d} ~ {g.index[-1]:%Y-%m-%d %H:%M} UTC），"
              f"日线 {len(daily.get('gold', []))} 条")
    return hourly, daily


def asof(df: pd.DataFrame | None, t: pd.Timestamp, col: str = "close"):
    """t 时刻（含）之前最近一个值。"""
    if df is None or df.empty:
        return None
    s = df[col].loc[:t]
    return None if s.empty else float(s.iloc[-1])
