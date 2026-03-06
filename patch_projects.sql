PRAGMA foreign_keys=off;
BEGIN TRANSACTION;
CREATE TABLE projects_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    address TEXT,
    description TEXT,
    client_name TEXT,
    client_organization TEXT,
    access_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'lead',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    stages_deadline DATETIME,
    manager_id INTEGER,
    foreman_id INTEGER,
    supplier_id INTEGER,
    customer_id INTEGER,
    pto_id INTEGER,
    FOREIGN KEY(manager_id) REFERENCES users(id),
    FOREIGN KEY(foreman_id) REFERENCES users(id),
    FOREIGN KEY(supplier_id) REFERENCES users(id),
    FOREIGN KEY(customer_id) REFERENCES users(id),
    FOREIGN KEY(pto_id) REFERENCES users(id)
);
INSERT INTO projects_new SELECT * FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;
CREATE INDEX idx_projects_manager ON projects(manager_id);
CREATE INDEX idx_projects_foreman ON projects(foreman_id);
CREATE INDEX idx_projects_customer ON projects(customer_id);
CREATE INDEX idx_projects_status ON projects(status);

UPDATE projects SET status = 'lead' WHERE status = 'new';
UPDATE projects SET status = 'won' WHERE status = 'completed';
UPDATE projects SET status = 'lost' WHERE status = 'cancelled';
UPDATE projects SET status = 'waiting_advance' WHERE status = 'stages_pending';

COMMIT;
PRAGMA foreign_keys=on;
