const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    console.log("⏳ Добавляю таблицу material_requests...");
    
    db.run(`CREATE TABLE IF NOT EXISTS material_requests (
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
    )`, (err) => {
        if (err) {
            console.error("❌ Ошибка:", err.message);
        } else {
            console.log("✅ Таблица material_requests успешно создана!");
        }
    });
});

db.close();