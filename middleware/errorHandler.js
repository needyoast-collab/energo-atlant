/**
 * Глобальный обработчик ошибок
 * Защищает от утечки системной информации (SQL-запросы, пути к файлам и т.д.)
 */
const errorHandler = (err, req, res, next) => {
    // 1. Логируем полную ошибку на сервере для отладки
    // Убираем потенциально чувствительные данные из лога если нужно
    console.error(' [ERROR] ', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        url: req.originalUrl,
        method: req.method,
        userId: req.session ? req.session.userId : 'unauthorized'
    });

    // 2. Стандартизированный ответ клиенту
    const statusCode = err.status || 500;

    // Если это ошибка валидации Zod, возвращаем детали
    if (err.name === 'ZodError') {
        return res.status(400).json({
            success: false,
            message: 'Ошибка валидации данных',
            errors: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
    }

    // В продакшене никогда не отдаем детали ошибки
    const message = process.env.NODE_ENV === 'production'
        ? 'Внутренняя ошибка сервера. Обратитесь в поддержку.'
        : err.message;

    res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = errorHandler;
