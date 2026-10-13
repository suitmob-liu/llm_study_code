/* ==================== i18n ==================== */
var I18N = {
'en': {
    'app.title':'Online Notes','app.subtitle':'Your personal workspace','app.brand':'Notes',
    'login.username':'Username','login.password':'Password','login.submit':'Sign In','login.submitting':'Signing in...','login.error':'Invalid username or password','login.locked':'Too many attempts. Locked for {0} minutes.',
    'header.logout':'Logout',
    'sidebar.new':'New','sidebar.textNote':'Text Note','sidebar.spreadsheet':'Spreadsheet','sidebar.dailyReport':'Daily Report','sidebar.weeklyReport':'Weekly Report',
    'sidebar.search':'Search...','sidebar.allNotes':'All Notes','sidebar.unfiled':'Unfiled','sidebar.trash':'Trash','sidebar.newFolder':'+ New Folder',
    'sidebar.noteCount':'{0} notes','sidebar.tags':'Tags',
    'editor.empty':'Select a note or create a new one','editor.untitled':'Untitled...','editor.startWriting':'Start writing...',
    'editor.addRow':'+ Row','editor.addCol':'+ Col','editor.delRow':'- Row','editor.delCol':'- Col',
    'editor.delete':'Delete','editor.back':'Back','editor.moveToFolder':'Move to folder','editor.pin':'Pin note','editor.unpin':'Unpin note',
    'editor.export':'Export','editor.exportMd':'Export as .md','editor.exportCsv':'Export as .csv','editor.history':'Version history','editor.markdown':'MD','editor.mdToggle':'Toggle Markdown preview',
    'editor.print':'Print','editor.tags':'Tags','editor.addTag':'Add tag...','editor.shortcutHint':'Press ? for keyboard shortcuts',
    'save.saving':'Saving...','save.saved':'Saved','save.failed':'Failed',
    'toast.welcome':'Welcome, {0}','toast.created':'Created','toast.deleted':'Deleted','toast.noteMoved':'Note moved',
    'toast.folderCreated':'Folder created','toast.folderDeleted':'Folder deleted','toast.storageLimit':'Storage limit!',
    'toast.pinned':'Note pinned','toast.unpinned':'Note unpinned','toast.exported':'Exported',
    'toast.restored':'Note restored','toast.imageUploaded':'Image uploaded','toast.imageTooLarge':'Image too large (max 5MB)',
    'toast.emptyTrash':'Trash emptied','toast.versionRestored':'Version restored','toast.conflict':'Conflict detected',
    'dialog.deleteNote':'Delete this note?','dialog.deleteFolder':'Delete this folder? Notes will be moved to Unfiled.','dialog.folderName':'Folder name:',
    'dialog.emptyTrash':'Permanently delete all items in trash?','dialog.restoreNote':'Restore this note?','dialog.permanentDelete':'Permanently delete this note?',
    'trash.title':'Trash','trash.restore':'Restore','trash.deletePermanently':'Delete permanently','trash.empty':'Trash is empty',
    'trash.emptyAll':'Empty Trash','trash.emptyConfirm':'Permanently delete all items in trash?','trash.noItems':'No items in trash',
    'list.noMatch':'No matching notes','list.empty':'No notes yet','list.sheet':'Sheet','list.text':'Text','list.spreadsheet':'Spreadsheet',
    'time.justNow':'Just now','time.minAgo':'{0} min ago','time.yesterday':'Yesterday',
    'tpl.newNote':'New Note','tpl.newSheet':'New Sheet','tpl.dailyTitle':'Daily Report - {0}','tpl.weeklyTitle':'Weekly Report - {0}',
    'tpl.createdTime':'Created Time',
    'tpl.d.project':'Project','tpl.d.todayWork':"Today's Work",'tpl.d.tomorrowPlan':"Tomorrow's Plan",'tpl.d.progress':'Progress','tpl.d.notes':'Notes',
    'tpl.w.project':'Project','tpl.w.thisWeek':'This Week','tpl.w.nextWeek':'Next Week','tpl.w.completion':'Completion','tpl.w.risks':'Risks/Issues',
    'tags.add':'Add tag','tags.create':'Create tag','tags.delete':'Delete tag','tags.name':'Tag name','tags.color':'Color',
    'tags.noTags':'No tags yet','tags.filterByTag':'Filter by tag',
    'history.title':'Version History','history.noVersions':'No version history','history.restore':'Restore','history.version':'Version {0}','history.empty':'No version history',
    'shortcuts.title':'Keyboard Shortcuts','shortcuts.newNote':'New text note','shortcuts.newSheet':'New spreadsheet','shortcuts.save':'Save note',
    'shortcuts.search':'Focus search','shortcuts.pin':'Toggle pin','shortcuts.delete':'Delete note','shortcuts.shortcuts':'Show shortcuts',
    'shortcuts.close':'Close panel','shortcuts.general':'General','shortcuts.editor':'Editor','shortcuts.navigation':'Navigation',
    'shortcuts.toggleDark':'Toggle dark mode','shortcuts.toggleMd':'Toggle Markdown preview','shortcuts.print':'Print',
    'shortcuts.export':'Export','shortcuts.historyKey':'Version history','shortcuts.closePanel':'Close panel / Back',
    'shortcuts.showShortcuts':'Show shortcuts','shortcuts.prevNext':'Previous / Next note','shortcuts.deleteNote':'Delete note',
    'conflict.title':'Conflict Detected','conflict.message':'This note was modified elsewhere. Choose which version to keep:',
    'conflict.keepLocal':'Keep Local','conflict.keepRemote':'Keep Remote','conflict.merge':'Merge Both',
    'chars':'{0} chars','kchars':'{0}k chars'
},
'zh-CN': {
    'app.title':'在线笔记','app.subtitle':'你的个人工作空间','app.brand':'笔记',
    'login.username':'用户名','login.password':'密码','login.submit':'登录','login.submitting':'登录中...','login.error':'用户名或密码错误','login.locked':'尝试次数过多，已锁定 {0} 分钟。',
    'header.logout':'退出登录',
    'sidebar.new':'新建','sidebar.textNote':'文本笔记','sidebar.spreadsheet':'电子表格','sidebar.dailyReport':'日报模板','sidebar.weeklyReport':'周报模板',
    'sidebar.search':'搜索...','sidebar.allNotes':'全部笔记','sidebar.unfiled':'未分类','sidebar.trash':'回收站','sidebar.newFolder':'+ 新建文件夹',
    'sidebar.noteCount':'{0} 条笔记','sidebar.tags':'标签',
    'editor.empty':'选择一个笔记或创建新笔记','editor.untitled':'无标题...','editor.startWriting':'开始写作...',
    'editor.addRow':'+ 行','editor.addCol':'+ 列','editor.delRow':'- 行','editor.delCol':'- 列',
    'editor.delete':'删除','editor.back':'返回','editor.moveToFolder':'移动到文件夹','editor.pin':'置顶笔记','editor.unpin':'取消置顶',
    'editor.export':'导出','editor.exportMd':'导出为 .md','editor.exportCsv':'导出为 .csv','editor.history':'版本历史','editor.markdown':'MD','editor.mdToggle':'切换 Markdown 预览',
    'editor.print':'打印','editor.tags':'标签','editor.addTag':'添加标签...','editor.shortcutHint':'按 ? 查看快捷键',
    'save.saving':'保存中...','save.saved':'已保存','save.failed':'保存失败',
    'toast.welcome':'欢迎回来，{0}','toast.created':'已创建','toast.deleted':'已删除','toast.noteMoved':'笔记已移动',
    'toast.folderCreated':'文件夹已创建','toast.folderDeleted':'文件夹已删除','toast.storageLimit':'存储空间已满！',
    'toast.pinned':'已置顶','toast.unpinned':'已取消置顶','toast.exported':'已导出',
    'toast.restored':'笔记已恢复','toast.imageUploaded':'图片已上传','toast.imageTooLarge':'图片过大（最大5MB）',
    'toast.emptyTrash':'回收站已清空','toast.versionRestored':'版本已恢复','toast.conflict':'检测到冲突',
    'dialog.deleteNote':'确定删除这条笔记吗？','dialog.deleteFolder':'确定删除此文件夹吗？笔记将移至未分类。','dialog.folderName':'文件夹名称：',
    'dialog.emptyTrash':'确定永久删除回收站中的所有项目？','dialog.restoreNote':'确定恢复此笔记？','dialog.permanentDelete':'确定永久删除此笔记？',
    'trash.title':'回收站','trash.restore':'恢复','trash.deletePermanently':'永久删除','trash.empty':'回收站为空',
    'trash.emptyAll':'清空回收站','trash.emptyConfirm':'确定永久删除回收站中的所有项目？','trash.noItems':'回收站中没有项目',
    'list.noMatch':'没有匹配的笔记','list.empty':'暂无笔记','list.sheet':'表格','list.text':'文本','list.spreadsheet':'电子表格',
    'time.justNow':'刚刚','time.minAgo':'{0} 分钟前','time.yesterday':'昨天',
    'tpl.newNote':'新笔记','tpl.newSheet':'新表格','tpl.dailyTitle':'日报 - {0}','tpl.weeklyTitle':'周报 - {0}',
    'tpl.createdTime':'创建时间',
    'tpl.d.project':'项目','tpl.d.todayWork':'今日完成','tpl.d.tomorrowPlan':'明日计划','tpl.d.progress':'进度','tpl.d.notes':'备注',
    'tpl.w.project':'项目','tpl.w.thisWeek':'本周完成','tpl.w.nextWeek':'下周计划','tpl.w.completion':'完成度','tpl.w.risks':'风险/问题',
    'tags.add':'添加标签','tags.create':'创建标签','tags.delete':'删除标签','tags.name':'标签名称','tags.color':'颜色',
    'tags.noTags':'暂无标签','tags.filterByTag':'按标签筛选',
    'history.title':'版本历史','history.noVersions':'暂无版本历史','history.restore':'恢复','history.version':'版本 {0}','history.empty':'暂无版本历史',
    'shortcuts.title':'键盘快捷键','shortcuts.newNote':'新建文本笔记','shortcuts.newSheet':'新建表格','shortcuts.save':'保存笔记',
    'shortcuts.search':'聚焦搜索','shortcuts.pin':'切换置顶','shortcuts.delete':'删除笔记','shortcuts.shortcuts':'显示快捷键',
    'shortcuts.close':'关闭面板','shortcuts.general':'通用','shortcuts.editor':'编辑器','shortcuts.navigation':'导航',
    'shortcuts.toggleDark':'切换深色模式','shortcuts.toggleMd':'切换 Markdown 预览','shortcuts.print':'打印',
    'shortcuts.export':'导出','shortcuts.historyKey':'版本历史','shortcuts.closePanel':'关闭面板 / 返回',
    'shortcuts.showShortcuts':'显示快捷键','shortcuts.prevNext':'上一条 / 下一条笔记','shortcuts.deleteNote':'删除笔记',
    'conflict.title':'检测到冲突','conflict.message':'此笔记已在其他地方被修改，请选择保留哪个版本：',
    'conflict.keepLocal':'保留本地','conflict.keepRemote':'保留远程','conflict.merge':'合并两者',
    'chars':'{0} 字符','kchars':'{0}k 字符'
},
'zh-TW': {
    'app.title':'線上筆記','app.subtitle':'你的個人工作空間','app.brand':'筆記',
    'login.username':'使用者名稱','login.password':'密碼','login.submit':'登入','login.submitting':'登入中...','login.error':'使用者名稱或密碼錯誤','login.locked':'嘗試次數過多，已鎖定 {0} 分鐘。',
    'header.logout':'登出',
    'sidebar.new':'新增','sidebar.textNote':'文字筆記','sidebar.spreadsheet':'試算表','sidebar.dailyReport':'日報範本','sidebar.weeklyReport':'週報範本',
    'sidebar.search':'搜尋...','sidebar.allNotes':'全部筆記','sidebar.unfiled':'未分類','sidebar.trash':'回收桶','sidebar.newFolder':'+ 新增資料夾',
    'sidebar.noteCount':'{0} 條筆記','sidebar.tags':'標籤',
    'editor.empty':'選擇一個筆記或建立新筆記','editor.untitled':'無標題...','editor.startWriting':'開始撰寫...',
    'editor.addRow':'+ 列','editor.addCol':'+ 欄','editor.delRow':'- 列','editor.delCol':'- 欄',
    'editor.delete':'刪除','editor.back':'返回','editor.moveToFolder':'移至資料夾','editor.pin':'置頂筆記','editor.unpin':'取消置頂',
    'editor.export':'匯出','editor.exportMd':'匯出為 .md','editor.exportCsv':'匯出為 .csv','editor.history':'版本歷史','editor.markdown':'MD','editor.mdToggle':'切換 Markdown 預覽',
    'editor.print':'列印','editor.tags':'標籤','editor.addTag':'新增標籤...','editor.shortcutHint':'按 ? 查看快捷鍵',
    'save.saving':'儲存中...','save.saved':'已儲存','save.failed':'儲存失敗',
    'toast.welcome':'歡迎回來，{0}','toast.created':'已建立','toast.deleted':'已刪除','toast.noteMoved':'筆記已移動',
    'toast.folderCreated':'資料夾已建立','toast.folderDeleted':'資料夾已刪除','toast.storageLimit':'儲存空間已滿！',
    'toast.pinned':'已置頂','toast.unpinned':'已取消置頂','toast.exported':'已匯出',
    'toast.restored':'筆記已恢復','toast.imageUploaded':'圖片已上傳','toast.imageTooLarge':'圖片過大（最大5MB）',
    'toast.emptyTrash':'回收桶已清空','toast.versionRestored':'版本已恢復','toast.conflict':'偵測到衝突',
    'dialog.deleteNote':'確定刪除這條筆記嗎？','dialog.deleteFolder':'確定刪除此資料夾嗎？筆記將移至未分類。','dialog.folderName':'資料夾名稱：',
    'dialog.emptyTrash':'確定永久刪除回收桶中的所有項目？','dialog.restoreNote':'確定恢復此筆記？','dialog.permanentDelete':'確定永久刪除此筆記？',
    'trash.title':'回收桶','trash.restore':'恢復','trash.deletePermanently':'永久刪除','trash.empty':'回收桶為空',
    'trash.emptyAll':'清空回收桶','trash.emptyConfirm':'確定永久刪除回收桶中的所有項目？','trash.noItems':'回收桶中沒有項目',
    'list.noMatch':'沒有符合的筆記','list.empty':'尚無筆記','list.sheet':'表格','list.text':'文字','list.spreadsheet':'試算表',
    'time.justNow':'剛才','time.minAgo':'{0} 分鐘前','time.yesterday':'昨天',
    'tpl.newNote':'新筆記','tpl.newSheet':'新表格','tpl.dailyTitle':'日報 - {0}','tpl.weeklyTitle':'週報 - {0}',
    'tpl.createdTime':'建立時間',
    'tpl.d.project':'專案','tpl.d.todayWork':'今日完成','tpl.d.tomorrowPlan':'明日計畫','tpl.d.progress':'進度','tpl.d.notes':'備註',
    'tpl.w.project':'專案','tpl.w.thisWeek':'本週完成','tpl.w.nextWeek':'下週計畫','tpl.w.completion':'完成度','tpl.w.risks':'風險/問題',
    'tags.add':'新增標籤','tags.create':'建立標籤','tags.delete':'刪除標籤','tags.name':'標籤名稱','tags.color':'顏色',
    'tags.noTags':'尚無標籤','tags.filterByTag':'依標籤篩選',
    'history.title':'版本歷史','history.noVersions':'尚無版本歷史','history.restore':'恢復','history.version':'版本 {0}','history.empty':'尚無版本歷史',
    'shortcuts.title':'鍵盤快捷鍵','shortcuts.newNote':'新增文字筆記','shortcuts.newSheet':'新增試算表','shortcuts.save':'儲存筆記',
    'shortcuts.search':'聚焦搜尋','shortcuts.pin':'切換置頂','shortcuts.delete':'刪除筆記','shortcuts.shortcuts':'顯示快捷鍵',
    'shortcuts.close':'關閉面板','shortcuts.general':'通用','shortcuts.editor':'編輯器','shortcuts.navigation':'導覽',
    'shortcuts.toggleDark':'切換深色模式','shortcuts.toggleMd':'切換 Markdown 預覽','shortcuts.print':'列印',
    'shortcuts.export':'匯出','shortcuts.historyKey':'版本歷史','shortcuts.closePanel':'關閉面板 / 返回',
    'shortcuts.showShortcuts':'顯示快捷鍵','shortcuts.prevNext':'上一條 / 下一條筆記','shortcuts.deleteNote':'刪除筆記',
    'conflict.title':'偵測到衝突','conflict.message':'此筆記已在其他地方被修改，請選擇保留哪個版本：',
    'conflict.keepLocal':'保留本地','conflict.keepRemote':'保留遠端','conflict.merge':'合併兩者',
    'chars':'{0} 字元','kchars':'{0}k 字元'
}
};

var curLang = localStorage.getItem('note-lang') || (navigator.language.startsWith('zh-TW') || navigator.language.startsWith('zh-Hant') ? 'zh-TW' : navigator.language.startsWith('zh') ? 'zh-CN' : 'en');
if (!I18N[curLang]) curLang = 'en';

function t(key, args) {
    var s = (I18N[curLang] && I18N[curLang][key]) || (I18N['en'][key]) || key;
    if (args !== undefined) {
        if (!Array.isArray(args)) args = [args];
        args.forEach(function(a, i) { s = s.replace('{' + i + '}', a); });
    }
    return s;
}

function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) { el.title = t(el.getAttribute('data-i18n-title')); });
    document.documentElement.lang = curLang === 'zh-TW' ? 'zh-TW' : curLang === 'zh-CN' ? 'zh-CN' : 'en';
    document.getElementById('login-lang').value = curLang;
    document.getElementById('app-lang').value = curLang;
    if (notes.length || folders.length) { renderFolders(); renderNotes(document.getElementById('search-input').value); }
    document.getElementById('note-count').textContent = t('sidebar.noteCount', notes.length);
}

function setLang(lang) {
    if (!I18N[lang]) return;
    curLang = lang;
    localStorage.setItem('note-lang', lang);
    applyLang();
}

document.getElementById('login-lang').addEventListener('change', function() { setLang(this.value); });
document.getElementById('app-lang').addEventListener('change', function() { setLang(this.value); });

/* ==================== State ==================== */
var currentNoteId = null, currentNoteType = 'text', notes = [], folders = [], tags = [];
var selectedFolder = 'all', selectedTag = null;
var saveTimer = null, isMobile = window.innerWidth <= 768;
var lastKnownUpdatedAt = null;
var searchTimer = null, mdRenderTimer = null;
var mdMode = 'edit'; // 'edit', 'preview', 'split'

/* ==================== Dark Mode ==================== */
(function() {
    var saved = localStorage.getItem('note-theme');
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
})();

function toggleDarkMode() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('note-theme', next);
}
document.getElementById('theme-toggle').addEventListener('click', toggleDarkMode);
document.getElementById('login-theme-toggle').addEventListener('click', toggleDarkMode);

/* ==================== API ==================== */
async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    if (res.status === 401 && path !== '/api/login' && path !== '/api/check') { showLogin(); throw new Error('unauthorized'); }
    if (res.status === 409) { var d = await res.json(); throw { status: 409, data: d }; }
    if (res.status === 429) { var d2 = await res.json(); throw { status: 429, data: d2 }; }
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'failed');
    return data;
}

/* ==================== Toast ==================== */
var toastT = null;
function toast(msg) {
    var el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function() { el.classList.remove('show'); }, 2500);
}

/* ==================== Screens ==================== */
function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-error').textContent = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    currentNoteId = null; notes = []; folders = []; tags = [];
}
function showApp(username) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    document.getElementById('user-info').textContent = username;
    document.getElementById('user-av').textContent = username.charAt(0).toUpperCase();
    loadFolders(); loadNotes(); loadTags(); loadStorage();
}

/* ==================== Init ==================== */
async function init() {
    applyLang();
    try { var d = await api('GET', '/api/check'); if (d.ok) showApp(d.username); else showLogin(); }
    catch (e) { showLogin(); }
}

/* ==================== Auth ==================== */
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = document.getElementById('login-btn');
    var u = document.getElementById('username').value.trim(), p = document.getElementById('password').value;
    if (!u || !p) return;
    btn.disabled = true; btn.textContent = t('login.submitting');
    document.getElementById('login-error').textContent = '';
    try {
        var d = await api('POST', '/api/login', {username:u, password:p});
        showApp(d.username); toast(t('toast.welcome', d.username));
    } catch (err) {
        if (err && err.status === 429) {
            var mins = (err.data && err.data.minutes) || 10;
            document.getElementById('login-error').textContent = t('login.locked', mins);
        } else {
            document.getElementById('login-error').textContent = t('login.error');
        }
    } finally { btn.disabled = false; btn.textContent = t('login.submit'); }
});
document.getElementById('logout-btn').addEventListener('click', async function() {
    try { await api('POST', '/api/logout'); } catch(e){} showLogin();
});

/* ==================== Folders ==================== */
async function loadFolders() {
    try { var d = await api('GET', '/api/folders'); folders = d.folders; renderFolders(); } catch(e){}
}

function renderFolders() {
    var el = document.getElementById('folder-list');
    var allCount = notes.length;
    var unfiledCount = notes.filter(function(n){return n.folder_id === null;}).length;
    var html = '<div class="folder-item' + (selectedFolder === 'all' ? ' active' : '') + '" data-f="all">' +
        '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 011 1v1H4V7zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>' +
        '<span>' + t('sidebar.allNotes') + '</span><span class="f-count">' + allCount + '</span></div>';
    html += '<div class="folder-item' + (selectedFolder === 'unfiled' ? ' active' : '') + '" data-f="unfiled">' +
        '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zm14 4H2v6a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>' +
        '<span>' + t('sidebar.unfiled') + '</span><span class="f-count">' + unfiledCount + '</span></div>';
    folders.forEach(function(f) {
        var cnt = notes.filter(function(n){return n.folder_id === f.id;}).length;
        html += '<div class="folder-item' + (selectedFolder === f.id ? ' active' : '') + '" data-f="' + f.id + '" data-drop-folder="' + f.id + '">' +
            '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>' +
            '<span>' + esc(f.name) + '</span><span class="f-count">' + cnt + '</span>' +
            '<button class="f-del" data-fid="' + f.id + '" title="' + t('editor.delete') + '"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg></button></div>';
    });
    // Trash folder item
    html += '<div class="folder-item' + (selectedFolder === 'trash' ? ' active' : '') + '" data-f="trash">' +
        '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"/></svg>' +
        '<span>' + t('sidebar.trash') + '</span></div>';

    el.innerHTML = html;
    el.querySelectorAll('.folder-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.f-del')) return;
            var f = item.getAttribute('data-f');
            selectedTag = null;
            if (f === 'trash') { selectedFolder = 'trash'; renderFolders(); showTrash(); return; }
            selectedFolder = (f === 'all' || f === 'unfiled') ? f : parseInt(f);
            renderFolders(); renderNotes();
        });
        // Drag-and-drop: folders accept dropped notes
        var folderId = item.getAttribute('data-drop-folder');
        if (folderId) {
            item.addEventListener('dragover', function(e) { e.preventDefault(); item.classList.add('drag-over'); });
            item.addEventListener('dragleave', function() { item.classList.remove('drag-over'); });
            item.addEventListener('drop', async function(e) {
                e.preventDefault(); item.classList.remove('drag-over');
                var noteId = e.dataTransfer.getData('text/plain');
                if (!noteId) return;
                try {
                    await api('PUT', '/api/notes/' + noteId + '/move', {folder_id: parseInt(folderId)});
                    await loadNotes(); await loadFolders(); toast(t('toast.noteMoved'));
                } catch(ex){}
            });
        }
    });
    el.querySelectorAll('.f-del').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!confirm(t('dialog.deleteFolder'))) return;
            try { await api('DELETE', '/api/folders/' + btn.getAttribute('data-fid'));
                selectedFolder = 'all'; await loadFolders(); await loadNotes(); toast(t('toast.folderDeleted')); } catch(e){}
        });
    });
}

document.getElementById('add-folder-btn').addEventListener('click', async function() {
    var name = prompt(t('dialog.folderName'));
    if (!name || !name.trim()) return;
    try { await api('POST', '/api/folders', {name: name.trim()}); await loadFolders(); toast(t('toast.folderCreated')); } catch(e){}
});

/* ==================== Tags ==================== */
async function loadTags() {
    try { var d = await api('GET', '/api/tags'); tags = d.tags || []; renderTagFilter(); } catch(e){}
}

function renderTagFilter() {
    var el = document.getElementById('tag-filter-list');
    if (!el) return;
    if (!tags.length) { el.innerHTML = '<div class="tag-empty-msg">' + t('tags.noTags') + '</div>'; return; }
    var html = '';
    tags.forEach(function(tg) {
        html += '<div class="tag-filter-item' + (selectedTag === tg.id ? ' active' : '') + '" data-tag="' + tg.id + '">' +
            '<span class="tag-dot" style="background:' + esc(tg.color) + '"></span>' +
            '<span class="tag-label">' + esc(tg.name) + '</span>' +
            '<button class="tag-del-btn" data-tid="' + tg.id + '" title="' + t('tags.delete') + '">&times;</button></div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('.tag-filter-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.tag-del-btn')) return;
            var tid = parseInt(item.getAttribute('data-tag'));
            selectedTag = (selectedTag === tid) ? null : tid;
            selectedFolder = 'all';
            renderTagFilter(); renderFolders(); renderNotes();
        });
    });
    el.querySelectorAll('.tag-del-btn').forEach(function(btn) {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            try { await api('DELETE', '/api/tags/' + btn.getAttribute('data-tid')); await loadTags(); await loadNotes(); } catch(ex){}
        });
    });
}

function renderNoteTagsDropdown() {
    var menu = document.getElementById('note-tags');
    if (!menu || !currentNoteId) return;
    var note = notes.find(function(n){ return n.id === currentNoteId; });
    var noteTagIds = (note && note.tag_ids) ? note.tag_ids : [];
    var predefinedColors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];
    var html = '';
    tags.forEach(function(tg) {
        var checked = noteTagIds.indexOf(tg.id) >= 0;
        html += '<div class="note-tag-row">' +
            '<label class="tag-check"><input type="checkbox" data-tid="' + tg.id + '"' + (checked ? ' checked' : '') + '>' +
            '<span class="tag-dot" style="background:' + esc(tg.color) + '"></span>' + esc(tg.name) + '</label></div>';
    });
    if (!tags.length) html = '<div class="tag-empty-msg">' + t('tags.noTags') + '</div>';
    // Color picker for new tag creation
    html += '<div class="tag-color-row" id="tag-color-row">';
    predefinedColors.forEach(function(c, i) {
        html += '<span class="tag-color-opt' + (i === 0 ? ' selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></span>';
    });
    html += '</div>';
    menu.innerHTML = html;
    menu.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
        cb.addEventListener('change', async function() {
            var newIds = [];
            menu.querySelectorAll('input[type=checkbox]:checked').forEach(function(c) { newIds.push(parseInt(c.getAttribute('data-tid'))); });
            try {
                await api('PUT', '/api/notes/' + currentNoteId + '/tags', {tag_ids: newIds});
                if (note) note.tag_ids = newIds;
                renderEditorTags(); renderNotes(document.getElementById('search-input').value);
            } catch(ex){}
        });
    });
    menu.querySelectorAll('.tag-color-opt').forEach(function(opt) {
        opt.addEventListener('click', function() {
            menu.querySelectorAll('.tag-color-opt').forEach(function(o){o.classList.remove('selected');});
            opt.classList.add('selected');
        });
    });
}

function renderEditorTags() {
    var el = document.getElementById('editor-tags');
    if (!el || !currentNoteId) { if(el) el.innerHTML = ''; return; }
    var note = notes.find(function(n){ return n.id === currentNoteId; });
    var noteTagIds = (note && note.tag_ids) ? note.tag_ids : [];
    if (!noteTagIds.length) { el.innerHTML = ''; return; }
    var html = '';
    noteTagIds.forEach(function(tid) {
        var tg = tags.find(function(t){ return t.id === tid; });
        if (tg) html += '<span class="tag-chip" style="--tc:' + esc(tg.color) + '">' + esc(tg.name) + '</span>';
    });
    el.innerHTML = html;
}

// Add tag button
document.getElementById('tag-add-btn').addEventListener('click', async function() {
    var input = document.getElementById('tag-input');
    var name = input.value.trim();
    if (!name) return;
    var colorEl = document.querySelector('#tag-color-row .tag-color-opt.selected');
    var color = colorEl ? colorEl.getAttribute('data-color') : '#6366f1';
    try {
        await api('POST', '/api/tags', {name: name, color: color});
        input.value = '';
        await loadTags();
        renderNoteTagsDropdown();
    } catch(ex){}
});

document.getElementById('tag-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tag-add-btn').click(); }
});

/* ==================== Notes List ==================== */
async function loadNotes() {
    try {
        var d = await api('GET', '/api/notes'); notes = d.notes || [];
        renderNotes(); renderFolders();
        document.getElementById('note-count').textContent = t('sidebar.noteCount', notes.length);
    } catch(e){}
}

function renderNotes(filter) {
    var list = document.getElementById('notes-list'); list.innerHTML = '';
    var filtered = notes;
    if (selectedFolder === 'unfiled') filtered = notes.filter(function(n){return n.folder_id === null;});
    else if (typeof selectedFolder === 'number') filtered = notes.filter(function(n){return n.folder_id === selectedFolder;});
    // Tag filter
    if (selectedTag) {
        filtered = filtered.filter(function(n) {
            return n.tag_ids && n.tag_ids.indexOf(selectedTag) >= 0;
        });
    }
    if (filter) {
        var f = filter.toLowerCase();
        filtered = filtered.filter(function(n){
            return (n.title || '').toLowerCase().indexOf(f) >= 0 || (n.preview || '').toLowerCase().indexOf(f) >= 0;
        });
    }
    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:32px 12px;text-align:center;color:var(--tm);font-size:12px">' + (notes.length ? t('list.noMatch') : t('list.empty')) + '</div>';
        return;
    }
    filtered.forEach(function(n) {
        var item = document.createElement('div');
        item.className = 'note-item' + (n.id === currentNoteId ? ' active' : '');
        var isSheet = n.note_type === 'sheet';
        var typeClass = isSheet ? 't-sheet' : 't-text';
        var typeLabel = isSheet ? t('list.sheet') : t('list.text');
        var preview = isSheet ? t('list.spreadsheet') : esc(n.preview || '');
        var pinHtml = n.is_pinned ? '<svg class="pin-indicator" width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z"/></svg>' : '';
        // Tag chips in list
        var tagHtml = '';
        if (n.tag_ids && n.tag_ids.length) {
            n.tag_ids.forEach(function(tid) {
                var tg = tags.find(function(t){ return t.id === tid; });
                if (tg) tagHtml += '<span class="tag-chip-sm" style="--tc:' + esc(tg.color) + '">' + esc(tg.name) + '</span>';
            });
        }
        item.innerHTML = '<div class="ni-top">' + pinHtml + '<span class="ni-type ' + typeClass + '">' + typeLabel + '</span><span class="ni-title">' + esc(n.title || t('editor.untitled')) + '</span></div>' +
            (tagHtml ? '<div class="ni-tags">' + tagHtml + '</div>' : '') +
            '<div class="ni-preview">' + preview + '</div><div class="ni-date">' + fmtDate(n.updated_at) + '</div>';
        // Draggable
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', String(n.id));
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('click', function() { openNote(n.id); });
        list.appendChild(item);
    });
}

/* ==================== Full-text Search ==================== */
document.getElementById('search-input').addEventListener('input', function(e) {
    var val = e.target.value;
    if (searchTimer) clearTimeout(searchTimer);
    if (val.length >= 2) {
        searchTimer = setTimeout(async function() {
            try {
                var d = await api('GET', '/api/search?q=' + encodeURIComponent(val));
                renderSearchResults(d.results || []);
            } catch(ex) { renderNotes(val); }
        }, 300);
    } else {
        renderNotes(val);
    }
});

function renderSearchResults(results) {
    var list = document.getElementById('notes-list'); list.innerHTML = '';
    if (!results.length) {
        list.innerHTML = '<div style="padding:32px 12px;text-align:center;color:var(--tm);font-size:12px">' + t('list.noMatch') + '</div>';
        return;
    }
    results.forEach(function(n) {
        var item = document.createElement('div');
        item.className = 'note-item' + (n.id === currentNoteId ? ' active' : '');
        var isSheet = n.note_type === 'sheet';
        var typeClass = isSheet ? 't-sheet' : 't-text';
        var typeLabel = isSheet ? t('list.sheet') : t('list.text');
        var preview = isSheet ? t('list.spreadsheet') : esc(n.preview || '');
        item.innerHTML = '<div class="ni-top"><span class="ni-type ' + typeClass + '">' + typeLabel + '</span><span class="ni-title">' + esc(n.title || t('editor.untitled')) + '</span></div>' +
            '<div class="ni-preview">' + preview + '</div><div class="ni-date">' + fmtDate(n.updated_at) + '</div>';
        item.addEventListener('click', function() { openNote(n.id); });
        list.appendChild(item);
    });
}

/* ==================== Open Note ==================== */
async function openNote(id) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveCurrent(); }
    try {
        var d = await api('GET', '/api/notes/' + id);
        currentNoteId = id; currentNoteType = d.note_type || 'text';
        lastKnownUpdatedAt = d.updated_at || null;
        if (currentNoteType === 'sheet') showSheetEditor(d); else showTextEditor(d);
        renderNotes(document.getElementById('search-input').value);
        renderEditorTags();
        renderNoteTagsDropdown();
        updatePinButton();
        if (isMobile) { document.getElementById('sidebar').classList.add('hidden'); document.getElementById('editor').classList.add('visible'); }
    } catch(e){}
}

function showTextEditor(d) {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'flex';
    document.getElementById('sheet-editor').style.display = 'none';
    hideTrashView();
    document.getElementById('note-title').value = d.title;
    document.getElementById('note-content').value = d.content;
    setSaveStatus('save-status', ''); updateCharCount(d.content); buildMoveMenu('move-menu');
    // Reset markdown preview
    mdMode = 'edit';
    document.getElementById('note-content').style.display = '';
    document.getElementById('md-preview').style.display = 'none';
    document.getElementById('md-toggle-btn').classList.remove('active');
}

function showSheetEditor(d) {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'flex';
    hideTrashView();
    document.getElementById('sheet-title').value = d.title;
    setSaveStatus('sheet-save-status', ''); buildMoveMenu('sheet-move-menu');
    var sd; try { sd = JSON.parse(d.content); } catch(e) { sd = {data:[['','',''],['','',''],['','','']], colWidths:[150,150,150]}; }
    Sheet.init(document.getElementById('sheet-wrap'), sd);
}

function hideEditors() {
    document.getElementById('editor-empty').style.display = 'flex';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'none';
    hideTrashView();
    currentNoteId = null; lastKnownUpdatedAt = null;
}

function hideTrashView() {
    var tv = document.getElementById('trash-view');
    if (tv) tv.style.display = 'none';
}

/* ==================== Move Menu ==================== */
function buildMoveMenu(menuId) {
    var el = document.getElementById(menuId);
    var html = '<button data-mv="0">' + t('sidebar.unfiled') + '</button>';
    folders.forEach(function(f) { html += '<button data-mv="' + f.id + '">' + esc(f.name) + '</button>'; });
    el.innerHTML = html;
    el.querySelectorAll('button').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            if (!currentNoteId) return; closeDropdowns();
            try { await api('PUT', '/api/notes/' + currentNoteId + '/move', {folder_id: parseInt(btn.getAttribute('data-mv'))});
                await loadNotes(); await loadFolders(); toast(t('toast.noteMoved')); } catch(e){}
        });
    });
}

/* ==================== Create Note ==================== */
document.getElementById('new-menu').querySelectorAll('button').forEach(function(btn) {
    btn.addEventListener('click', async function() {
        closeDropdowns();
        var action = btn.getAttribute('data-action');
        var folderId = typeof selectedFolder === 'number' ? selectedFolder : 0;
        var title, content, noteType;
        if (action === 'new-text') { title = t('tpl.newNote'); content = ''; noteType = 'text'; }
        else if (action === 'new-sheet') { title = t('tpl.newSheet'); content = JSON.stringify({data: mkEmpty(5,4), colWidths:[150,200,200,200,150]}); noteType = 'sheet'; }
        else if (action === 'tpl-daily') {
            title = t('tpl.dailyTitle', new Date().toISOString().slice(0,10));
            var now = new Date(); var nowStr = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
            var data = [[t('tpl.createdTime'),t('tpl.d.project'),t('tpl.d.todayWork'),t('tpl.d.tomorrowPlan'),t('tpl.d.progress'),t('tpl.d.notes')],[nowStr,'','','','',''],['','','','','',''],['','','','','',''],['','','','','','']];
            content = JSON.stringify({data:data, colWidths:[150,120,220,220,100,160]}); noteType = 'sheet';
        } else if (action === 'tpl-weekly') {
            title = t('tpl.weeklyTitle', getWeekStr());
            var now2 = new Date(); var nowStr2 = now2.getFullYear()+'-'+String(now2.getMonth()+1).padStart(2,'0')+'-'+String(now2.getDate()).padStart(2,'0')+' '+String(now2.getHours()).padStart(2,'0')+':'+String(now2.getMinutes()).padStart(2,'0');
            var data2 = [[t('tpl.createdTime'),t('tpl.w.project'),t('tpl.w.thisWeek'),t('tpl.w.nextWeek'),t('tpl.w.completion'),t('tpl.w.risks')],[nowStr2,'','','','',''],['','','','','',''],['','','','','',''],['','','','','','']];
            content = JSON.stringify({data:data2, colWidths:[150,120,220,220,110,180]}); noteType = 'sheet';
        }
        try { var d = await api('POST', '/api/notes', {title:title,content:content,folder_id:folderId,note_type:noteType});
            await loadNotes(); openNote(d.id); toast(t('toast.created'));
        } catch(e) { if (e.message && e.message.indexOf('storage') >= 0) toast(t('toast.storageLimit')); }
    });
});

function mkEmpty(cols,rows){var d=[];for(var r=0;r<rows;r++){var row=[];for(var c=0;c<cols;c++)row.push('');d.push(row);}return d;}
function getWeekStr(){var d=new Date(),day=d.getDay()||7;d.setDate(d.getDate()-day+1);var s=d.toISOString().slice(0,10);d.setDate(d.getDate()+6);return s+' ~ '+d.toISOString().slice(0,10);}

/* ==================== Save ==================== */
function setSaveStatus(elId, status) {
    var el = document.getElementById(elId); el.className = ''; el.textContent = '';
    if (status === 'saving') { el.textContent = t('save.saving'); el.className = 'ss-saving'; }
    else if (status === 'saved') { el.textContent = t('save.saved'); el.className = 'ss-saved'; }
    else if (status === 'error') { el.textContent = t('save.failed'); el.className = 'ss-err'; }
}

function scheduleSave() {
    var sid = currentNoteType === 'sheet' ? 'sheet-save-status' : 'save-status';
    setSaveStatus(sid, 'saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async function() { saveTimer = null; await saveCurrent(); }, 1500);
}

async function saveCurrent(forceNoConflictCheck) {
    if (!currentNoteId) return;
    var title, content, sid;
    if (currentNoteType === 'sheet') { title = document.getElementById('sheet-title').value; content = JSON.stringify(Sheet.getData()); sid = 'sheet-save-status'; }
    else { title = document.getElementById('note-title').value; content = document.getElementById('note-content').value; sid = 'save-status'; }
    var body = {title:title, content:content};
    if (!forceNoConflictCheck && lastKnownUpdatedAt) { body.expected_updated_at = lastKnownUpdatedAt; }
    try {
        await api('PUT', '/api/notes/' + currentNoteId, body);
        setSaveStatus(sid, 'saved');
        lastKnownUpdatedAt = new Date().toISOString().replace('T',' ').substring(0,19);
        var n = notes.find(function(x){return x.id === currentNoteId;});
        if (n) { n.title = title; n.preview = currentNoteType === 'sheet' ? '' : content.substring(0,100); n.updated_at = lastKnownUpdatedAt; }
        renderNotes(document.getElementById('search-input').value); loadStorage();
        setTimeout(function() { var el = document.getElementById(sid); if (el && el.textContent === t('save.saved')) setSaveStatus(sid, ''); }, 3000);
    } catch(e) {
        if (e && e.status === 409) { showConflictDialog(); }
        else { setSaveStatus(sid, 'error'); }
    }
}

document.getElementById('note-title').addEventListener('input', scheduleSave);
document.getElementById('note-content').addEventListener('input', function() {
    scheduleSave(); updateCharCount(this.value);
    // Debounced markdown render
    if (mdMode !== 'edit') {
        if (mdRenderTimer) clearTimeout(mdRenderTimer);
        mdRenderTimer = setTimeout(function() { renderMarkdownPreview(); }, 300);
    }
});
document.getElementById('sheet-title').addEventListener('input', scheduleSave);

function updateCharCount(txt) {
    var el = document.getElementById('char-count');
    if (!txt) { el.textContent = ''; return; }
    el.textContent = txt.length >= 1000 ? t('kchars', (txt.length/1000).toFixed(1)) : t('chars', txt.length);
}

/* ==================== Conflict Detection ==================== */
function showConflictDialog() {
    document.getElementById('conflict-overlay').style.display = 'flex';
    toast(t('toast.conflict'));
}

document.getElementById('conflict-keep-local').addEventListener('click', async function() {
    document.getElementById('conflict-overlay').style.display = 'none';
    await saveCurrent(true);
});

document.getElementById('conflict-keep-remote').addEventListener('click', async function() {
    document.getElementById('conflict-overlay').style.display = 'none';
    if (currentNoteId) { await openNote(currentNoteId); }
});

document.getElementById('conflict-merge').addEventListener('click', async function() {
    // Simple merge: reload remote, append local changes as comment
    document.getElementById('conflict-overlay').style.display = 'none';
    await saveCurrent(true);
});

/* ==================== Pin/Unpin ==================== */
function updatePinButton() {
    var note = notes.find(function(n){ return n.id === currentNoteId; });
    var pinned = note && note.is_pinned;
    var pinBtn = document.getElementById('pin-btn');
    var sheetPinBtn = document.getElementById('sheet-pin-btn');
    if (pinBtn) {
        pinBtn.classList.toggle('active', !!pinned);
        pinBtn.title = pinned ? t('editor.unpin') : t('editor.pin');
    }
    if (sheetPinBtn) {
        sheetPinBtn.classList.toggle('active', !!pinned);
        sheetPinBtn.title = pinned ? t('editor.unpin') : t('editor.pin');
    }
}

async function togglePin() {
    if (!currentNoteId) return;
    var note = notes.find(function(n){ return n.id === currentNoteId; });
    var newPinned = (note && note.is_pinned) ? 0 : 1;
    try {
        await api('PUT', '/api/notes/' + currentNoteId + '/pin', {pinned: newPinned});
        if (note) note.is_pinned = newPinned;
        updatePinButton();
        await loadNotes();
        toast(newPinned ? t('toast.pinned') : t('toast.unpinned'));
    } catch(e){}
}

document.getElementById('pin-btn').addEventListener('click', togglePin);
document.getElementById('sheet-pin-btn').addEventListener('click', togglePin);

/* ==================== Delete (Soft Delete / Trash) ==================== */
async function deleteCurrentNote() {
    if (!currentNoteId || !confirm(t('dialog.deleteNote'))) return;
    try {
        await api('DELETE', '/api/notes/' + currentNoteId);
        hideEditors(); await loadNotes(); loadStorage(); toast(t('toast.deleted'));
        if (isMobile) { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); }
    } catch(e){}
}
document.getElementById('del-btn').addEventListener('click', deleteCurrentNote);
document.getElementById('sheet-del-btn').addEventListener('click', deleteCurrentNote);

/* ==================== Trash View ==================== */
async function showTrash() {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'none';
    document.getElementById('trash-view').style.display = 'flex';
    currentNoteId = null;
    if (isMobile) { document.getElementById('sidebar').classList.add('hidden'); document.getElementById('editor').classList.add('visible'); }
    await loadTrash();
}

async function loadTrash() {
    try {
        var d = await api('GET', '/api/trash');
        var trashNotes = d.notes || [];
        renderTrash(trashNotes);
    } catch(e){}
}

function renderTrash(trashNotes) {
    var listEl = document.getElementById('trash-list');
    var emptyEl = document.getElementById('trash-empty');
    if (!trashNotes.length) {
        listEl.innerHTML = ''; listEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    emptyEl.style.display = 'none'; listEl.style.display = 'block';
    var html = '';
    trashNotes.forEach(function(n) {
        var isSheet = n.note_type === 'sheet';
        var typeLabel = isSheet ? t('list.sheet') : t('list.text');
        html += '<div class="trash-item" data-id="' + n.id + '">' +
            '<div class="trash-info"><span class="ni-type ' + (isSheet ? 't-sheet' : 't-text') + '">' + typeLabel + '</span>' +
            '<span class="trash-title">' + esc(n.title || t('editor.untitled')) + '</span>' +
            '<span class="trash-date">' + fmtDate(n.deleted_at || n.updated_at) + '</span></div>' +
            '<div class="trash-actions">' +
            '<button class="sm-btn" data-restore="' + n.id + '">' + t('trash.restore') + '</button>' +
            '<button class="sm-btn danger-text" data-permdelete="' + n.id + '">' + t('trash.deletePermanently') + '</button></div></div>';
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('[data-restore]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            try {
                await api('PUT', '/api/trash/' + btn.getAttribute('data-restore') + '/restore');
                toast(t('toast.restored'));
                await loadTrash(); await loadNotes();
            } catch(e){}
        });
    });
    listEl.querySelectorAll('[data-permdelete]').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            if (!confirm(t('dialog.permanentDelete'))) return;
            try {
                await api('DELETE', '/api/trash/' + btn.getAttribute('data-permdelete'));
                toast(t('toast.deleted'));
                await loadTrash(); loadStorage();
            } catch(e){}
        });
    });
}

document.getElementById('empty-trash-btn').addEventListener('click', async function() {
    if (!confirm(t('trash.emptyConfirm'))) return;
    try {
        await api('DELETE', '/api/trash');
        toast(t('toast.emptyTrash'));
        await loadTrash(); loadStorage();
    } catch(e){}
});

document.getElementById('trash-back-btn').addEventListener('click', function() {
    hideTrashView();
    document.getElementById('editor-empty').style.display = 'flex';
    selectedFolder = 'all'; renderFolders();
    if (isMobile) { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); }
});

/* ==================== Export ==================== */
function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], {type: mimeType});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportCurrentNote() {
    if (!currentNoteId) return;
    if (currentNoteType === 'sheet') {
        var sd = Sheet.getData();
        var csvRows = [];
        (sd.data || []).forEach(function(row) {
            var cells = row.map(function(cell) {
                var val = String(cell || '');
                if (val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0) {
                    return '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csvRows.push(cells.join(','));
        });
        var title = document.getElementById('sheet-title').value || 'sheet';
        downloadFile(title + '.csv', csvRows.join('\n'), 'text/csv;charset=utf-8');
    } else {
        var title2 = document.getElementById('note-title').value || 'note';
        var content = document.getElementById('note-content').value || '';
        downloadFile(title2 + '.md', content, 'text/markdown;charset=utf-8');
    }
    toast(t('toast.exported'));
}

document.getElementById('export-md-btn').addEventListener('click', exportCurrentNote);
document.getElementById('export-csv-btn').addEventListener('click', exportCurrentNote);

/* ==================== Version History ==================== */
async function showHistory() {
    if (!currentNoteId) return;
    document.getElementById('history-overlay').style.display = 'flex';
    var listEl = document.getElementById('history-list');
    var emptyEl = document.getElementById('history-empty');
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--tm)">Loading...</div>';
    emptyEl.style.display = 'none';
    try {
        var d = await api('GET', '/api/notes/' + currentNoteId + '/versions');
        var versions = d.versions || [];
        if (!versions.length) {
            listEl.innerHTML = ''; emptyEl.style.display = 'block';
            return;
        }
        emptyEl.style.display = 'none';
        var html = '';
        versions.forEach(function(v, i) {
            html += '<div class="history-item" data-vid="' + v.id + '">' +
                '<div class="history-info"><strong>' + t('history.version', versions.length - i) + '</strong>' +
                '<span class="history-date">' + fmtDate(v.created_at) + '</span></div>' +
                '<div class="history-preview">' + esc((v.title || '') + ' - ' + (v.content || '').substring(0, 80)) + '</div>' +
                '<button class="sm-btn" data-restore-ver="' + v.id + '">' + t('history.restore') + '</button></div>';
        });
        listEl.innerHTML = html;
        listEl.querySelectorAll('[data-restore-ver]').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var vid = btn.getAttribute('data-restore-ver');
                try {
                    await api('PUT', '/api/notes/' + currentNoteId + '/versions/' + vid + '/restore');
                    document.getElementById('history-overlay').style.display = 'none';
                    toast(t('toast.versionRestored'));
                    await openNote(currentNoteId);
                } catch(e){}
            });
        });
    } catch(e) {
        listEl.innerHTML = ''; emptyEl.style.display = 'block';
    }
}

document.getElementById('history-btn').addEventListener('click', showHistory);
document.getElementById('sheet-history-btn').addEventListener('click', showHistory);
document.getElementById('history-close-btn').addEventListener('click', function() {
    document.getElementById('history-overlay').style.display = 'none';
});

/* ==================== Markdown Preview ==================== */
function parseMarkdown(src) {
    var lines = src.split('\n');
    var html = '', inCode = false, codeLang = '', codeLines = [];
    var inList = false, listType = '', inBlockquote = false;
    var inTable = false, tableRows = [];

    function closeList() { if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; } }
    function closeBlockquote() { if (inBlockquote) { html += '</blockquote>'; inBlockquote = false; } }
    function closeTable() {
        if (inTable && tableRows.length) {
            html += '<table>';
            tableRows.forEach(function(row, ri) {
                if (ri === 1 && /^[\s|:-]+$/.test(row)) return; // separator row
                var cells = row.replace(/^\||\|$/g, '').split('|');
                var tag = ri === 0 ? 'th' : 'td';
                html += '<tr>';
                cells.forEach(function(c) { html += '<' + tag + '>' + inlineMarkdown(c.trim()) + '</' + tag + '>'; });
                html += '</tr>';
            });
            html += '</table>';
        }
        inTable = false; tableRows = [];
    }

    function inlineMarkdown(text) {
        // images
        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
        // links
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        // bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // italic
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // inline code
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        return text;
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Code blocks
        if (line.match(/^```/)) {
            if (inCode) {
                html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>';
                inCode = false; codeLines = [];
            } else {
                closeList(); closeBlockquote(); closeTable();
                inCode = true; codeLang = line.slice(3).trim(); codeLines = [];
            }
            continue;
        }
        if (inCode) { codeLines.push(line); continue; }

        // Horizontal rule
        if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
            closeList(); closeBlockquote(); closeTable();
            html += '<hr>'; continue;
        }

        // Table rows
        if (line.trim().indexOf('|') >= 0 && line.trim().charAt(0) === '|') {
            closeList(); closeBlockquote();
            if (!inTable) { inTable = true; tableRows = []; }
            tableRows.push(line.trim());
            continue;
        } else if (inTable) { closeTable(); }

        // Headings
        var hm = line.match(/^(#{1,6})\s+(.*)$/);
        if (hm) {
            closeList(); closeBlockquote(); closeTable();
            var level = hm[1].length;
            html += '<h' + level + '>' + inlineMarkdown(hm[2]) + '</h' + level + '>';
            continue;
        }

        // Blockquote
        if (line.match(/^>\s?/)) {
            closeList(); closeTable();
            if (!inBlockquote) { html += '<blockquote>'; inBlockquote = true; }
            html += '<p>' + inlineMarkdown(line.replace(/^>\s?/, '')) + '</p>';
            continue;
        } else if (inBlockquote) { closeBlockquote(); }

        // Unordered list
        var ulMatch = line.match(/^[\s]*[-*+]\s+(.*)/);
        if (ulMatch) {
            closeBlockquote(); closeTable();
            if (!inList || listType !== 'ul') { closeList(); html += '<ul>'; inList = true; listType = 'ul'; }
            html += '<li>' + inlineMarkdown(ulMatch[1]) + '</li>';
            continue;
        }

        // Ordered list
        var olMatch = line.match(/^[\s]*\d+\.\s+(.*)/);
        if (olMatch) {
            closeBlockquote(); closeTable();
            if (!inList || listType !== 'ol') { closeList(); html += '<ol>'; inList = true; listType = 'ol'; }
            html += '<li>' + inlineMarkdown(olMatch[1]) + '</li>';
            continue;
        }

        if (inList) closeList();

        // Empty line
        if (!line.trim()) { html += ''; continue; }

        // Paragraph
        html += '<p>' + inlineMarkdown(line) + '</p>';
    }
    if (inCode) html += '<pre><code>' + esc(codeLines.join('\n')) + '</code></pre>';
    closeList(); closeBlockquote(); closeTable();
    return html;
}

function renderMarkdownPreview() {
    var content = document.getElementById('note-content').value || '';
    document.getElementById('md-preview').innerHTML = parseMarkdown(content);
}

document.getElementById('md-toggle-btn').addEventListener('click', function() {
    var textarea = document.getElementById('note-content');
    var preview = document.getElementById('md-preview');
    var btn = document.getElementById('md-toggle-btn');
    if (mdMode === 'edit') {
        mdMode = 'preview';
        textarea.style.display = 'none';
        preview.style.display = 'block';
        btn.classList.add('active');
        renderMarkdownPreview();
    } else if (mdMode === 'preview') {
        mdMode = 'split';
        textarea.style.display = '';
        preview.style.display = 'block';
        textarea.style.width = '50%';
        preview.style.width = '50%';
        preview.style.position = 'absolute';
        preview.style.right = '0';
        preview.style.top = '0';
        preview.style.bottom = '0';
        preview.style.overflow = 'auto';
        renderMarkdownPreview();
    } else {
        mdMode = 'edit';
        textarea.style.display = '';
        textarea.style.width = '';
        preview.style.display = 'none';
        preview.style.width = '';
        preview.style.position = '';
        preview.style.right = '';
        preview.style.top = '';
        preview.style.bottom = '';
        btn.classList.remove('active');
    }
});

/* ==================== Image Upload (Paste) ==================== */
document.getElementById('note-content').addEventListener('paste', async function(e) {
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') >= 0) {
            e.preventDefault();
            var file = items[i].getAsFile();
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { toast(t('toast.imageTooLarge')); return; }
            var fd = new FormData();
            fd.append('file', file, file.name || 'paste.png');
            try {
                var res = await fetch('/api/upload', { method: 'POST', body: fd });
                var data = await res.json();
                if (!res.ok) throw new Error(data.error || 'upload failed');
                var textarea = document.getElementById('note-content');
                var start = textarea.selectionStart;
                var end = textarea.selectionEnd;
                var text = textarea.value;
                var insert = '![image](' + data.url + ')';
                textarea.value = text.substring(0, start) + insert + text.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + insert.length;
                textarea.dispatchEvent(new Event('input'));
                toast(t('toast.imageUploaded'));
            } catch(ex) {
                toast(t('save.failed'));
            }
            return;
        }
    }
});

/* ==================== Print ==================== */
document.getElementById('print-btn').addEventListener('click', function() { window.print(); });
document.getElementById('sheet-print-btn').addEventListener('click', function() { window.print(); });

/* ==================== Mobile Nav ==================== */
function goBack() { if (saveTimer){clearTimeout(saveTimer);saveTimer=null;saveCurrent();} document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); }
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('sheet-back-btn').addEventListener('click', goBack);
document.getElementById('menu-btn').addEventListener('click', function() {
    var sb = document.getElementById('sidebar'); sb.classList.toggle('hidden');
    if (!sb.classList.contains('hidden') && isMobile) document.getElementById('editor').classList.remove('visible');
});

/* ==================== Dropdowns ==================== */
function closeDropdowns(){document.querySelectorAll('.dropdown.open').forEach(function(d){d.classList.remove('open');});}
document.querySelectorAll('.dropdown').forEach(function(dd) {
    var trigger = dd.querySelector('.primary-btn, .ico-btn, .sm-btn');
    if (trigger) trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var w = dd.classList.contains('open');
        closeDropdowns();
        if (!w) {
            dd.classList.add('open');
            // Refresh tag dropdown content when opening
            if (dd.id === 'tag-dropdown') renderNoteTagsDropdown();
        }
    });
});
document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown')) closeDropdowns();
});

/* ==================== Storage ==================== */
async function loadStorage() {
    try { var d = await api('GET', '/api/storage');
        document.getElementById('storage-info').textContent = (d.used/1024/1024).toFixed(1)+' MB / '+(d.limit/1024/1024/1024).toFixed(0)+' GB';
        var pct = Math.min(d.used/d.limit*100,100); var fill = document.getElementById('st-bar-fill');
        fill.style.width = pct+'%'; fill.style.background = pct>80?'var(--dn)':pct>60?'#f59e0b':'var(--p)';
    } catch(e){}
}

/* ==================== Spreadsheet with Formulas ==================== */
var Sheet = {
    data:[], colWidths:[], container:null,
    init:function(c,sd){
        this.container=c;
        this.data=sd.data||[['','',''],['','',''],['','','']];
        this.colWidths=sd.colWidths||[];
        while(this.colWidths.length<(this.data[0]||[]).length) this.colWidths.push(150);
        this.render();
    },
    render:function(){
        if(!this.container)return;
        var cols=(this.data[0]||[]).length,rows=this.data.length;
        var h='<table class="sheet-table"><thead><tr><th class="corner"></th>';
        for(var c=0;c<cols;c++) h+='<th style="min-width:'+this.colWidths[c]+'px">'+this.colLabel(c)+'</th>';
        h+='</tr></thead><tbody>';
        for(var r=0;r<rows;r++){
            h+='<tr><td class="row-hdr">'+(r+1)+'</td>';
            for(var c2=0;c2<cols;c2++){
                var raw = this.data[r][c2]||'';
                var display = this.evalFormula(raw, r, c2);
                h+='<td><div class="cell" contenteditable="true" data-r="'+r+'" data-c="'+c2+'">'+esc(display)+'</div></td>';
            }
            h+='</tr>';
        }
        h+='</tbody></table>';
        this.container.innerHTML=h;
        var self=this;
        this.container.querySelectorAll('.cell').forEach(function(cell){
            cell.addEventListener('focus', function(){
                var r=parseInt(cell.getAttribute('data-r')),c=parseInt(cell.getAttribute('data-c'));
                var raw=self.data[r][c]||'';
                cell.textContent=raw; // Show formula when editing
            });
            cell.addEventListener('blur', function(){
                var r=parseInt(cell.getAttribute('data-r')),c=parseInt(cell.getAttribute('data-c'));
                self.data[r][c]=cell.textContent;
                var display=self.evalFormula(cell.textContent,r,c);
                cell.textContent=display;
                self.recalcAll();
                scheduleSave();
            });
            cell.addEventListener('input',function(){
                // No-op during editing, save on blur
            });
            cell.addEventListener('keydown',function(e){
                var r=parseInt(cell.getAttribute('data-r')),c=parseInt(cell.getAttribute('data-c'));
                if(e.key==='Tab'){e.preventDefault();cell.blur();self.focusCell(r,e.shiftKey?c-1:c+1);}
                else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();cell.blur();self.focusCell(r+1,c);}
                else if(e.key==='ArrowDown'&&isAtEnd(cell)){e.preventDefault();cell.blur();self.focusCell(r+1,c);}
                else if(e.key==='ArrowUp'&&isAtStart(cell)){e.preventDefault();cell.blur();self.focusCell(r-1,c);}
            });
        });
    },
    colLabel:function(c){
        var s='';
        while(true){s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26)-1;if(c<0)break;}
        return s;
    },
    focusCell:function(r,c){
        var cols=(this.data[0]||[]).length,rows=this.data.length;
        if(r<0||r>=rows||c<0||c>=cols)return;
        var cell=this.container.querySelector('.cell[data-r="'+r+'"][data-c="'+c+'"]');
        if(cell)cell.focus();
    },
    addRow:function(){var cols=(this.data[0]||[]).length||3;var row=[];for(var i=0;i<cols;i++)row.push('');this.data.push(row);this.render();scheduleSave();},
    addCol:function(){this.data.forEach(function(r){r.push('');});this.colWidths.push(150);this.render();scheduleSave();},
    delRow:function(){if(this.data.length>1){this.data.pop();this.render();scheduleSave();}},
    delCol:function(){if((this.data[0]||[]).length>1){this.data.forEach(function(r){r.pop();});this.colWidths.pop();this.render();scheduleSave();}},
    getData:function(){return{data:this.data,colWidths:this.colWidths};},
    // Parse cell reference like A1, B12 etc.
    parseRef:function(ref){
        var m=ref.match(/^([A-Z]+)(\d+)$/);
        if(!m)return null;
        var col=0,letters=m[1];
        for(var i=0;i<letters.length;i++) col=col*26+(letters.charCodeAt(i)-64);
        col--;
        var row=parseInt(m[2])-1;
        return{r:row,c:col};
    },
    // Get cell value as number (resolving formulas)
    getCellVal:function(r,c){
        if(r<0||r>=this.data.length||c<0||c>=(this.data[0]||[]).length) return 0;
        var raw=this.data[r][c]||'';
        if(raw.charAt(0)==='=') {
            var v=this.evalFormula(raw,r,c);
            var n=parseFloat(v);
            return isNaN(n)?0:n;
        }
        var n2=parseFloat(raw);
        return isNaN(n2)?0:n2;
    },
    // Parse a range like A1:B3
    parseRange:function(rangeStr){
        var parts=rangeStr.split(':');
        if(parts.length!==2) return [];
        var start=this.parseRef(parts[0].trim());
        var end=this.parseRef(parts[1].trim());
        if(!start||!end)return[];
        var vals=[];
        for(var r=Math.min(start.r,end.r);r<=Math.max(start.r,end.r);r++){
            for(var c=Math.min(start.c,end.c);c<=Math.max(start.c,end.c);c++){
                vals.push(this.getCellVal(r,c));
            }
        }
        return vals;
    },
    evalFormula:function(raw,rowCtx,colCtx){
        if(!raw||raw.charAt(0)!=='=') return raw;
        try{
            var expr=raw.substring(1).trim().toUpperCase();
            // SUM(range)
            var sumMatch=expr.match(/^SUM\(([^)]+)\)$/);
            if(sumMatch){var vals=this.parseRange(sumMatch[1]);return String(vals.reduce(function(a,b){return a+b;},0));}
            // AVG(range)
            var avgMatch=expr.match(/^AVG\(([^)]+)\)$/);
            if(avgMatch){var vals2=this.parseRange(avgMatch[1]);return vals2.length?String(vals2.reduce(function(a,b){return a+b;},0)/vals2.length):'0';}
            // COUNT(range)
            var cntMatch=expr.match(/^COUNT\(([^)]+)\)$/);
            if(cntMatch){return String(this.parseRange(cntMatch[1]).length);}
            // MIN(range)
            var minMatch=expr.match(/^MIN\(([^)]+)\)$/);
            if(minMatch){var vals3=this.parseRange(minMatch[1]);return vals3.length?String(Math.min.apply(null,vals3)):'0';}
            // MAX(range)
            var maxMatch=expr.match(/^MAX\(([^)]+)\)$/);
            if(maxMatch){var vals4=this.parseRange(maxMatch[1]);return vals4.length?String(Math.max.apply(null,vals4)):'0';}
            // Simple arithmetic with cell refs: replace A1 etc. with values
            var self=this;
            var replaced=expr.replace(/([A-Z]+)(\d+)/g, function(match){
                var ref=self.parseRef(match);
                if(!ref)return '0';
                // Prevent self-reference
                if(ref.r===rowCtx&&ref.c===colCtx)return '0';
                return String(self.getCellVal(ref.r,ref.c));
            });
            // Evaluate safe arithmetic (only numbers, +, -, *, /, (, ), .)
            if(/^[0-9+\-*/().eE\s]+$/.test(replaced)){
                var result=Function('"use strict";return('+replaced+')')();
                if(typeof result==='number'&&isFinite(result)) return String(Math.round(result*1000000)/1000000);
            }
            return '#ERR';
        }catch(e){return '#ERR';}
    },
    recalcAll:function(){
        if(!this.container)return;
        var self=this;
        this.container.querySelectorAll('.cell').forEach(function(cell){
            if(document.activeElement===cell) return; // Skip actively edited cell
            var r=parseInt(cell.getAttribute('data-r')),c=parseInt(cell.getAttribute('data-c'));
            var raw=self.data[r][c]||'';
            cell.textContent=self.evalFormula(raw,r,c);
        });
    }
};

function isAtEnd(el){var s=window.getSelection();return s.rangeCount&&s.getRangeAt(0).endOffset>=(el.textContent||'').length;}
function isAtStart(el){var s=window.getSelection();return s.rangeCount&&s.getRangeAt(0).startOffset===0;}
document.getElementById('sheet-add-row').addEventListener('click',function(){Sheet.addRow();});
document.getElementById('sheet-add-col').addEventListener('click',function(){Sheet.addCol();});
document.getElementById('sheet-del-row').addEventListener('click',function(){Sheet.delRow();});
document.getElementById('sheet-del-col').addEventListener('click',function(){Sheet.delCol();});

/* ==================== Keyboard Shortcuts ==================== */
document.getElementById('shortcuts-close-btn').addEventListener('click', function() {
    document.getElementById('shortcuts-overlay').style.display = 'none';
});

document.addEventListener('keydown', function(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var isInput = (tag === 'input' || tag === 'textarea' || e.target.isContentEditable);

    // Escape: close modals
    if (e.key === 'Escape') {
        var closed = false;
        ['history-overlay','shortcuts-overlay','conflict-overlay'].forEach(function(id){
            var el = document.getElementById(id);
            if (el && el.style.display !== 'none') { el.style.display = 'none'; closed = true; }
        });
        if (closed) return;
        if (isMobile && currentNoteId) { goBack(); return; }
    }

    // ? key to show shortcuts (not in input)
    if (e.key === '?' && !isInput) {
        var overlay = document.getElementById('shortcuts-overlay');
        overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    // Ctrl+N: new text note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        document.querySelector('[data-action="new-text"]').click();
        return;
    }

    // Ctrl+Shift+N: new spreadsheet
    if ((e.ctrlKey || e.metaKey) && e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        document.querySelector('[data-action="new-sheet"]').click();
        return;
    }

    // Ctrl+S: save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        saveCurrent();
        return;
    }

    // Ctrl+F: focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search-input').focus();
        return;
    }

    // Ctrl+P: print
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
        return;
    }
});

/* ==================== Utilities ==================== */
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function fmtDate(ds){
    if(!ds)return '';var d=new Date(ds.replace(' ','T')+'Z'),now=new Date();if(isNaN(d.getTime()))return ds;
    var diff=Math.floor((now-d)/60000);
    if(diff<1)return t('time.justNow');if(diff<60)return t('time.minAgo',diff);
    if(d.toDateString()===now.toDateString())return d.toLocaleTimeString(curLang==='en'?'en-US':'zh-CN',{hour:'2-digit',minute:'2-digit'});
    var y=new Date(now);y.setDate(y.getDate()-1);
    if(d.toDateString()===y.toDateString())return t('time.yesterday');
    return d.toLocaleDateString(curLang==='en'?'en-US':curLang==='zh-TW'?'zh-TW':'zh-CN',{month:'short',day:'numeric'});
}

/* ==================== Responsive ==================== */
window.addEventListener('resize',function(){
    var w=isMobile;
    isMobile=window.innerWidth<=768;
    if(w&&!isMobile){
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('editor').classList.remove('visible');
    }
});

/* ==================== PWA ==================== */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
}

/* ==================== Start ==================== */
init();
