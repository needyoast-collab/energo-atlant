// Middleware для проверки авторизации и ролей

// Проверка авторизации
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ 
            success: false, 
            message: "Требуется авторизация" 
        });
    }
    next();
};

// Проверка конкретной роли
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Требуется авторизация" 
            });
        }
        
        if (!allowedRoles.includes(req.session.userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: "Недостаточно прав доступа" 
            });
        }
        
        next();
    };
};

// Проверка что пользователь - менеджер или админ
const requireManagerOrAdmin = requireRole('admin', 'manager');

// Проверка что пользователь - прораб
const requireForeman = requireRole('foreman', 'admin');

// Проверка что пользователь - снабженец
const requireSupplier = requireRole('supplier', 'admin');

// Проверка что пользователь - ПТО
const requirePTO = requireRole('pto', 'admin');

// Проверка что пользователь - заказчик
const requireCustomer = requireRole('customer', 'admin');

// Проверка что пользователь - админ
const requireAdmin = requireRole('admin');

module.exports = {
    requireAuth,
    requireRole,
    requireManagerOrAdmin,
    requireForeman,
    requireSupplier,
    requirePTO,
    requireCustomer,
    requireAdmin
};