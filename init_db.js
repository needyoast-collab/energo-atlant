const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    // 1. Очистка старого (чтобы накатить новую структуру)
    db.run("DROP TABLE IF EXISTS users");
    db.run("DROP TABLE IF EXISTS projects");
    db.run("DROP TABLE IF EXISTS project_requests");
    db.run("DROP TABLE IF EXISTS project_stages");

    // 2. Таблица ПОЛЬЗОВАТЕЛИ
    // Роли: 'admin', 'manager', 'foreman' (прораб), 'supplier' (снабженец), 'pto', 'customer'
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE,
        password TEXT,
        email TEXT,
        phone TEXT,
        role TEXT,
        full_name TEXT
    )`);

    // 3. Таблица ПРОЕКТЫ
    // access_code - код для подключения заказчика/прораба
    db.run(`CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        address TEXT,
        description TEXT,
        doc_link TEXT,
        access_code TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'new',
        manager_id INTEGER,
        foreman_id INTEGER,
        supplier_id INTEGER,
        customer_id INTEGER,
        pto_id INTEGER
    )`);

    // 4. Таблица ЗАЯВКИ ОТ НОВЫХ КЛИЕНТОВ
    db.run(`CREATE TABLE project_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        description TEXT,
        contact_info TEXT,
        status TEXT DEFAULT 'pending'
    )`);

    // 5. Таблица ЭТАПЫ РАБОТ (Для прораба)
    db.run(`CREATE TABLE project_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        name TEXT,
        materials_planned TEXT,
        materials_used TEXT,
        photos_link TEXT,
        is_completed INTEGER DEFAULT 0,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )`);

    console.log("✅ Таблицы созданы.");

    // 6. СОЗДАНИЕ БАЗОВЫХ ПОЛЬЗОВАТЕЛЕЙ
    const stmt = db.prepare("INSERT INTO users (login, password, email, phone, role, full_name) VALUES (?, ?, ?, ?, ?, ?)");
    
    // Админ
    stmt.run("admin", "12345", "admin@energo.ru", "000", "admin", "Главный Администратор");
    // Менеджер
    stmt.run("manager", "12345", "manager@energo.ru", "111", "manager", "Алексей Менеджер");
    // Прораб (Константин)
    stmt.run("konstantin", "12345", "kostya@energo.ru", "+79000000000", "foreman", "Константин Каракчиев");
    // Снабженец
    stmt.run("snab", "12345", "snab@energo.ru", "222", "supplier", "Иван Снабженец");
    // Инженер ПТО
    stmt.run("pto", "12345", "pto@energo.ru", "333", "pto", "Сергей ПТО");

    stmt.finalize();
    console.log("✅ Пользователи добавлены: admin, manager, konstantin, snab, pto (Пароль у всех: 12345)");
});

db.close();