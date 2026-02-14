const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    // 1. Создаем таблицу проектов, если её нет
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        address TEXT,
        status TEXT,
        progress INTEGER,
        description TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    console.log("✅ Таблица 'projects' успешно создана!");

    // 2. (Опционально) Добавим тестовый проект для проверки
    // Привяжем его к пользователю с ID = 1 (обычно это ты или первый юзер)
    const stmt = db.prepare("INSERT INTO projects (user_id, title, address, status, progress, description) VALUES (?, ?, ?, ?, ?, ?)");
    stmt.run(1, "Реконструкция ПС 'Северная'", "г. Москва, ул. Ленина 1", "working", 35, "Замена силовых трансформаторов Т-1 и Т-2");
    stmt.finalize();
    
    console.log("✅ Тестовый проект добавлен для ID=1");
});

db.close();