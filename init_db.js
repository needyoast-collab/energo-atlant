const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Создаем папку uploads если её нет
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Папка uploads создана');
}

const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    console.log("🔄 Удаление старых таблиц...");
    
    // 1. Очистка старых таблиц
    db.run("DROP TABLE IF EXISTS material_requests");
    db.run("DROP TABLE IF EXISTS project_materials");
    db.run("DROP TABLE IF EXISTS project_stage_photos");
    db.run("DROP TABLE IF EXISTS project_stages");
    db.run("DROP TABLE IF EXISTS project_documents");
    db.run("DROP TABLE IF EXISTS project_requests");
    db.run("DROP TABLE IF EXISTS projects");
    db.run("DROP TABLE IF EXISTS users");

    console.log("✅ Старые таблицы удалены");
    console.log("🔄 Создание новых таблиц...");

    // 2. Таблица ПОЛЬЗОВАТЕЛИ
    db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'foreman', 'supplier', 'pto', 'customer')),
        full_name TEXT NOT NULL,
        organization TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
    )`);
    console.log("✅ Таблица users создана");

    // 3. Таблица ПРОЕКТЫ
    db.run(`CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        address TEXT,
        description TEXT,
        client_name TEXT,
        client_organization TEXT,
        access_code TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'stages_pending', 'completed', 'cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        stages_deadline DATETIME,
        manager_id INTEGER,
        foreman_id INTEGER,
        supplier_id INTEGER,
        customer_id INTEGER,
        pto_id INTEGER,
        FOREIGN KEY(manager_id) REFERENCES users(id),
        FOREIGN KEY(foreman_id) REFERENCES users(id),
        FOREIGN KEY(supplier_id) REFERENCES users(id),
        FOREIGN KEY(customer_id) REFERENCES users(id),
        FOREIGN KEY(pto_id) REFERENCES users(id)
    )`);
    console.log("✅ Таблица projects создана");

    // 4. Таблица ЗАЯВКИ ОТ КЛИЕНТОВ
    db.run(`CREATE TABLE project_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        documents TEXT,
        contact_info TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'accepted', 'rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        reviewer_id INTEGER,
        notes TEXT,
        project_id INTEGER,
        FOREIGN KEY(customer_id) REFERENCES users(id),
        FOREIGN KEY(reviewer_id) REFERENCES users(id),
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )`);
    console.log("✅ Таблица project_requests создана");

    // 5. Таблица ДОКУМЕНТЫ ПРОЕКТА
    db.run(`CREATE TABLE project_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        document_type TEXT CHECK(document_type IN ('initial', 'technical', 'executive', 'contract', 'other')),
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        document_date DATE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )`);
    console.log("✅ Таблица project_documents создана");

    // 6. Таблица ЭТАПЫ РАБОТ
    db.run(`CREATE TABLE project_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        stage_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_completed INTEGER DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id)
    )`);
    console.log("✅ Таблица project_stages создана");

    // 7. Таблица МАТЕРИАЛЫ ПО ЭТАПАМ
    db.run(`CREATE TABLE project_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL,
        material_name TEXT NOT NULL,
        unit TEXT,
        quantity_planned REAL NOT NULL,
        quantity_used REAL DEFAULT 0,
        quantity_received REAL DEFAULT 0,
        is_received INTEGER DEFAULT 0,
        received_at DATETIME,
        notes TEXT,
        FOREIGN KEY(stage_id) REFERENCES project_stages(id) ON DELETE CASCADE
    )`);
    console.log("✅ Таблица project_materials создана");

    // 8. Таблица ЗАЯВКИ НА МАТЕРИАЛЫ (НОВАЯ!)
    db.run(`CREATE TABLE material_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        foreman_id INTEGER NOT NULL,
        supplier_id INTEGER,
        material_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'delivered')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        delivered_at DATETIME,
        notes TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(foreman_id) REFERENCES users(id),
        FOREIGN KEY(supplier_id) REFERENCES users(id)
    )`);
    console.log("✅ Таблица material_requests создана");

    // 9. Таблица ФОТО К ЭТАПАМ
    db.run(`CREATE TABLE project_stage_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        FOREIGN KEY(stage_id) REFERENCES project_stages(id) ON DELETE CASCADE,
        FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )`);
    console.log("✅ Таблица project_stage_photos создана");

    // 10. Индексы для оптимизации
    db.run("CREATE INDEX idx_projects_manager ON projects(manager_id)");
    db.run("CREATE INDEX idx_projects_foreman ON projects(foreman_id)");
    db.run("CREATE INDEX idx_projects_customer ON projects(customer_id)");
    db.run("CREATE INDEX idx_projects_status ON projects(status)");
    db.run("CREATE INDEX idx_stages_project ON project_stages(project_id)");
    db.run("CREATE INDEX idx_materials_stage ON project_materials(stage_id)");
    db.run("CREATE INDEX idx_material_requests_project ON material_requests(project_id)");
    db.run("CREATE INDEX idx_material_requests_supplier ON material_requests(supplier_id)");
    console.log("✅ Индексы созданы");

    // 11. СОЗДАНИЕ БАЗОВЫХ ПОЛЬЗОВАТЕЛЕЙ
    console.log("🔄 Создание пользователей...");
    
    const users = [
        { login: "admin", password: "admin123", email: "admin@energo.ru", phone: "+70000000000", role: "admin", full_name: "Главный Администратор" },
        { login: "manager1", password: "manager123", email: "manager@energo.ru", phone: "+71111111111", role: "manager", full_name: "Алексей Менеджеров" },
        { login: "konstantin", password: "foreman123", email: "konstantin@energo.ru", phone: "+79000000000", role: "foreman", full_name: "Константин Каракчиев" },
        { login: "snab", password: "supplier123", email: "snab@energo.ru", phone: "+72222222222", role: "supplier", full_name: "Иван Снабженцев" },
        { login: "pto", password: "pto123", email: "pto@energo.ru", phone: "+73333333333", role: "pto", full_name: "Сергей Инженеров" },
        { login: "customer1", password: "customer123", email: "customer@test.ru", phone: "+74444444444", role: "customer", full_name: "Тестовый Заказчик", organization: "ООО Тест" }
    ];

    const stmt = db.prepare("INSERT INTO users (login, password, email, phone, role, full_name, organization) VALUES (?, ?, ?, ?, ?, ?, ?)");
    
    let completed = 0;
    users.forEach(user => {
        bcrypt.hash(user.password, 10, (err, hash) => {
            if (err) {
                console.error(`❌ Ошибка хеширования для ${user.login}:`, err);
                return;
            }
            stmt.run(user.login, hash, user.email, user.phone, user.role, user.full_name, user.organization || null, (err) => {
                if (err) {
                    console.error(`❌ Ошибка создания ${user.login}:`, err);
                } else {
                    console.log(`✅ Пользователь создан: ${user.login} (${user.role})`);
                }
                completed++;
                if (completed === users.length) {
                    stmt.finalize();
                    console.log("\n🎉 ИНИЦИАЛИЗАЦИЯ ЗАВЕРШЕНА!");
                    console.log("\n📋 УЧЕТНЫЕ ДАННЫЕ:");
                    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    console.log("👤 Админ:       admin / admin123");
                    console.log("👤 Менеджер:    manager1 / manager123");
                    console.log("👤 Прораб:      konstantin / foreman123");
                    console.log("👤 Снабженец:   snab / supplier123");
                    console.log("👤 ПТО:         pto / pto123");
                    console.log("👤 Заказчик:    customer1 / customer123");
                    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    console.log("\n⚠️  ОБЯЗАТЕЛЬНО смените пароли после первого входа!");
                    db.close();
                }
            });
        });
    });
});