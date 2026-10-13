"""特征工程：以黄金小时线为时间轴，叠加美元、美债、白银、原油、VIX 等国际因子。"""
import numpy as np
import pandas as pd


def _align(s: pd.Series, idx: pd.DatetimeIndex) -> pd.Series:
    """把外部序列按时间向前填充对齐到 idx（只用 t 时刻之前已知的数据）。"""
    s = s[~s.index.duplicated(keep="last")].sort_index()
    return s.reindex(s.index.union(idx)).ffill().reindex(idx)


def _rsi(close: pd.Series, n: int = 14) -> pd.Series:
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def build_features(hourly: dict, daily: dict) -> pd.DataFrame:
    g = hourly["gold"]
    idx = g.index
    c = g["close"]
    lr = np.log(c)
    f = pd.DataFrame(index=idx)
    f["close"] = c

    # —— 黄金自身价格行为 ——
    for n in (1, 5, 24, 120):
        f[f"r{n}"] = lr.diff(n)
    f["vol24"] = f["r1"].rolling(24).std()
    f["vol120"] = f["r1"].rolling(120).std()
    for n in (24, 120, 480):
        f[f"ma_dev{n}"] = c / c.rolling(n).mean() - 1
    f["rsi14"] = (_rsi(c) - 50) / 50
    f["range24"] = (g["high"].rolling(24).max() - g["low"].rolling(24).min()) / c

    # —— 国际因子（小时线） ——
    def ext(name):
        if name in hourly:
            return _align(hourly[name]["close"], idx)
        if name in daily:  # 退化为日线：时间戳 +1 天，避免用到当日未收盘数据
            s = daily[name]["close"].copy()
            s.index = s.index + pd.Timedelta(days=1)
            return _align(s, idx)
        return None

    dxy, tnx, silver, oil, vix = (ext(n) for n in ("dxy", "tnx", "silver", "oil", "vix"))
    if dxy is not None:
        f["dxy_r24"] = np.log(dxy).diff(24)
        f["dxy_r120"] = np.log(dxy).diff(120)
    if tnx is not None:
        f["tnx_d24"] = tnx.diff(24)
        f["tnx_d120"] = tnx.diff(120)
    if silver is not None:
        gs = np.log(c / silver)
        f["gs_ratio_dev"] = gs - gs.rolling(480).mean()
        f["silver_r24"] = np.log(silver).diff(24)
    if oil is not None:
        f["oil_r24"] = np.log(oil).diff(24)
        f["oil_r120"] = np.log(oil).diff(120)
    if vix is not None:
        f["vix_lvl"] = np.log(vix) - np.log(vix).rolling(480).mean()
        f["vix_d24"] = np.log(vix).diff(24)

    return f.replace([np.inf, -np.inf], np.nan)


FEATURES_EXCLUDE = {"close"}


def feature_columns(f: pd.DataFrame) -> list[str]:
    return [c for c in f.columns if c not in FEATURES_EXCLUDE]


def make_target(close: pd.Series, hours: int) -> pd.Series:
    """t 时刻之后 hours 小时（自然时间）的对数收益；目标时刻取其之前最近一根 K 线。"""
    idx = close.index
    target_t = idx + pd.Timedelta(hours=hours)
    pos = idx.searchsorted(target_t, side="right") - 1
    fut = close.to_numpy()[pos]
    y = pd.Series(np.log(fut / close.to_numpy()), index=idx)
    y[target_t > idx[-1]] = np.nan  # 未来尚未发生
    return y
