"""netDisk HTTP 服务（FastAPI）。

页面：/login 登录页，/ 网盘主页（未登录自动跳转 /login）
接口：/api/*，除 /api/login 外都需要登录 cookie
"""
import asyncio
import logging
import mimetypes
import os
import secrets
import shutil
import threading
import time
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.requests import ClientDisconnect

from . import storage
from .config import settings
from .sessions import DeviceLimitError, Session, check_password, device_name_from_ua, sessions, throttle
from .storage import PathError, QuotaExceeded, quota

log = logging.getLogger("netdisk")

COOKIE = "nd_session"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
# 宿主机磁盘至少保留这么多空间，防止把服务器写满
DISK_RESERVE = 200 * 1024 ** 2
WRITE_BUF = 1024 * 1024
# 同目录下「查重名 + rename」需要串行，避免两台设备同时上传同名文件互相覆盖
_name_lock = threading.Lock()

# 浏览器内可直接预览的类型；其余一律按附件下载（防止上传的 html/svg 在本域执行脚本）
_INLINE_PREFIX = ("image/", "video/", "audio/")
_INLINE_EXACT = {"application/pdf"}
_TEXT_EXT = {
    ".txt", ".md", ".log", ".json", ".csv", ".xml", ".yaml", ".yml", ".ini", ".conf", ".py",
    ".js", ".ts", ".java", ".c", ".h", ".cpp", ".go", ".rs", ".sh", ".sql", ".html", ".css",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if len(settings.password) < 6:
        raise RuntimeError("未设置登录密码或密码过短：请在 .env 中设置 NETDISK_PASSWORD（至少 6 位）")
    settings.ensure_dirs()
    # 上次异常退出残留的上传临时文件
    for p in settings.tmp_dir.iterdir():
        shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
    sessions.open()
    quota.recalc()
    log.info("netDisk 启动：数据目录 %s，已用 %d / %d 字节，设备上限 %d",
             settings.data_dir, quota.used, settings.quota_bytes, settings.max_devices)
    yield
    sessions.close()


app = FastAPI(title="netDisk", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------------------------------------------------------- 中间件 / 依赖

@app.middleware("http")
async def security_headers(request: Request, call_next):
    # 简易 CSRF 防护：所有写接口必须带自定义头，跨站表单 / 图片无法伪造
    if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("x-requested-with") != "netdisk":
            return JSONResponse({"detail": "缺少请求头 X-Requested-With"}, status_code=403)
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    return resp


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def current_session(request: Request) -> Session:
    s = sessions.lookup(request.cookies.get(COOKIE), client_ip(request))
    if s is None:
        raise HTTPException(401, "未登录或已在其他设备被下线")
    return s


@app.exception_handler(PathError)
async def _path_error(_req, exc: PathError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(QuotaExceeded)
async def _quota_error(_req, _exc):
    return JSONResponse({"detail": "网盘空间不足"}, status_code=507)


def _existing(rel: str) -> Path:
    p = storage.resolve(rel)
    if not p.exists():
        raise HTTPException(404, "文件不存在")
    return p


def _not_root(rel: str) -> str:
    rel = storage.normalize(rel)
    if not rel:
        raise HTTPException(400, "不能操作根目录")
    return rel


# ---------------------------------------------------------------- 页面

@app.get("/", include_in_schema=False)
def index(request: Request):
    if sessions.lookup(request.cookies.get(COOKIE), client_ip(request)) is None:
        return RedirectResponse("/login", status_code=302)
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/login", include_in_schema=False)
def login_page():
    return FileResponse(STATIC_DIR / "login.html", headers={"Cache-Control": "no-cache"})


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"ok": True}


# ---------------------------------------------------------------- 登录 / 设备

class LoginBody(BaseModel):
    password: str = Field(max_length=1024)
    device_name: str = Field(default="", max_length=60)
    evict_oldest: bool = False   # 设备数已满时，是否踢掉最久未使用的设备


@app.post("/api/login")
def login(body: LoginBody, request: Request):
    ip = client_ip(request)
    left = throttle.locked_seconds(ip)
    if left:
        raise HTTPException(429, f"密码错误次数过多，请 {left // 60 + 1} 分钟后再试")
    if not check_password(body.password):
        throttle.fail(ip)
        left = throttle.locked_seconds(ip)
        msg = f"密码错误次数过多，已锁定 {settings.login_lock_minutes} 分钟" if left else "密码错误"
        raise HTTPException(401, msg)
    throttle.success(ip)

    ua = request.headers.get("user-agent", "")
    name = body.device_name.strip() or device_name_from_ua(ua)
    try:
        token, s = sessions.create(name, ua, ip, body.evict_oldest)
    except DeviceLimitError as e:
        return JSONResponse(status_code=409, content={
            "detail": f"已有 {len(e.devices)} 台设备在线，达到上限 {settings.max_devices} 台",
            "code": "device_limit",
            "devices": [d.to_dict() for d in e.devices],
        })
    resp = JSONResponse({"ok": True, "device": s.to_dict(s.id)})
    resp.set_cookie(COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                    samesite="lax", secure=settings.cookie_secure, path="/")
    return resp


@app.post("/api/logout")
def logout(s: Session = Depends(current_session)):
    sessions.delete(s.id)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


@app.get("/api/me")
def me(s: Session = Depends(current_session)):
    return {
        "device": s.to_dict(s.id),
        "used": quota.used,
        "quota": settings.quota_bytes,
        "devices": sessions.count(),
        "max_devices": settings.max_devices,
    }


@app.get("/api/devices")
def list_devices(s: Session = Depends(current_session)):
    return {"max_devices": settings.max_devices, "devices": [d.to_dict(s.id) for d in sessions.list()]}


@app.delete("/api/devices/{device_id}")
def kick_device(device_id: int, s: Session = Depends(current_session)):
    if not sessions.delete(device_id):
        raise HTTPException(404, "设备不存在或已下线")
    resp = JSONResponse({"ok": True, "self": device_id == s.id})
    if device_id == s.id:
        resp.delete_cookie(COOKIE, path="/")
    return resp


class RenameDeviceBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@app.patch("/api/devices/{device_id}")
def rename_device(device_id: int, body: RenameDeviceBody, _s: Session = Depends(current_session)):
    if not sessions.rename(device_id, body.name.strip()):
        raise HTTPException(404, "设备不存在或已下线")
    return {"ok": True}


# ---------------------------------------------------------------- 浏览

def _entry(p: Path) -> dict:
    st = p.stat()
    is_dir = p.is_dir()
    return {
        "name": p.name,
        "path": storage.to_rel(p),
        "is_dir": is_dir,
        "size": 0 if is_dir else st.st_size,
        "mtime": st.st_mtime,
    }


@app.get("/api/list")
def list_dir(path: str = "", _s: Session = Depends(current_session)):
    d = _existing(path)
    if not d.is_dir():
        raise HTTPException(400, "不是文件夹")
    items = []
    for p in d.iterdir():
        try:
            items.append(_entry(p))
        except OSError:
            continue
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return {"path": storage.to_rel(d), "items": items, "used": quota.used, "quota": settings.quota_bytes}


@app.get("/api/search")
def search(q: str = Query(min_length=1, max_length=100), _s: Session = Depends(current_session)):
    needle = q.lower()
    hits = []
    root = settings.files_dir
    for dirpath, dirs, files in os.walk(root):
        for n in dirs + files:
            if needle in n.lower():
                try:
                    hits.append(_entry(Path(dirpath) / n))
                except OSError:
                    continue
                if len(hits) >= 300:
                    return {"items": hits, "truncated": True}
    hits.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return {"items": hits, "truncated": False}


# ---------------------------------------------------------------- 上传

@app.put("/api/upload")
async def upload(
    request: Request,
    name: str = Query(min_length=1, max_length=4096, description="文件名；上传文件夹时可带子路径 a/b.txt"),
    dir: str = "",
    mtime: Optional[float] = Query(default=None, description="文件原始修改时间（毫秒时间戳）"),
    _s: Session = Depends(current_session),
):
    rel = storage.normalize(f"{dir}/{name}")
    if not rel:
        raise HTTPException(400, "文件名不能为空")
    target = storage.resolve(rel)
    parent = target.parent
    if parent.exists() and not parent.is_dir():
        raise HTTPException(409, "目标位置有同名文件")

    length = request.headers.get("content-length")
    if length and length.isdigit():
        n = int(length)
        if n > quota.free:
            raise QuotaExceeded()
        if n > disk_free_safe():
            raise HTTPException(507, "服务器磁盘空间不足")

    tmp = settings.tmp_dir / secrets.token_hex(16)
    reserved = 0
    try:
        with open(tmp, "wb") as f:
            buf = bytearray()
            async for chunk in request.stream():
                if not chunk:
                    continue
                quota.reserve(len(chunk))
                reserved += len(chunk)
                buf += chunk
                if len(buf) >= WRITE_BUF:
                    await asyncio.to_thread(f.write, bytes(buf))
                    buf.clear()
            if buf:
                await asyncio.to_thread(f.write, bytes(buf))
        with _name_lock:
            parent.mkdir(parents=True, exist_ok=True)
            # mkdir 之后再做一次越权检查（防止中途有人把父目录换成符号链接）
            storage.resolve(storage.to_rel(parent))
            final = parent / storage.unique_name(parent, target.name)
            os.replace(tmp, final)
    except QuotaExceeded:
        tmp.unlink(missing_ok=True)
        quota.release(reserved)
        raise
    except ClientDisconnect:
        tmp.unlink(missing_ok=True)
        quota.release(reserved)
        raise HTTPException(400, "上传中断")
    except BaseException:
        tmp.unlink(missing_ok=True)
        quota.release(reserved)
        raise

    if mtime:
        try:
            t = mtime / 1000
            os.utime(final, (t, t))
        except (OSError, OverflowError, ValueError):
            pass
    return {"ok": True, "item": _entry(final), "used": quota.used, "quota": settings.quota_bytes}


def disk_free_safe() -> int:
    return max(0, storage.disk_free() - DISK_RESERVE)


# ---------------------------------------------------------------- 下载 / 预览

@app.get("/api/download")
def download(path: str, inline: bool = False, _s: Session = Depends(current_session)):
    p = _existing(path)
    if p.is_dir():
        return _zip_response([p], p.name)
    if not inline:
        return FileResponse(p, filename=p.name, media_type="application/octet-stream")

    mt, _ = mimetypes.guess_type(p.name)
    headers = {"Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'"}
    if p.suffix.lower() in _TEXT_EXT:
        mt = "text/plain; charset=utf-8"
    elif not mt or not (mt.startswith(_INLINE_PREFIX) or mt in _INLINE_EXACT) or mt == "image/svg+xml":
        return FileResponse(p, filename=p.name, media_type="application/octet-stream")
    if mt == "application/pdf":
        headers.pop("Content-Security-Policy")   # 浏览器内置 PDF 查看器在 sandbox 下无法工作
    return FileResponse(p, filename=p.name, media_type=mt, content_disposition_type="inline",
                        headers=headers)


class _ZipPipe:
    """zipfile 的写入目标：只收集数据，由生成器边压缩边吐给客户端，不落盘。"""

    def __init__(self) -> None:
        self.chunks: list[bytes] = []

    def write(self, b) -> int:
        self.chunks.append(bytes(b))
        return len(b)

    def flush(self) -> None:
        pass

    def drain(self) -> bytes:
        out = b"".join(self.chunks)
        self.chunks.clear()
        return out


def _zip_iter(paths: list[Path]):
    pipe = _ZipPipe()
    # 不压缩：网盘里多是图片视频，压缩收益小且耗 CPU
    with zipfile.ZipFile(pipe, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        for top in paths:
            base = top.parent
            items = [top] if top.is_file() else sorted(top.rglob("*"))
            if top.is_dir():
                zf.writestr(zipfile.ZipInfo(top.name + "/"), b"")
            for p in items:
                if p.is_symlink():
                    continue
                arc = p.relative_to(base).as_posix()
                if p.is_dir():
                    zf.writestr(zipfile.ZipInfo(arc + "/"), b"")
                    continue
                info = zipfile.ZipInfo.from_file(p, arc)
                with open(p, "rb") as src, zf.open(info, "w", force_zip64=True) as dst:
                    while True:
                        b = src.read(WRITE_BUF)
                        if not b:
                            break
                        dst.write(b)
                        data = pipe.drain()
                        if data:
                            yield data
                data = pipe.drain()
                if data:
                    yield data
    yield pipe.drain()


def _zip_response(paths: list[Path], name: str) -> StreamingResponse:
    from urllib.parse import quote
    fname = f"{name or 'netdisk'}.zip"
    return StreamingResponse(_zip_iter(paths), media_type="application/zip", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}",
    })


@app.get("/api/zip")
def download_zip(paths: list[str] = Query(min_length=1), _s: Session = Depends(current_session)):
    ps = [_existing(_not_root(r)) for r in paths]
    name = ps[0].name if len(ps) == 1 else f"netdisk-{time.strftime('%Y%m%d-%H%M%S')}"
    return _zip_response(ps, name)


# ---------------------------------------------------------------- 文件操作

class MkdirBody(BaseModel):
    dir: str = ""
    name: str


@app.post("/api/mkdir")
def mkdir(body: MkdirBody, _s: Session = Depends(current_session)):
    parent = _existing(body.dir)
    if not parent.is_dir():
        raise HTTPException(400, "不是文件夹")
    name = storage.check_name(body.name)
    with _name_lock:
        p = parent / name
        if p.exists():
            raise HTTPException(409, "已存在同名文件或文件夹")
        p.mkdir()
    return {"ok": True, "item": _entry(p)}


class RenameBody(BaseModel):
    path: str
    new_name: str


@app.post("/api/rename")
def rename(body: RenameBody, _s: Session = Depends(current_session)):
    src = _existing(_not_root(body.path))
    name = storage.check_name(body.new_name)
    dst = src.parent / name
    if dst == src:
        return {"ok": True, "item": _entry(src)}
    with _name_lock:
        # 允许只改大小写（Windows/macOS 大小写不敏感文件系统上 exists() 会为真）
        if dst.exists() and dst.name.lower() != src.name.lower():
            raise HTTPException(409, "已存在同名文件或文件夹")
        src.rename(dst)
    return {"ok": True, "item": _entry(dst)}


class PathsBody(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=1000)


class MoveBody(PathsBody):
    dest: str = ""


@app.post("/api/move")
def move(body: MoveBody, _s: Session = Depends(current_session)):
    dest = _existing(body.dest)
    if not dest.is_dir():
        raise HTTPException(400, "目标不是文件夹")
    dest_real = Path(os.path.realpath(dest))
    moved = []
    with _name_lock:
        for rel in body.paths:
            src = _existing(_not_root(rel))
            src_real = Path(os.path.realpath(src))
            if src.parent == dest:
                continue
            if src.is_dir() and (dest_real == src_real or src_real in dest_real.parents):
                raise HTTPException(400, f"不能把「{src.name}」移动到它自己的子文件夹里")
            final = dest / storage.unique_name(dest, src.name)
            shutil.move(str(src), str(final))
            moved.append(storage.to_rel(final))
    return {"ok": True, "moved": moved}


@app.post("/api/delete")
def delete(body: PathsBody, _s: Session = Depends(current_session)):
    targets = [_existing(_not_root(r)) for r in body.paths]
    freed = 0
    try:
        for p in targets:
            if not p.exists():
                continue
            size = storage.tree_size(p)
            if p.is_dir() and not p.is_symlink():
                shutil.rmtree(p)
            else:
                p.unlink()
            quota.release(size)
            freed += size
    except OSError:
        quota.recalc()
        raise HTTPException(500, "部分文件删除失败")
    return {"ok": True, "freed": freed, "used": quota.used, "quota": settings.quota_bytes}
