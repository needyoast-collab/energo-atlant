const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = 3000;

// Глобальный код для регистрации самих партнеров (чтобы чужие не регистрировались)
const REG_INVITE_CODE = "ENERGO2026"; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'energo-secret-key-2026', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const db = new sqlite3.Database('./energo.db', (err) => {
    if (err) console.error(err.message);
    else console.log("💾 БД подключена.");
});

// --- ЗАЩИТА ---
app.get('/cabinet.html', (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login.html');
    next();
});
app.get('/manager.html', (req, res, next) => {
    if (!req.session.userId || req.session.userRole !== 'admin') return res.redirect('/login.html');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --- АВТОРИЗАЦИЯ ---
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    db.get("SELECT * FROM users WHERE (login = ? OR email = ? OR phone = ?) AND password = ?", [login, login, login, password], (err, row) => {
        if (row) {
            req.session.userId = row.id;
            req.session.userLogin = row.login;
            req.session.userRole = row.role;
            res.json({ success: true, role: row.role });
        } else {
            res.status(401).json({ success: false, message: "Неверные данные" });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { login, password, email, phone, secretCode } = req.body;
    
    // Простая проверка кода приглашения (для регистрации аккаунта)
    if (secretCode !== REG_INVITE_CODE) {
        return res.json({ success: false, message: "Неверный код партнера!" });
    }

    db.get("SELECT * FROM users WHERE email = ? OR phone = ? OR login = ?", [email, phone, login], (err, row) => {
        if (row) return res.json({ success: false, errorType: 'exists' });
        
        db.run("INSERT INTO users (login, password, email, phone, role) VALUES (?, ?, ?, ?, ?)", 
            [login, password, email, phone, 'client'], function(err) {
            res.json({ success: true });
        });
    });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/index.html');
});

app.get('/api/user/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({});
    res.json({ success: true, login: req.session.userLogin, role: req.session.userRole });
});

// --- АДМИНКА ---
// 1. Получить список всех пользователей (для выбора прораба)
app.get('/api/admin/users', (req, res) => {
    if (req.session.userRole !== 'admin') return res.status(403).json({});
    db.all("SELECT id, login, email, role FROM users", [], (err, rows) => res.json({ success: true, users: rows }));
});

// 2. Удалить пользователя
app.delete('/api/admin/users/:id', (req, res) => {
    if (req.session.userRole !== 'admin') return res.status(403).json({});
    if (parseInt(req.params.id) === req.session.userId) return res.json({success:false});
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], () => res.json({ success: true }));
});


// ============================================================
// ЛОГИКА ПРОЕКТОВ (Hybrid: Назначение + Код)
// ============================================================

// 1. Создать проект (Админ назначает или оставляет пустым)
app.post('/api/projects', (req, res) => {
    if (req.session.userRole !== 'admin') return res.status(403).json({});
    
    const { title, address, description, doc_link, assigned_user_id } = req.body;
    
    // Генерируем код проекта (PRJ-XXXX)
    const accessCode = `PRJ-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const sql = "INSERT INTO projects (title, address, description, doc_link, status, progress, access_code, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    
    // Если assigned_user_id пустой, запишется NULL (проект ничей)
    db.run(sql, [title, address, description, doc_link, 'waiting', 0, accessCode, assigned_user_id || null], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, code: accessCode });
    });
});

// 2. Получить проекты
app.get('/api/projects', (req, res) => {
    if (!req.session.userId) return res.status(401).json({});

    if (req.session.userRole === 'admin') {
        // Админ видит всё + имена прорабов
        const sql = `SELECT projects.*, users.login as owner_name FROM projects LEFT JOIN users ON projects.user_id = users.id`;
        db.all(sql, [], (err, rows) => res.json({ success: true, projects: rows }));
    } else {
        // Прораб видит ТОЛЬКО свои
        const sql = "SELECT * FROM projects WHERE user_id = ?";
        db.all(sql, [req.session.userId], (err, rows) => res.json({ success: true, projects: rows }));
    }
});

// 3. УДАЛИТЬ проект
app.delete('/api/projects/:id', (req, res) => {
    if (req.session.userRole !== 'admin') return res.status(403).json({});
    db.run("DELETE FROM projects WHERE id = ?", [req.params.id], () => res.json({ success: true }));
});

// 4. ПРИСОЕДИНИТЬСЯ ПО КОДУ (Для прораба)
app.post('/api/projects/claim', (req, res) => {
    if (!req.session.userId) return res.status(401).json({});
    
    const { code } = req.body;

    // Ищем проект по коду
    db.get("SELECT * FROM projects WHERE access_code = ?", [code], (err, project) => {
        if (!project) return res.json({ success: false, message: "Проект с таким кодом не найден" });
        
        // Привязываем текущего юзера к проекту
        db.run("UPDATE projects SET user_id = ? WHERE id = ?", [req.session.userId, project.id], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true, projectTitle: project.title });
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер: http://localhost:${PORT}`);
});