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
    loadNotes();
    loadStorage();
}

// ==================== Init ====================

async function init() {
    try {
        const data = await api('GET', '/api/check');
        if (data.ok) showApp(data.username);
        else showLogin();
    } catch {
        showLogin();
    }
}

// ==================== Auth ====================

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) return;

    btn.disabled = true;
    btn.textContent = 'Logging in...';
    document.getElementById('login-error').textContent = '';

    try {
        const data = await api('POST', '/api/login', { username, password });
        showApp(data.username);
    } catch {
        document.getElementById('login-error').textContent = 'Invalid username or password';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('POST', '/api/logout'); } catch {}
    showLogin();
});

// ==================== Notes List ====================

async function loadNotes() {
    try {
        const data = await api('GET', '/api/notes');
        notes = data.notes;
        renderNotesList();
    } catch {}
}

function renderNotesList(filter) {
    const list = document.getElementById('notes-list');
    list.innerHTML = '';

    let filtered = notes;
    if (filter) {
        const f = filter.toLowerCase();
        filtered = notes.filter(n =>
            n.title.toLowerCase().includes(f) ||
            n.preview.toLowerCase().includes(f)
        );
    }

    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:40px 16px;text-align:center;color:#ccc;font-size:14px">' +
            (notes.length === 0 ? 'No notes yet' : 'No matches') + '</div>';
        return;
    }

    filtered.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
        item.innerHTML =
            '<div class="note-item-title">' + escapeHtml(note.title || 'Untitled') + '</div>' +
            '<div class="note-item-preview">' + escapeHtml(note.preview) + '</div>' +
            '<div class="note-item-date">' + formatDate(note.updated_at) + '</div>';
        item.addEventListener('click', () => openNote(note.id));
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
        const data = await api('GET', '/api/notes/' + id);
        currentNoteId = id;
        document.getElementById('note-title').value = data.title;
        document.getElementById('note-content').value = data.content;
        document.getElementById('editor-empty').style.display = 'none';
        document.getElementById('editor-content').style.display = 'flex';
        document.getElementById('save-status').textContent = '';
        renderNotesList(document.getElementById('search-input').value);

        if (isMobile) {
            document.getElementById('sidebar').classList.add('hidden');
            document.getElementById('editor').classList.add('visible');
        }
    } catch {}
}

document.getElementById('new-note-btn').addEventListener('click', async () => {
    try {
        const data = await api('POST', '/api/notes', { title: 'New Note', content: '' });
        await loadNotes();
        openNote(data.id);
    } catch (err) {
        if (err.message.includes('storage')) {
            alert('Storage limit exceeded!');
        }
    }
});

// Auto-save with debounce
function scheduleSave() {
    document.getElementById('save-status').textContent = 'Editing...';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        saveTimer = null;
        await saveCurrentNote();
    }, 1500);
}

async function saveCurrentNote() {
    if (!currentNoteId) return;
    const title = document.getElementById('note-title').value;
    const content = document.getElementById('note-content').value;
    try {
        await api('PUT', '/api/notes/' + currentNoteId, { title, content });
        document.getElementById('save-status').textContent = 'Saved';

        // Update sidebar preview
        const note = notes.find(n => n.id === currentNoteId);
        if (note) {
            note.title = title;
            note.preview = content.substring(0, 100);
            note.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            renderNotesList(document.getElementById('search-input').value);
        }
        loadStorage();
    } catch {
        document.getElementById('save-status').textContent = 'Save failed';
    }
}

document.getElementById('note-title').addEventListener('input', scheduleSave);
document.getElementById('note-content').addEventListener('input', scheduleSave);

// Delete
document.getElementById('delete-note-btn').addEventListener('click', async () => {
    if (!currentNoteId) return;
    if (!confirm('Delete this note?')) return;

    try {
        await api('DELETE', '/api/notes/' + currentNoteId);
        currentNoteId = null;
        document.getElementById('editor-empty').style.display = 'flex';
        document.getElementById('editor-content').style.display = 'none';
        await loadNotes();
        loadStorage();

        if (isMobile) {
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('editor').classList.remove('visible');
        }
    } catch {}
});

// ==================== Mobile Navigation ====================

document.getElementById('back-btn').addEventListener('click', async () => {
    // Save before going back
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await saveCurrentNote();
    }
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('editor').classList.remove('visible');
});

document.getElementById('menu-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hidden');
    // Hide editor when showing sidebar on mobile
    if (!sidebar.classList.contains('hidden') && isMobile) {
        document.getElementById('editor').classList.remove('visible');
    }
});

// ==================== Search ====================

document.getElementById('search-input').addEventListener('input', (e) => {
    renderNotesList(e.target.value);
});

// ==================== Storage ====================

async function loadStorage() {
    try {
        const data = await api('GET', '/api/storage');
        const usedMB = (data.used / 1024 / 1024).toFixed(1);
        const limitGB = (data.limit / 1024 / 1024 / 1024).toFixed(0);
        document.getElementById('storage-info').textContent = usedMB + ' MB / ' + limitGB + ' GB';
    } catch {}
}

// ==================== Utilities ====================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const now = new Date();
    if (isNaN(d.getTime())) return dateStr;

    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ==================== Responsive ====================

window.addEventListener('resize', () => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;

    // Reset mobile classes when switching to desktop
    if (wasMobile && !isMobile) {
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('editor').classList.remove('visible');
    }
});

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
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
