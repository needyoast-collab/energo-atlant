const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.all("SELECT id, login, email, phone, role FROM users", [], (err, rows) => {
    if (err) throw err;
    console.log("=== СПИСОК ПОЛЬЗОВАТЕЛЕЙ ===");
    console.table(rows); // Красивая таблица в консоли
    db.close();
});