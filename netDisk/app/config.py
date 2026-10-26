"""运行配置：全部来自环境变量（Docker 中由 .env → docker-compose 传入）。"""
import os
from pathlib import Path


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


class Settings:
    def __init__(self) -> None:
        # 登录密码（必填）。修改后重启服务，所有已登录设备会被强制下线
        self.password: str = os.environ.get("NETDISK_PASSWORD", "")
        # 网盘总容量上限（GB，按 1024^3 计），默认 2G
        self.quota_bytes: int = int(_float("NETDISK_QUOTA_GB", 2) * 1024 ** 3)
        # 同时在线的设备数上限，默认 10
        self.max_devices: int = _int("NETDISK_MAX_DEVICES", 10)
        # 设备多少天不活动后自动下线
        self.session_days: int = _int("NETDISK_SESSION_DAYS", 30)
        # 连续输错密码多少次后锁定该 IP，锁定多少分钟
        self.login_max_fails: int = _int("NETDISK_LOGIN_MAX_FAILS", 5)
        self.login_lock_minutes: int = _int("NETDISK_LOGIN_LOCK_MINUTES", 10)
        # 上 HTTPS 后改为 1，cookie 只走 HTTPS
        self.cookie_secure: bool = os.environ.get("NETDISK_COOKIE_SECURE", "0") == "1"

        data = Path(os.environ.get("NETDISK_DATA", "/data")).resolve()
        self.data_dir: Path = data
        self.files_dir: Path = data / "files"   # 用户文件
        self.tmp_dir: Path = data / ".tmp"      # 上传中的临时文件（与 files 同盘，保证 rename 原子）
        self.db_path: Path = data / "netdisk.db"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.files_dir, self.tmp_dir):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
