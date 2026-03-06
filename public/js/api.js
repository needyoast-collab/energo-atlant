// =============================================================================
// API.JS - Общие функции для работы с API
// =============================================================================

// Универсальная функция для API запросов
async function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {}
    };

    // Если данные не FormData, добавляем JSON заголовок
    if (data && !(data instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
    } else if (data) {
        options.body = data;
    }

    try {
        const response = await fetch(url, options);

        // Если это экспорт файла (Excel)
        if (response.headers.get('content-type')?.includes('spreadsheet')) {
            return response.blob();
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        showError('Ошибка соединения с сервером');
        return { success: false, message: 'Ошибка сети' };
    }
}

// Проверка авторизации
async function checkAuth() {
    const data = await apiRequest('/api/user/me');
    if (!data.success) {
        window.location.href = '/login.html';
        return null;
    }
    return data.user;
}


// =============================================================================
// УВЕДОМЛЕНИЯ
// =============================================================================

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'danger');
}

function showInfo(message) {
    showToast(message, 'info');
}

function showToast(message, type = 'success') {
    // Создаём контейнер для toast если его нет
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    // Создаём toast
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} alert-dismissible fade show`;
    toast.role = 'alert';
    toast.style.minWidth = '300px';
    toast.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    container.appendChild(toast);

    // Автоудаление через 5 секунд
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// =============================================================================
// ФОРМАТИРОВАНИЕ
// =============================================================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateShort(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU');
}

function getStatusBadge(status) {
    const isCustomer = window.location.pathname.includes('customer');
    switch (status) {
        // Проекты
        case 'lead': return isCustomer ? '<span class="badge bg-primary text-uppercase">Заявка принята</span>' : '<span class="badge bg-primary text-uppercase">Новый лид</span>';
        case 'qualification': return isCustomer ? '<span class="badge text-dark text-uppercase" style="background:#0dcaf0;">Уточняем детали</span>' : '<span class="badge text-dark text-uppercase" style="background:#0dcaf0;">Квалификация</span>';
        case 'visit_scheduled': return isCustomer ? '<span class="badge bg-warning text-dark text-uppercase">Выезд на объект запланирован</span>' : '<span class="badge bg-warning text-dark text-uppercase">Выезд назначен</span>';
        case 'offer_in_progress': return isCustomer ? '<span class="badge text-dark border text-uppercase" style="background:#e9ecef;">Готовим КП</span>' : '<span class="badge text-dark border text-uppercase" style="background:#e9ecef;">КП в работе</span>';
        case 'offer_sent': return isCustomer ? '<span class="badge bg-info text-dark text-uppercase">КП направлено</span>' : '<span class="badge bg-info text-dark text-uppercase">КП отправлено</span>';
        case 'negotiation': return isCustomer ? '<span class="badge bg-warning text-dark text-uppercase">Согласование условий</span>' : '<span class="badge bg-warning text-dark text-uppercase">Переговоры</span>';
        case 'contract_signing': return isCustomer ? '<span class="badge bg-secondary text-uppercase">Договор на подписании</span>' : '<span class="badge bg-secondary text-uppercase">Договор на согласовании</span>';
        case 'waiting_advance': return isCustomer ? '<span class="badge text-dark text-uppercase" style="background:#ffc107;">Ожидаем аванс</span>' : '<span class="badge text-dark text-uppercase" style="background:#ffc107;">Ожидание аванса</span>';
        case 'in_progress': return isCustomer ? '<span class="badge bg-success text-uppercase">Работы выполняются</span>' : '<span class="badge bg-success text-uppercase">В работе</span>';
        case 'closing_docs': return isCustomer ? '<span class="badge bg-secondary text-uppercase">Оформление документации</span>' : '<span class="badge bg-secondary text-uppercase">Закрытие документов</span>';
        case 'won': return isCustomer ? '<span class="badge bg-success text-uppercase">Объект сдан</span>' : '<span class="badge bg-success text-uppercase">Закрыт — выигран</span>';
        case 'lost': return isCustomer ? '<span class="badge border border-danger text-danger text-uppercase bg-transparent d-none">Отменён</span>' : '<span class="badge border border-danger text-danger text-uppercase bg-transparent">Закрыт — проигран</span>';
        case 'postponed': return isCustomer ? '<span class="badge bg-dark text-uppercase">Рассмотрение приостановлено</span>' : '<span class="badge bg-dark text-uppercase">Отложен</span>';

        // Обратная совместимость с запросами (requests) и материалами из других таблиц:
        case 'new': return '<span class="badge bg-primary">НОВЫЙ</span>';
        case 'stages_pending': return '<span class="badge bg-warning text-dark">ОЖИДАНИЕ ЭТАПОВ</span>';
        case 'completed': return '<span class="badge bg-success">ЗАВЕРШЁН</span>';
        case 'cancelled': return '<span class="badge bg-danger">ОТМЕНЁН</span>';
        case 'pending': return '<span class="badge bg-warning text-dark">ОЖИДАЕТ</span>';
        case 'reviewed': return '<span class="badge bg-info text-dark">РАССМОТРЕНО</span>';
        case 'accepted': return '<span class="badge bg-success">ПРИНЯТО</span>';
        case 'rejected': return '<span class="badge bg-danger">ОТКЛОНЕНО</span>';
        case 'approved': return '<span class="badge bg-success">ОДОБРЕНО</span>';
        case 'delivered': return '<span class="badge bg-primary">ДОСТАВЛЕНО</span>';
        default: return `<span class="badge bg-secondary">${status ? status.toUpperCase() : 'НЕИЗВЕСТНО'}</span>`;
    }
}

// =============================================================================
// LOADING
// =============================================================================

function showLoading(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Загрузка...</span>
                </div>
                <p class="mt-2 text-muted">Загрузка...</p>
            </div>
        `;
    }
}

// =============================================================================
// МОДАЛЬНЫЕ ОКНА
// =============================================================================

function showModal(modalId) {
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
}

function hideModal(modalId) {
    const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
    if (modal) modal.hide();
}

// =============================================================================
// ВАЛИДАЦИЯ
// =============================================================================

function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return false;
    }
    return true;
}

// =============================================================================
// ЭКСПОРТ ТАБЛИЦЫ В CSV
// =============================================================================

function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    let csv = [];

    // Заголовки
    const headers = Array.from(table.querySelectorAll('thead th'))
        .map(th => th.textContent.trim());
    csv.push(headers.join(','));

    // Данные
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cols = Array.from(row.querySelectorAll('td'))
            .map(td => `"${td.textContent.trim()}"`);
        csv.push(cols.join(','));
    });

    // Скачивание
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Добавляем обработчик для кнопки выхода если она есть
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Показываем имя пользователя
    checkAuth().then(user => {
        if (user) {
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.full_name || user.login;
            }

            const userRoleElement = document.getElementById('userRole');
            if (userRoleElement) {
                const roles = {
                    'admin': 'Администратор',
                    'manager': 'Менеджер',
                    'foreman': 'Прораб',
                    'supplier': 'Снабженец',
                    'pto': 'Инженер ПТО',
                    'customer': 'Заказчик'
                };
                userRoleElement.textContent = roles[user.role] || user.role;
            }
        }
    });
});