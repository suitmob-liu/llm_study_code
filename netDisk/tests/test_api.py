"""接口测试：python -m unittest discover -s tests -v（在 netDisk 目录下运行）。"""
import io
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="netdisk-test-")
os.environ.update({
    "NETDISK_DATA": _TMP,
    "NETDISK_PASSWORD": "test-password",
    "NETDISK_QUOTA_GB": str(1 / 1024),      # 1 MB，方便测试配额
    "NETDISK_MAX_DEVICES": "3",
    "NETDISK_LOGIN_MAX_FAILS": "3",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.sessions import throttle  # noqa: E402

H = {"X-Requested-With": "netdisk"}
QUOTA = 1024 * 1024


def new_client(name: str = "", evict: bool = False) -> tuple[TestClient, object]:
    c = TestClient(app)
    r = c.post("/api/login", json={"password": "test-password", "device_name": name, "evict_oldest": evict},
               headers=H)
    return c, r


class NetDiskTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cm = TestClient(app)
        cls.cm.__enter__()          # 触发 lifespan

    @classmethod
    def tearDownClass(cls):
        cls.cm.__exit__(None, None, None)

    def setUp(self):
        throttle._fails.clear()
        # 每个用例从空网盘、无设备开始
        c, r = new_client("setup", evict=True)
        for d in c.get("/api/devices").json()["devices"]:
            if not d["current"]:
                c.delete(f"/api/devices/{d['id']}", headers=H)
        items = c.get("/api/list").json()["items"]
        if items:
            c.post("/api/delete", json={"paths": [i["path"] for i in items]}, headers=H)
        c.post("/api/logout", headers=H)

    def login(self, name=""):
        c, r = new_client(name)
        self.assertEqual(r.status_code, 200, r.text)
        return c

    # ---------------------------------------------------------- 登录

    def test_requires_login(self):
        c = TestClient(app)
        self.assertEqual(c.get("/api/list").status_code, 401)
        r = c.get("/", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], "/login")

    def test_wrong_password_and_lockout(self):
        c = TestClient(app)
        for _ in range(3):
            r = c.post("/api/login", json={"password": "bad"}, headers=H)
            self.assertEqual(r.status_code, 401)
        # 锁定后即使密码正确也拒绝
        r = c.post("/api/login", json={"password": "test-password"}, headers=H)
        self.assertEqual(r.status_code, 429)

    def test_csrf_header_required(self):
        c = self.login()
        r = c.post("/api/mkdir", json={"name": "x"})
        self.assertEqual(r.status_code, 403)

    def test_device_limit(self):
        a = self.login("A")
        self.login("B")
        self.login("C")
        _, r = new_client("D")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["code"], "device_limit")
        self.assertEqual(len(r.json()["devices"]), 3)
        # 选择踢掉最久未用的设备（A）后可以登录
        d, r = new_client("D", evict=True)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(a.get("/api/list").status_code, 401)
        names = [x["name"] for x in d.get("/api/devices").json()["devices"]]
        self.assertEqual(sorted(names), ["B", "C", "D"])

    def test_kick_device(self):
        a = self.login("A")
        b = self.login("B")
        dev_b = [x for x in a.get("/api/devices").json()["devices"] if x["name"] == "B"][0]
        self.assertEqual(a.delete(f"/api/devices/{dev_b['id']}", headers=H).status_code, 200)
        self.assertEqual(b.get("/api/list").status_code, 401)
        self.assertEqual(a.get("/api/list").status_code, 200)

    def test_logout(self):
        c = self.login()
        c.post("/api/logout", headers=H)
        self.assertEqual(c.get("/api/list").status_code, 401)

    # ---------------------------------------------------------- 文件

    def test_upload_list_download(self):
        c = self.login()
        data = "你好，网盘".encode() * 100
        r = c.put("/api/upload", params={"dir": "", "name": "中文 文件.txt"}, content=data, headers=H)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["used"], len(data))
        items = c.get("/api/list").json()["items"]
        self.assertEqual([i["name"] for i in items], ["中文 文件.txt"])
        r = c.get("/api/download", params={"path": "中文 文件.txt"})
        self.assertEqual(r.content, data)
        self.assertIn("attachment", r.headers["content-disposition"])
        # 断点续传 / 视频拖动依赖 Range
        r = c.get("/api/download", params={"path": "中文 文件.txt"}, headers={"Range": "bytes=0-2"})
        self.assertEqual(r.status_code, 206)
        self.assertEqual(r.content, data[:3])

    def test_upload_same_name_auto_rename(self):
        c = self.login()
        for _ in range(3):
            c.put("/api/upload", params={"name": "a.txt"}, content=b"1", headers=H)
        names = sorted(i["name"] for i in c.get("/api/list").json()["items"])
        self.assertEqual(names, ["a (1).txt", "a (2).txt", "a.txt"])

    def test_upload_folder_structure(self):
        c = self.login()
        r = c.put("/api/upload", params={"name": "相册/2026/1.jpg"}, content=b"img", headers=H)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["item"]["path"], "相册/2026/1.jpg")
        items = c.get("/api/list", params={"path": "相册/2026"}).json()["items"]
        self.assertEqual([i["name"] for i in items], ["1.jpg"])

    def test_quota(self):
        c = self.login()
        r = c.put("/api/upload", params={"name": "big.bin"}, content=b"x" * (QUOTA - 100), headers=H)
        self.assertEqual(r.status_code, 200)
        r = c.put("/api/upload", params={"name": "more.bin"}, content=b"x" * 200, headers=H)
        self.assertEqual(r.status_code, 507)
        # 超额上传失败后不留下文件、不占配额
        self.assertEqual(c.get("/api/me").json()["used"], QUOTA - 100)
        self.assertEqual(len(c.get("/api/list").json()["items"]), 1)
        self.assertEqual(list(Path(_TMP, ".tmp").iterdir()), [])
        # 删除后释放空间
        r = c.post("/api/delete", json={"paths": ["big.bin"]}, headers=H)
        self.assertEqual(r.json()["used"], 0)
        r = c.put("/api/upload", params={"name": "more.bin"}, content=b"x" * 200, headers=H)
        self.assertEqual(r.status_code, 200)

    def test_quota_without_content_length(self):
        c = self.login()

        def gen():   # 分块传输，没有 Content-Length，靠流式预占拦截
            for _ in range(20):
                yield b"y" * 100_000
        r = c.put("/api/upload", params={"name": "stream.bin"}, content=gen(), headers=H)
        self.assertEqual(r.status_code, 507)
        self.assertEqual(c.get("/api/me").json()["used"], 0)

    def test_path_traversal_rejected(self):
        c = self.login()
        for bad in ["../x.txt", "a/../../x.txt", "..", "a\\..\\..\\x"]:
            r = c.put("/api/upload", params={"name": bad}, content=b"1", headers=H)
            self.assertEqual(r.status_code, 400, bad)
        self.assertEqual(c.get("/api/list", params={"path": "../"}).status_code, 400)
        self.assertEqual(c.get("/api/download", params={"path": "../netdisk.db"}).status_code, 400)

    def test_mkdir_rename_move_delete(self):
        c = self.login()
        self.assertEqual(c.post("/api/mkdir", json={"name": "docs"}, headers=H).status_code, 200)
        self.assertEqual(c.post("/api/mkdir", json={"name": "docs"}, headers=H).status_code, 409)
        c.put("/api/upload", params={"name": "a.txt"}, content=b"abc", headers=H)
        r = c.post("/api/rename", json={"path": "a.txt", "new_name": "b.txt"}, headers=H)
        self.assertEqual(r.status_code, 200)
        r = c.post("/api/move", json={"paths": ["b.txt"], "dest": "docs"}, headers=H)
        self.assertEqual(r.json()["moved"], ["docs/b.txt"])
        # 不能把文件夹移动到自己里面
        c.post("/api/mkdir", json={"dir": "docs", "name": "sub"}, headers=H)
        r = c.post("/api/move", json={"paths": ["docs"], "dest": "docs/sub"}, headers=H)
        self.assertEqual(r.status_code, 400)
        r = c.post("/api/delete", json={"paths": ["docs"]}, headers=H)
        self.assertEqual(r.json()["freed"], 3)
        self.assertEqual(c.get("/api/list").json()["items"], [])

    def test_search(self):
        c = self.login()
        c.put("/api/upload", params={"name": "x/Report-2026.pdf"}, content=b"1", headers=H)
        c.put("/api/upload", params={"name": "other.txt"}, content=b"1", headers=H)
        items = c.get("/api/search", params={"q": "report"}).json()["items"]
        self.assertEqual([i["path"] for i in items], ["x/Report-2026.pdf"])

    def test_zip_download(self):
        c = self.login()
        c.put("/api/upload", params={"name": "d/1.txt"}, content=b"one", headers=H)
        c.put("/api/upload", params={"name": "d/e/2.txt"}, content=b"two", headers=H)
        c.post("/api/mkdir", json={"dir": "d", "name": "empty"}, headers=H)
        r = c.get("/api/download", params={"path": "d"})
        self.assertEqual(r.status_code, 200)
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        self.assertEqual(zf.read("d/1.txt"), b"one")
        self.assertEqual(zf.read("d/e/2.txt"), b"two")
        self.assertIn("d/empty/", zf.namelist())

    def test_inline_preview_safe(self):
        c = self.login()
        c.put("/api/upload", params={"name": "evil.html"}, content=b"<script>alert(1)</script>", headers=H)
        c.put("/api/upload", params={"name": "evil.svg"}, content=b"<svg/>", headers=H)
        r = c.get("/api/download", params={"path": "evil.html", "inline": 1})
        self.assertTrue(r.headers["content-type"].startswith("text/plain"))
        r = c.get("/api/download", params={"path": "evil.svg", "inline": 1})
        self.assertIn("attachment", r.headers["content-disposition"])


if __name__ == "__main__":
    unittest.main()
