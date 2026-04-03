/* ==================== i18n ==================== */
var I18N = {
'en': {
    'app.title':'Online Notes','app.subtitle':'Your personal workspace','app.brand':'Notes',
    'login.username':'Username','login.password':'Password','login.submit':'Sign In','login.submitting':'Signing in...','login.error':'Invalid username or password',
    'header.logout':'Logout',
    'sidebar.new':'New','sidebar.textNote':'Text Note','sidebar.spreadsheet':'Spreadsheet','sidebar.dailyReport':'Daily Report','sidebar.weeklyReport':'Weekly Report',
    'sidebar.search':'Search...','sidebar.allNotes':'All Notes','sidebar.unfiled':'Unfiled','sidebar.newFolder':'+ New Folder',
    'sidebar.noteCount':'{0} notes',
    'editor.empty':'Select a note or create a new one','editor.untitled':'Untitled...','editor.startWriting':'Start writing...',
    'editor.addRow':'+ Row','editor.addCol':'+ Col','editor.delRow':'- Row','editor.delCol':'- Col',
    'editor.delete':'Delete','editor.back':'Back','editor.moveToFolder':'Move to folder',
    'save.saving':'Saving...','save.saved':'Saved','save.failed':'Failed',
    'toast.welcome':'Welcome, {0}','toast.created':'Created','toast.deleted':'Deleted','toast.noteMoved':'Note moved','toast.folderCreated':'Folder created','toast.folderDeleted':'Folder deleted','toast.storageLimit':'Storage limit!',
    'dialog.deleteNote':'Delete this note?','dialog.deleteFolder':'Delete this folder? Notes will be moved to Unfiled.','dialog.folderName':'Folder name:',
    'list.noMatch':'No matching notes','list.empty':'No notes yet','list.sheet':'Sheet','list.text':'Text','list.spreadsheet':'Spreadsheet',
    'time.justNow':'Just now','time.minAgo':'{0} min ago','time.yesterday':'Yesterday',
    'tpl.newNote':'New Note','tpl.newSheet':'New Sheet','tpl.dailyTitle':'Daily Report - {0}','tpl.weeklyTitle':'Weekly Report - {0}',
    'tpl.d.project':'Project','tpl.d.todayWork':"Today's Work","tpl.d.tomorrowPlan":"Tomorrow's Plan",'tpl.d.progress':'Progress','tpl.d.notes':'Notes',
    'tpl.w.project':'Project','tpl.w.thisWeek':'This Week','tpl.w.nextWeek':'Next Week','tpl.w.completion':'Completion','tpl.w.risks':'Risks/Issues',
    'chars':'{0} chars','kchars':'{0}k chars'
},
'zh-CN': {
    'app.title':'在线笔记','app.subtitle':'你的个人工作空间','app.brand':'笔记',
    'login.username':'用户名','login.password':'密码','login.submit':'登录','login.submitting':'登录中...','login.error':'用户名或密码错误',
    'header.logout':'退出登录',
    'sidebar.new':'新建','sidebar.textNote':'文本笔记','sidebar.spreadsheet':'电子表格','sidebar.dailyReport':'日报模板','sidebar.weeklyReport':'周报模板',
    'sidebar.search':'搜索...','sidebar.allNotes':'全部笔记','sidebar.unfiled':'未分类','sidebar.newFolder':'+ 新建文件夹',
    'sidebar.noteCount':'{0} 条笔记',
    'editor.empty':'选择一个笔记或创建新笔记','editor.untitled':'无标题...','editor.startWriting':'开始写作...',
    'editor.addRow':'+ 行','editor.addCol':'+ 列','editor.delRow':'- 行','editor.delCol':'- 列',
    'editor.delete':'删除','editor.back':'返回','editor.moveToFolder':'移动到文件夹',
    'save.saving':'保存中...','save.saved':'已保存','save.failed':'保存失败',
    'toast.welcome':'欢迎回来，{0}','toast.created':'已创建','toast.deleted':'已删除','toast.noteMoved':'笔记已移动','toast.folderCreated':'文件夹已创建','toast.folderDeleted':'文件夹已删除','toast.storageLimit':'存储空间已满！',
    'dialog.deleteNote':'确定删除这条笔记吗？','dialog.deleteFolder':'确定删除此文件夹吗？笔记将移至未分类。','dialog.folderName':'文件夹名称：',
    'list.noMatch':'没有匹配的笔记','list.empty':'暂无笔记','list.sheet':'表格','list.text':'文本','list.spreadsheet':'电子表格',
    'time.justNow':'刚刚','time.minAgo':'{0} 分钟前','time.yesterday':'昨天',
    'tpl.newNote':'新笔记','tpl.newSheet':'新表格','tpl.dailyTitle':'日报 - {0}','tpl.weeklyTitle':'周报 - {0}',
    'tpl.d.project':'项目','tpl.d.todayWork':'今日完成','tpl.d.tomorrowPlan':'明日计划','tpl.d.progress':'进度','tpl.d.notes':'备注',
    'tpl.w.project':'项目','tpl.w.thisWeek':'本周完成','tpl.w.nextWeek':'下周计划','tpl.w.completion':'完成度','tpl.w.risks':'风险/问题',
    'chars':'{0} 字符','kchars':'{0}k 字符'
},
'zh-TW': {
    'app.title':'線上筆記','app.subtitle':'你的個人工作空間','app.brand':'筆記',
    'login.username':'使用者名稱','login.password':'密碼','login.submit':'登入','login.submitting':'登入中...','login.error':'使用者名稱或密碼錯誤',
    'header.logout':'登出',
    'sidebar.new':'新增','sidebar.textNote':'文字筆記','sidebar.spreadsheet':'試算表','sidebar.dailyReport':'日報範本','sidebar.weeklyReport':'週報範本',
    'sidebar.search':'搜尋...','sidebar.allNotes':'全部筆記','sidebar.unfiled':'未分類','sidebar.newFolder':'+ 新增資料夾',
    'sidebar.noteCount':'{0} 條筆記',
    'editor.empty':'選擇一個筆記或建立新筆記','editor.untitled':'無標題...','editor.startWriting':'開始撰寫...',
    'editor.addRow':'+ 列','editor.addCol':'+ 欄','editor.delRow':'- 列','editor.delCol':'- 欄',
    'editor.delete':'刪除','editor.back':'返回','editor.moveToFolder':'移至資料夾',
    'save.saving':'儲存中...','save.saved':'已儲存','save.failed':'儲存失敗',
    'toast.welcome':'歡迎回來，{0}','toast.created':'已建立','toast.deleted':'已刪除','toast.noteMoved':'筆記已移動','toast.folderCreated':'資料夾已建立','toast.folderDeleted':'資料夾已刪除','toast.storageLimit':'儲存空間已滿！',
    'dialog.deleteNote':'確定刪除這條筆記嗎？','dialog.deleteFolder':'確定刪除此資料夾嗎？筆記將移至未分類。','dialog.folderName':'資料夾名稱：',
    'list.noMatch':'沒有符合的筆記','list.empty':'尚無筆記','list.sheet':'表格','list.text':'文字','list.spreadsheet':'試算表',
    'time.justNow':'剛才','time.minAgo':'{0} 分鐘前','time.yesterday':'昨天',
    'tpl.newNote':'新筆記','tpl.newSheet':'新表格','tpl.dailyTitle':'日報 - {0}','tpl.weeklyTitle':'週報 - {0}',
    'tpl.d.project':'專案','tpl.d.todayWork':'今日完成','tpl.d.tomorrowPlan':'明日計畫','tpl.d.progress':'進度','tpl.d.notes':'備註',
    'tpl.w.project':'專案','tpl.w.thisWeek':'本週完成','tpl.w.nextWeek':'下週計畫','tpl.w.completion':'完成度','tpl.w.risks':'風險/問題',
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
    // Sync both selectors
    document.getElementById('login-lang').value = curLang;
    document.getElementById('app-lang').value = curLang;
    // Re-render dynamic content if app is loaded
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
var currentNoteId = null, currentNoteType = 'text', notes = [], folders = [];
var selectedFolder = 'all';
var saveTimer = null, isMobile = window.innerWidth <= 768;

/* ==================== API ==================== */
async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    var data = await res.json();
    if (res.status === 401 && path !== '/api/login' && path !== '/api/check') { showLogin(); throw new Error('unauthorized'); }
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
    currentNoteId = null; notes = []; folders = [];
}
function showApp(username) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    document.getElementById('user-info').textContent = username;
    document.getElementById('user-av').textContent = username.charAt(0).toUpperCase();
    loadFolders(); loadNotes(); loadStorage();
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
    try { var d = await api('POST', '/api/login', {username:u, password:p}); showApp(d.username); toast(t('toast.welcome', d.username)); }
    catch (err) { document.getElementById('login-error').textContent = t('login.error'); }
    finally { btn.disabled = false; btn.textContent = t('login.submit'); }
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
        html += '<div class="folder-item' + (selectedFolder === f.id ? ' active' : '') + '" data-f="' + f.id + '">' +
            '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>' +
            '<span>' + esc(f.name) + '</span><span class="f-count">' + cnt + '</span>' +
            '<button class="f-del" data-fid="' + f.id + '" title="' + t('editor.delete') + '"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg></button></div>';
    });
    el.innerHTML = html;
    el.querySelectorAll('.folder-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (e.target.closest('.f-del')) return;
            var f = item.getAttribute('data-f');
            selectedFolder = (f === 'all' || f === 'unfiled') ? f : parseInt(f);
            renderFolders(); renderNotes();
        });
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

/* ==================== Notes List ==================== */
async function loadNotes() {
    try { var d = await api('GET', '/api/notes'); notes = d.notes; renderNotes(); renderFolders();
        document.getElementById('note-count').textContent = t('sidebar.noteCount', notes.length); } catch(e){}
}
function renderNotes(filter) {
    var list = document.getElementById('notes-list'); list.innerHTML = '';
    var filtered = notes;
    if (selectedFolder === 'unfiled') filtered = notes.filter(function(n){return n.folder_id === null;});
    else if (typeof selectedFolder === 'number') filtered = notes.filter(function(n){return n.folder_id === selectedFolder;});
    if (filter) { var f = filter.toLowerCase(); filtered = filtered.filter(function(n){ return n.title.toLowerCase().includes(f) || n.preview.toLowerCase().includes(f); }); }
    if (filtered.length === 0) { list.innerHTML = '<div style="padding:32px 12px;text-align:center;color:var(--tm);font-size:12px">' + (notes.length ? t('list.noMatch') : t('list.empty')) + '</div>'; return; }
    filtered.forEach(function(n) {
        var item = document.createElement('div');
        item.className = 'note-item' + (n.id === currentNoteId ? ' active' : '');
        var isSheet = n.note_type === 'sheet';
        var typeClass = isSheet ? 't-sheet' : 't-text';
        var typeLabel = isSheet ? t('list.sheet') : t('list.text');
        var preview = isSheet ? t('list.spreadsheet') : esc(n.preview);
        item.innerHTML = '<div class="ni-top"><span class="ni-type ' + typeClass + '">' + typeLabel + '</span><span class="ni-title">' + esc(n.title || t('editor.untitled')) + '</span></div>' +
            '<div class="ni-preview">' + preview + '</div><div class="ni-date">' + fmtDate(n.updated_at) + '</div>';
        item.addEventListener('click', function() { openNote(n.id); });
        list.appendChild(item);
    });
}
document.getElementById('search-input').addEventListener('input', function(e) { renderNotes(e.target.value); });

/* ==================== Open Note ==================== */
async function openNote(id) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveCurrent(); }
    try {
        var d = await api('GET', '/api/notes/' + id);
        currentNoteId = id; currentNoteType = d.note_type || 'text';
        if (currentNoteType === 'sheet') showSheetEditor(d); else showTextEditor(d);
        renderNotes(document.getElementById('search-input').value);
        if (isMobile) { document.getElementById('sidebar').classList.add('hidden'); document.getElementById('editor').classList.add('visible'); }
    } catch(e){}
}
function showTextEditor(d) {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'flex';
    document.getElementById('sheet-editor').style.display = 'none';
    document.getElementById('note-title').value = d.title;
    document.getElementById('note-content').value = d.content;
    setSaveStatus('save-status', ''); updateCharCount(d.content); buildMoveMenu('move-menu');
}
function showSheetEditor(d) {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'flex';
    document.getElementById('sheet-title').value = d.title;
    setSaveStatus('sheet-save-status', ''); buildMoveMenu('sheet-move-menu');
    var sd; try { sd = JSON.parse(d.content); } catch(e) { sd = {data:[['','',''],['','',''],['','','']], colWidths:[150,150,150]}; }
    Sheet.init(document.getElementById('sheet-wrap'), sd);
}
function hideEditors() {
    document.getElementById('editor-empty').style.display = 'flex';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'none';
    currentNoteId = null;
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
            var data = [[t('tpl.d.project'),t('tpl.d.todayWork'),t('tpl.d.tomorrowPlan'),t('tpl.d.progress'),t('tpl.d.notes')],['','','','',''],['','','','',''],['','','','',''],['','','','','']];
            content = JSON.stringify({data:data, colWidths:[120,220,220,100,160]}); noteType = 'sheet';
        } else if (action === 'tpl-weekly') {
            title = t('tpl.weeklyTitle', getWeekStr());
            var data = [[t('tpl.w.project'),t('tpl.w.thisWeek'),t('tpl.w.nextWeek'),t('tpl.w.completion'),t('tpl.w.risks')],['','','','',''],['','','','',''],['','','','',''],['','','','','']];
            content = JSON.stringify({data:data, colWidths:[120,220,220,110,180]}); noteType = 'sheet';
        }
        try { var d = await api('POST', '/api/notes', {title:title,content:content,folder_id:folderId,note_type:noteType});
            await loadNotes(); openNote(d.id); toast(t('toast.created'));
        } catch(e) { if (e.message.includes('storage')) toast(t('toast.storageLimit')); }
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
async function saveCurrent() {
    if (!currentNoteId) return;
    var title, content, sid;
    if (currentNoteType === 'sheet') { title = document.getElementById('sheet-title').value; content = JSON.stringify(Sheet.getData()); sid = 'sheet-save-status'; }
    else { title = document.getElementById('note-title').value; content = document.getElementById('note-content').value; sid = 'save-status'; }
    try {
        await api('PUT', '/api/notes/' + currentNoteId, {title:title, content:content});
        setSaveStatus(sid, 'saved');
        var n = notes.find(function(x){return x.id === currentNoteId;});
        if (n) { n.title = title; n.preview = currentNoteType === 'sheet' ? '' : content.substring(0,100); n.updated_at = new Date().toISOString().replace('T',' ').substring(0,19); }
        renderNotes(document.getElementById('search-input').value); loadStorage();
        setTimeout(function() { var el = document.getElementById(sid); if (el && el.textContent === t('save.saved')) setSaveStatus(sid, ''); }, 3000);
    } catch(e) { setSaveStatus(sid, 'error'); }
}

document.getElementById('note-title').addEventListener('input', scheduleSave);
document.getElementById('note-content').addEventListener('input', function() { scheduleSave(); updateCharCount(this.value); });
document.getElementById('sheet-title').addEventListener('input', scheduleSave);

function updateCharCount(txt) {
    var el = document.getElementById('char-count');
    if (!txt) { el.textContent = ''; return; }
    el.textContent = txt.length >= 1000 ? t('kchars', (txt.length/1000).toFixed(1)) : t('chars', txt.length);
}

/* ==================== Delete ==================== */
async function deleteCurrentNote() {
    if (!currentNoteId || !confirm(t('dialog.deleteNote'))) return;
    try { await api('DELETE', '/api/notes/' + currentNoteId); hideEditors(); await loadNotes(); loadStorage(); toast(t('toast.deleted'));
        if (isMobile) { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); } } catch(e){}
}
document.getElementById('del-btn').addEventListener('click', deleteCurrentNote);
document.getElementById('sheet-del-btn').addEventListener('click', deleteCurrentNote);

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
    var trigger = dd.querySelector('.primary-btn, .ico-btn');
    if (trigger) trigger.addEventListener('click', function(e) { e.stopPropagation(); var w=dd.classList.contains('open'); closeDropdowns(); if(!w)dd.classList.add('open'); });
});
document.addEventListener('click', closeDropdowns);

/* ==================== Storage ==================== */
async function loadStorage() {
    try { var d = await api('GET', '/api/storage');
        document.getElementById('storage-info').textContent = (d.used/1024/1024).toFixed(1)+' MB / '+(d.limit/1024/1024/1024).toFixed(0)+' GB';
        var pct = Math.min(d.used/d.limit*100,100); var fill = document.getElementById('st-bar-fill');
        fill.style.width = pct+'%'; fill.style.background = pct>80?'var(--dn)':pct>60?'#f59e0b':'var(--p)';
    } catch(e){}
}

/* ==================== Spreadsheet ==================== */
var Sheet = {
    data:[], colWidths:[], container:null,
    init:function(c,sd){this.container=c;this.data=sd.data||[['','',''],['','',''],['','','']];this.colWidths=sd.colWidths||[];while(this.colWidths.length<(this.data[0]||[]).length)this.colWidths.push(150);this.render();},
    render:function(){
        if(!this.container)return;var cols=(this.data[0]||[]).length,rows=this.data.length;
        var h='<table class="sheet-table"><thead><tr><th class="corner"></th>';
        for(var c=0;c<cols;c++)h+='<th style="min-width:'+this.colWidths[c]+'px">'+String.fromCharCode(65+c)+'</th>';
        h+='</tr></thead><tbody>';
        for(var r=0;r<rows;r++){h+='<tr><td class="row-hdr">'+(r+1)+'</td>';for(var c2=0;c2<cols;c2++)h+='<td><div class="cell" contenteditable="true" data-r="'+r+'" data-c="'+c2+'">'+esc(this.data[r][c2]||'')+'</div></td>';h+='</tr>';}
        h+='</tbody></table>';this.container.innerHTML=h;var self=this;
        this.container.querySelectorAll('.cell').forEach(function(cell){
            cell.addEventListener('input',function(){self.data[parseInt(cell.getAttribute('data-r'))][parseInt(cell.getAttribute('data-c'))]=cell.textContent;scheduleSave();});
            cell.addEventListener('keydown',function(e){var r=parseInt(cell.getAttribute('data-r')),c=parseInt(cell.getAttribute('data-c'));
                if(e.key==='Tab'){e.preventDefault();self.focusCell(r,e.shiftKey?c-1:c+1);}
                else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();self.focusCell(r+1,c);}
                else if(e.key==='ArrowDown'&&isAtEnd(cell)){e.preventDefault();self.focusCell(r+1,c);}
                else if(e.key==='ArrowUp'&&isAtStart(cell)){e.preventDefault();self.focusCell(r-1,c);}
            });
        });
    },
    focusCell:function(r,c){var cols=(this.data[0]||[]).length,rows=this.data.length;if(r<0||r>=rows||c<0||c>=cols)return;var cell=this.container.querySelector('.cell[data-r="'+r+'"][data-c="'+c+'"]');if(cell)cell.focus();},
    addRow:function(){var cols=(this.data[0]||[]).length||3;var row=[];for(var i=0;i<cols;i++)row.push('');this.data.push(row);this.render();scheduleSave();},
    addCol:function(){this.data.forEach(function(r){r.push('');});this.colWidths.push(150);this.render();scheduleSave();},
    delRow:function(){if(this.data.length>1){this.data.pop();this.render();scheduleSave();}},
    delCol:function(){if((this.data[0]||[]).length>1){this.data.forEach(function(r){r.pop();});this.colWidths.pop();this.render();scheduleSave();}},
    getData:function(){return{data:this.data,colWidths:this.colWidths};}
};
function isAtEnd(el){var s=window.getSelection();return s.rangeCount&&s.getRangeAt(0).endOffset>=(el.textContent||'').length;}
function isAtStart(el){var s=window.getSelection();return s.rangeCount&&s.getRangeAt(0).startOffset===0;}
document.getElementById('sheet-add-row').addEventListener('click',function(){Sheet.addRow();});
document.getElementById('sheet-add-col').addEventListener('click',function(){Sheet.addCol();});
document.getElementById('sheet-del-row').addEventListener('click',function(){Sheet.delRow();});
document.getElementById('sheet-del-col').addEventListener('click',function(){Sheet.delCol();});

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
window.addEventListener('resize',function(){var w=isMobile;isMobile=window.innerWidth<=768;if(w&&!isMobile){document.getElementById('sidebar').classList.remove('hidden');document.getElementById('editor').classList.remove('visible');}});
document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}saveCurrent();}});

/* ==================== Start ==================== */
init();
