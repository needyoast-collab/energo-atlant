// =============================================================================
// ADMIN.JS - Кабинет администратора
// =============================================================================

let allUsers = [];

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
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// Заглушка для проектов (пока не реализовано управление проектами в админке полностью)
async function loadProjects() {
    document.getElementById('projectsTable').innerHTML = '<div class="alert alert-info">Функция управления проектами для администратора находится в разработке.</div>';
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

                html += `
                    <tr>
                        <td class="text-muted small">${user.id}</td>
                        <td><strong>${user.login}</strong></td>
                        <td>${user.full_name}</td>
                        <td>${roleNames[user.role] || user.role}</td>
                        <td>${statusBadge}</td>
                        <td>
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
