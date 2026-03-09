require('dotenv').config();
const { dbAll } = require('./config/database');
async function run() {
    try {
        const res = await dbAll("SELECT id, organization as title, description, documents, NULL as contact_info, status, created_at, full_name as customer_name, email, phone, 'public' as request_type FROM public_requests WHERE status = 'pending' ORDER BY created_at DESC");
        console.log(res);
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
run();
