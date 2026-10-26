"""文件存储：路径安全校验 + 容量配额。

所有文件放在 settings.files_dir 下，前端传来的路径一律是相对路径（如 "照片/2026/a.jpg"）。
容量配额在内存中维护一个已用字节计数，启动时全量扫描一次；上传按块预占配额，
多台设备并发上传时也不会超过上限。
"""
import os
import shutil
import threading
from pathlib import Path, PurePosixPath

from .config import settings

# Windows / Linux 都不允许或容易出问题的文件名字符
_BAD_CHARS = set('<>:"|?*\\') | {chr(i) for i in range(32)}
_MAX_NAME = 255


class PathError(ValueError):
    """路径非法（越权、非法字符等），对应 HTTP 400。"""


class QuotaExceeded(Exception):
    """超出容量上限，对应 HTTP 507。"""


def check_name(name: str) -> str:
    """校验单个文件 / 文件夹名。"""
    name = name.strip()
    if not name or name in (".", ".."):
        raise PathError("名称不能为空")
    if len(name.encode()) > _MAX_NAME:
        raise PathError("名称过长")
    if "/" in name or any(c in _BAD_CHARS for c in name):
        raise PathError('名称不能包含 / \\ : * ? " < > | 等字符')
    return name


def normalize(rel: str) -> str:
    """把前端传来的相对路径规范化为 "a/b/c" 形式，根目录为 ""。"""
    rel = (rel or "").replace("\\", "/").strip("/")
    if not rel:
        return ""
    parts = []
    for seg in rel.split("/"):
        if seg in ("", "."):
            continue
        parts.append(check_name(seg))
    return "/".join(parts)


def resolve(rel: str) -> Path:
    """相对路径 → 绝对路径，并确保不会逃出 files_dir（含符号链接）。"""
    root = settings.files_dir
    p = (root / normalize(rel)) if rel else root
    real = Path(os.path.realpath(p))
    if real != root and root not in real.parents:
        raise PathError("非法路径")
    return p


def to_rel(p: Path) -> str:
    return PurePosixPath(p.relative_to(settings.files_dir)).as_posix() if p != settings.files_dir else ""


def tree_size(p: Path) -> int:
    if p.is_file():
        return p.stat().st_size
    total = 0
    for dirpath, _dirs, files in os.walk(p):
        for f in files:
            try:
                total += os.lstat(os.path.join(dirpath, f)).st_size
            except OSError:
                pass
    return total


def unique_name(parent: Path, name: str) -> str:
    """同名时自动改名：a.txt → a (1).txt。"""
    if not (parent / name).exists():
        return name
    stem, dot, ext = name.rpartition(".")
    if not stem:            # 无扩展名或 .bashrc 这类
        stem, dot, ext = name, "", ""
    i = 1
    while True:
        cand = f"{stem} ({i}){dot}{ext}"
        if not (parent / cand).exists():
            return cand
        i += 1


class Quota:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._used = 0

    def recalc(self) -> None:
        """全量重算（启动时、删除后）。上传中的临时文件也计入，因为它们已经占了配额。"""
        with self._lock:
            self._used = tree_size(settings.files_dir) + tree_size(settings.tmp_dir)

    @property
    def used(self) -> int:
        return self._used

    @property
    def free(self) -> int:
        return max(0, settings.quota_bytes - self._used)

    def reserve(self, n: int) -> None:
        """预占 n 字节，不够时抛 QuotaExceeded。"""
        if n <= 0:
            return
        with self._lock:
            if self._used + n > settings.quota_bytes:
                raise QuotaExceeded()
            self._used += n

    def release(self, n: int) -> None:
        if n <= 0:
            return
        with self._lock:
            self._used = max(0, self._used - n)


def disk_free() -> int:
    return shutil.disk_usage(settings.data_dir).free


quota = Quota()
