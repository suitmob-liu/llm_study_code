/**
 * 墨记 — 待办事项系统前端
 * 功能: 登录/注册、待办CRUD、管理员面板、企业微信通知
 */

(function () {
    'use strict';

    // =========================================================================
    // 状态
    // =========================================================================

    let currentUser = null;
    let currentFilter = 'all';
    let todos = [];

    // =========================================================================
    // DOM 引用
    // =========================================================================

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const authPage = $('#auth-page');
    const appPage = $('#app-page');
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');
    const authMessage = $('#auth-message');
    const todoForm = $('#todo-form');
    const todoList = $('#todo-list');
    const emptyState = $('#empty-state');
    const todoCount = $('#todo-count');
    const adminModal = $('#admin-modal');
    const passwordModal = $('#password-modal');
    const passwordForm = $('#password-form');

    // =========================================================================
    // API 工具
    // =========================================================================

    /**
     * 发起 API 请求。
     *
     * @param {string} url - 请求路径
     * @param {Object} options - fetch 选项
     * @returns {Promise<Object>} 解析后的 JSON 响应
     * @throws {Error} HTTP 错误时抛出，message 为服务端 error 字段
     */
    async function api(url, options = {}) {
        const resp = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || '请求失败');
        }
        return data;
    }

    /**
     * 显示 Toast 通知。
     *
     * @param {string} msg - 提示文本
     * @param {string} type - 类型: 'success' | 'error' | '' (默认)
     */
    function showToast(msg, type = '') {
        const toast = $('#toast');
        toast.textContent = msg;
        toast.className = 'toast show ' + type;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    /**
     * 显示认证页面的消息。
     *
     * @param {string} msg - 消息文本
     * @param {string} type - 类型: 'success' | 'error'
     */
    function showAuthMessage(msg, type) {
        authMessage.textContent = msg;
        authMessage.className = 'message show ' + type;
    }

    // =========================================================================
    // 认证
    // =========================================================================

    /**
     * 检查当前登录状态，已登录则进入应用页面，否则显示登录页。
     *
     * @returns {Promise<void>}
     */
    async function checkAuth() {
        try {
            const data = await api('/api/auth/me');
            if (data.user) {
                currentUser = data.user;
                enterApp();
            }
        } catch (e) {
            // 未登录，保持在登录页
        }
    }

    /**
     * 进入应用主界面，初始化用户信息和待办列表。
     */
    function enterApp() {
        authPage.style.display = 'none';
        appPage.style.display = 'block';
        $('#user-info').textContent = currentUser.username;
        if (currentUser.role === 'admin') {
            $('#btn-admin').style.display = '';
        }
        loadTodos();
    }

    /**
     * 返回登录页面，清除用户状态。
     */
    function exitApp() {
        appPage.style.display = 'none';
        authPage.style.display = 'flex';
        currentUser = null;
        todos = [];
    }

    // 登录
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('#login-username').value.trim();
        const password = $('#login-password').value;
        try {
            const data = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            currentUser = data.user;
            loginForm.reset();
            authMessage.className = 'message';
            enterApp();
        } catch (err) {
            showAuthMessage(err.message, 'error');
        }
    });

    // 注册
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('#reg-username').value.trim();
        const password = $('#reg-password').value;
        try {
            const data = await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });
            showAuthMessage(data.message, 'success');
            registerForm.reset();
        } catch (err) {
            showAuthMessage(err.message, 'error');
        }
    });

    // 登出
    $('#btn-logout').addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' });
        exitApp();
    });

    // 选项卡切换
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            authMessage.className = 'message';
            if (tab.dataset.tab === 'login') {
                loginForm.style.display = '';
                registerForm.style.display = 'none';
            } else {
                loginForm.style.display = 'none';
                registerForm.style.display = '';
            }
        });
    });

    // =========================================================================
    // 待办 CRUD
    // =========================================================================

    /**
     * 加载当前用户的待办列表。
     *
     * @returns {Promise<void>}
     */
    async function loadTodos() {
        try {
            const data = await api('/api/todos?status=' + currentFilter);
            todos = data.todos;
            renderTodos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    /**
     * 渲染待办列表到 DOM。
     */
    function renderTodos() {
        todoList.innerHTML = '';

        if (todos.length === 0) {
            emptyState.style.display = '';
            todoList.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            todoList.style.display = '';
        }

        const pendingCount = todos.filter(t => t.status === 'pending').length;
        const total = todos.length;
        todoCount.textContent = currentFilter === 'all'
            ? `${pendingCount} 待办 / ${total} 总计`
            : `${total} 项`;

        todos.forEach((todo, idx) => {
            const item = document.createElement('div');
            item.className = 'todo-item';
            item.style.animationDelay = `${idx * 0.05}s`;

            if (todo.status === 'completed') {
                item.classList.add('completed');
            }

            // 检查是否逾期
            let isOverdue = false;
            if (todo.deadline && todo.status === 'pending') {
                const deadlineDate = new Date(todo.deadline);
                if (deadlineDate < new Date()) {
                    isOverdue = true;
                    item.classList.add('overdue');
                }
            }

            const deadlineMeta = todo.deadline
                ? `<span class="${isOverdue ? 'overdue-text' : ''}">截止: ${formatDate(todo.deadline)}${isOverdue ? ' (已逾期)' : ''}</span>`
                : '';

            item.innerHTML = `
                <div class="todo-checkbox ${todo.status === 'completed' ? 'checked' : ''}"
                     data-id="${todo.id}" data-action="toggle"></div>
                <div class="todo-body">
                    <div class="todo-text">${escapeHtml(todo.content)}</div>
                    <div class="todo-meta">
                        <span>创建: ${formatDate(todo.created_at)}</span>
                        ${deadlineMeta}
                    </div>
                </div>
                <div class="todo-actions">
                    <button class="btn-todo-action delete" data-id="${todo.id}" data-action="delete" title="删除">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
            todoList.appendChild(item);
        });
    }

    /**
     * 格式化日期字符串为易读格式。
     *
     * @param {string} dateStr - 日期字符串 (YYYY-MM-DD HH:MM:SS 或 YYYY-MM-DDTHH:MM)
     * @returns {string} 格式化后的日期字符串 (MM-DD HH:MM)
     */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${mm}-${dd} ${hh}:${min}`;
    }

    /**
     * HTML 转义，防止 XSS。
     *
     * @param {string} str - 原始字符串
     * @returns {string} 转义后的安全字符串
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 新建待办
    todoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = $('#todo-content').value.trim();
        const deadline = $('#todo-deadline').value || '';
        if (!content) return;

        try {
            await api('/api/todos', {
                method: 'POST',
                body: JSON.stringify({ content, deadline }),
            });
            todoForm.reset();
            showToast('已记下', 'success');
            loadTodos();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // 待办操作（事件委托）
    todoList.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const id = target.dataset.id;
        const action = target.dataset.action;

        if (action === 'toggle') {
            const todo = todos.find(t => t.id == id);
            if (!todo) return;
            const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
            try {
                await api(`/api/todos/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: newStatus }),
                });
                loadTodos();
            } catch (err) {
                showToast(err.message, 'error');
            }
        } else if (action === 'delete') {
            if (!confirm('确认删除此条待办？')) return;
            try {
                await api(`/api/todos/${id}`, { method: 'DELETE' });
                showToast('已删除', 'success');
                loadTodos();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    });

    // 过滤
    $$('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            loadTodos();
        });
    });

    // =========================================================================
    // 通知设置与发送
    // =========================================================================

    const notifyModal = $('#notify-modal');
    const notifyForm = $('#notify-form');
    const notifyChannel = $('#notify-channel');
    const notifyToken = $('#notify-token');
    const notifyTokenGroup = $('#notify-token-group');
    const notifyHint = $('#notify-hint');
    const notifyTokenLabel = $('#notify-token-label');
    const notifySchedule = $('#notify-schedule');
    const scheduleTimeGroup = $('#schedule-time-group');
    const scheduleDaysGroup = $('#schedule-days-group');

    const channelHints = {
        pushplus: { label: 'PushPlus Token', placeholder: '粘贴你的 PushPlus token', hint: '在 pushplus.plus 首页复制' },
        serverchan: { label: 'Server酱 SendKey', placeholder: '粘贴你的 SendKey', hint: '在 sct.ftqq.com 复制' },
        wechat_work: { label: 'Webhook URL', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...', hint: '企业微信群机器人完整 URL' },
    };

    /**
     * 根据选中的渠道更新 token 输入框的提示文本。
     */
    function updateNotifyHints() {
        const ch = notifyChannel.value;
        if (ch && channelHints[ch]) {
            notifyTokenGroup.style.display = '';
            notifyTokenLabel.textContent = channelHints[ch].label;
            notifyToken.placeholder = channelHints[ch].placeholder;
            notifyHint.textContent = channelHints[ch].hint;
        } else {
            notifyTokenGroup.style.display = 'none';
        }
    }

    /**
     * 根据选中的推送频率显示/隐藏时间和星期选择器。
     */
    function updateScheduleUI() {
        const sch = notifySchedule.value;
        if (sch === 'off') {
            scheduleTimeGroup.style.display = 'none';
            scheduleDaysGroup.style.display = 'none';
        } else if (sch === 'daily') {
            scheduleTimeGroup.style.display = '';
            scheduleDaysGroup.style.display = 'none';
        } else {
            scheduleTimeGroup.style.display = '';
            scheduleDaysGroup.style.display = '';
        }
    }

    notifyChannel.addEventListener('change', updateNotifyHints);
    notifySchedule.addEventListener('change', updateScheduleUI);

    /**
     * 获取星期选择器中勾选的日期。
     *
     * @returns {number[]} 选中的星期数组，1=周一 ... 7=周日
     */
    function getSelectedDays() {
        const checks = scheduleDaysGroup.querySelectorAll('input[type="checkbox"]');
        return Array.from(checks).filter(c => c.checked).map(c => parseInt(c.value));
    }

    /**
     * 设置星期选择器的勾选状态。
     *
     * @param {number[]} days - 要选中的星期数组
     */
    function setSelectedDays(days) {
        const checks = scheduleDaysGroup.querySelectorAll('input[type="checkbox"]');
        checks.forEach(c => { c.checked = days.includes(parseInt(c.value)); });
    }

    /**
     * 打开通知设置模态框并加载当前配置。
     *
     * @returns {Promise<void>}
     */
    async function openNotifySettings() {
        notifyModal.style.display = '';
        $('#notify-message').className = 'message';
        try {
            const data = await api('/api/notify/settings');
            notifyChannel.value = data.channel || '';
            notifyToken.value = '';
            if (data.has_token) {
                notifyToken.placeholder = `当前: ${data.token}（留空则不修改）`;
            }
            notifySchedule.value = data.schedule || 'off';
            $('#notify-time').value = data.time || '09:00';
            setSelectedDays(data.days || []);
            updateNotifyHints();
            updateScheduleUI();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // 铃铛：点击发送通知，长按打开设置
    let notifyPressTimer = null;
    const btnNotify = $('#btn-notify');

    btnNotify.addEventListener('mousedown', () => {
        notifyPressTimer = setTimeout(() => {
            notifyPressTimer = 'long';
            openNotifySettings();
        }, 600);
    });

    btnNotify.addEventListener('mouseup', async () => {
        if (notifyPressTimer === 'long') {
            notifyPressTimer = null;
            return;
        }
        clearTimeout(notifyPressTimer);
        notifyPressTimer = null;
        try {
            const status = await api('/api/notify/status');
            if (!status.configured) {
                openNotifySettings();
                return;
            }
            showToast('正在发送...', '');
            const data = await api('/api/notify/send', { method: 'POST' });
            showToast(data.message, 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    btnNotify.addEventListener('mouseleave', () => {
        if (notifyPressTimer && notifyPressTimer !== 'long') {
            clearTimeout(notifyPressTimer);
            notifyPressTimer = null;
        }
    });

    // 保存通知设置
    notifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ch = notifyChannel.value;
        const tk = notifyToken.value.trim();
        const sch = notifySchedule.value;
        const time = $('#notify-time').value || '09:00';
        const days = getSelectedDays();
        const msg = $('#notify-message');

        try {
            await api('/api/notify/settings', {
                method: 'POST',
                body: JSON.stringify({
                    channel: ch,
                    token: tk || undefined,
                    schedule: sch,
                    time: time,
                    days: days,
                }),
            });
            const scheduleText = sch === 'off' ? '' :
                sch === 'daily' ? ` | 每天 ${time} 自动推送` :
                ` | 每周${days.map(d => ['','一','二','三','四','五','六','日'][d]).join('、')} ${time} 自动推送`;
            msg.textContent = '设置已保存' + scheduleText;
            msg.className = 'message show success';
        } catch (err) {
            msg.textContent = err.message;
            msg.className = 'message show error';
        }
    });

    // =========================================================================
    // 管理员面板
    // =========================================================================

    $('#btn-admin').addEventListener('click', openAdminModal);

    /**
     * 打开管理员面板，加载用户列表。
     *
     * @returns {Promise<void>}
     */
    async function openAdminModal() {
        adminModal.style.display = '';
        try {
            const data = await api('/api/admin/users');
            renderAdminUsers(data.users);
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    /**
     * 渲染管理员面板的用户列表。
     *
     * @param {Array<Object>} users - 用户列表
     */
    function renderAdminUsers(users) {
        const container = $('#admin-users');
        container.innerHTML = '';

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'admin-user-card';

            const statusClass = user.role === 'admin' ? 'admin' : user.status;
            const statusText = user.role === 'admin' ? '管理员'
                : user.status === 'approved' ? '已通过'
                : user.status === 'pending' ? '待审核'
                : '已拒绝';

            let actions = '';
            if (user.role !== 'admin') {
                if (user.status === 'pending') {
                    actions = `
                        <button class="btn-admin-action approve" data-uid="${user.id}" data-act="approve">通过</button>
                        <button class="btn-admin-action reject" data-uid="${user.id}" data-act="reject">拒绝</button>
                    `;
                }
                actions += `<button class="btn-admin-action delete" data-uid="${user.id}" data-act="delete">删除</button>`;
            }

            card.innerHTML = `
                <div class="admin-user-info">
                    <div class="admin-user-name">
                        ${escapeHtml(user.username)}
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="admin-user-meta">
                        <span>注册: ${formatDate(user.created_at)}</span>
                        <span>待办: ${user.todo_count} 项</span>
                    </div>
                </div>
                <div class="admin-user-actions">${actions}</div>
            `;
            container.appendChild(card);
        });
    }

    // 管理员操作（事件委托）
    $('#admin-users').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;

        const uid = btn.dataset.uid;
        const act = btn.dataset.act;

        try {
            if (act === 'approve') {
                await api(`/api/admin/users/${uid}/approve`, { method: 'POST' });
                showToast('已通过', 'success');
            } else if (act === 'reject') {
                await api(`/api/admin/users/${uid}/reject`, { method: 'POST' });
                showToast('已拒绝', 'success');
            } else if (act === 'delete') {
                if (!confirm('确认删除此用户？其所有待办将一并删除。')) return;
                await api(`/api/admin/users/${uid}`, { method: 'DELETE' });
                showToast('已删除', 'success');
            }
            openAdminModal();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // =========================================================================
    // 修改密码
    // =========================================================================

    $('#btn-password').addEventListener('click', () => {
        passwordModal.style.display = '';
        passwordForm.reset();
        $('#password-message').className = 'message';
    });

    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPwd = $('#old-password').value;
        const newPwd = $('#new-password').value;
        try {
            const data = await api('/api/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
            });
            const msg = $('#password-message');
            msg.textContent = data.message;
            msg.className = 'message show success';
            passwordForm.reset();
        } catch (err) {
            const msg = $('#password-message');
            msg.textContent = err.message;
            msg.className = 'message show error';
        }
    });

    // =========================================================================
    // 模态框关闭
    // =========================================================================

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            $$('.modal').forEach(m => m.style.display = 'none');
        }
    });

    // =========================================================================
    // 启动
    // =========================================================================

    checkAuth();

})();
