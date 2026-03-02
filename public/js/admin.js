// =============================================================================
// ADMIN.JS - Кабинет администратора
// =============================================================================

let allUsers = [];
let currentProjects = [];

document.addEventListener('DOMContentLoaded', () => {
    loadStats();

    // Загружаем пользователей при переключении на вкладку
    const usersTab = document.getElementById('users-tab');
    if (usersTab) {
        usersTab.addEventListener('click', loadUsers);
        // Если вкладка активна по умолчанию
        if (usersTab.classList.contains('active')) {
            loadUsers();
        }
    }

    const projectsTab = document.getElementById('projects-tab');
    if (projectsTab) {
        projectsTab.addEventListener('click', loadProjects);
        if (projectsTab.classList.contains('active')) loadProjects();
    }

    const requestsTab = document.getElementById('requests-tab');
    if (requestsTab) {
        requestsTab.addEventListener('click', loadRequests);
        if (requestsTab.classList.contains('active')) loadRequests();
    }
});

// =============================================================================
// СТАТИСТИКА И ПРОЕКТЫ
// =============================================================================

async function loadStats() {
    try {
        const [projectsRes, requestsRes] = await Promise.all([
            apiRequest('/api/manager/projects'),
            apiRequest('/api/manager/requests')
        ]);

        if (projectsRes.success) {
            document.getElementById('totalProjects').textContent = projectsRes.projects.length;
            const active = projectsRes.projects.filter(p => p.status === 'in_progress').length;
            document.getElementById('activeProjects').textContent = active;
        }

        if (requestsRes.success) {
            const pending = requestsRes.requests.filter(r => r.status === 'pending').length;
            document.getElementById('pendingRequests').textContent = pending;
        }
        const usersRes = await apiRequest('/api/admin/users');
        if (usersRes.success) {
            document.getElementById('totalUsers').textContent = usersRes.users.length;
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Загрузка проектов в админке
async function loadProjects() {
    const container = document.getElementById('projectsTable');
    showLoading('projectsTable');
    const data = await apiRequest('/api/manager/projects');
    if (data.success) {
        currentProjects = data.projects;
        const active = data.projects.filter(p => !['completed', 'cancelled'].includes(p.status));
        const completed = data.projects.filter(p => ['completed', 'cancelled'].includes(p.status));

        if (active.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <p class="text-muted">Нет активных проектов</p>
                    ${completed.length > 0 ? `<p class="small text-muted">Завершённых: ${completed.length}.</p>` : ''}
                </div>`;
            return;
        }

        let html = '<div class="row g-4">';
        active.forEach(p => {
            // Определяем имя заказчика для красивого вывода
            const clientDisplay = p.customer_name
                ? `<span class="badge bg-info text-dark border"><i class="bi bi-person-circle"></i> ${p.customer_name}</span>`
                : (p.client_name ? `<span class="badge bg-secondary border"><i class="bi bi-person"></i> ${p.client_name}</span>` : '<span class="text-muted small">Заказчик не назначен</span>');

            const foremanDisplay = p.foreman_name
                ? `<span class="badge border border-warning text-warning bg-transparent"><i class="bi bi-tools"></i> ${p.foreman_name}</span>`
                : `<span class="badge border border-secondary text-secondary bg-transparent"><i class="bi bi-exclamation-triangle"></i> Прораб не назначен</span>`;

            html += `
                <div class="col-12 col-md-6 col-xl-4">
                    <div class="card h-100 bg-transparent border-secondary shadow-hover" style="border: 1px solid var(--border-color);">
                        <div class="card-header border-bottom border-secondary bg-transparent d-flex justify-content-between align-items-start pt-3 pb-2">
                             <div class="d-flex flex-column">
                                <h5 class="fw-bold mb-1 text-white text-truncate" style="max-width: 250px;" title="${p.title}">${p.title}</h5>
                                <small class="text-muted"><i class="bi bi-hash"></i> ${p.id}</small>
                             </div>
                             ${getStatusBadge(p.status)}
                        </div>
                        <div class="card-body">
                            <div class="mb-3 d-flex flex-wrap gap-2">
                                 ${clientDisplay}
                                 ${foremanDisplay}
                            </div>
                            <div class="mb-3">
                                <p class="mb-1 text-muted small"><i class="bi bi-geo-alt"></i> Адрес</p>
                                <span class="text-white">${p.address || '<span class="text-muted">-</span>'}</span>
                            </div>
                            <div class="mb-2">
                                 <p class="mb-1 text-muted small"><i class="bi bi-key"></i> Код доступа</p>
                                 <code class="user-select-all px-2 py-1 rounded" style="background-color: var(--bg-elevated); color: var(--primary-color); border: 1px solid var(--border-color);">${p.access_code}</code>
                            </div>
                        </div>
                        <div class="card-footer bg-transparent border-top border-secondary pt-3 pb-3">
                            <div class="d-flex justify-content-between gap-2">
                                <button class="btn btn-sm btn-outline-warning flex-grow-1" onclick="editProject(${p.id})">
                                    <i class="bi bi-pencil-square"></i> ИЗМЕНИТЬ
                                </button>
                                <button class="btn btn-sm btn-outline-info" onclick="showProjectDocs(${p.id})">
                                    <i class="bi bi-folder2-open"></i> DOCS
                                </button>
                                <button class="btn btn-sm btn-ai-glow" onclick="showAIModal(${p.id})">
                                    <i class="bi bi-stars"></i> ✨ ИИ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        html += '</div>';

        if (completed.length > 0) {
            html += `
                <div class="p-3 mt-4 text-muted small border-top border-secondary text-center">
                    Завершённых проектов: ${completed.length} (доступны в общем списке API)
                </div>`;
        }

        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки проектов</div>';
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'new': return '<span class="badge bg-primary">Новый</span>';
        case 'in_progress': return '<span class="badge bg-info">В работе</span>';
        case 'stages_pending': return '<span class="badge bg-warning text-dark">Ожидание этапов</span>';
        case 'completed': return '<span class="badge bg-success">Завершён</span>';
        case 'cancelled': return '<span class="badge bg-danger">Отменён</span>';
        default: return '<span class="badge bg-secondary">Неизвестно</span>';
    }
}

function showLoading(containerId) {
    document.getElementById(containerId).innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Загрузка...</span>
            </div>
            <p class="mt-2 text-muted">Загрузка данных...</p>
        </div>`;
}

// Загрузка заявок в админке
async function loadRequests() {
    const container = document.getElementById('requestsList');
    showLoading('requestsList');
    const data = await apiRequest('/api/manager/requests');
    if (data.success) {
        let html = `<div class="table-responsive"><table class="table table-hover">
             <thead class="table-light"><tr><th>ID</th><th>Заголовок</th><th>Клиент</th></tr></thead><tbody>`;
        data.requests.forEach(r => {
            html += `<tr><td>${r.id}</td><td>${r.title}</td><td>${r.customer_name}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки заявок</div>';
    }
}

// =============================================================================
// ПОЛЬЗОВАТЕЛИ
// =============================================================================

async function loadUsers() {
    const container = document.getElementById('usersTable');
    showLoading('usersTable');

    try {
        const data = await apiRequest('/api/admin/users');

        if (data.success) {
            allUsers = data.users;

            let html = `
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead class="table-light">
                            <tr>
                                <th>ID</th>
                                <th>Логин</th>
                                <th>ФИО</th>
                                <th>Роль</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            data.users.forEach(user => {
                const roleNames = {
                    'admin': '<span class="badge bg-danger">Администратор</span>',
                    'manager': '<span class="badge bg-primary">Менеджер</span>',
                    'foreman': '<span class="badge bg-info text-dark">Прораб</span>',
                    'supplier': '<span class="badge bg-warning text-dark">Снабженец</span>',
                    'pto': '<span class="badge bg-secondary">Инженер ПТО</span>',
                    'customer': '<span class="badge bg-success">Заказчик</span>'
                };

                const statusBadge = user.is_active
                    ? '<span class="badge bg-success">Активен</span>'
                    : '<span class="badge bg-danger">Отключен</span>';

                const verifyBadge = user.is_verified
                    ? '<span class="badge bg-success ms-1" title="Верифицирован"><i class="bi bi-patch-check-fill"></i></span>'
                    : '<span class="badge bg-warning text-dark ms-1" title="Ожидает модерации"><i class="bi bi-clock-history"></i> Непроверен</span>';

                html += `
                    <tr>
                        <td class="text-muted small">${user.id}</td>
                        <td><strong>${user.login}</strong> ${verifyBadge}</td>
                        <td>${user.full_name}</td>
                        <td>${roleNames[user.role] || user.role}</td>
                        <td>${statusBadge}</td>
                        <td>
                            ${user.is_verified === 0 ? `<button class="btn btn-sm btn-success me-1" onclick="verifyUser(${user.id})" title="Одобрить"><i class="bi bi-check-circle"></i></button>` : ''}
                            <button class="btn btn-sm btn-outline-primary" onclick="editUser(${user.id})">
                                ✏️ Изменить
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            container.innerHTML = html;
        } else {
            container.innerHTML = `<div class="alert alert-danger">${data.message || 'Ошибка загрузки пользователей'}</div>`;
        }
    } catch (error) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка сервера при загрузке пользователей</div>';
    }
}

// =============================================================================
// ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ
// =============================================================================

function showAddUserModal() {
    const oldModal = document.getElementById('addUserModal');
    if (oldModal) oldModal.remove();

    const modalHtml = `
        <div class="modal fade" id="addUserModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">➕ Добавить пользователя</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="addUserForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Логин *</label>
                                <input type="text" class="form-control" id="addLogin" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Пароль *</label>
                                <input type="password" class="form-control" id="addPassword" required minlength="4">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">E-mail</label>
                                <input type="email" class="form-control" id="addEmail">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">ФИО *</label>
                                <input type="text" class="form-control" id="addFullName" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Роль *</label>
                                <select class="form-select" id="addRole" required>
                                    <option value="">-- Выберите роль --</option>
                                    <option value="admin">Администратор</option>
                                    <option value="manager">Менеджер</option>
                                    <option value="foreman">Прораб</option>
                                    <option value="supplier">Снабженец</option>
                                    <option value="pto">Инженер ПТО</option>
                                    <option value="customer">Заказчик</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Организация</label>
                                <input type="text" class="form-control" id="addOrganization">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-success">Создать</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
    modal.show();

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('[type=submit]');
        const ogText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Создание...';

        const payload = {
            login: document.getElementById('addLogin').value,
            password: document.getElementById('addPassword').value,
            email: document.getElementById('addEmail').value,
            full_name: document.getElementById('addFullName').value,
            role: document.getElementById('addRole').value,
            organization: document.getElementById('addOrganization').value
        };

        const res = await apiRequest('/api/admin/users', 'POST', payload);

        if (res.success) {
            modal.hide();
            showSuccess(res.message);
            loadUsers(); // Перезагружаем список
        } else {
            showError(res.message);
            btn.disabled = false;
            btn.innerHTML = ogText;
        }
    });

    document.getElementById('addUserModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ
// =============================================================================

function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    const oldModal = document.getElementById('editUserModal');
    if (oldModal) oldModal.remove();

    const modalHtml = `
        <div class="modal fade" id="editUserModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">✏️ Редактирование: ${user.login}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="editUserForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">E-mail</label>
                                <input type="email" class="form-control" id="editEmail" value="${user.email || ''}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">ФИО *</label>
                                <input type="text" class="form-control" id="editFullName" value="${user.full_name}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Роль *</label>
                                <select class="form-select" id="editRole" required>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Администратор</option>
                                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Менеджер</option>
                                    <option value="foreman" ${user.role === 'foreman' ? 'selected' : ''}>Прораб</option>
                                    <option value="supplier" ${user.role === 'supplier' ? 'selected' : ''}>Снабженец</option>
                                    <option value="pto" ${user.role === 'pto' ? 'selected' : ''}>Инженер ПТО</option>
                                    <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Заказчик</option>
                                </select>
                            </div>
                            <div class="mb-3 form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="editIsActive" ${user.is_active ? 'checked' : ''}>
                                <label class="form-check-label text-${user.is_active ? 'success' : 'danger'}" id="isActiveText">
                                    ${user.is_active ? 'Активен' : 'Отключен'}
                                </label>
                            </div>
                            <small class="text-muted">Для смены пароля обратитесь к разработчику (временно не реализовано в интерфейсе)</small>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">Сохранить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    modal.show();

    // Обновляем текст при переключении свитча
    document.getElementById('editIsActive').addEventListener('change', function (e) {
        const label = document.getElementById('isActiveText');
        if (e.target.checked) {
            label.textContent = 'Активен';
            label.className = 'form-check-label text-success';
        } else {
            label.textContent = 'Отключен';
            label.className = 'form-check-label text-danger';
        }
    });

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('[type=submit]');
        const ogText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Сохранение...';

        const payload = {
            email: document.getElementById('editEmail').value,
            full_name: document.getElementById('editFullName').value,
            role: document.getElementById('editRole').value,
            is_active: document.getElementById('editIsActive').checked ? 1 : 0
        };

        const res = await apiRequest(`/api/admin/users/${userId}`, 'PUT', payload);

        if (res.success) {
            modal.hide();
            showSuccess(res.message);
            loadUsers(); // Перезагружаем список
        } else {
            showError(res.message);
            btn.disabled = false;
            btn.innerHTML = ogText;
        }
    });

    document.getElementById('editUserModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// ВЕРИФИКАЦИЯ ПОЛЬЗОВАТЕЛЯ
// =============================================================================

async function verifyUser(userId) {
    if (!confirm('Вы уверены, что хотите верифицировать (одобрить) этого пользователя? Он получит доступ к системе.')) {
        return;
    }

    try {
        const res = await apiRequest(`/api/admin/users/${userId}/verify`, 'POST');
        if (res.success) {
            showSuccess(res.message);
            loadUsers(); // Перезагружаем таблицу, чтобы обновить бейджи
        } else {
            showError(res.message);
        }
    } catch (error) {
        showError('Ошибка сервера при верификации');
    }
}
