const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    // Поскольку SQLite не любит сложные изменения таблиц, мы сделаем хитро:
    // Мы просто добавим колонку access_code. 
    // user_id у нас и так не был NOT NULL, так что его можно оставлять пустым.

    try {
        db.run("ALTER TABLE projects ADD COLUMN access_code TEXT");
        console.log("✅ Колонка access_code добавлена!");
    } catch (e) {
        console.log("ℹ️ Колонка уже существует или ошибка:", e);
    }

    try {
        db.run("ALTER TABLE projects ADD COLUMN doc_link TEXT"); // Ссылка на документы
        console.log("✅ Колонка doc_link добавлена!");
    } catch (e) {}

});

db.close();