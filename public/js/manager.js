// =============================================================================
// MANAGER.JS - Логика для кабинета менеджера (ИСПРАВЛЕННЫЙ)
// =============================================================================

let currentProjects = [];
let currentRequests = []; // Храним заявки глобально
let staffList = [];       // Храним список сотрудников глобально

// =============================================================================
// 1. ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Сначала грузим справочники
    await loadStaff(); 
    
    // 2. Потом данные
    await loadProjects();
    await loadRequests();
    
    // 3. Вешаем обработчик на создание проекта
    const createForm = document.getElementById('createProjectForm');
    if (createForm) {
        // Удаляем старые обработчики (на всякий случай)
        const newForm = createForm.cloneNode(true);
        createForm.parentNode.replaceChild(newForm, createForm);
        newForm.addEventListener('submit', handleCreateProject);
    }

    // Автообновление раз в 30 секунд
    setInterval(() => {
        loadProjects();
        loadRequests();
    }, 30000);
});

// =============================================================================
// 2. РАБОТА С ПЕРСОНАЛОМ
// =============================================================================

async function loadStaff() {
    try {
        const data = await apiRequest('/api/manager/staff');
        
        if (data.success) {
            staffList = data.staff; // Сохраняем в глобальную переменную
            populateStaffSelects(); // Заполняем селекты в модальном окне создания
        }
    } catch (e) {
        console.error("Ошибка загрузки персонала:", e);
    }
}

function populateStaffSelects() {
    // ID селектов из твоего HTML (sel_foreman, sel_supplier, sel_pto)
    const selects = {
        'sel_foreman': 'foreman',
        'sel_supplier': 'supplier',
        'sel_pto': 'pto'
    };

    for (const [id, role] of Object.entries(selects)) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<option value="">-- Не назначен --</option>';
            // Фильтруем сотрудников по роли и добавляем в список
            staffList.filter(s => s.role === role).forEach(s => {
                el.innerHTML += `<option value="${s.id}">${s.full_name}</option>`;
            });
        }
    }
}

// =============================================================================
// 3. ПРОЕКТЫ (CRUD)
// =============================================================================

async function loadProjects() {
    // Не показываем спиннер при автообновлении, если данные уже есть
    const container = document.getElementById('projectsList');
    if (!container.innerHTML.includes('table')) showLoading('projectsList');
    
    const data = await apiRequest('/api/manager/projects');
    
    if (data.success) {
        currentProjects = data.projects;
        renderProjects(data.projects);
    } else {
        container.innerHTML = `<div class="alert alert-danger">Ошибка: ${data.message}</div>`;
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsList');
    if (!projects || projects.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Нет активных проектов</div>';
        return;
    }

    let html = `
        <table class="table table-hover align-middle">
            <thead class="table-light">
                <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Адрес</th>
                    <th>Код</th>
                    <th>Прораб</th>
                    <th>Статус</th>
                    <th class="text-end">Действия</th>
                </tr>
            </thead>
            <tbody>
    `;

    projects.forEach(p => {
        html += `
            <tr>
                <td>${p.id}</td>
                <td class="fw-bold">${p.title}</td>
                <td class="small text-muted">${p.address || '-'}</td>
                <td><code class="user-select-all">${p.access_code}</code></td>
                <td>${p.foreman_name || '<span class="text-muted">–</span>'}</td>
                <td>${getStatusBadge(p.status)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewProject(${p.id})">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-warning" onclick="editProject(${p.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// СОЗДАНИЕ ПРОЕКТА
async function handleCreateProject(e) {
    e.preventDefault();
    
    // Собираем данные вручную, так как ID в HTML (p_title) отличаются от API (title)
    const payload = new FormData();
    payload.append('title', document.getElementById('p_title').value);
    payload.append('address', document.getElementById('p_address').value);
    payload.append('description', document.getElementById('p_description').value);
    payload.append('clientName', document.getElementById('p_clientName').value);
    payload.append('clientOrganization', document.getElementById('p_clientOrg').value);
    
    payload.append('foremanId', document.getElementById('sel_foreman').value);
    payload.append('supplierId', document.getElementById('sel_supplier').value);
    payload.append('ptoId', document.getElementById('sel_pto').value);

    // Файлы
    const fileInput = document.getElementById('p_files');
    if (fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            payload.append('documents', fileInput.files[i]);
        }
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Создание...";

    try {
        const res = await apiRequest('/api/manager/projects', 'POST', payload);
        
        if (res.success) {
            hideModal('createProjectModal');
            e.target.reset(); // Очистить форму
            showAccessCodeModal(res.accessCode); // Показать код
            await loadProjects();
        } else {
            showError(res.message);
        }
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// РЕДАКТИРОВАНИЕ ПРОЕКТА
async function editProject(id) {
    const p = currentProjects.find(x => x.id === id);
    if (!p) return;

    // Генерируем модалку динамически (чтобы избежать дублей событий)
    const modalHtml = `
        <div class="modal fade" id="editModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Редактирование: ${p.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="editForm">
                        <div class="modal-body">
                            <div class="mb-3"><label>Название</label><input class="form-control" id="e_title" value="${p.title}" required></div>
                            <div class="mb-3"><label>Адрес</label><input class="form-control" id="e_address" value="${p.address || ''}"></div>
                            <div class="mb-3"><label>Статус</label>
                                <select class="form-select" id="e_status">
                                    <option value="new" ${p.status==='new'?'selected':''}>Новый</option>
                                    <option value="stages_pending" ${p.status==='stages_pending'?'selected':''}>Ожидание этапов</option>
                                    <option value="in_progress" ${p.status==='in_progress'?'selected':''}>В работе</option>
                                    <option value="completed" ${p.status==='completed'?'selected':''}>Завершен</option>
                                </select>
                            </div>
                            </div>
                        <div class="modal-footer">
                            <button type="submit" class="btn btn-primary">Сохранить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    // Удаляем старую модалку если была
    const oldModal = document.getElementById('editModal');
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('editModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Обработчик сохранения
    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('e_title').value,
            address: document.getElementById('e_address').value,
            status: document.getElementById('e_status').value,
            // Передаем старые значения, чтобы не затереть их, если API требует полный объект
            description: p.description,
            clientName: p.client_name,
            clientOrganization: p.client_organization
        };

        const res = await apiRequest(`/api/manager/projects/${id}`, 'PUT', payload);
        if (res.success) {
            modal.hide();
            modalEl.remove(); // Чистим DOM
            showSuccess('Проект обновлен');
            loadProjects();
        } else {
            showError(res.message);
        }
    });
}

// =============================================================================
// 4. ЗАЯВКИ (REQUESTS)
// =============================================================================

async function loadRequests() {
    const data = await apiRequest('/api/manager/requests');
    if (data.success) {
        currentRequests = data.requests;
        renderRequests(data.requests);
        updateBadge(data.requests.length);
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requestsList');
    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-center text-muted my-5">Нет новых заявок</p>';
        return;
    }

    let html = '';
    requests.forEach(r => {
        html += `
            <div class="card mb-3 shadow-sm border-start border-4 border-primary">
                <div class="card-body">
                    <div class="d-flex justify-content-between">
                        <h5 class="card-title text-primary">${r.title || 'Без названия'}</h5>
                        <span class="text-muted small">${formatDateShort(r.created_at)}</span>
                    </div>
                    <p class="card-text">${r.description}</p>
                    
                    <div class="bg-light p-2 rounded mb-3 small">
                        <strong>От:</strong> ${r.customer_name} (${r.phone || 'нет тел.'})<br>
                        <strong>Контакты:</strong> ${r.contact_info || '-'}
                    </div>

                    <div class="d-flex gap-2">
                        <button class="btn btn-primary btn-sm" onclick="createProjectFromRequest(${r.id})">
                            <i class="bi bi-magic"></i> Создать проект
                        </button>
                        
                        <button class="btn btn-outline-success btn-sm" onclick="acceptRequest(${r.id})">
                            Принять
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="rejectRequest(${r.id})">
                            Отклонить
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ЛОГИКА: ПЕРЕНОС ДАННЫХ ИЗ ЗАЯВКИ В МОДАЛКУ ПРОЕКТА
function createProjectFromRequest(reqId) {
    const req = currentRequests.find(r => r.id === reqId);
    if (!req) return;

    // 1. Открываем модалку создания
    const modal = new bootstrap.Modal(document.getElementById('createProjectModal'));
    modal.show();

    // 2. Заполняем поля данными из заявки
    document.getElementById('p_title').value = req.title;
    document.getElementById('p_description').value = req.description;
    document.getElementById('p_clientName').value = req.customer_name;
    // document.getElementById('p_clientOrg').value = ... (если есть в заявке)

    // Можно добавить пометку, что проект по заявке (опционально)
}

async function acceptRequest(id) {
    if(!confirm('Принять заявку в архив?')) return;
    const res = await apiRequest(`/api/manager/requests/${id}`, 'PUT', { status: 'accepted', notes: 'Принято менеджером' });
    if(res.success) { showSuccess('Принято'); loadRequests(); }
}

async function rejectRequest(id) {
    const reason = prompt('Причина отказа:');
    if(!reason) return;
    const res = await apiRequest(`/api/manager/requests/${id}`, 'PUT', { status: 'rejected', notes: reason });
    if(res.success) { showSuccess('Отклонено'); loadRequests(); }
}

function updateBadge(count) {
    const badge = document.getElementById('newRequestsBadge');
    if (badge) {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// =============================================================================
// 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

function showAccessCodeModal(code) {
    const modalHtml = `
        <div class="modal fade" id="codeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content text-center">
                    <div class="modal-header bg-success text-white justify-content-center">
                        <h5 class="modal-title">Проект создан!</h5>
                    </div>
                    <div class="modal-body py-4">
                        <p>Код доступа:</p>
                        <h2 class="display-4 fw-bold user-select-all">${code}</h2>
                        <p class="text-muted small mt-3">Передайте этот код прорабу и заказчику</p>
                    </div>
                    <div class="modal-footer justify-content-center">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('codeModal'));
    modal.show();
}

function showLoading(id) {
    const el = document.getElementById(id);
    if(el) el.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
}

function getStatusBadge(status) {
    const map = {
        'new': '<span class="badge bg-secondary">Новый</span>',
        'stages_pending': '<span class="badge bg-warning text-dark">Ждет этапов</span>',
        'in_progress': '<span class="badge bg-primary">В работе</span>',
        'completed': '<span class="badge bg-success">Завершен</span>'
    };
    return map[status] || status;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ru-RU');
}