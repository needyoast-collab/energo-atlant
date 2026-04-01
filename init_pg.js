require('dotenv').config();
const { Client } = require('pg');
const argon2 = require('argon2');
const fs = require('fs');

async function initializePostgres() {
    const client = new Client({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT,
        ssl: process.env.PGSSLROOTCERT ? { rejectUnauthorized: true, ca: fs.readFileSync(process.env.PGSSLROOTCERT).toString() } : false,
    });

    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL');

        console.log('🔄 Cleaning up old tables...');
        const dropTables = [
            'material_requests', 'project_materials', 'project_stage_photos',
            'project_stages', 'project_documents', 'project_requests',
            'projects', 'notifications', 'messages', 'referral_clients',
            'partner_payouts', 'users', 'session'
        ];

        for (const table of dropTables) {
            await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        }
        console.log('✅ Old tables dropped');

        console.log('🔄 Creating new tables...');

        // 1. users
        await client.query(`CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE,
            phone TEXT,
            role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'foreman', 'supplier', 'pto', 'customer', 'partner')),
            full_name TEXT NOT NULL,
            organization TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1,
            is_verified INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            ref_code TEXT,
            partner_level TEXT DEFAULT 'start'
        )`);

        // 2. projects
        await client.query(`CREATE TABLE projects (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            address TEXT,
            description TEXT,
            client_name TEXT,
            client_organization TEXT,
            access_code TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'lead',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            stages_deadline TIMESTAMP,
            work_type TEXT,
            length_m INTEGER,
            offer_sum DECIMAL(15,2),
            lead_source TEXT,
            visit_date TEXT,
            offer_sent_date TEXT,
            offer_valid_until TEXT,
            contract_date TEXT,
            advance_sum DECIMAL(15,2),
            advance_date TEXT,
            act_date TEXT,
            final_sum DECIMAL(15,2),
            manager_id INTEGER REFERENCES users(id),
            foreman_id INTEGER REFERENCES users(id),
            supplier_id INTEGER REFERENCES users(id),
            customer_id INTEGER REFERENCES users(id),
            pto_id INTEGER REFERENCES users(id),
            is_deleted INTEGER DEFAULT 0
        )`);

        // 3. project_requests
        await client.query(`CREATE TABLE project_requests (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT,
            description TEXT,
            documents TEXT,
            contact_info TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'accepted', 'rejected')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewer_id INTEGER REFERENCES users(id),
            notes TEXT,
            project_id INTEGER REFERENCES projects(id),
            is_deleted INTEGER DEFAULT 0
        )`);

        // 4. project_documents
        await client.query(`CREATE TABLE project_documents (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            document_type TEXT,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            uploaded_by INTEGER NOT NULL REFERENCES users(id),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            document_date DATE
        )`);

        // 5. project_stages
        await client.query(`CREATE TABLE project_stages (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            stage_number INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            is_completed INTEGER DEFAULT 0,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER NOT NULL REFERENCES users(id),
            is_deleted INTEGER DEFAULT 0
        )`);

        // 6. project_materials
        await client.query(`CREATE TABLE project_materials (
            id SERIAL PRIMARY KEY,
            stage_id INTEGER NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
            material_name TEXT NOT NULL,
            unit TEXT,
            quantity_planned DECIMAL(15,2) NOT NULL,
            quantity_used DECIMAL(15,2) DEFAULT 0,
            quantity_received DECIMAL(15,2) DEFAULT 0,
            is_received INTEGER DEFAULT 0,
            received_at TIMESTAMP,
            notes TEXT,
            is_deleted INTEGER DEFAULT 0
        )`);

        // 7. material_requests
        await client.query(`CREATE TABLE material_requests (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            foreman_id INTEGER NOT NULL REFERENCES users(id),
            supplier_id INTEGER REFERENCES users(id),
            material_name TEXT NOT NULL,
            quantity DECIMAL(15,2) NOT NULL,
            unit TEXT,
            reason TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'delivered')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP,
            delivered_at TIMESTAMP,
            notes TEXT,
            is_deleted INTEGER DEFAULT 0
        )`);

        // 8. project_stage_photos
        await client.query(`CREATE TABLE project_stage_photos (
            id SERIAL PRIMARY KEY,
            stage_id INTEGER NOT NULL REFERENCES project_stages(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            uploaded_by INTEGER NOT NULL REFERENCES users(id),
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            description TEXT
        )`);

        // 9. notifications
        await client.query(`CREATE TABLE notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 10. messages
        await client.query(`CREATE TABLE messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
            subject TEXT,
            body TEXT NOT NULL,
            attachments TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 11. referral/payouts
        await client.query(`CREATE TABLE referral_clients (
            id SERIAL PRIMARY KEY,
            partner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'paid')),
            commission_amount DECIMAL(15,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(partner_id, referred_user_id)
        )`);

        await client.query(`CREATE TABLE partner_payouts (
            id SERIAL PRIMARY KEY,
            partner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount DECIMAL(15,2) NOT NULL,
            payment_details TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'paid', 'rejected')),
            admin_note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP
        )`);

        // 12. session table for connect-pg-simple
        await client.query(`
            CREATE TABLE "session" (
              "sid" varchar NOT NULL COLLATE "default",
              "sess" json NOT NULL,
              "expire" timestamp(6) NOT NULL
            ) WITH (OIDS=FALSE);
            ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
            CREATE INDEX "IDX_session_expire" ON "session" ("expire");
        `);

        console.log('✅ Tables created successfully');

        console.log('🔄 Creating base users...');
        const users = [
            { login: "admin", password: "admin123", email: "admin@energo.ru", phone: "+70000000000", role: "admin", full_name: "Главный Администратор" },
            { login: "manager1", password: "manager123", email: "manager@energo.ru", phone: "+71111111111", role: "manager", full_name: "Алексей Менеджеров" },
            { login: "konstantin", password: "foreman123", email: "konstantin@energo.ru", phone: "+79000000000", role: "foreman", full_name: "Константин Каракчиев" },
            { login: "snab", password: "supplier123", email: "snab@energo.ru", phone: "+72222222222", role: "supplier", full_name: "Иван Снабженцев" },
            { login: "pto", password: "pto123", email: "pto@energo.ru", phone: "+73333333333", role: "pto", full_name: "Сергей Инженеров" },
            { login: "customer1", password: "customer123", email: "customer@test.ru", phone: "+74444444444", role: "customer", full_name: "Тестовый Заказчик", organization: "ООО Тест" },
            { login: "partner1", password: "partner123", email: "partner@test.ru", phone: "+75555555555", role: "partner", full_name: "Игорь Партнеров", organization: "Агентство" }
        ];

        for (const user of users) {
            const hash = await argon2.hash(user.password);
            await client.query(
                `INSERT INTO users (login, password, email, phone, role, full_name, organization, is_verified) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
                [user.login, hash, user.email, user.phone, user.role, user.full_name, user.organization || null]
            );
            console.log(`✅ User created: ${user.login}`);
        }

        console.log('\n🎉 POSTGRES INITIALIZATION COMPLETE!');

    } catch (err) {
        console.error('❌ Error during initialization:', err);
    } finally {
        await client.end();
    }
}

initializePostgres();
