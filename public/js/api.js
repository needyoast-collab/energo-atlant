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

// Выход из системы
async function logout() {
    const confirmed = confirm('Вы уверены, что хотите выйти?');
    if (!confirmed) return;
    
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
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
    const statuses = {
        'new': '<span class="badge bg-primary">Новый</span>',
        'stages_pending': '<span class="badge bg-warning">Ожидание этапов</span>',
        'in_progress': '<span class="badge bg-info">В работе</span>',
        'completed': '<span class="badge bg-success">Завершен</span>',
        'cancelled': '<span class="badge bg-danger">Отменен</span>',
        'pending': '<span class="badge bg-warning">На рассмотрении</span>',
        'reviewed': '<span class="badge bg-info">Рассмотрено</span>',
        'accepted': '<span class="badge bg-success">Принято</span>',
        'rejected': '<span class="badge bg-danger">Отклонено</span>'
    };
    return statuses[status] || status;
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