"""SQLite 存储：预测记录 + 模型调整历史。"""
import json
import sqlite3
from datetime import datetime, timezone

from .config import CHANGELOG_PATH, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    model_version INTEGER,
    horizon TEXT, hours INTEGER,
    base_time TEXT, base_price REAL, usdcny REAL,
    target_time TEXT,
    pred_ret REAL, pred_price REAL, lower REAL, upper REAL, sigma REAL,
    prob_up REAL, direction TEXT, context_score REAL,
    components TEXT,
    status TEXT DEFAULT 'pending',
    actual_price REAL, actual_ret REAL, error_usd REAL, error_pct REAL,
    direction_hit INTEGER, in_interval INTEGER,
    reasons TEXT, evaluated_at TEXT
);
CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL, interval TEXT NOT NULL, ts INTEGER NOT NULL,
    open REAL, high REAL, low REAL, close REAL, volume REAL,
    PRIMARY KEY (symbol, interval, ts)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS model_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    version INTEGER, kind TEXT,
    changes TEXT, metrics TEXT, note TEXT
);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")  # 网页读取与后台更新并发
    con.executescript(SCHEMA)
    return con


def set_meta(con, key: str, value):
    con.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))
    con.commit()


def get_meta(con, key: str, default=None):
    r = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def add_prediction(con, rec: dict) -> int:
    rec = dict(rec)
    rec["components"] = json.dumps(rec.get("components", {}), ensure_ascii=False)
    keys = ",".join(rec)
    cur = con.execute(f"INSERT INTO predictions ({keys}) VALUES ({','.join('?' * len(rec))})", list(rec.values()))
    con.commit()
    return cur.lastrowid


def due_predictions(con, now: str):
    return con.execute("SELECT * FROM predictions WHERE status='pending' AND target_time <= ? ORDER BY id",
                       (now,)).fetchall()


def update_prediction(con, pid: int, fields: dict):
    sets = ",".join(f"{k}=?" for k in fields)
    con.execute(f"UPDATE predictions SET {sets} WHERE id=?", [*fields.values(), pid])
    con.commit()


def recent_evaluated(con, horizon: str, limit: int):
    return con.execute("SELECT * FROM predictions WHERE status='evaluated' AND horizon=? "
                       "ORDER BY target_time DESC LIMIT ?", (horizon, limit)).fetchall()


def all_predictions(con, limit: int = 50):
    return con.execute("SELECT * FROM predictions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()


def add_history(con, version: int, kind: str, changes, metrics=None, note: str = ""):
    ts = now_iso()
    con.execute("INSERT INTO model_history (created_at, version, kind, changes, metrics, note) VALUES (?,?,?,?,?,?)",
                (ts, version, kind, json.dumps(changes, ensure_ascii=False),
                 json.dumps(metrics or {}, ensure_ascii=False), note))
    con.commit()
    # 同步写一份人类可读的变更日志
    new = not CHANGELOG_PATH.exists()
    with open(CHANGELOG_PATH, "a", encoding="utf-8") as fp:
        if new:
            fp.write("# 模型变更历史\n\n")
        fp.write(f"## v{version} · {kind} · {ts}\n\n")
        if note:
            fp.write(f"{note}\n\n")
        for c in changes if isinstance(changes, list) else [changes]:
            fp.write(f"- {c}\n")
        fp.write("\n")


def history(con, limit: int = 30):
    return con.execute("SELECT * FROM model_history ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
