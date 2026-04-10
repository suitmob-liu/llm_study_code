"""
Todo 待办事项系统 - Flask 后端
端口: 24175
功能: 用户注册(需管理员审核)、待办CRUD、管理员面板、微信/企业微信通知
"""

import os
import sqlite3
import hashlib
import secrets
import json
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, request, jsonify, send_from_directory,
    session, g
)

import requests as http_requests

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.secret_key = os.environ.get('TODO_SECRET_KEY', secrets.token_hex(32))
app.permanent_session_lifetime = timedelta(days=7)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'todo.db')
MAX_USERS = 10

# 通知渠道配置（任选其一即可，全局 fallback）
# 方式1: WxPusher（推荐，完全免费，2000条/天）— wxpusher.zjiecode.com
WXPUSHER_APPTOKEN = os.environ.get('WXPUSHER_APPTOKEN', '')
WXPUSHER_UID = os.environ.get('WXPUSHER_UID', '')
# 方式2: PushPlus — 关注公众号"pushplus"获取 token
PUSHPLUS_TOKEN = os.environ.get('PUSHPLUS_TOKEN', '')
# 方式3: Server酱 — https://sct.ftqq.com 获取 SendKey
SERVERCHAN_KEY = os.environ.get('SERVERCHAN_KEY', '')
# 方式4: 企业微信 Webhook
WECHAT_WEBHOOK_URL = os.environ.get('WECHAT_WEBHOOK_URL', '')


# =============================================================================
# 数据库初始化
# =============================================================================

def get_db():
    """
    获取当前请求的数据库连接。

    Returns:
        sqlite3.Connection: 数据库连接对象，row_factory 设为 sqlite3.Row
    """
    if 'db' not in g:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    """
    请求结束时关闭数据库连接。

    Args:
        exception: 如果有异常则传入异常对象，否则为 None
    """
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """
    初始化数据库，创建所有必要的表。

    创建的表:
        - users: 用户表(id, username, password_hash, salt, role, status, notify_channel, notify_token, notify_schedule, notify_time, notify_days, created_at)
        - todos: 待办表(id, user_id, content, deadline, status, created_at, updated_at)
        - sessions: 会话表(id, user_id, token, expires_at)

    副作用:
        如果不存在管理员账户，自动创建默认管理员 admin/admin123
    """
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            status TEXT NOT NULL DEFAULT 'pending',
            notify_channel TEXT NOT NULL DEFAULT '',
            notify_token TEXT NOT NULL DEFAULT '',
            notify_schedule TEXT NOT NULL DEFAULT 'off',
            notify_time TEXT NOT NULL DEFAULT '09:00',
            notify_days TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            deadline TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

    # 兼容旧库：自动添加缺失列
    _migrate_columns = [
        ('notify_channel', "TEXT NOT NULL DEFAULT ''"),
        ('notify_token', "TEXT NOT NULL DEFAULT ''"),
        ('notify_schedule', "TEXT NOT NULL DEFAULT 'off'"),
        ('notify_time', "TEXT NOT NULL DEFAULT '09:00'"),
        ('notify_days', "TEXT NOT NULL DEFAULT ''"),
    ]
    for col_name, col_def in _migrate_columns:
        try:
            conn.execute(f"SELECT {col_name} FROM users LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")

    # 创建默认管理员（如果不存在）
    cursor = conn.execute("SELECT id FROM users WHERE role='admin' LIMIT 1")
    if cursor.fetchone() is None:
        salt = secrets.token_hex(16)
        password_hash = hash_password('admin123', salt)
        conn.execute(
            "INSERT INTO users (username, password_hash, salt, role, status) VALUES (?, ?, ?, 'admin', 'approved')",
            ('admin', password_hash, salt)
        )
        print("[Init] 默认管理员已创建 — 用户名: admin / 密码: admin123")
        print("[Init] 请登录后立即修改密码！")

    conn.commit()
    conn.close()


# =============================================================================
# 密码工具
# =============================================================================

def hash_password(password, salt):
    """
    使用 SHA256 + 盐值对密码进行哈希。

    Args:
        password (str): 明文密码
        salt (str): 盐值字符串

    Returns:
        str: 哈希后的密码字符串
    """
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


# =============================================================================
# 认证中间件
# =============================================================================

def get_current_user():
    """
    从请求 Cookie 中的 token 获取当前登录用户。

    Returns:
        sqlite3.Row | None: 用户记录行，未登录或 token 无效时返回 None
    """
    token = request.cookies.get('token')
    if not token:
        return None
    db = get_db()
    row = db.execute("""
        SELECT u.* FROM users u
        JOIN sessions s ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now', 'localtime')
    """, (token,)).fetchone()
    return row


def login_required(f):
    """
    装饰器：要求用户已登录且账户状态为 approved。

    Args:
        f: 被装饰的视图函数

    Returns:
        function: 包装后的函数，未授权时返回 401 JSON 错误

    错误码:
        401: 未登录或账户未通过审核
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': '请先登录'}), 401
        if user['status'] != 'approved':
            return jsonify({'error': '账户等待审核中'}), 401
        g.user = user
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """
    装饰器：要求用户已登录且角色为 admin。

    Args:
        f: 被装饰的视图函数

    Returns:
        function: 包装后的函数，非管理员时返回 403 JSON 错误

    错误码:
        401: 未登录
        403: 非管理员角色
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': '请先登录'}), 401
        if user['role'] != 'admin':
            return jsonify({'error': '需要管理员权限'}), 403
        g.user = user
        return f(*args, **kwargs)
    return decorated


# =============================================================================
# 认证 API
# =============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    用户注册接口。

    请求体 JSON:
        username (str): 用户名，3-20字符
        password (str): 密码，至少6字符

    Returns:
        JSON: {'message': '注册成功，等待管理员审核'}

    错误码:
        400: 参数缺失、格式错误、用户名已存在、用户数已满
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if len(username) < 3 or len(username) > 20:
        return jsonify({'error': '用户名长度 3-20 字符'}), 400
    if len(password) < 6:
        return jsonify({'error': '密码至少 6 个字符'}), 400

    db = get_db()

    # 检查用户数量上限
    count = db.execute("SELECT COUNT(*) as cnt FROM users").fetchone()['cnt']
    if count >= MAX_USERS:
        return jsonify({'error': f'用户数已达上限 ({MAX_USERS})'}), 400

    # 检查用户名是否存在
    existing = db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if existing:
        return jsonify({'error': '用户名已存在'}), 400

    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    db.execute(
        "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
        (username, password_hash, salt)
    )
    db.commit()

    return jsonify({'message': '注册成功，等待管理员审核'})


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    用户登录接口。

    请求体 JSON:
        username (str): 用户名
        password (str): 密码

    Returns:
        JSON: {'message': '登录成功', 'user': {id, username, role, status}}
        Set-Cookie: token (HttpOnly, 7天过期)

    错误码:
        400: 参数缺失
        401: 用户名或密码错误、账户被拒绝
        403: 账户等待审核
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不能为空'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()

    if not user:
        return jsonify({'error': '用户名或密码错误'}), 401

    if hash_password(password, user['salt']) != user['password_hash']:
        return jsonify({'error': '用户名或密码错误'}), 401

    if user['status'] == 'pending':
        return jsonify({'error': '账户正在等待管理员审核'}), 403
    if user['status'] == 'rejected':
        return jsonify({'error': '账户注册已被拒绝'}), 401

    # 创建会话
    token = secrets.token_hex(32)
    expires_at = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
    db.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
        (user['id'], token, expires_at)
    )
    db.commit()

    resp = jsonify({
        'message': '登录成功',
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'status': user['status']
        }
    })
    resp.set_cookie('token', token, httponly=True, max_age=7*86400, samesite='Lax')
    return resp


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """
    用户登出接口，清除会话。

    Returns:
        JSON: {'message': '已登出'}
    """
    token = request.cookies.get('token')
    if token:
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token=?", (token,))
        db.commit()
    resp = jsonify({'message': '已登出'})
    resp.delete_cookie('token')
    return resp


@app.route('/api/auth/me', methods=['GET'])
def get_me():
    """
    获取当前登录用户信息。

    Returns:
        JSON: {'user': {id, username, role, status}} 或 {'user': null}
    """
    user = get_current_user()
    if not user:
        return jsonify({'user': None})
    return jsonify({
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'status': user['status']
        }
    })


@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """
    修改当前用户密码。

    请求体 JSON:
        old_password (str): 当前密码
        new_password (str): 新密码，至少6字符

    Returns:
        JSON: {'message': '密码修改成功'}

    错误码:
        400: 参数缺失、新密码太短
        401: 当前密码错误
    """
    data = request.get_json()
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not old_password or not new_password:
        return jsonify({'error': '请填写完整'}), 400
    if len(new_password) < 6:
        return jsonify({'error': '新密码至少 6 个字符'}), 400

    user = g.user
    db = get_db()
    full_user = db.execute("SELECT * FROM users WHERE id=?", (user['id'],)).fetchone()

    if hash_password(old_password, full_user['salt']) != full_user['password_hash']:
        return jsonify({'error': '当前密码错误'}), 401

    new_salt = secrets.token_hex(16)
    new_hash = hash_password(new_password, new_salt)
    db.execute(
        "UPDATE users SET password_hash=?, salt=? WHERE id=?",
        (new_hash, new_salt, user['id'])
    )
    db.commit()
    return jsonify({'message': '密码修改成功'})


# =============================================================================
# 待办 API
# =============================================================================

@app.route('/api/todos', methods=['GET'])
@login_required
def list_todos():
    """
    获取当前用户的所有待办事项。

    Query 参数:
        status (str, optional): 按状态过滤 (pending/completed/all)，默认 all

    Returns:
        JSON: {'todos': [{id, content, deadline, status, created_at, updated_at}, ...]}
    """
    db = get_db()
    status_filter = request.args.get('status', 'all')

    if status_filter == 'all':
        rows = db.execute(
            "SELECT * FROM todos WHERE user_id=? ORDER BY created_at DESC",
            (g.user['id'],)
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM todos WHERE user_id=? AND status=? ORDER BY created_at DESC",
            (g.user['id'], status_filter)
        ).fetchall()

    todos = [dict(row) for row in rows]
    return jsonify({'todos': todos})


@app.route('/api/todos', methods=['POST'])
@login_required
def create_todo():
    """
    创建新的待办事项。

    请求体 JSON:
        content (str): 待办内容，不能为空
        deadline (str, optional): 截止日期，格式 YYYY-MM-DD 或 YYYY-MM-DD HH:MM

    Returns:
        JSON: {'todo': {id, content, deadline, status, created_at, updated_at}}

    错误码:
        400: content 为空
    """
    data = request.get_json()
    content = data.get('content', '').strip()
    deadline = data.get('deadline', '').strip() or None

    if not content:
        return jsonify({'error': '请填写待办内容'}), 400

    db = get_db()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cursor = db.execute(
        "INSERT INTO todos (user_id, content, deadline, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (g.user['id'], content, deadline, now, now)
    )
    db.commit()

    todo = db.execute("SELECT * FROM todos WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify({'todo': dict(todo)})


@app.route('/api/todos/<int:todo_id>', methods=['PUT'])
@login_required
def update_todo(todo_id):
    """
    更新指定的待办事项。

    Args:
        todo_id (int): 待办事项 ID (URL 路径参数)

    请求体 JSON (均为可选):
        content (str): 待办内容
        deadline (str): 截止日期
        status (str): 状态 (pending/completed)

    Returns:
        JSON: {'todo': {id, content, deadline, status, created_at, updated_at}}

    错误码:
        404: 待办不存在或不属于当前用户
    """
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id=? AND user_id=?",
        (todo_id, g.user['id'])
    ).fetchone()

    if not todo:
        return jsonify({'error': '待办不存在'}), 404

    data = request.get_json()
    content = data.get('content', todo['content'])
    deadline = data.get('deadline', todo['deadline'])
    status = data.get('status', todo['status'])
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    db.execute(
        "UPDATE todos SET content=?, deadline=?, status=?, updated_at=? WHERE id=?",
        (content, deadline, status, now, todo_id)
    )
    db.commit()

    updated = db.execute("SELECT * FROM todos WHERE id=?", (todo_id,)).fetchone()
    return jsonify({'todo': dict(updated)})


@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
@login_required
def delete_todo(todo_id):
    """
    删除指定的待办事项。

    Args:
        todo_id (int): 待办事项 ID (URL 路径参数)

    Returns:
        JSON: {'message': '已删除'}

    错误码:
        404: 待办不存在或不属于当前用户
    """
    db = get_db()
    todo = db.execute(
        "SELECT * FROM todos WHERE id=? AND user_id=?",
        (todo_id, g.user['id'])
    ).fetchone()

    if not todo:
        return jsonify({'error': '待办不存在'}), 404

    db.execute("DELETE FROM todos WHERE id=?", (todo_id,))
    db.commit()
    return jsonify({'message': '已删除'})


# =============================================================================
# 管理员 API
# =============================================================================

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_list_users():
    """
    管理员获取所有用户列表。

    Returns:
        JSON: {'users': [{id, username, role, status, created_at, todo_count}, ...]}
    """
    db = get_db()
    rows = db.execute("""
        SELECT u.id, u.username, u.role, u.status, u.created_at,
               COUNT(t.id) as todo_count
        FROM users u
        LEFT JOIN todos t ON t.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """).fetchall()
    return jsonify({'users': [dict(r) for r in rows]})


@app.route('/api/admin/users/<int:user_id>/approve', methods=['POST'])
@admin_required
def admin_approve_user(user_id):
    """
    管理员审核通过用户注册。

    Args:
        user_id (int): 用户 ID (URL 路径参数)

    Returns:
        JSON: {'message': '已通过'}

    错误码:
        404: 用户不存在
    """
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    db.execute("UPDATE users SET status='approved' WHERE id=?", (user_id,))
    db.commit()
    return jsonify({'message': '已通过'})


@app.route('/api/admin/users/<int:user_id>/reject', methods=['POST'])
@admin_required
def admin_reject_user(user_id):
    """
    管理员拒绝用户注册。

    Args:
        user_id (int): 用户 ID (URL 路径参数)

    Returns:
        JSON: {'message': '已拒绝'}

    错误码:
        404: 用户不存在
    """
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    db.execute("UPDATE users SET status='rejected' WHERE id=?", (user_id,))
    db.commit()
    return jsonify({'message': '已拒绝'})


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    """
    管理员删除用户（不能删除自己）。

    Args:
        user_id (int): 用户 ID (URL 路径参数)

    Returns:
        JSON: {'message': '已删除'}

    错误码:
        400: 不能删除自己
        404: 用户不存在
    """
    if user_id == g.user['id']:
        return jsonify({'error': '不能删除自己'}), 400
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    return jsonify({'message': '已删除'})


# =============================================================================
# 通知设置 API
# =============================================================================

CHANNEL_LABELS = {
    'wxpusher': 'WxPusher 微信推送',
    'pushplus': 'PushPlus 微信推送',
    'serverchan': 'Server酱 微信推送',
    'wechat_work': '企业微信 Webhook',
}


@app.route('/api/notify/settings', methods=['GET'])
@login_required
def get_notify_settings():
    """
    获取当前用户的通知配置（含定时推送设置）。

    Returns:
        JSON: {
            'channel': str,
            'token': str (脱敏显示),
            'has_token': bool,
            'schedule': 'off' | 'daily' | 'weekly',
            'time': 'HH:MM',
            'days': [int] (1=周一 ... 7=周日)
        }
    """
    db = get_db()
    user = db.execute(
        "SELECT notify_channel, notify_token, notify_schedule, notify_time, notify_days FROM users WHERE id=?",
        (g.user['id'],)
    ).fetchone()
    channel = user['notify_channel'] or ''
    token = user['notify_token'] or ''
    masked = ''
    if token:
        masked = token[:6] + '****' + token[-4:] if len(token) > 10 else '****'
    days = [int(d) for d in user['notify_days'].split(',') if d.strip().isdigit()]
    return jsonify({
        'channel': channel,
        'token': masked,
        'has_token': bool(token),
        'schedule': user['notify_schedule'] or 'off',
        'time': user['notify_time'] or '09:00',
        'days': days,
    })


@app.route('/api/notify/settings', methods=['POST'])
@login_required
def save_notify_settings():
    """
    保存当前用户的通知配置（含定时推送设置）。

    请求体 JSON:
        channel (str): 通知渠道 ('pushplus' | 'serverchan' | 'wechat_work' | '')
        token (str): 对应渠道的 token/key/url（留空则不修改已有 token）
        schedule (str): 定时推送频率 ('off' | 'daily' | 'weekly')
        time (str): 推送时间 'HH:MM'，默认 '09:00'
        days (list[int]): 每周几推送，1=周一 ... 7=周日（仅 weekly 时有效）

    Returns:
        JSON: {'message': '通知设置已保存'}

    错误码:
        400: 渠道类型无效、token 为空、时间格式错误
    """
    data = request.get_json()
    channel = data.get('channel', '').strip()
    token = data.get('token', '').strip()
    schedule = data.get('schedule', 'off').strip()
    notify_time = data.get('time', '09:00').strip()
    days = data.get('days', [])

    valid_channels = ('wxpusher', 'pushplus', 'serverchan', 'wechat_work', '')
    if channel not in valid_channels:
        return jsonify({'error': '无效的通知渠道'}), 400

    valid_schedules = ('off', 'daily', 'weekly')
    if schedule not in valid_schedules:
        return jsonify({'error': '无效的推送频率'}), 400

    # 验证时间格式
    try:
        parts = notify_time.split(':')
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        notify_time = f"{h:02d}:{m:02d}"
    except (ValueError, IndexError):
        return jsonify({'error': '时间格式错误，请使用 HH:MM'}), 400

    # 验证星期
    valid_days = [d for d in days if isinstance(d, int) and 1 <= d <= 7]
    days_str = ','.join(str(d) for d in sorted(valid_days))

    if schedule != 'off' and not channel:
        return jsonify({'error': '请先选择推送渠道'}), 400

    db = get_db()

    # 如果 token 为空且已有渠道配置，保留旧 token
    if channel and not token:
        old = db.execute("SELECT notify_token, notify_channel FROM users WHERE id=?", (g.user['id'],)).fetchone()
        if old['notify_channel'] == channel and old['notify_token']:
            token = old['notify_token']
        else:
            return jsonify({'error': '请填写 Token'}), 400

    db.execute(
        "UPDATE users SET notify_channel=?, notify_token=?, notify_schedule=?, notify_time=?, notify_days=? WHERE id=?",
        (channel, token, schedule, notify_time, days_str, g.user['id'])
    )
    db.commit()
    return jsonify({'message': '通知设置已保存'})


# =============================================================================
# 微信 / 企业微信通知发送
# =============================================================================

def _build_todo_message(username, todos):
    """
    将待办列表构建为通知文本。

    Args:
        username (str): 用户名
        todos (list): 待办事项记录列表

    Returns:
        tuple: (title, plain_text, html_text) 标题、纯文本、HTML 三种格式
    """
    title = f"{username} 的待办提醒 ({len(todos)} 项)"
    lines = []
    html_lines = [f"<h3>{title}</h3><ul>"]
    for i, t in enumerate(todos, 1):
        deadline_str = f" | 截止: {t['deadline']}" if t['deadline'] else ""
        lines.append(f"{i}. {t['content']}{deadline_str}")
        html_lines.append(f"<li>{t['content']}{deadline_str}</li>")
    html_lines.append("</ul>")
    return title, "\n".join(lines), "\n".join(html_lines)


def _send_wxpusher(token, title, html_content):
    """
    通过 WxPusher 发送微信推送。

    token 格式为 "appToken|uid"，用竖线分隔。

    Args:
        token (str): "appToken|uid" 格式的凭证
        title (str): 消息标题
        html_content (str): HTML 格式消息内容

    Returns:
        tuple: (success: bool, error_msg: str)
    """
    parts = token.split('|', 1)
    if len(parts) != 2:
        return False, "token 格式错误，需要 appToken|UID"
    app_token, uid = parts[0].strip(), parts[1].strip()

    resp = http_requests.post(
        "https://wxpusher.zjiecode.com/api/send/message",
        json={
            "appToken": app_token,
            "content": html_content,
            "summary": title,
            "contentType": 2,
            "uids": [uid],
        },
        timeout=10
    )
    data = resp.json()
    if data.get("code") == 1000:
        return True, ""
    return False, data.get("msg", f"状态码 {resp.status_code}")


def _send_pushplus(token, title, html_content):
    """
    通过 PushPlus 发送微信推送。

    Args:
        token (str): 用户的 PushPlus token
        title (str): 消息标题
        html_content (str): HTML 格式消息内容

    Returns:
        tuple: (success: bool, error_msg: str)
    """
    resp = http_requests.post(
        "https://www.pushplus.plus/send",
        json={
            "token": token,
            "title": title,
            "content": html_content,
            "template": "html"
        },
        timeout=10
    )
    data = resp.json()
    if data.get("code") == 200:
        return True, ""
    return False, data.get("msg", f"状态码 {resp.status_code}")


def _send_serverchan(key, title, plain_text):
    """
    通过 Server酱 发送微信推送。

    Args:
        key (str): 用户的 Server酱 SendKey
        title (str): 消息标题
        plain_text (str): Markdown 格式消息内容

    Returns:
        tuple: (success: bool, error_msg: str)
    """
    resp = http_requests.post(
        f"https://sctapi.ftqq.com/{key}.send",
        json={"title": title, "desp": plain_text},
        timeout=10
    )
    data = resp.json()
    if data.get("code") == 0:
        return True, ""
    return False, data.get("message", f"状态码 {resp.status_code}")


def _send_wechat_work(webhook_url, plain_text):
    """
    通过企业微信 Webhook 发送消息。

    Args:
        webhook_url (str): 企业微信 Webhook 完整 URL
        plain_text (str): Markdown 格式消息内容

    Returns:
        tuple: (success: bool, error_msg: str)
    """
    resp = http_requests.post(
        webhook_url,
        json={"msgtype": "markdown", "markdown": {"content": plain_text}},
        timeout=10
    )
    if resp.status_code == 200:
        return True, ""
    return False, f"状态码 {resp.status_code}"


def _resolve_user_channel(user_id):
    """
    解析用户的通知渠道和 token。优先用户个人配置，其次全局环境变量。

    Args:
        user_id (int): 用户 ID

    Returns:
        tuple: (channel: str, token: str, label: str) 或 (None, None, None)
    """
    db = get_db()
    user = db.execute(
        "SELECT notify_channel, notify_token FROM users WHERE id=?",
        (user_id,)
    ).fetchone()

    # 优先用户个人配置
    if user['notify_channel'] and user['notify_token']:
        ch = user['notify_channel']
        return ch, user['notify_token'], CHANNEL_LABELS.get(ch, ch)

    # 回退到全局环境变量
    if WXPUSHER_APPTOKEN and WXPUSHER_UID:
        return 'wxpusher', f"{WXPUSHER_APPTOKEN}|{WXPUSHER_UID}", 'WxPusher (全局)'
    if PUSHPLUS_TOKEN:
        return 'pushplus', PUSHPLUS_TOKEN, 'PushPlus (全局)'
    if SERVERCHAN_KEY:
        return 'serverchan', SERVERCHAN_KEY, 'Server酱 (全局)'
    if WECHAT_WEBHOOK_URL:
        return 'wechat_work', WECHAT_WEBHOOK_URL, '企业微信 (全局)'
    return None, None, None


@app.route('/api/notify/send', methods=['POST'])
@login_required
def notify_send():
    """
    发送待办提醒到微信。优先使用用户个人 token，回退到全局环境变量。

    Returns:
        JSON: {'message': '已通过 xxx 发送', 'channel': str}

    错误码:
        400: 未配置通知渠道
        502: 发送失败
    """
    channel, token, label = _resolve_user_channel(g.user['id'])
    if not channel:
        return jsonify({
            'error': '请先在通知设置中配置你的推送 Token'
        }), 400

    db = get_db()
    todos = db.execute(
        "SELECT * FROM todos WHERE user_id=? AND status='pending' ORDER BY deadline ASC NULLS LAST",
        (g.user['id'],)
    ).fetchall()

    if not todos:
        return jsonify({'message': '没有待办事项需要提醒'})

    title, plain_text, html_text = _build_todo_message(g.user['username'], todos)

    try:
        if channel == 'wxpusher':
            ok, err = _send_wxpusher(token, title, html_text)
        elif channel == 'pushplus':
            ok, err = _send_pushplus(token, title, html_text)
        elif channel == 'serverchan':
            ok, err = _send_serverchan(token, title, plain_text)
        else:
            ok, err = _send_wechat_work(token, plain_text)

        if ok:
            return jsonify({'message': f'已通过 {label} 发送', 'channel': channel})
        else:
            return jsonify({'error': f'{label} 发送失败: {err}'}), 502
    except Exception as e:
        return jsonify({'error': f'发送失败: {str(e)}'}), 502


@app.route('/api/notify/status', methods=['GET'])
@login_required
def notify_status():
    """
    查询当前用户的通知配置状态。

    Returns:
        JSON: {
            'configured': bool,
            'channel': str | null,
            'label': str | null,
            'source': 'user' | 'global' | null
        }
    """
    channel, token, label = _resolve_user_channel(g.user['id'])
    source = None
    if channel:
        db = get_db()
        user = db.execute(
            "SELECT notify_channel, notify_token FROM users WHERE id=?",
            (g.user['id'],)
        ).fetchone()
        source = 'user' if (user['notify_channel'] and user['notify_token']) else 'global'
    return jsonify({
        'configured': channel is not None,
        'channel': channel,
        'label': label,
        'source': source,
    })


# =============================================================================
# 静态文件与页面路由
# =============================================================================

@app.route('/')
def index():
    """
    返回前端单页应用入口 HTML。

    Returns:
        file: static/index.html
    """
    return send_from_directory('static', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    """
    返回静态文件。

    Args:
        path (str): 文件路径

    Returns:
        file: static/<path> 或 static/index.html (SPA fallback)
    """
    try:
        return send_from_directory('static', path)
    except Exception:
        return send_from_directory('static', 'index.html')


# =============================================================================
# 定时推送调度器
# =============================================================================

def _send_notify_for_user(user_row):
    """
    为指定用户发送待办提醒（供调度器调用，不依赖请求上下文）。

    Args:
        user_row (dict): 包含 id, username, notify_channel, notify_token 的用户记录

    Returns:
        bool: 发送是否成功
    """
    channel = user_row['notify_channel']
    token = user_row['notify_token']

    # 回退到全局
    if not channel or not token:
        if WXPUSHER_APPTOKEN and WXPUSHER_UID:
            channel, token = 'wxpusher', f"{WXPUSHER_APPTOKEN}|{WXPUSHER_UID}"
        elif PUSHPLUS_TOKEN:
            channel, token = 'pushplus', PUSHPLUS_TOKEN
        elif SERVERCHAN_KEY:
            channel, token = 'serverchan', SERVERCHAN_KEY
        elif WECHAT_WEBHOOK_URL:
            channel, token = 'wechat_work', WECHAT_WEBHOOK_URL
        else:
            return False

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    todos = conn.execute(
        "SELECT * FROM todos WHERE user_id=? AND status='pending' ORDER BY deadline ASC NULLS LAST",
        (user_row['id'],)
    ).fetchall()
    conn.close()

    if not todos:
        return True

    title, plain_text, html_text = _build_todo_message(user_row['username'], todos)

    try:
        if channel == 'wxpusher':
            ok, _ = _send_wxpusher(token, title, html_text)
        elif channel == 'pushplus':
            ok, _ = _send_pushplus(token, title, html_text)
        elif channel == 'serverchan':
            ok, _ = _send_serverchan(token, title, plain_text)
        else:
            ok, _ = _send_wechat_work(token, plain_text)
        return ok
    except Exception as e:
        print(f"[Scheduler] 发送失败 user={user_row['username']}: {e}")
        return False


def scheduled_notify_check():
    """
    每分钟执行一次，检查哪些用户需要在当前时刻发送定时推送。

    匹配逻辑:
        - daily: 每天在 notify_time 时发送
        - weekly: 在 notify_days 指定的星期几的 notify_time 时发送
        - 时间匹配精确到分钟（HH:MM）

    使用独立数据库连接，不依赖 Flask 请求上下文。
    """
    now = datetime.now()
    current_time = now.strftime('%H:%M')
    # Python weekday(): 0=Monday ... 6=Sunday, 我们用 1=Monday ... 7=Sunday
    current_weekday = now.weekday() + 1

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    users = conn.execute(
        "SELECT id, username, notify_channel, notify_token, notify_schedule, notify_time, notify_days "
        "FROM users WHERE notify_schedule != 'off' AND status='approved'"
    ).fetchall()
    conn.close()

    for user in users:
        if user['notify_time'] != current_time:
            continue

        should_send = False
        if user['notify_schedule'] == 'daily':
            should_send = True
        elif user['notify_schedule'] == 'weekly':
            user_days = [int(d) for d in user['notify_days'].split(',') if d.strip().isdigit()]
            should_send = current_weekday in user_days

        if should_send:
            print(f"[Scheduler] 发送定时提醒 -> {user['username']} ({current_time})")
            _send_notify_for_user(user)


def start_scheduler():
    """
    启动 APScheduler 后台调度器，每分钟执行一次定时推送检查。
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(scheduled_notify_check, 'interval', minutes=1, id='notify_check')
    scheduler.start()
    print("[Scheduler] 定时推送调度器已启动（每分钟检查一次）")


# gunicorn 启动时也初始化调度器（仅在第一个 worker 执行）
_scheduler_started = False


@app.before_request
def _ensure_scheduler():
    """
    确保调度器在 gunicorn 环境下也能启动（首次请求时触发一次）。
    """
    global _scheduler_started
    if not _scheduler_started:
        _scheduler_started = True
        init_db()
        start_scheduler()


# =============================================================================
# 启动
# =============================================================================

if __name__ == '__main__':
    init_db()
    start_scheduler()
    port = int(os.environ.get('TODO_PORT', 24175))
    print(f"\n{'='*50}")
    print(f"  待办事项系统启动")
    print(f"  地址: http://0.0.0.0:{port}")
    print(f"  管理员: admin / admin123 (请及时修改密码)")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=port, debug=False)
