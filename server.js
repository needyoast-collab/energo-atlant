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

// --- СТАТИКА И МАРШРУТЫ ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/dashboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    
    // Простой роутер по ролям
    if (['admin', 'manager'].includes(req.session.userRole)) {
        return res.sendFile(path.join(__dirname, 'public/dashboard_manager.html'));
    } else if (req.session.userRole === 'foreman') {
        return res.sendFile(path.join(__dirname, 'public/dashboard_foreman.html'));
    } else {
        return res.sendFile(path.join(__dirname, 'public/dashboard_customer.html'));
    }
});

// --- РЕГИСТРАЦИЯ (ИСПРАВЛЕНА) ---
app.post('/api/register', (req, res) => {
    console.log("📥 Получен запрос на регистрацию:", req.body); // ОТЛАДКА
    
    const { login, password, email, phone, fullName } = req.body;
    
    // Проверка на пустые поля
    if(!login || !password) return res.json({ success: false, message: "Нет логина или пароля" });

    db.get("SELECT * FROM users WHERE login = ?", [login], (err, row) => {
        if (row) {
            console.log("❌ Пользователь уже есть");
            return res.json({ success: false, message: "Логин занят" });
        }
        
        // Создаем пользователя (роль customer по умолчанию)
        const sql = "INSERT INTO users (login, password, email, phone, full_name, role) VALUES (?, ?, ?, ?, ?, 'customer')";
        db.run(sql, [login, password, email, phone, fullName], function(err) {
            if (err) {
                console.error("❌ Ошибка БД:", err.message);
                return res.json({ success: false, message: "Ошибка базы данных" });
            }
            console.log("✅ Пользователь создан! ID:", this.lastID);
            res.json({ success: true });
        });
    });
});

// --- ВХОД ---
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    db.get("SELECT * FROM users WHERE (login = ? OR email = ?) AND password = ?", [login, login, password], (err, row) => {
        if (row) {
            req.session.userId = row.id;
            req.session.userRole = row.role;
            req.session.userName = row.full_name;
            console.log(`✅ Вход выполнен: ${row.role} ${row.login}`);
            res.json({ success: true, role: row.role });
        } else {
            res.status(401).json({ success: false, message: "Неверные данные" });
        }
    });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/index.html');
});

// --- СОЗДАНИЕ ПРОЕКТА (МЕНЕДЖЕР) ---
app.post('/api/projects/create', (req, res) => {
    console.log("🏗 Создание проекта:", req.body); // ОТЛАДКА

    if (!req.session.userId) return res.status(403).json({success: false, message: "Нет сессии"});
    
    const { title, address, description, doc_link, foreman_id, supplier_id } = req.body;
    
    // Генерация кода
    const accessCode = `PRJ-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const sql = `INSERT INTO projects (title, address, description, doc_link, access_code, manager_id, foreman_id, supplier_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [title, address, description, doc_link, accessCode, req.session.userId, foreman_id, supplier_id], function(err) {
        if (err) {
            console.error("❌ Ошибка создания проекта:", err.message);
            return res.json({ success: false, message: err.message });
        }
        console.log("✅ Проект создан, код:", accessCode);
        res.json({ success: true, code: accessCode });
    });
});

// --- ВСПОМОГАТЕЛЬНЫЕ API ---
app.get('/api/staff', (req, res) => {
    db.all("SELECT id, full_name, role FROM users WHERE role IN ('foreman', 'supplier', 'pto')", [], (err, rows) => {
        res.json({ success: true, staff: rows });
    });
});

app.get('/api/manager/projects', (req, res) => {
    const sql = `SELECT p.*, u.full_name as foreman_name FROM projects p LEFT JOIN users u ON p.foreman_id = u.id`;
    db.all(sql, [], (err, rows) => res.json({ success: true, projects: rows }));
});

// Запуск
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
});