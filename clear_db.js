const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

// ВАРИАНТ А: Удалить вообще всех
db.run("DELETE FROM users", (err) => {
    if (err) console.error(err);
    else console.log("БД полностью очищена!");
});

/* // ВАРИАНТ Б: Удалить только конкретного по ID (если нужно)
const userIdToDelete = 2; 
db.run("DELETE FROM users WHERE id = ?", [userIdToDelete], (err) => {
    if (err) console.error(err);
    else console.log(`Пользователь с ID ${userIdToDelete} удален!`);
});
*/

db.close();