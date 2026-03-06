require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const xss = require('xss-clean');

const { requireAuth } = require('./middleware/auth');
const { db } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// === MIDDLEWARE ===
app.use(helmet({
    contentSecurityPolicy: false // Отключаем CSP для Bootstrap CDN, чтобы стили не ломались
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    credentials: true
}));

app.use(compression()); // Сжатие всех ответов сервера для ускорения загрузки
app.use(xss()); // Защита от XSS-атак

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev')); // Цветные логи в консоли
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));


app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === РОУТИНГ ПО РОЛЯМ ===
// Подключение новых роутов
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const managerRoutes = require('./routes/managerRoutes');
const foremanRoutes = require('./routes/foremanRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const ptoRoutes = require('./routes/ptoRoutes');
const customerRoutes = require('./routes/customerRoutes');
const publicRoutes = require('./routes/publicRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const projectRoutes = require('./routes/projectRoutes');
const messageRoutes = require('./routes/messageRoutes');
const partnerRoutes = require('./routes/partnerRoutes');

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/foreman', foremanRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/api/pto', ptoRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/partner', partnerRoutes);

app.get('/ref/:code', (req, res) => {
    res.redirect(`/register.html?ref=${req.params.code}`);
});

app.get('/dashboard', requireAuth, (req, res) => {
    const role = req.session.userRole;
    const dashboards = {
        'admin': 'dashboard_admin.html',
        'manager': 'dashboard_manager.html',
        'foreman': 'dashboard_foreman.html',
        'supplier': 'dashboard_supplier.html',
        'pto': 'dashboard_pto.html',
        'customer': 'dashboard_customer.html',
        'partner': 'dashboard_partner.html'
    };

    const file = dashboards[role] || 'dashboard_customer.html';
    res.sendFile(path.join(__dirname, 'public', file));
});



// Обработка 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({
        success: false,
        message: "Внутренняя ошибка сервера"
    });
});

app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📂 Среда: ${process.env.NODE_ENV || 'development'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    db.close((err) => {
        if (err) {
            console.error('Ошибка закрытия БД:', err);
        } else {
            console.log('💾 База данных отключена');
        }
        process.exit(0);
    });
});