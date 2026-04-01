require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

const { requireAuth } = require('./middleware/auth');
const { pool, dbRun } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;


// === MIDDLEWARE ===
// Helmet для защиты HTTP-заголовков
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "code.jquery.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com", "cdnjs.cloudflare.com", "unpkg.com"],
            imgSrc: ["'self'", "data:", "blob:", "images.unsplash.com", "res.cloudinary.com"],
            fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
            connectSrc: ["'self'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    referrerPolicy: { policy: 'same-origin' }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'http://localhost:3000',
    credentials: true
}));

app.use(compression()); // Сжатие всех ответов сервера
app.use(xss()); // Базовая защита от XSS

// === RATE LIMITING ===
// Общий лимит для всех API запросов
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "⚠️ Слишком много запросов. Пожалуйста, подождите 15 минут." }
});
app.use('/api/', globalLimiter);

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'fallback-unsafe-secret-key', // Крайне важно переопределить в .env!
    resave: false,
    saveUninitialized: false,
    name: 'sessionid', // Смена имени куки по умолчанию для затруднения идентификации стека
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        httpOnly: true, // Куки недоступны через JS
        secure: process.env.NODE_ENV === 'production', // Только HTTPS в продакшене
        sameSite: 'lax' // Защита от CSRF
    }
}));

app.use(express.static(path.join(__dirname, 'public')));
// УДАЛЕНО: app.use('/uploads', ...) - папка теперь защищена и доступ только через API

// === РОУТИНГ ПО РОЛЯМ ===
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
const documentRoutes = require('./routes/documentRoutes');

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
app.use('/api/documents', documentRoutes);

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
    if (req.accepts('json')) {
        res.status(404).json({ success: false, message: "Эндпоинт не найден" });
    } else {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
});

// === ЦЕНТРАЛИЗОВАННАЯ ОБРАБОТКА ОШИБОК ===
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📂 Среда: ${process.env.NODE_ENV || 'development'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Остановка сервера...');
    try {
        await pool.end();
        console.log('🐘 PostgreSQL: Пул соединений закрыт');
    } catch (err) {
        console.error('Ошибка закрытия пула БД:', err);
    }
    process.exit(0);
});