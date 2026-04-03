// ==================== State ====================

let currentNoteId = null;
let notes = [];
let saveTimer = null;
let isMobile = window.innerWidth <= 768;

// ==================== API Helper ====================

async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const data = await res.json();
    if (res.status === 401 && path !== '/api/login' && path !== '/api/check') {
        showLogin();
        throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error(data.error || 'request failed');
    return data;
}

// ==================== Toast ====================

let toastTimer = null;
function showToast(msg, duration) {
    duration = duration || 2500;
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('show'); }, duration);
}

// ==================== Screens ====================

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-error').textContent = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    currentNoteId = null;
    notes = [];
}

function showApp(username) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    document.getElementById('user-info').textContent = username;
    document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
    loadNotes();
    loadStorage();
}

// ==================== Init ====================

async function init() {
    try {
        const data = await api('GET', '/api/check');
        if (data.ok) showApp(data.username);
        else showLogin();
    } catch (e) {
        showLogin();
    }
}

// ==================== Auth ====================

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = document.getElementById('login-btn');
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;

    if (!username || !password) return;

    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Signing in...';
    document.getElementById('login-error').textContent = '';

    try {
        var data = await api('POST', '/api/login', { username: username, password: password });
        showApp(data.username);
        showToast('Welcome back, ' + data.username);
    } catch (err) {
        document.getElementById('login-error').textContent = 'Invalid username or password';
        // Shake animation
        var card = document.querySelector('.login-card');
        card.style.animation = 'none';
        card.offsetHeight; // trigger reflow
        card.style.animation = 'shake 0.5s ease';
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'Sign In';
    }
});

// Add shake keyframe dynamically
var shakeStyle = document.createElement('style');
shakeStyle.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}';
document.head.appendChild(shakeStyle);

document.getElementById('logout-btn').addEventListener('click', async function() {
    try { await api('POST', '/api/logout'); } catch (e) {}
    showLogin();
});

// ==================== Notes List ====================

async function loadNotes() {
    try {
        var data = await api('GET', '/api/notes');
        notes = data.notes;
        renderNotesList();
        updateNoteCount();
    } catch (e) {}
}

function updateNoteCount() {
    var el = document.getElementById('note-count');
    el.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
}

function renderNotesList(filter) {
    var list = document.getElementById('notes-list');
    list.innerHTML = '';

    var filtered = notes;
    if (filter) {
        var f = filter.toLowerCase();
        filtered = notes.filter(function(n) {
            return n.title.toLowerCase().includes(f) || n.preview.toLowerCase().includes(f);
        });
    }

    if (filtered.length === 0) {
        var emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'padding:48px 16px;text-align:center;color:var(--text-muted);font-size:13px';
        emptyDiv.textContent = notes.length === 0 ? 'No notes yet. Create one!' : 'No matching notes';
        list.appendChild(emptyDiv);
        return;
    }

    filtered.forEach(function(note) {
        var item = document.createElement('div');
        item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
        item.innerHTML =
            '<div class="note-item-title">' + escapeHtml(note.title || 'Untitled') + '</div>' +
            '<div class="note-item-preview">' + escapeHtml(note.preview) + '</div>' +
            '<div class="note-item-date">' + formatDate(note.updated_at) + '</div>';
        item.addEventListener('click', function() { openNote(note.id); });
        list.appendChild(item);
    });
}

// ==================== Note Editor ====================

async function openNote(id) {
    // Save current note first
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await saveCurrentNote();
    }

    try {
        var data = await api('GET', '/api/notes/' + id);
        currentNoteId = id;
        document.getElementById('note-title').value = data.title;
        document.getElementById('note-content').value = data.content;
        document.getElementById('editor-empty').style.display = 'none';
        document.getElementById('editor-content').style.display = 'flex';
        updateSaveStatus('');
        updateCharCount(data.content);
        renderNotesList(document.getElementById('search-input').value);

        if (isMobile) {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('editor').classList.add('visible');
        }
    } catch (e) {}
}

document.getElementById('new-note-btn').addEventListener('click', async function() {
    try {
        var data = await api('POST', '/api/notes', { title: 'New Note', content: '' });
        await loadNotes();
        openNote(data.id);
        showToast('Note created');
    } catch (err) {
        if (err.message.includes('storage')) {
            showToast('Storage limit exceeded!');
        }
    }
});

// Save status
function updateSaveStatus(status) {
    var el = document.getElementById('save-status');
    el.className = '';
    if (status === 'saving') {
        el.textContent = 'Saving...';
        el.className = 'saving';
    } else if (status === 'saved') {
        el.textContent = 'Saved';
        el.className = 'saved';
    } else if (status === 'error') {
        el.textContent = 'Failed';
        el.className = 'error';
    } else {
        el.textContent = '';
    }
}

// Character count
function updateCharCount(text) {
    var el = document.getElementById('char-count');
    if (!text) { el.textContent = ''; return; }
    var chars = text.length;
    if (chars >= 1000) {
        el.textContent = (chars / 1000).toFixed(1) + 'k chars';
    } else {
        el.textContent = chars + ' chars';
    }
}

// Auto-save with debounce
function scheduleSave() {
    updateSaveStatus('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async function() {
        saveTimer = null;
        await saveCurrentNote();
    }, 1500);
}

async function saveCurrentNote() {
    if (!currentNoteId) return;
    var title = document.getElementById('note-title').value;
    var content = document.getElementById('note-content').value;
    try {
        await api('PUT', '/api/notes/' + currentNoteId, { title: title, content: content });
        updateSaveStatus('saved');

        // Update sidebar preview
        var note = notes.find(function(n) { return n.id === currentNoteId; });
        if (note) {
            note.title = title;
            note.preview = content.substring(0, 100);
            note.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            renderNotesList(document.getElementById('search-input').value);
        }
        loadStorage();

        // Clear status after a while
        setTimeout(function() {
            var el = document.getElementById('save-status');
            if (el.textContent === 'Saved') updateSaveStatus('');
        }, 3000);
    } catch (e) {
        updateSaveStatus('error');
    }
}

document.getElementById('note-title').addEventListener('input', scheduleSave);
document.getElementById('note-content').addEventListener('input', function() {
    scheduleSave();
    updateCharCount(this.value);
});

// Delete
document.getElementById('delete-note-btn').addEventListener('click', async function() {
    if (!currentNoteId) return;
    if (!confirm('Delete this note? This action cannot be undone.')) return;

    try {
        await api('DELETE', '/api/notes/' + currentNoteId);
        currentNoteId = null;
        document.getElementById('editor-empty').style.display = 'flex';
        document.getElementById('editor-content').style.display = 'none';
        await loadNotes();
        loadStorage();
        showToast('Note deleted');

        if (isMobile) {
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('editor').classList.remove('visible');
        }
    } catch (e) {}
});

// ==================== Mobile Navigation ====================

document.getElementById('back-btn').addEventListener('click', async function() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await saveCurrentNote();
    }
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('editor').classList.remove('visible');
});

document.getElementById('menu-btn').addEventListener('click', function() {
    var sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hidden');
    if (!sidebar.classList.contains('hidden') && isMobile) {
        document.getElementById('editor').classList.remove('visible');
    }
});

// ==================== Search ====================

document.getElementById('search-input').addEventListener('input', function(e) {
    renderNotesList(e.target.value);
});

// ==================== Storage ====================

async function loadStorage() {
    try {
        var data = await api('GET', '/api/storage');
        var usedMB = (data.used / 1024 / 1024).toFixed(1);
        var limitGB = (data.limit / 1024 / 1024 / 1024).toFixed(0);
        document.getElementById('storage-info').textContent = usedMB + ' MB / ' + limitGB + ' GB';

        var percent = Math.min((data.used / data.limit) * 100, 100);
        var fill = document.getElementById('storage-bar-fill');
        fill.style.width = percent + '%';
        if (percent > 80) fill.style.background = 'var(--danger)';
        else if (percent > 60) fill.style.background = '#f59e0b';
        else fill.style.background = 'var(--primary)';
    } catch (e) {}
}

// ==================== Utilities ====================

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr.replace(' ', 'T') + 'Z');
    var now = new Date();
    if (isNaN(d.getTime())) return dateStr;

    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return diffMin + ' min ago';

    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ==================== Responsive ====================

window.addEventListener('resize', function() {
    var wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;
    if (wasMobile && !isMobile) {
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('editor').classList.remove('visible');
    }
});

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        saveCurrentNote();
    }
});

// ==================== Start ====================

init();
