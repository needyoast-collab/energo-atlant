// Вспомогательные функции

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

module.exports = {
    generateProjectCode,
    addHours,
    formatDateForDB,
    isDeadlinePassed,
    isValidEmail,
    isValidPhone,
    sanitizeUser
};