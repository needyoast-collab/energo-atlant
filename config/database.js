const sqlite3 = require('sqlite3').verbose();

// === НАСТРОЙКА БАЗЫ ДАННЫХ ===
const db = new sqlite3.Database(process.env.DB_PATH || './energo.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
        process.exit(1);
    }
    console.log('💾 База данных подключена');

    // Авто-патч БД - добавление таблицы уведомлений
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        project_id INTEGER,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`);

    // Авто-патч БД - добавление таблицы сообщений
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        project_id INTEGER,
        subject TEXT,
        body TEXT NOT NULL,
        attachments TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    )`);

    // Авто-патч: партнёрские таблицы
    db.run(`CREATE TABLE IF NOT EXISTS referral_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'paid')),
        commission_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(partner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(referred_user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(partner_id, referred_user_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS partner_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_details TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'paid', 'rejected')),
        admin_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        FOREIGN KEY(partner_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Авто-патч: добавить колонки ref_code и partner_level в users если нет
    db.run(`ALTER TABLE users ADD COLUMN ref_code TEXT`, () => { });
    db.run(`ALTER TABLE users ADD COLUMN partner_level TEXT DEFAULT 'start'`, () => { });
});

// Промисификация запросов к БД
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

module.exports = {
    db,
    dbGet,
    dbAll,
    dbRun
};
