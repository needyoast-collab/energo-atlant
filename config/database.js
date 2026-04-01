const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

// === НАСТРОЙКА POSTGRESQL ===
const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    ssl: process.env.PGSSLROOTCERT ? {
        rejectUnauthorized: true,
        ca: fs.readFileSync(process.env.PGSSLROOTCERT).toString(),
    } : false,
});

pool.on('error', (err) => {
    console.error('❌ Ошибка пула PostgreSQL:', err);
});

console.log('� PostgreSQL: Пул соединений инициализирован');

/**
 * Вспомогательная функция для конвертации SQL-диалекта
 * Переводит SQLite-стиль (?) в PostgreSQL ($1, $2)
 */
const convertQuery = (sql) => {
    if (!sql) return sql;
    let pgSql = sql;

    // 1. Конвертация заполнителей ? -> $1, $2...
    let count = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${count++}`);

    // 2. Хак для дат: SQLite datetime('now') -> PG CURRENT_TIMESTAMP
    pgSql = pgSql.replace(/datetime\(['"]now['"]\)/gi, 'CURRENT_TIMESTAMP');
    pgSql = pgSql.replace(/datetime\(['"]now['"],\s?['"]localtime['"]\)/gi, 'CURRENT_TIMESTAMP');

    // 3. Хак для автоинкремента: в PG нужно RETURNING id, чтобы получить ID вставленной записи
    if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        // Добавляем RETURNING id если это вставка и его нет
        pgSql = pgSql.trim();
        if (pgSql.endsWith(';')) pgSql = pgSql.slice(0, -1);
        pgSql += ' RETURNING id';
    }

    return pgSql;
};

// --- Промисификация запросов для совместимости с существующим кодом ---

const dbGet = async (sql, params = []) => {
    try {
        const pgSql = convertQuery(sql);
        const result = await pool.query(pgSql, params);
        return result.rows[0];
    } catch (error) {
        console.error('SQL Error (dbGet):', sql, params, error.message);
        throw error;
    }
};

const dbAll = async (sql, params = []) => {
    try {
        const pgSql = convertQuery(sql);
        const result = await pool.query(pgSql, params);
        return result.rows;
    } catch (error) {
        console.error('SQL Error (dbAll):', sql, params, error.message);
        throw error;
    }
};

const dbRun = async (sql, params = []) => {
    try {
        const pgSql = convertQuery(sql);
        const result = await pool.query(pgSql, params);

        // Для совместимости с SQLite: возвращаем { id: lastID, changes: changesCount }
        // В PG для INSERT RETURNING id, значение будет в result.rows[0].id
        return {
            id: (result.rows && result.rows.length > 0) ? result.rows[0].id : null,
            changes: result.rowCount
        };
    } catch (error) {
        // Специальная обработка BEGIN TRANSACTION для PG
        if (sql.toUpperCase().includes('BEGIN TRANSACTION')) {
            await pool.query('BEGIN');
            return { success: true };
        }
        if (sql.toUpperCase().includes('COMMIT')) {
            await pool.query('COMMIT');
            return { success: true };
        }
        if (sql.toUpperCase().includes('ROLLBACK')) {
            await pool.query('ROLLBACK');
            return { success: true };
        }

        console.error('SQL Error (dbRun):', sql, params, error.message);
        throw error;
    }
};

module.exports = {
    pool,
    db: pool, // Для совместимости, если где-то используется напрямую
    dbGet,
    dbAll,
    dbRun
};
