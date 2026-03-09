const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, 'energo.db');
const db = new sqlite3.Database(dbPath);

const tables = [
    'projects',
    'users',
    'project_requests',
    'project_stages',
    'material_requests',
    'project_materials'
];

async function migrate() {
    console.log('🚀 Starting Soft Delete migration...');

    for (const table of tables) {
        try {
            await new Promise((resolve, reject) => {
                db.run(`ALTER TABLE ${table} ADD COLUMN is_deleted INTEGER DEFAULT 0`, (err) => {
                    if (err) {
                        if (err.message.includes('duplicate column name')) {
                            console.log(`ℹ️ Table ${table} already has is_deleted column.`);
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        console.log(`✅ Added is_deleted to ${table}`);
                        resolve();
                    }
                });
            });
        } catch (err) {
            console.error(`❌ Error migrating ${table}:`, err.message);
        }
    }

    console.log('🏁 Migration complete.');
    db.close();
}

migrate();
