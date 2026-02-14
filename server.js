const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'energo-super-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const db = new sqlite3.Database('./energo.db');

// Раздача статики (CSS, JS, картинки)
app.use(express.static(path.join(__dirname, 'public')));

// === УМНЫЙ РОУТЕР (Перенаправление по ролям) ===
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    
    const role = req.session.userRole;

    if (role === 'admin' || role === 'manager') {
        return res.sendFile(path.join(__dirname, 'public/dashboard_manager.html'));
    } else if (role === 'foreman') {
        return res.sendFile(path.join(__dirname, 'public/dashboard_foreman.html'));
    } else {
        return res.sendFile(path.join(__dirname, 'public/dashboard_customer.html')); // или cabinet.html
    }
});

// === ВХОД (ИСПРАВЛЕННЫЙ: Логин, Email ИЛИ ТЕЛЕФОН) ===
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    // Теперь ищем по 3 полям: login, email или phone
    const sql = "SELECT * FROM users WHERE (login = ? OR email = ? OR phone = ?) AND password = ?";
    
    db.get(sql, [login, login, login, password], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Ошибка сервера" });
        }
        if (row) {
            req.session.userId = row.id;
            req.session.userRole = row.role;
            req.session.userName = row.full_name;
            console.log(`✅ Вход: ${row.login} (${row.role})`);
            res.json({ success: true, role: row.role });
        } else {
            res.status(401).json({ success: false, message: "Неверные данные" });
        }
    });
});

// === РЕГИСТРАЦИЯ ===
app.post('/api/register', (req, res) => {
    const { login, password, email, phone, fullName } = req.body;
    
    db.get("SELECT * FROM users WHERE login = ?", [login], (err, row) => {
        if (row) return res.json({ success: false, message: "Логин занят" });
        
        db.run("INSERT INTO users (login, password, email, phone, full_name, role) VALUES (?, ?, ?, ?, ?, 'customer')", 
            [login, password, email, phone, fullName], function(err) {
            if (err) return res.json({ success: false, message: err.message });
            res.json({ success: true });
        });
    });
});

// === ВЫХОД ===
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// === API ДЛЯ МЕНЕДЖЕРА ===
app.get('/api/staff', (req, res) => {
    db.all("SELECT id, full_name, role FROM users WHERE role IN ('foreman', 'supplier', 'pto')", [], (err, rows) => {
        res.json({ success: true, staff: rows });
    });
});

app.post('/api/projects/create', (req, res) => {
    if (!req.session.userId) return res.status(403).json({});
    const { title, address, description, doc_link, foreman_id, supplier_id } = req.body;
    
    // Генерация кода доступа
    const accessCode = `PRJ-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const sql = `INSERT INTO projects (title, address, description, doc_link, access_code, manager_id, foreman_id, supplier_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [title, address, description, doc_link, accessCode, req.session.userId, foreman_id, supplier_id], function(err) {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, code: accessCode });
    });
});

app.get('/api/manager/projects', (req, res) => {
    const sql = `SELECT p.*, u.full_name as foreman_name FROM projects p LEFT JOIN users u ON p.foreman_id = u.id`;
    db.all(sql, [], (err, rows) => res.json({ success: true, projects: rows }));
});

// API данных пользователя (для кабинета)
app.get('/api/user/me', (req, res) => {
    if(!req.session.userId) return res.status(401).json({});
    res.json({ success:true, id: req.session.userId, role: req.session.userRole, name: req.session.userName });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер: http://localhost:${PORT}`);
});