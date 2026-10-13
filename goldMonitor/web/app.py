"""网页版后端：FastAPI + 后台定时任务（行情刷新 / 到期回测 / 自动预测）。

环境变量
  REFRESH_MINUTES         行情刷新间隔（分钟），默认 5
  PREDICT_INTERVAL_HOURS  自动预测间隔（小时），默认 5；0 表示关闭自动预测
  ADMIN_TOKEN             设置后，所有写操作（预测/训练/修改情景）需在请求头 X-Admin-Token 中携带
  GOLD_HOME               数据目录（数据库、模型、配置、报告）
"""
import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from gold import data, periods, service, store
from gold.analysis import analyze
from gold.config import CONTEXT_PATH, COMPONENT_CN, HORIZON_CN, OZ_TO_GRAM, ensure_dirs, load_config
from gold.context import context_score, load_context
from gold.evaluate import summarize
from gold.model import load_model

log = logging.getLogger("gold.web")
STATIC = Path(__file__).parent / "static"
REFRESH_MINUTES = float(os.environ.get("REFRESH_MINUTES", 5))
PREDICT_INTERVAL_HOURS = float(os.environ.get("PREDICT_INTERVAL_HOURS", 5))
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

STATE = {"started_at": None, "last_tick": None, "last_error": None, "running": False, "last_events": []}


def _event(msg: str):
    STATE["last_events"] = ([{"at": store.now_iso(), "msg": msg}] + STATE["last_events"])[:30]
    log.info(msg)


# ———————————— 后台任务 ————————————

def tick(force_predict: bool = False):
    if STATE["running"]:
        return
    STATE["running"] = True
    con = store.connect()
    try:
        st = data.refresh(con)
        bad = [k for k, v in st.items() if not v["ok"]]
        _event(f"行情已刷新（{len(st) - len(bad)}/{len(st)} 成功）" + (f"，失败：{', '.join(bad)}" if bad else ""))
        hourly, daily = data.load(refresh_data=False, verbose=False, con=con)
        cfg = load_config()
        now = datetime.now(timezone.utc)
        if store.due_predictions(con, now.isoformat(timespec="seconds")):
            res = service.feedback(con, cfg, hourly, daily)
            if res["done"]:
                _event(f"回测了 {len(res['done'])} 条到期预测，模型调整 {len([c for c in res['changes'] if '暂不' not in c])} 项")
        if PREDICT_INTERVAL_HOURS > 0 or force_predict:
            last = store.get_meta(con, "last_predict")
            market_open = (now - hourly["gold"].index[-1].to_pydatetime()) < timedelta(hours=2)
            due = last is None or now - datetime.fromisoformat(last) >= timedelta(hours=PREDICT_INTERVAL_HOURS)
            if force_predict or (due and market_open):
                res = service.make_prediction(con, cfg, hourly, daily)
                _event("已生成新预测：" + "，".join(f"{i['horizon_cn']} {i['pred_price']:.1f}（{i['direction']}）"
                                                for i in res["items"]))
        STATE["last_error"] = None
    except Exception as e:  # noqa: BLE001
        STATE["last_error"] = f"{type(e).__name__}: {e}"
        log.exception("后台任务失败")
    finally:
        STATE["last_tick"] = store.now_iso()
        STATE["running"] = False
        con.close()


def _loop(stop: threading.Event):
    while not stop.is_set():
        tick()
        stop.wait(REFRESH_MINUTES * 60)


@asynccontextmanager
async def lifespan(_app):
    ensure_dirs()
    STATE["started_at"] = store.now_iso()
    stop = threading.Event()
    t = threading.Thread(target=_loop, args=(stop,), daemon=True, name="gold-scheduler")
    t.start()
    yield
    stop.set()


app = FastAPI(title="黄金走势分析", lifespan=lifespan)


# ———————————— 工具函数 ————————————

def _clean(o):
    """把 numpy/pandas/NaN 转成可 JSON 序列化的值。"""
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) or np.isinf(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (pd.Timestamp, datetime)):
        return o.isoformat()
    return o


def ok(o):
    return JSONResponse(_clean(o))


def _auth(token: str | None):
    if ADMIN_TOKEN and token != ADMIN_TOKEN:
        raise HTTPException(401, "需要管理口令（X-Admin-Token）")


def _ms(idx) -> list[int]:
    return (idx.asi8 // 1_000_000).tolist()


def _row(r) -> dict:
    d = dict(r)
    for k in ("components", "reasons"):
        if d.get(k):
            d[k] = json.loads(d[k])
    d["horizon_cn"] = HORIZON_CN.get(d["horizon"], d["horizon"])
    return d


# ———————————— 行情 ————————————

@app.get("/api/latest")
def latest():
    con = store.connect()
    try:
        g = data.read(con, "gold", "1h", start=pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=10))
        gd = data.read(con, "gold", "1d", start=pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=15))
        if g.empty:
            return ok({"ready": False, "message": "正在首次下载行情数据，请稍候刷新…", "state": STATE})
        last_t, last = g.index[-1], float(g["close"].iloc[-1])
        prev = float(gd["close"].iloc[-2]) if len(gd) >= 2 else None
        today = gd.iloc[-1] if not gd.empty else None
        fxd = data.read(con, "usdcny", "1d", start=pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=15))
        fx = float(fxd["close"].iloc[-1]) if not fxd.empty else None
        macros = {}
        for m in ("dxy", "tnx", "vix", "silver", "oil", "usdcny"):
            iv = "1h" if m in data.HOURLY else "1d"
            df = data.read(con, m, iv, start=pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=10))
            if df.empty:
                continue
            v, t = float(df["close"].iloc[-1]), df.index[-1]
            ref = data.asof(df, t - pd.Timedelta(hours=24)) if iv == "1h" else (
                float(df["close"].iloc[-2]) if len(df) > 1 else None)
            macros[m] = {"name": data.NAMES_CN[m], "value": v, "time": t,
                         "change": None if ref is None else v - ref,
                         "change_pct": None if not ref else (v / ref - 1) * 100}
        spark = g.iloc[-48:]
        return ok({
            "ready": True, "price": last, "time": last_t, "prev_close": prev,
            "change": None if prev is None else last - prev,
            "change_pct": None if not prev else (last / prev - 1) * 100,
            "day_high": None if today is None else float(today["high"]),
            "day_low": None if today is None else float(today["low"]),
            "usdcny": fx, "price_cny_g": last * fx / OZ_TO_GRAM if fx else None,
            "market_open": (pd.Timestamp.now(tz="UTC") - last_t) < pd.Timedelta(hours=2),
            "macros": macros, "spark": [_ms(spark.index), spark["close"].tolist()],
            "last_refresh": store.get_meta(con, "last_refresh"), "state": STATE,
        })
    finally:
        con.close()


RANGES = {"1d": (1, "1h"), "5d": (5, "1h"), "1m": (31, "1h"), "3m": (92, "1d"), "6m": (183, "1d"),
          "1y": (366, "1d"), "2y": (731, "1d"), "all": (None, "1d")}


@app.get("/api/chart")
def chart(range: str = "1y", symbol: str = "gold", overlay: str | None = None,
          start: str | None = None, end: str | None = None):
    if range not in RANGES or symbol not in data.SYMBOLS:
        raise HTTPException(400, "参数错误")
    days, interval = RANGES[range]
    now = pd.Timestamp.now(tz="UTC")
    t0 = pd.Timestamp(start, tz="Asia/Shanghai").tz_convert("UTC") if start else (
        now - pd.Timedelta(days=days) if days else None)
    t1 = pd.Timestamp(end, tz="Asia/Shanghai").tz_convert("UTC") + pd.Timedelta(days=1) if end else None
    if start and end:  # 自定义区间：短于 40 天用小时线
        interval = "1h" if (t1 - t0) <= pd.Timedelta(days=40) else "1d"
    if symbol not in data.HOURLY:
        interval = "1d"
    con = store.connect()
    try:
        warm = pd.Timedelta(days=320) if interval == "1d" else pd.Timedelta(days=30)
        df = data.read(con, symbol, interval, start=None if t0 is None else t0 - warm, end=t1)
        if df.empty:
            return ok({"interval": interval, "candles": [], "ma": {}, "overlay": None})
        c = df["close"]
        mas = {"MA20": 20, "MA50": 50, "MA200": 200} if interval == "1d" else {"MA24h": 24, "MA120h": 120}
        ma = {k: c.rolling(n).mean() for k, n in mas.items()}
        if t0 is not None:
            keep = df.index >= t0
            df, ma = df[keep], {k: v[keep] for k, v in ma.items()}
        df = df.copy()
        for col in ("open", "high", "low"):
            df[col] = df[col].fillna(df["close"])
        ms = _ms(df.index)
        out = {"interval": interval, "symbol": symbol, "name": data.NAMES_CN[symbol],
               "candles": [[t, o, cl, lo, hi] for t, o, cl, lo, hi in
                           zip(ms, df["open"], df["close"], df["low"], df["high"])],
               "volume": [[t, v] for t, v in zip(ms, df["volume"].fillna(0))],
               "ma": {k: [[t, v] for t, v in zip(ms, s) if not np.isnan(v)] for k, s in ma.items()},
               "overlay": None}
        if overlay and overlay in data.SYMBOLS and overlay != symbol:
            oiv = interval if overlay in data.HOURLY else "1d"
            od = data.read(con, overlay, oiv, start=df.index[0], end=t1)
            out["overlay"] = {"symbol": overlay, "name": data.NAMES_CN[overlay],
                              "data": [[t, v] for t, v in zip(_ms(od.index), od["close"])]}
        fxd = data.read(con, "usdcny", "1d", start=df.index[0] - pd.Timedelta(days=10), end=t1)
        out["usdcny"] = [[t, v] for t, v in zip(_ms(fxd.index), fxd["close"])]
        return ok(out)
    finally:
        con.close()


# ———————————— 日 / 周 / 月 查询 ————————————

@app.get("/api/period")
def period(kind: str = "day", date: str | None = None):
    if kind not in periods.KINDS:
        raise HTTPException(400, "kind 只能是 day / week / month")
    try:
        d = periods.parse_date(date)
    except ValueError:
        raise HTTPException(400, "日期格式应为 YYYY-MM-DD 或 YYYY-MM")
    con = store.connect()
    try:
        return ok(periods.period_detail(con, kind, d))
    finally:
        con.close()


@app.get("/api/periods")
def period_list(kind: str = "month", months: int = Query(12, ge=1, le=36)):
    if kind not in periods.KINDS:
        raise HTTPException(400, "kind 只能是 day / week / month")
    con = store.connect()
    try:
        return ok({"kind": kind, "items": periods.list_periods(con, kind, months)})
    finally:
        con.close()


# ———————————— 分析 ————————————

_analysis_cache: dict = {}


@app.get("/api/analysis")
def analysis():
    con = store.connect()
    try:
        stamp = (store.get_meta(con, "last_refresh") or {}).get("at")
        if _analysis_cache.get("stamp") != stamp or not _analysis_cache.get("data"):
            hourly, daily = data.load(refresh_data=False, verbose=False, con=con)
            text, info = analyze(daily, hourly, load_context())
            _analysis_cache.update(stamp=stamp, data={**info, "markdown": text})
        return ok(_analysis_cache["data"])
    finally:
        con.close()


# ———————————— 预测与回测 ————————————

@app.get("/api/predictions")
def predictions(limit: int = Query(300, le=5000), horizon: str | None = None, status: str | None = None):
    con = store.connect()
    try:
        sql, args = "SELECT * FROM predictions WHERE 1=1", []
        if horizon:
            sql += " AND horizon=?"
            args.append(horizon)
        if status:
            sql += " AND status=?"
            args.append(status)
        rows = con.execute(sql + " ORDER BY id DESC LIMIT ?", [*args, limit]).fetchall()
        return ok({"items": [_row(r) for r in rows]})
    finally:
        con.close()


@app.get("/api/predictions/latest")
def predictions_latest():
    con = store.connect()
    try:
        r = con.execute("SELECT MAX(created_at) AS t FROM predictions").fetchone()
        if not r["t"]:
            return ok({"items": []})
        rows = con.execute("SELECT * FROM predictions WHERE created_at=? ORDER BY hours", (r["t"],)).fetchall()
        return ok({"created_at": r["t"], "items": [_row(x) for x in rows]})
    finally:
        con.close()


@app.get("/api/accuracy")
def accuracy():
    con = store.connect()
    try:
        rows = store.all_predictions(con, 100000)
        cfg = load_config()
        model = load_model()
        hist = [{**dict(h), "changes": json.loads(h["changes"]), "metrics": json.loads(h["metrics"] or "{}")}
                for h in store.history(con, 100)]
        return ok({
            "stats": summarize(rows),
            "pending": sum(1 for r in rows if r["status"] == "pending"),
            "model": None if model is None else {
                "version": cfg["version"], "trained_at": model["trained_at"], "data_end": model["data_end"],
                "horizons": {h: {"metrics": hm["metrics"], "lambda": hm["lambda"], "resid_std": hm["resid_std"]}
                             for h, hm in model["horizons"].items()},
                "params": cfg["params"],
            },
            "component_cn": COMPONENT_CN, "history": hist,
        })
    finally:
        con.close()


# ———————————— 国际情景 ————————————

@app.get("/api/context")
def get_context():
    ctx = load_context()
    return ok({**ctx, "score": context_score(ctx)})


@app.put("/api/context")
def put_context(body: dict = Body(...), x_admin_token: str | None = Header(None)):
    _auth(x_admin_token)
    fs = body.get("factors")
    if not isinstance(fs, list) or not fs:
        raise HTTPException(400, "factors 不能为空")
    for f in fs:
        if not f.get("name") or not isinstance(f.get("impact"), (int, float)) or not -2 <= f["impact"] <= 2:
            raise HTTPException(400, f"因子格式错误：{f}")
        f["impact"] = int(round(f["impact"]))
        f["weight"] = float(f.get("weight", 1))
    ctx = load_context()
    ctx.update({k: body[k] for k in ("summary", "upcoming_events", "sources") if k in body})
    ctx["factors"] = fs
    ctx["updated_at"] = date.today().isoformat()
    CONTEXT_PATH.write_text(json.dumps(ctx, ensure_ascii=False, indent=2), encoding="utf-8")
    _event(f"国际情景已更新，情景分 {context_score(ctx):+.2f}")
    return ok({**ctx, "score": context_score(ctx)})


# ———————————— 操作 ————————————

@app.post("/api/actions/{name}")
def action(name: str, x_admin_token: str | None = Header(None)):
    _auth(x_admin_token)
    t = time.time()
    con = store.connect()
    try:
        if name == "refresh":
            tick()
            return ok({"ok": True, "seconds": time.time() - t, "error": STATE["last_error"]})
        hourly, daily = data.load(refresh_data=False, verbose=False, con=con)
        cfg = load_config()
        if name == "predict":
            res = service.make_prediction(con, cfg, hourly, daily)
            _event("手动生成预测")
            return ok({"ok": True, **res})
        if name == "evaluate":
            res = service.feedback(con, cfg, hourly, daily)
            return ok({"ok": True, "evaluated": len(res["done"]), "changes": res["changes"], "report": res["report"]})
        if name == "train":
            model, _ = service.train_model(con, cfg, hourly, daily, "网页手动重新训练", verbose=False)
            _event(f"模型已重新训练 v{cfg['version']}")
            return ok({"ok": True, "version": cfg["version"],
                       "metrics": {h: hm["metrics"] for h, hm in model["horizons"].items()}})
        raise HTTPException(404, "未知操作")
    finally:
        con.close()


@app.get("/api/status")
def status():
    con = store.connect()
    try:
        cnt = {f"{r['symbol']}_{r['interval']}": {"rows": r["n"], "first": r["a"], "last": r["b"]}
               for r in con.execute("SELECT symbol, interval, COUNT(*) n, MIN(ts) a, MAX(ts) b "
                                    "FROM prices GROUP BY symbol, interval")}
        return ok({"state": STATE, "refresh_minutes": REFRESH_MINUTES,
                   "predict_interval_hours": PREDICT_INTERVAL_HOURS, "auth_required": bool(ADMIN_TOKEN),
                   "last_refresh": store.get_meta(con, "last_refresh"),
                   "last_predict": store.get_meta(con, "last_predict"), "prices": cnt})
    finally:
        con.close()


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
