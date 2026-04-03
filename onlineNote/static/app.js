/* ==================== State ==================== */
var currentNoteId = null, currentNoteType = 'text', notes = [], folders = [];
var selectedFolder = 'all'; // 'all', 'unfiled', or folder id number
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
    try { var d = await api('GET', '/api/check'); if (d.ok) showApp(d.username); else showLogin(); }
    catch (e) { showLogin(); }
}

/* ==================== Auth ==================== */
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = document.getElementById('login-btn');
    var u = document.getElementById('username').value.trim(), p = document.getElementById('password').value;
    if (!u || !p) return;
    btn.disabled = true; btn.textContent = 'Signing in...';
    document.getElementById('login-error').textContent = '';
    try { var d = await api('POST', '/api/login', {username:u, password:p}); showApp(d.username); toast('Welcome, ' + d.username); }
    catch (err) { document.getElementById('login-error').textContent = 'Invalid username or password'; }
    finally { btn.disabled = false; btn.textContent = 'Sign In'; }
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
        '<span>All Notes</span><span class="f-count">' + allCount + '</span></div>';
    html += '<div class="folder-item' + (selectedFolder === 'unfiled' ? ' active' : '') + '" data-f="unfiled">' +
        '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zm14 4H2v6a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>' +
        '<span>Unfiled</span><span class="f-count">' + unfiledCount + '</span></div>';
    folders.forEach(function(f) {
        var cnt = notes.filter(function(n){return n.folder_id === f.id;}).length;
        html += '<div class="folder-item' + (selectedFolder === f.id ? ' active' : '') + '" data-f="' + f.id + '">' +
            '<svg class="f-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>' +
            '<span>' + esc(f.name) + '</span><span class="f-count">' + cnt + '</span>' +
            '<button class="f-del" data-fid="' + f.id + '" title="Delete folder"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg></button></div>';
    });
    el.innerHTML = html;
    // Events
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
            if (!confirm('Delete this folder? Notes will be moved to Unfiled.')) return;
            try { await api('DELETE', '/api/folders/' + btn.getAttribute('data-fid'));
                selectedFolder = 'all'; await loadFolders(); await loadNotes(); toast('Folder deleted'); } catch(e){}
        });
    });
}

document.getElementById('add-folder-btn').addEventListener('click', async function() {
    var name = prompt('Folder name:');
    if (!name || !name.trim()) return;
    try { await api('POST', '/api/folders', {name: name.trim()}); await loadFolders(); toast('Folder created'); } catch(e){}
});

/* ==================== Notes List ==================== */
async function loadNotes() {
    try { var d = await api('GET', '/api/notes'); notes = d.notes; renderNotes(); renderFolders();
        document.getElementById('note-count').textContent = notes.length + ' note' + (notes.length !== 1 ? 's' : ''); } catch(e){}
}
function renderNotes(filter) {
    var list = document.getElementById('notes-list'); list.innerHTML = '';
    var filtered = notes;
    if (selectedFolder === 'unfiled') filtered = notes.filter(function(n){return n.folder_id === null;});
    else if (typeof selectedFolder === 'number') filtered = notes.filter(function(n){return n.folder_id === selectedFolder;});
    if (filter) { var f = filter.toLowerCase(); filtered = filtered.filter(function(n){ return n.title.toLowerCase().includes(f) || n.preview.toLowerCase().includes(f); }); }
    if (filtered.length === 0) { list.innerHTML = '<div style="padding:32px 12px;text-align:center;color:var(--tm);font-size:12px">' + (notes.length ? 'No matching notes' : 'No notes yet') + '</div>'; return; }
    filtered.forEach(function(n) {
        var item = document.createElement('div');
        item.className = 'note-item' + (n.id === currentNoteId ? ' active' : '');
        var typeClass = n.note_type === 'sheet' ? 't-sheet' : 't-text';
        var typeLabel = n.note_type === 'sheet' ? 'Sheet' : 'Text';
        var preview = n.note_type === 'sheet' ? 'Spreadsheet' : esc(n.preview);
        item.innerHTML = '<div class="ni-top"><span class="ni-type ' + typeClass + '">' + typeLabel + '</span><span class="ni-title">' + esc(n.title || 'Untitled') + '</span></div>' +
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
        if (currentNoteType === 'sheet') showSheetEditor(d);
        else showTextEditor(d);
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
    setSaveStatus('save-status', '');
    updateCharCount(d.content);
    buildMoveMenu('move-menu');
}

function showSheetEditor(d) {
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('text-editor').style.display = 'none';
    document.getElementById('sheet-editor').style.display = 'flex';
    document.getElementById('sheet-title').value = d.title;
    setSaveStatus('sheet-save-status', '');
    buildMoveMenu('sheet-move-menu');
    var sheetData;
    try { sheetData = JSON.parse(d.content); } catch(e) { sheetData = {data: [['', '', ''], ['', '', ''], ['', '', '']], colWidths: [150, 150, 150]}; }
    Sheet.init(document.getElementById('sheet-wrap'), sheetData);
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
    var html = '<button data-mv="0">Unfiled</button>';
    folders.forEach(function(f) { html += '<button data-mv="' + f.id + '">' + esc(f.name) + '</button>'; });
    el.innerHTML = html;
    el.querySelectorAll('button').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            if (!currentNoteId) return;
            closeDropdowns();
            try { await api('PUT', '/api/notes/' + currentNoteId + '/move', {folder_id: parseInt(btn.getAttribute('data-mv'))});
                await loadNotes(); await loadFolders(); toast('Note moved'); } catch(e){}
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
        if (action === 'new-text') { title = 'New Note'; content = ''; noteType = 'text'; }
        else if (action === 'new-sheet') { title = 'New Sheet'; content = JSON.stringify({data: mkEmpty(5, 4), colWidths: [150,200,200,200,150]}); noteType = 'sheet'; }
        else if (action === 'tpl-daily') {
            var today = new Date().toISOString().slice(0,10);
            title = 'Daily Report - ' + today;
            var data = [['Project','Today\'s Work','Tomorrow\'s Plan','Progress','Notes'],['','','','',''],['','','','',''],['','','','',''],['','','','','']];
            content = JSON.stringify({data: data, colWidths: [120,220,220,100,160]}); noteType = 'sheet';
        } else if (action === 'tpl-weekly') {
            var wk = getWeekStr();
            title = 'Weekly Report - ' + wk;
            var data = [['Project','This Week','Next Week','Completion','Risks/Issues'],['','','','',''],['','','','',''],['','','','',''],['','','','','']];
            content = JSON.stringify({data: data, colWidths: [120,220,220,110,180]}); noteType = 'sheet';
        }
        try {
            var d = await api('POST', '/api/notes', {title:title, content:content, folder_id:folderId, note_type:noteType});
            await loadNotes(); openNote(d.id); toast('Created');
        } catch(e) { if (e.message.includes('storage')) toast('Storage limit!'); }
    });
});

function mkEmpty(cols, rows) { var d = []; for (var r = 0; r < rows; r++) { var row = []; for (var c = 0; c < cols; c++) row.push(''); d.push(row); } return d; }
function getWeekStr() { var d = new Date(), day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); var s = d.toISOString().slice(0,10); d.setDate(d.getDate()+6); return s + ' ~ ' + d.toISOString().slice(0,10); }

/* ==================== Save ==================== */
function setSaveStatus(elId, status) {
    var el = document.getElementById(elId);
    el.className = ''; el.textContent = '';
    if (status === 'saving') { el.textContent = 'Saving...'; el.className = 'ss-saving'; }
    else if (status === 'saved') { el.textContent = 'Saved'; el.className = 'ss-saved'; }
    else if (status === 'error') { el.textContent = 'Failed'; el.className = 'ss-err'; }
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
    if (currentNoteType === 'sheet') {
        title = document.getElementById('sheet-title').value;
        content = JSON.stringify(Sheet.getData());
        sid = 'sheet-save-status';
    } else {
        title = document.getElementById('note-title').value;
        content = document.getElementById('note-content').value;
        sid = 'save-status';
    }
    try {
        await api('PUT', '/api/notes/' + currentNoteId, {title:title, content:content});
        setSaveStatus(sid, 'saved');
        var n = notes.find(function(x){return x.id === currentNoteId;});
        if (n) { n.title = title; n.preview = currentNoteType === 'sheet' ? '' : content.substring(0,100); n.updated_at = new Date().toISOString().replace('T',' ').substring(0,19); }
        renderNotes(document.getElementById('search-input').value);
        loadStorage();
        setTimeout(function() { var el = document.getElementById(sid); if (el && el.textContent === 'Saved') setSaveStatus(sid, ''); }, 3000);
    } catch(e) { setSaveStatus(sid, 'error'); }
}

/* Text editor events */
document.getElementById('note-title').addEventListener('input', scheduleSave);
document.getElementById('note-content').addEventListener('input', function() { scheduleSave(); updateCharCount(this.value); });
document.getElementById('sheet-title').addEventListener('input', scheduleSave);

function updateCharCount(t) {
    var el = document.getElementById('char-count');
    if (!t) { el.textContent = ''; return; }
    el.textContent = t.length >= 1000 ? (t.length/1000).toFixed(1) + 'k chars' : t.length + ' chars';
}

/* ==================== Delete ==================== */
async function deleteCurrentNote() {
    if (!currentNoteId || !confirm('Delete this note?')) return;
    try { await api('DELETE', '/api/notes/' + currentNoteId); hideEditors(); await loadNotes(); loadStorage(); toast('Deleted');
        if (isMobile) { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); } } catch(e){}
}
document.getElementById('del-btn').addEventListener('click', deleteCurrentNote);
document.getElementById('sheet-del-btn').addEventListener('click', deleteCurrentNote);

/* ==================== Mobile Nav ==================== */
function goBack() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveCurrent(); }
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('editor').classList.remove('visible');
}
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('sheet-back-btn').addEventListener('click', goBack);
document.getElementById('menu-btn').addEventListener('click', function() {
    var sb = document.getElementById('sidebar'); sb.classList.toggle('hidden');
    if (!sb.classList.contains('hidden') && isMobile) document.getElementById('editor').classList.remove('visible');
});

/* ==================== Dropdowns ==================== */
function closeDropdowns() { document.querySelectorAll('.dropdown.open').forEach(function(d){d.classList.remove('open');}); }
document.querySelectorAll('.dropdown').forEach(function(dd) {
    var trigger = dd.querySelector('.primary-btn, .ico-btn');
    if (trigger) trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var wasOpen = dd.classList.contains('open');
        closeDropdowns();
        if (!wasOpen) dd.classList.add('open');
    });
});
document.addEventListener('click', closeDropdowns);

/* ==================== Storage ==================== */
async function loadStorage() {
    try { var d = await api('GET', '/api/storage');
        document.getElementById('storage-info').textContent = (d.used/1024/1024).toFixed(1) + ' MB / ' + (d.limit/1024/1024/1024).toFixed(0) + ' GB';
        var pct = Math.min(d.used/d.limit*100, 100); var fill = document.getElementById('st-bar-fill');
        fill.style.width = pct + '%'; fill.style.background = pct > 80 ? 'var(--dn)' : pct > 60 ? '#f59e0b' : 'var(--p)';
    } catch(e){}
}

/* ==================== Spreadsheet Engine ==================== */
var Sheet = {
    data: [], colWidths: [], container: null,
    init: function(container, sd) {
        this.container = container;
        this.data = sd.data || [['','',''],['','',''],['','','']];
        this.colWidths = sd.colWidths || [];
        while (this.colWidths.length < (this.data[0]||[]).length) this.colWidths.push(150);
        this.render();
    },
    render: function() {
        if (!this.container) return;
        var cols = (this.data[0]||[]).length, rows = this.data.length;
        var html = '<table class="sheet-table"><thead><tr><th class="corner"></th>';
        for (var c = 0; c < cols; c++) html += '<th style="min-width:' + this.colWidths[c] + 'px">' + String.fromCharCode(65+c) + '</th>';
        html += '</tr></thead><tbody>';
        for (var r = 0; r < rows; r++) {
            html += '<tr><td class="row-hdr">' + (r+1) + '</td>';
            for (var c2 = 0; c2 < cols; c2++) {
                html += '<td><div class="cell" contenteditable="true" data-r="' + r + '" data-c="' + c2 + '">' + esc(this.data[r][c2] || '') + '</div></td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        this.container.innerHTML = html;
        var self = this;
        this.container.querySelectorAll('.cell').forEach(function(cell) {
            cell.addEventListener('input', function() {
                var r = parseInt(cell.getAttribute('data-r')), c = parseInt(cell.getAttribute('data-c'));
                self.data[r][c] = cell.textContent;
                scheduleSave();
            });
            cell.addEventListener('keydown', function(e) {
                var r = parseInt(cell.getAttribute('data-r')), c = parseInt(cell.getAttribute('data-c'));
                if (e.key === 'Tab') { e.preventDefault(); self.focusCell(r, e.shiftKey ? c-1 : c+1); }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.focusCell(r+1, c); }
                else if (e.key === 'ArrowDown' && isAtEnd(cell)) { e.preventDefault(); self.focusCell(r+1, c); }
                else if (e.key === 'ArrowUp' && isAtStart(cell)) { e.preventDefault(); self.focusCell(r-1, c); }
            });
        });
    },
    focusCell: function(r, c) {
        var cols = (this.data[0]||[]).length, rows = this.data.length;
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        var cell = this.container.querySelector('.cell[data-r="'+r+'"][data-c="'+c+'"]');
        if (cell) cell.focus();
    },
    addRow: function() {
        var cols = (this.data[0]||[]).length || 3;
        var row = []; for (var i = 0; i < cols; i++) row.push('');
        this.data.push(row); this.render(); scheduleSave();
    },
    addCol: function() {
        this.data.forEach(function(row){ row.push(''); });
        this.colWidths.push(150); this.render(); scheduleSave();
    },
    delRow: function() { if (this.data.length > 1) { this.data.pop(); this.render(); scheduleSave(); } },
    delCol: function() {
        if ((this.data[0]||[]).length > 1) {
            this.data.forEach(function(row){ row.pop(); }); this.colWidths.pop(); this.render(); scheduleSave();
        }
    },
    getData: function() { return { data: this.data, colWidths: this.colWidths }; }
};

function isAtEnd(el) { var s = window.getSelection(); return s.rangeCount && s.getRangeAt(0).endOffset >= (el.textContent||'').length; }
function isAtStart(el) { var s = window.getSelection(); return s.rangeCount && s.getRangeAt(0).startOffset === 0; }

document.getElementById('sheet-add-row').addEventListener('click', function(){ Sheet.addRow(); });
document.getElementById('sheet-add-col').addEventListener('click', function(){ Sheet.addCol(); });
document.getElementById('sheet-del-row').addEventListener('click', function(){ Sheet.delRow(); });
document.getElementById('sheet-del-col').addEventListener('click', function(){ Sheet.delCol(); });

/* ==================== Utilities ==================== */
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function fmtDate(ds) {
    if (!ds) return '';
    var d = new Date(ds.replace(' ','T')+'Z'), now = new Date();
    if (isNaN(d.getTime())) return ds;
    var diff = Math.floor((now-d)/60000);
    if (diff < 1) return 'Just now'; if (diff < 60) return diff + ' min ago';
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    var y = new Date(now); y.setDate(y.getDate()-1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
}

/* ==================== Responsive ==================== */
window.addEventListener('resize', function() {
    var was = isMobile; isMobile = window.innerWidth <= 768;
    if (was && !isMobile) { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('editor').classList.remove('visible'); }
});
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey||e.metaKey) && e.key === 's') { e.preventDefault(); if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } saveCurrent(); }
});

/* ==================== Start ==================== */
init();
