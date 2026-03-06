const { dbGet, dbRun } = require('../config/database');

// Генерация уникального кода проекта
const generateProjectCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'PRJ-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Добавление часов к дате
const addHours = (date, hours) => {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
};

// Форматирование даты для SQLite
const formatDateForDB = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

// Проверка истечения срока
const isDeadlinePassed = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
};

// Валидация email
const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

// Валидация телефона (русский формат)
const isValidPhone = (phone) => {
    const re = /^\+?[78][\d]{10}$/;
    return re.test(phone.replace(/[\s\-\(\)]/g, ''));
};

// Безопасное удаление пароля из объекта пользователя
const sanitizeUser = (user) => {
    if (!user) return null;
    const { password, ...sanitized } = user;
    return sanitized;
};

// Автоматическое создание уведомления
async function sendNotification(projectId, type, message) {
    try {
        const proj = await dbGet(`SELECT customer_id FROM projects WHERE id = ?`, [projectId]);
        if (proj && proj.customer_id) {
            await dbRun(
                `INSERT INTO notifications (user_id, project_id, type, message) VALUES (?, ?, ?, ?)`,
                [proj.customer_id, projectId, type, message]
            );
        }
    } catch (err) {
        console.error('Ошибка записи уведомления:', err);
    }
}

async function sendDirectNotification(userId, projectId, type, message) {
    try {
        await dbRun(
            `INSERT INTO notifications (user_id, project_id, type, message) VALUES (?, ?, ?, ?)`,
            [userId, projectId, type, message]
        );
    } catch (err) {
        console.error('Ошибка записи прямого уведомления:', err);
    }
}

module.exports = {
    generateProjectCode,
    addHours,
    formatDateForDB,
    isDeadlinePassed,
    isValidEmail,
    isValidPhone,
    sanitizeUser,
    sendNotification,
    sendDirectNotification
};