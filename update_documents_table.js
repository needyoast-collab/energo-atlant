const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./energo.db');

db.serialize(() => {
    // 1. Rename old table
    db.run("ALTER TABLE project_documents RENAME TO project_documents_old");

    // 2. Create new table without the restrictive CHECK constraint (or with an updated one)
    db.run(`CREATE TABLE project_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        document_type TEXT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_by INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )`);

    // 3. Copy data
    db.run(`INSERT INTO project_documents (id, project_id, document_type, file_name, file_path, uploaded_by, uploaded_at, description)
            SELECT id, project_id, document_type, file_name, file_path, uploaded_by, uploaded_at, description FROM project_documents_old`);

    // 4. Drop old table
    db.run("DROP TABLE project_documents_old", (err) => {
        if (err) console.error(err);
        else console.log("Success updating project_documents schema.");
    });
});
