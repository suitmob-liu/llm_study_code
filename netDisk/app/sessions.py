"""登录会话（= 设备）管理。

每次登录生成一个随机 token 写入 HttpOnly cookie，数据库只存 token 的 SHA-256。
一个会话就是一台设备；同时在线设备数受 max_devices 限制。
"""
import hashlib
import hmac
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Optional

from .config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash  TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    user_agent  TEXT NOT NULL DEFAULT '',
    ip          TEXT NOT NULL DEFAULT '',
    created_at  REAL NOT NULL,
    last_seen   REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
"""

# last_seen 写库的最小间隔，避免每个请求都写一次
_TOUCH_INTERVAL = 60


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass
class Session:
    id: int
    name: str
    user_agent: str
    ip: str
    created_at: float
    last_seen: float

    def to_dict(self, current_id: Optional[int] = None) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "ip": self.ip,
            "created_at": self.created_at,
            "last_seen": self.last_seen,
            "current": self.id == current_id,
        }


class DeviceLimitError(Exception):
    def __init__(self, devices: list[Session]):
        self.devices = devices


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None

    # ---- 生命周期 ----
    def open(self) -> None:
        self._conn = sqlite3.connect(settings.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._invalidate_if_password_changed()
        self._conn.commit()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def _invalidate_if_password_changed(self) -> None:
        """密码改了就清空所有会话：所有设备需要用新密码重新登录。"""
        fp = hashlib.sha256(b"netdisk:" + settings.password.encode()).hexdigest()
        row = self._conn.execute("SELECT v FROM meta WHERE k='pw_fp'").fetchone()
        if row is None or row["v"] != fp:
            self._conn.execute("DELETE FROM sessions")
            self._conn.execute("INSERT OR REPLACE INTO meta(k, v) VALUES('pw_fp', ?)", (fp,))

    # ---- 内部 ----
    @staticmethod
    def _row(r: sqlite3.Row) -> Session:
        return Session(r["id"], r["name"], r["user_agent"], r["ip"], r["created_at"], r["last_seen"])

    def _expire_cutoff(self) -> float:
        return time.time() - settings.session_days * 86400

    def _purge_expired(self) -> None:
        self._conn.execute("DELETE FROM sessions WHERE last_seen < ?", (self._expire_cutoff(),))

    # ---- 对外接口 ----
    def create(self, name: str, user_agent: str, ip: str, evict_oldest: bool) -> tuple[str, Session]:
        """新建会话。设备数已满时：evict_oldest=True 踢掉最久未活动的设备，否则抛 DeviceLimitError。"""
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self._lock:
            self._purge_expired()
            rows = self._conn.execute("SELECT * FROM sessions ORDER BY last_seen ASC").fetchall()
            overflow = len(rows) - settings.max_devices + 1
            if overflow > 0:
                if not evict_oldest:
                    self._conn.commit()
                    raise DeviceLimitError([self._row(r) for r in rows])
                ids = [r["id"] for r in rows[:overflow]]
                self._conn.executemany("DELETE FROM sessions WHERE id=?", [(i,) for i in ids])
            cur = self._conn.execute(
                "INSERT INTO sessions(token_hash, name, user_agent, ip, created_at, last_seen) "
                "VALUES(?, ?, ?, ?, ?, ?)",
                (_hash(token), name, user_agent[:500], ip, now, now),
            )
            self._conn.commit()
            return token, Session(cur.lastrowid, name, user_agent, ip, now, now)

    def lookup(self, token: Optional[str], ip: str = "") -> Optional[Session]:
        """校验 token，有效则顺带刷新 last_seen。"""
        if not token:
            return None
        with self._lock:
            r = self._conn.execute(
                "SELECT * FROM sessions WHERE token_hash=?", (_hash(token),)
            ).fetchone()
            if r is None:
                return None
            s = self._row(r)
            now = time.time()
            if s.last_seen < self._expire_cutoff():
                self._conn.execute("DELETE FROM sessions WHERE id=?", (s.id,))
                self._conn.commit()
                return None
            if now - s.last_seen > _TOUCH_INTERVAL or (ip and ip != s.ip):
                self._conn.execute(
                    "UPDATE sessions SET last_seen=?, ip=? WHERE id=?", (now, ip or s.ip, s.id)
                )
                self._conn.commit()
                s.last_seen, s.ip = now, ip or s.ip
            return s

    def list(self) -> list[Session]:
        with self._lock:
            self._purge_expired()
            self._conn.commit()
            rows = self._conn.execute("SELECT * FROM sessions ORDER BY last_seen DESC").fetchall()
            return [self._row(r) for r in rows]

    def count(self) -> int:
        return len(self.list())

    def delete(self, session_id: int) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
            self._conn.commit()
            return cur.rowcount > 0

    def rename(self, session_id: int, name: str) -> bool:
        with self._lock:
            cur = self._conn.execute("UPDATE sessions SET name=? WHERE id=?", (name, session_id))
            self._conn.commit()
            return cur.rowcount > 0


def check_password(candidate: str) -> bool:
    # 先各自做哈希再比较，长度不同也是常数时间
    a = hashlib.sha256(candidate.encode()).digest()
    b = hashlib.sha256(settings.password.encode()).digest()
    return hmac.compare_digest(a, b)


class LoginThrottle:
    """按 IP 记录失败次数，连续失败超过阈值锁定一段时间，防止暴力破解。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._fails: dict[str, tuple[int, float]] = {}   # ip -> (失败次数, 锁定截止时间)

    def locked_seconds(self, ip: str) -> int:
        with self._lock:
            n, until = self._fails.get(ip, (0, 0.0))
            left = until - time.time()
            return int(left) + 1 if left > 0 else 0

    def fail(self, ip: str) -> None:
        with self._lock:
            n, until = self._fails.get(ip, (0, 0.0))
            if until and until <= time.time():
                n = 0          # 上一轮锁定已过期，重新计数
            n += 1
            if n >= settings.login_max_fails:
                self._fails[ip] = (0, time.time() + settings.login_lock_minutes * 60)
            else:
                self._fails[ip] = (n, 0.0)

    def success(self, ip: str) -> None:
        with self._lock:
            self._fails.pop(ip, None)


def device_name_from_ua(ua: str) -> str:
    """从 User-Agent 粗略推断一个可读的设备名，如「Windows · Chrome」。"""
    u = ua.lower()
    if "iphone" in u:
        os_name = "iPhone"
    elif "ipad" in u:
        os_name = "iPad"
    elif "android" in u:
        os_name = "Android"
    elif "harmonyos" in u or "openharmony" in u:
        os_name = "鸿蒙"
    elif "windows" in u:
        os_name = "Windows"
    elif "mac os" in u or "macintosh" in u:
        os_name = "Mac"
    elif "linux" in u:
        os_name = "Linux"
    else:
        os_name = "未知系统"
    if "micromessenger" in u:
        browser = "微信"
    elif "edg/" in u:
        browser = "Edge"
    elif "firefox" in u:
        browser = "Firefox"
    elif "chrome" in u or "crios" in u:
        browser = "Chrome"
    elif "safari" in u:
        browser = "Safari"
    elif "curl" in u:
        browser = "curl"
    else:
        browser = "浏览器"
    return f"{os_name} · {browser}"


sessions = SessionStore()
throttle = LoginThrottle()
