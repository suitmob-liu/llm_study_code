"use strict";

const $ = (id) => document.getElementById(id);
const state = {
  path: "",          // 当前目录（相对路径，根目录为 ""）
  items: [],
  selected: new Set(),
  searching: false,
};
const UPLOAD_CONCURRENCY = 2;

// ------------------------------------------------------------------ 工具

function fmtSize(n) {
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 2 : 1) + " " + u[i];
}

function fmtTime(t) {
  const d = new Date(t * 1000);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function joinPath(dir, name) { return dir ? `${dir}/${name}` : name; }

function iconOf(item) {
  if (item.is_dir) return "📁";
  const ext = item.name.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "svg"].includes(ext)) return "🖼";
  if (["mp4", "mkv", "mov", "avi", "webm", "flv"].includes(ext)) return "🎬";
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return "🗜";
  if (ext === "pdf") return "📕";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "📄";
  if (["txt", "md", "log", "json", "csv", "py", "js", "sh", "yaml", "yml"].includes(ext)) return "📝";
  return "📦";
}

function previewKind(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "log", "json", "csv", "xml", "yaml", "yml", "ini", "conf", "py", "js", "ts",
       "java", "c", "h", "cpp", "go", "rs", "sh", "sql", "html", "css"].includes(ext)) return "text";
  return null;
}

function toast(msg, isErr) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3000);
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

async function api(method, url, body) {
  const opt = { method, headers: { "X-Requested-With": "netdisk" } };
  if (body !== undefined) {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url, opt);
  if (r.status === 401) { location.href = "/login"; throw new Error("未登录"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail ? (typeof data.detail === "string" ? data.detail : "参数错误") : `请求失败（${r.status}）`);
  return data;
}

function setUsage(used, quota) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  const fill = $("usage-fill");
  fill.style.width = pct.toFixed(1) + "%";
  fill.className = pct > 90 ? "danger" : pct > 75 ? "warn" : "";
  $("usage-text").textContent = `已用 ${fmtSize(used)} / ${fmtSize(quota)}（剩余 ${fmtSize(Math.max(0, quota - used))}）`;
}

// ------------------------------------------------------------------ 列表

function pathFromHash() {
  const h = location.hash.replace(/^#\/?/, "");
  try { return decodeURIComponent(h); } catch (e) { return ""; }
}

function go(path) {
  const h = "#/" + encodeURIComponent(path).replace(/%2F/g, "/");
  if (location.hash === h) load(); else location.hash = h;
}

async function load() {
  state.searching = false;
  $("search").value = "";
  state.path = pathFromHash();
  try {
    const data = await api("GET", "/api/list?path=" + encodeURIComponent(state.path));
    state.items = data.items;
    setUsage(data.used, data.quota);
  } catch (e) {
    toast(e.message, true);
    if (state.path) { go(""); return; }
    state.items = [];
  }
  state.selected.clear();
  render();
}

async function refreshQuiet() {
  // 其他设备的改动：页面重新获得焦点 / 定时刷新；有选中项或在搜索时不打扰
  if (state.searching || state.selected.size || document.hidden || !$("modal").hidden) return;
  try {
    const data = await api("GET", "/api/list?path=" + encodeURIComponent(state.path));
    state.items = data.items;
    setUsage(data.used, data.quota);
    render();
  } catch (e) { /* 忽略 */ }
}

function renderCrumbs() {
  const c = $("crumbs");
  c.innerHTML = "";
  if (state.searching) {
    c.append(el("a", { href: "#", onclick: (e) => { e.preventDefault(); load(); } }, "← 返回"),
             el("span", { class: "sep" }, "搜索结果"));
    return;
  }
  c.append(el("a", { href: "#/" }, "全部文件"));
  let acc = "";
  for (const seg of state.path ? state.path.split("/") : []) {
    acc = joinPath(acc, seg);
    const p = acc;
    c.append(el("span", { class: "sep" }, "/"),
             el("a", { href: "#", onclick: (e) => { e.preventDefault(); go(p); } }, seg));
  }
}

function render() {
  renderCrumbs();
  const rows = $("rows");
  rows.innerHTML = "";
  for (const it of state.items) {
    const cb = el("input", { type: "checkbox" });
    cb.checked = state.selected.has(it.path);
    cb.addEventListener("change", () => {
      cb.checked ? state.selected.add(it.path) : state.selected.delete(it.path);
      row.classList.toggle("sel", cb.checked);
      renderSel();
    });
    const nameText = state.searching && it.path.includes("/")
      ? el("span", {}, it.name, el("small", { class: "muted" }, "  " + it.path.slice(0, it.path.lastIndexOf("/"))))
      : el("span", {}, it.name);
    const row = el("div", { class: "row" + (cb.checked ? " sel" : "") },
      el("label", { class: "cb" }, cb),
      el("a", { class: "col-name", href: "#", title: it.name, onclick: (e) => { e.preventDefault(); openItem(it); } },
        el("span", { class: "ico" }, iconOf(it)), nameText),
      el("span", { class: "col-size" }, it.is_dir ? "-" : fmtSize(it.size)),
      el("span", { class: "col-time" }, fmtTime(it.mtime)),
      el("a", { class: "row-dl", title: "下载", href: dlUrl(it) }, "⬇"),
    );
    rows.append(row);
  }
  $("empty").hidden = state.items.length > 0;
  $("empty").textContent = state.searching ? "没有找到匹配的文件" : "这里还没有文件，拖拽文件到页面或点「上传文件」";
  renderSel();
}

function renderSel() {
  const n = state.selected.size;
  $("selbar").hidden = n === 0;
  $("sel-count").textContent = `已选 ${n} 项`;
  $("sel-rename").hidden = n !== 1;
  $("sel-all").checked = n > 0 && n === state.items.length;
}

function dlUrl(it) {
  return "/api/download?path=" + encodeURIComponent(it.path);
}

function openItem(it) {
  if (it.is_dir) { go(it.path); return; }
  const kind = previewKind(it.name);
  if (!kind) { location.href = dlUrl(it); return; }
  const src = dlUrl(it) + "&inline=1";
  let body;
  if (kind === "image") body = el("img", { src, class: "preview" });
  else if (kind === "video") body = el("video", { src, controls: "", autoplay: "", class: "preview" });
  else if (kind === "audio") body = el("audio", { src, controls: "", autoplay: "" });
  else if (kind === "pdf") body = el("iframe", { src, class: "preview-frame" });
  else {
    body = el("pre", { class: "preview-text" }, "加载中…");
    if (it.size > 2 * 1024 * 1024) body.textContent = "文件较大，请下载后查看";
    else fetch(src).then((r) => r.text()).then((t) => (body.textContent = t)).catch(() => (body.textContent = "加载失败"));
  }
  showModal(it.name, body, [
    el("a", { class: "btn", href: dlUrl(it) }, "下载"),
  ], "wide");
}

// ------------------------------------------------------------------ 弹窗

function showModal(title, body, buttons = [], size = "") {
  $("modal-title").textContent = title;
  const b = $("modal-body");
  b.innerHTML = "";
  b.append(body);
  const f = $("modal-foot");
  f.innerHTML = "";
  for (const btn of buttons) f.append(btn);
  $("modal").className = "modal " + size;
  $("modal").hidden = false;
}

function closeModal() {
  $("modal").hidden = true;
  $("modal-body").innerHTML = "";   // 停止视频 / 音频播放
}

function prompt2(title, value, onOk) {
  const input = el("input", { type: "text", value: value || "", class: "full" });
  const ok = el("button", {}, "确定");
  const submit = async () => {
    const v = input.value.trim();
    if (!v) return;
    ok.disabled = true;
    try { await onOk(v); closeModal(); } catch (e) { toast(e.message, true); } finally { ok.disabled = false; }
  };
  ok.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  showModal(title, input, [el("button", { class: "secondary", onclick: closeModal }, "取消"), ok]);
  input.focus();
  const dot = value ? value.lastIndexOf(".") : -1;
  input.setSelectionRange(0, dot > 0 ? dot : (value || "").length);
}

function confirm2(title, msg, onOk, danger) {
  const ok = el("button", { class: danger ? "danger" : "" }, "确定");
  ok.addEventListener("click", async () => {
    ok.disabled = true;
    try { await onOk(); closeModal(); } catch (e) { toast(e.message, true); } finally { ok.disabled = false; }
  });
  showModal(title, el("p", {}, msg), [el("button", { class: "secondary", onclick: closeModal }, "取消"), ok]);
}

// ------------------------------------------------------------------ 文件操作

function selectedItems() { return state.items.filter((i) => state.selected.has(i.path)); }

function doMkdir() {
  prompt2("新建文件夹", "", async (name) => {
    await api("POST", "/api/mkdir", { dir: state.path, name });
    toast("已创建");
    load();
  });
}

function doRename() {
  const [it] = selectedItems();
  if (!it) return;
  prompt2("重命名", it.name, async (name) => {
    await api("POST", "/api/rename", { path: it.path, new_name: name });
    toast("已重命名");
    state.searching ? doSearch() : load();
  });
}

function doDelete() {
  const items = selectedItems();
  if (!items.length) return;
  const what = items.length === 1 ? `「${items[0].name}」` : `选中的 ${items.length} 项`;
  confirm2("删除", `确定删除${what}？删除后无法恢复。`, async () => {
    const r = await api("POST", "/api/delete", { paths: items.map((i) => i.path) });
    toast(`已删除，释放 ${fmtSize(r.freed)}`);
    setUsage(r.used, r.quota);
    state.searching ? doSearch() : load();
  }, true);
}

function doDownload() {
  const items = selectedItems();
  if (!items.length) return;
  if (items.length === 1) { location.href = dlUrl(items[0]); return; }
  const qs = items.map((i) => "paths=" + encodeURIComponent(i.path)).join("&");
  location.href = "/api/zip?" + qs;
}

function doMove() {
  const items = selectedItems();
  if (!items.length) return;
  let cur = "";
  const listBox = el("div", { class: "picker" });
  const crumb = el("div", { class: "picker-path" });
  const draw = async () => {
    crumb.textContent = "位置：/" + cur;
    listBox.innerHTML = "加载中…";
    try {
      const data = await api("GET", "/api/list?path=" + encodeURIComponent(cur));
      listBox.innerHTML = "";
      if (cur) {
        const up = cur.includes("/") ? cur.slice(0, cur.lastIndexOf("/")) : "";
        listBox.append(el("a", { href: "#", onclick: (e) => { e.preventDefault(); cur = up; draw(); } }, "⬆ 上一级"));
      }
      const dirs = data.items.filter((i) => i.is_dir && !state.selected.has(i.path));
      for (const d of dirs) {
        listBox.append(el("a", { href: "#", onclick: (e) => { e.preventDefault(); cur = d.path; draw(); } }, "📁 " + d.name));
      }
      if (!dirs.length) listBox.append(el("p", { class: "muted" }, "（没有子文件夹）"));
    } catch (e) { listBox.textContent = e.message; }
  };
  const ok = el("button", {}, "移动到这里");
  ok.addEventListener("click", async () => {
    ok.disabled = true;
    try {
      await api("POST", "/api/move", { paths: items.map((i) => i.path), dest: cur });
      closeModal();
      toast("已移动");
      load();
    } catch (e) { toast(e.message, true); } finally { ok.disabled = false; }
  });
  showModal(`移动 ${items.length} 项`, el("div", {}, crumb, listBox),
            [el("button", { class: "secondary", onclick: closeModal }, "取消"), ok]);
  draw();
}

let searchTimer;
async function doSearch() {
  const q = $("search").value.trim();
  if (!q) { load(); return; }
  try {
    const data = await api("GET", "/api/search?q=" + encodeURIComponent(q));
    state.searching = true;
    state.items = data.items;
    state.selected.clear();
    render();
    if (data.truncated) toast("结果过多，仅显示前 300 项");
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ 上传

const uploadQueue = [];
let uploading = 0;
let uploadDone = 0;
let uploadFailed = 0;

function enqueue(files) {
  // files: [{file, relPath}]，relPath 为相对当前目录的路径（上传文件夹时包含子目录）
  if (!files.length) return;
  const dir = state.path;
  $("uploads").hidden = false;
  for (const f of files) {
    const bar = el("div", { class: "up-bar" }, el("div"));
    const status = el("span", { class: "up-status" }, "等待");
    const cancel = el("button", { class: "ghost small" }, "✕");
    const row = el("div", { class: "up-row" },
      el("div", { class: "up-name", title: f.relPath }, f.relPath), bar, status, cancel);
    $("up-list").prepend(row);
    const task = { ...f, dir, row, bar, status, cancel, xhr: null, cancelled: false };
    cancel.addEventListener("click", () => {
      task.cancelled = true;
      if (task.xhr) task.xhr.abort();
      status.textContent = "已取消";
      cancel.remove();
    });
    uploadQueue.push(task);
  }
  updateUpTitle();
  pump();
}

function updateUpTitle() {
  const pending = uploadQueue.length + uploading;
  $("up-title").textContent = pending
    ? `正在上传：剩余 ${pending} 个`
    : `上传完成：成功 ${uploadDone} 个` + (uploadFailed ? `，失败 ${uploadFailed} 个` : "");
}

function pump() {
  while (uploading < UPLOAD_CONCURRENCY && uploadQueue.length) {
    const t = uploadQueue.shift();
    if (t.cancelled) continue;
    uploading++;
    uploadOne(t).finally(() => {
      uploading--;
      updateUpTitle();
      pump();
      if (!uploading && !uploadQueue.length) load();
    });
  }
}

function uploadOne(t) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    t.xhr = xhr;
    const qs = `dir=${encodeURIComponent(t.dir)}&name=${encodeURIComponent(t.relPath)}&mtime=${t.file.lastModified || ""}`;
    xhr.open("PUT", "/api/upload?" + qs);
    xhr.setRequestHeader("X-Requested-With", "netdisk");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = (e.loaded / e.total) * 100;
      t.bar.firstChild.style.width = pct.toFixed(1) + "%";
      t.status.textContent = pct.toFixed(0) + "%";
    };
    const fail = (msg) => {
      uploadFailed++;
      t.row.classList.add("failed");
      t.status.textContent = msg;
      t.status.title = msg;
      resolve();
    };
    xhr.onload = () => {
      t.cancel.remove();
      if (xhr.status === 401) { location.href = "/login"; return; }
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* 忽略 */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadDone++;
        t.row.classList.add("done");
        t.bar.firstChild.style.width = "100%";
        t.status.textContent = "完成";
        if (data.used !== undefined) setUsage(data.used, data.quota);
        resolve();
      } else {
        fail(typeof data.detail === "string" ? data.detail : `失败 ${xhr.status}`);
      }
    };
    xhr.onerror = () => { t.cancel.remove(); fail("网络错误"); };
    xhr.onabort = () => resolve();
    t.status.textContent = "0%";
    xhr.send(t.file);
  });
}

async function collectDropped(dt) {
  // 支持拖拽文件夹：用 webkitGetAsEntry 递归读取
  const out = [];
  const entries = [];
  for (const item of dt.items || []) {
    const en = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (en) entries.push(en);
  }
  if (!entries.length) {
    for (const f of dt.files) out.push({ file: f, relPath: f.name });
    return out;
  }
  const readAll = (reader) => new Promise((res, rej) => {
    const acc = [];
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return res(acc);
      acc.push(...batch);
      next();
    }, rej);
    next();
  });
  const walk = async (en, prefix) => {
    if (en.isFile) {
      const f = await new Promise((res, rej) => en.file(res, rej));
      out.push({ file: f, relPath: prefix + f.name });
    } else if (en.isDirectory) {
      const children = await readAll(en.createReader());
      if (!children.length) out.push({ dirOnly: true, relPath: prefix + en.name });
      for (const c of children) await walk(c, prefix + en.name + "/");
    }
  };
  for (const en of entries) await walk(en, "");
  return out.filter((x) => !x.dirOnly);
}

// ------------------------------------------------------------------ 设备

async function showDevices() {
  let data;
  try { data = await api("GET", "/api/devices"); } catch (e) { toast(e.message, true); return; }
  $("dev-count").textContent = `${data.devices.length}/${data.max_devices}`;
  const box = el("div", { class: "devices" },
    el("p", { class: "muted" }, `同时最多 ${data.max_devices} 台设备在线，当前 ${data.devices.length} 台。下线后该设备需重新输入密码。`));
  for (const d of data.devices) {
    const kick = el("button", { class: d.current ? "secondary small" : "danger small" }, d.current ? "退出本机" : "下线");
    kick.addEventListener("click", async () => {
      try {
        const r = await api("DELETE", "/api/devices/" + d.id);
        if (r.self) { location.href = "/login"; return; }
        toast("已下线");
        showDevices();
      } catch (e) { toast(e.message, true); }
    });
    const nameEl = el("strong", {}, d.name);
    const actions = el("div", { class: "dev-actions" });
    if (d.current) {
      actions.append(el("button", {
        class: "ghost small", onclick: () => prompt2("修改本机名称", d.name, async (name) => {
          await api("PATCH", "/api/devices/" + d.id, { name });
          try { localStorage.setItem("netdisk.deviceName", name); } catch (e) { /* 忽略 */ }
          toast("已修改");
          setTimeout(showDevices, 0);
        }),
      }, "改名"));
    }
    actions.append(kick);
    box.append(el("div", { class: "dev" + (d.current ? " current" : "") },
      el("div", {}, nameEl, d.current ? el("span", { class: "tag" }, "本机") : "",
        el("div", { class: "muted small" }, `IP ${d.ip || "-"} · 登录于 ${fmtTime(d.created_at)} · 最近活动 ${fmtTime(d.last_seen)}`)),
      actions));
  }
  showModal("在线设备", box);
}

async function refreshMe() {
  try {
    const me = await api("GET", "/api/me");
    $("dev-count").textContent = `${me.devices}/${me.max_devices}`;
    setUsage(me.used, me.quota);
  } catch (e) { /* 忽略 */ }
}

// ------------------------------------------------------------------ 事件绑定

$("btn-upload").addEventListener("click", () => $("file-input").click());
$("btn-upload-dir").addEventListener("click", () => $("dir-input").click());
$("file-input").addEventListener("change", (e) => {
  enqueue([...e.target.files].map((f) => ({ file: f, relPath: f.name })));
  e.target.value = "";
});
$("dir-input").addEventListener("change", (e) => {
  enqueue([...e.target.files].map((f) => ({ file: f, relPath: f.webkitRelativePath || f.name })));
  e.target.value = "";
});
$("btn-mkdir").addEventListener("click", doMkdir);
$("sel-delete").addEventListener("click", doDelete);
$("sel-rename").addEventListener("click", doRename);
$("sel-move").addEventListener("click", doMove);
$("sel-download").addEventListener("click", doDownload);
$("sel-clear").addEventListener("click", () => { state.selected.clear(); render(); });
$("sel-all").addEventListener("change", (e) => {
  state.selected = new Set(e.target.checked ? state.items.map((i) => i.path) : []);
  render();
});
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 300); });
$("btn-devices").addEventListener("click", showDevices);
$("btn-logout").addEventListener("click", async () => {
  try { await api("POST", "/api/logout"); } catch (e) { /* 忽略 */ }
  location.href = "/login";
});
$("modal-close").addEventListener("click", closeModal);
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("up-close").addEventListener("click", () => {
  if (uploading || uploadQueue.length) { toast("还有文件在上传"); return; }
  $("uploads").hidden = true;
  $("up-list").innerHTML = "";
  uploadDone = uploadFailed = 0;
});

// 拖拽上传
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
document.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $("drop-mask").classList.add("show"); });
document.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $("drop-mask").classList.remove("show"); } });
document.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $("drop-mask").classList.remove("show");
  if (state.searching) { toast("请先退出搜索再上传", true); return; }
  enqueue(await collectDropped(e.dataTransfer));
});

window.addEventListener("beforeunload", (e) => {
  if (uploading || uploadQueue.length) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("hashchange", load);
window.addEventListener("focus", () => { refreshQuiet(); refreshMe(); });
setInterval(() => { refreshQuiet(); refreshMe(); }, 30000);

load();
refreshMe();
