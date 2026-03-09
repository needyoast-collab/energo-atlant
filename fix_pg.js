const { pool } = require('./config/database');

async function fix() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public_requests (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                organization VARCHAR(100),
                description TEXT,
                documents TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP
            );
        `);
        console.log("Table public_requests created.");
    } catch(e) {
        console.error(e);
    } finally {
        pool.end();
    }
}
fix();
