const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');
db.run("UPDATE users SET role = 'admin' WHERE login = 'ТВОЙ_ЛОГИН'");
console.log("Теперь ты админ!");
db.close();