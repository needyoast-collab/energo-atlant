// =============================================================================
// MANAGER.JS - Логика для кабинета менеджера
// =============================================================================

let currentProjects = [];
let staffList = [];

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadStaff();
    await loadProjects();
    await loadRequests();
    
    // Обработчик формы создания проекта
    const createProjectForm = document.getElementById('createProjectForm');
    if (createProjectForm) {
        createProjectForm.addEventListener('submit', handleCreateProject);
    }
});

// =============================================================================
// ЗАГРУЗКА ПЕРСОНАЛА
// =============================================================================

async function loadRequests() {
    showLoading('requestsList');
    
    const data = await apiRequest('/api/manager/requests');  // ← ПРОВЕРЬ ЧТО ТАК!
    
    if (data.success) {
        renderRequests(data.requests);
    } else {
        document.getElementById('requestsList').innerHTML = '<div class="alert alert-danger">Ошибка загрузки</div>';
    }
    // Автообновление заявок каждые 30 секунд
setTimeout(loadRequests, 30000);
}


// В функции showCreateProjectModal или при открытии модалки ДОБАВЬ:
async function loadStaffSelects() {
    const data = await apiRequest('/api/manager/staff');
    
    if (data.success) {
        const foreman = document.getElementById('foremanId') || document.getElementById('sel_foreman');
        const supplier = document.getElementById('supplierId') || document.getElementById('sel_supplier');
        const pto = document.getElementById('ptoId') || document.getElementById('sel_pto');
        
        if (foreman) {
            foreman.innerHTML = '<option value="">-- Не назначен --</option>';
            data.staff.filter(s => s.role === 'foreman').forEach(s => {
                foreman.innerHTML += `<option value="${s.id}">${s.full_name}</option>`;
            });
        }
        
        if (supplier) {
            supplier.innerHTML = '<option value="">-- Не назначен --</option>';
            data.staff.filter(s => s.role === 'supplier').forEach(s => {
                supplier.innerHTML += `<option value="${s.id}">${s.full_name}</option>`;
            });
        }
        
        if (pto) {
            pto.innerHTML = '<option value="">-- Не назначен --</option>';
            data.staff.filter(s => s.role === 'pto').forEach(s => {
                pto.innerHTML += `<option value="${s.id}">${s.full_name}</option>`;
            });
        }
    }
}

// =============================================================================
// СОЗДАНИЕ ПРОЕКТА
// =============================================================================

async function handleCreateProject(e) {
    e.preventDefault();
    
    if (!validateForm('createProjectForm')) {
        showError('Заполните обязательные поля');
        return;
    }
    
    const formData = new FormData(e.target);
    
    // Добавляем файлы если есть
    const documentsInput = document.getElementById('projectDocuments');
    if (documentsInput && documentsInput.files.length > 0) {
        Array.from(documentsInput.files).forEach(file => {
            formData.append('documents', file);
        });
    }
    
    showLoading('projectsTable');
    
    const result = await apiRequest('/api/manager/projects', 'POST', formData);

    if (result.success) {
        // ПОКАЗЫВАЕМ КОД ПРОЕКТА
        alert(`✅ Проект создан!\n\nКод доступа: ${result.accessCode}\n\nОтправьте этот код прорабу и заказчику.`);
        
        // Или создай красивое модальное окно:
        showAccessCodeModal(result.accessCode, result.projectId);
        
        hideModal('createProjectModal');
        await loadProjects();
    } else {
        showError(result.message || 'Ошибка создания проекта');
    }
}
function showAccessCodeModal(code, projectId) {
    const modal = `
        <div class="modal fade" id="accessCodeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">✅ Проект создан!</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center py-4">
                        <p class="lead">Код доступа к проекту:</p>
                        <div class="bg-light p-4 rounded">
                            <h2 class="mb-0" style="font-family: monospace; letter-spacing: 3px;">${code}</h2>
                        </div>
                        <p class="mt-3 text-muted">Отправьте этот код прорабу и заказчику</p>
                        <button class="btn btn-outline-primary" onclick="navigator.clipboard.writeText('${code}'); showSuccess('Код скопирован!');">
                            📋 Скопировать код
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('accessCodeModal');
    
    document.getElementById('accessCodeModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

function showAccessCode(code) {
    const modal = `
        <div class="modal fade" id="accessCodeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">✅ Проект создан!</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center">
                        <p class="mb-3">Код доступа к проекту:</p>
                        <h2 class="display-4 text-primary mb-3">${code}</h2>
                        <button class="btn btn-outline-primary" onclick="copyToClipboard('${code}')">
                            📋 Скопировать код
                        </button>
                        <p class="mt-3 text-muted small">
                            Отправьте этот код прорабу и заказчику для доступа к проекту
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('accessCodeModal');
    
    // Удаляем модалку после закрытия
    document.getElementById('accessCodeModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Код скопирован в буфер обмена');
    });
}

// =============================================================================
// ЗАГРУЗКА ПРОЕКТОВ
// =============================================================================

async function loadProjects() {
    showLoading('projectsTable');
    
    const data = await apiRequest('/api/manager/projects');
    
    if (data.success) {
        currentProjects = data.projects;
        renderProjects(data.projects);
    } else {
        document.getElementById('projectsTable').innerHTML = `
            <div class="alert alert-danger">Ошибка загрузки проектов</div>
        `;
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsTable');
    
    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                📋 У вас пока нет проектов. Создайте первый проект!
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-light">
                    <tr>
                        <th>ID</th>
                        <th>Название</th>
                        <th>Адрес</th>
                        <th>Код доступа</th>
                        <th>Прораб</th>
                        <th>Статус</th>
                        <th>Создан</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    projects.forEach(project => {
        html += `
            <tr>
                <td>${project.id}</td>
                <td><strong>${project.title}</strong></td>
                <td>${project.address || '-'}</td>
                <td>
                    <code>${project.access_code}</code>
                    <button class="btn btn-sm btn-outline-secondary ms-1" 
                            onclick="copyToClipboard('${project.access_code}')" 
                            title="Скопировать">
                        📋
                    </button>
                </td>
                <td>${project.foreman_name || '<span class="text-muted">Не назначен</span>'}</td>
                <td>${getStatusBadge(project.status)}</td>
                <td>${formatDateShort(project.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewProject(${project.id})">
                        👁️ Просмотр
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editProject(${project.id})">
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
}

// =============================================================================
// ПРОСМОТР ПРОЕКТА
// =============================================================================

async function viewProject(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    if (!project) return;
    
    const modal = `
        <div class="modal fade" id="viewProjectModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">📋 ${project.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>ID:</strong> ${project.id}</p>
                                <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                                <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                                <p><strong>Код доступа:</strong> <code>${project.access_code}</code></p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Прораб:</strong> ${project.foreman_name || '-'}</p>
                                <p><strong>Снабженец:</strong> ${project.supplier_name || '-'}</p>
                                <p><strong>ПТО:</strong> ${project.pto_name || '-'}</p>
                                <p><strong>Заказчик:</strong> ${project.customer_name || '-'}</p>
                            </div>
                        </div>
                        <hr>
                        <p><strong>Описание:</strong></p>
                        <p>${project.description || 'Нет описания'}</p>
                        <hr>
                        <p><strong>Клиент:</strong> ${project.client_name || '-'}</p>
                        <p><strong>Организация:</strong> ${project.client_organization || '-'}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Закрыть</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('viewProjectModal');
    
    document.getElementById('viewProjectModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// =============================================================================
// РЕДАКТИРОВАНИЕ ПРОЕКТА
// =============================================================================

async function editProject(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    if (!project) return;
    
    const modal = `
        <div class="modal fade" id="editProjectModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">✏️ Редактирование проекта</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="editProjectForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Название *</label>
                                <input type="text" class="form-control" id="editTitle" value="${project.title}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Адрес</label>
                                <input type="text" class="form-control" id="editAddress" value="${project.address || ''}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="editDescription" rows="3">${project.description || ''}</textarea>
                            </div>
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Прораб</label>
                                        <select class="form-select" id="editForemanId">
                                            <option value="">Не назначен</option>
                                            ${staffList.filter(s => s.role === 'foreman').map(s => 
                                                `<option value="${s.id}" ${s.id === project.foreman_id ? 'selected' : ''}>${s.full_name}</option>`
                                            ).join('')}
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Снабженец</label>
                                        <select class="form-select" id="editSupplierId">
                                            <option value="">Не назначен</option>
                                            ${staffList.filter(s => s.role === 'supplier').map(s => 
                                                `<option value="${s.id}" ${s.id === project.supplier_id ? 'selected' : ''}>${s.full_name}</option>`
                                            ).join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Статус</label>
                                <select class="form-select" id="editStatus">
                                    <option value="new" ${project.status === 'new' ? 'selected' : ''}>Новый</option>
                                    <option value="stages_pending" ${project.status === 'stages_pending' ? 'selected' : ''}>Ожидание этапов</option>
                                    <option value="in_progress" ${project.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                                    <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Завершен</option>
                                    <option value="cancelled" ${project.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">💾 Сохранить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('editProjectModal');
    
    document.getElementById('editProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updateData = {
            title: document.getElementById('editTitle').value,
            address: document.getElementById('editAddress').value,
            description: document.getElementById('editDescription').value,
            clientName: project.client_name,
            clientOrganization: project.client_organization,
            foremanId: document.getElementById('editForemanId').value || null,
            supplierId: document.getElementById('editSupplierId').value || null,
            ptoId: project.pto_id,
            status: document.getElementById('editStatus').value
        };
        
        const result = await apiRequest(`/api/manager/projects/${projectId}`, 'PUT', updateData);
        
        if (result.success) {
            showSuccess('Проект обновлен');
            hideModal('editProjectModal');
            await loadProjects();
        } else {
            showError(result.message || 'Ошибка обновления');
        }
    });
    
    document.getElementById('editProjectModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// =============================================================================
// ЗАЯВКИ ОТ КЛИЕНТОВ
// =============================================================================

async function loadRequests() {
    const data = await apiRequest('/api/manager/requests');
    
    if (data.success) {
        renderRequests(data.requests);
    }
    // Автообновление заявок каждые 30 секунд
setTimeout(loadRequests, 30000);
}

function renderRequests(requests) {
    const container = document.getElementById('requestsList');
    if (!container) return;
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="alert alert-info">📭 Новых заявок нет</div>';
        return;
    }
    
    let html = '';
    requests.forEach(request => {
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <h5 class="card-title">${request.title || 'Заявка от клиента'}</h5>
                    <p class="card-text">${request.description}</p>
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Заказчик:</strong> ${request.customer_name}</p>
                            <p><strong>Email:</strong> ${request.email || '-'}</p>
                            <p><strong>Телефон:</strong> ${request.phone || '-'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Дата:</strong> ${formatDate(request.created_at)}</p>
                            <p><strong>Контакты:</strong> ${request.contact_info || '-'}</p>
                        </div>
                    </div>
                    <hr>
                    <button class="btn btn-success" onclick="acceptRequest(${request.id})">✅ Принять</button>
                    <button class="btn btn-danger" onclick="rejectRequest(${request.id})">❌ Отклонить</button>
                    <button class="btn btn-secondary" onclick="markAsReviewed(${request.id})">👁️ Отметить как рассмотренное</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function acceptRequest(requestId) {
    const notes = prompt('Комментарий (необязательно):');
    
    const data = await apiRequest(`/api/manager/requests/${requestId}`, 'PUT', {
        status: 'accepted',
        notes: notes || 'Заявка принята'
    });
    
    if (data.success) {
        showSuccess('Заявка принята');
        await loadRequests();
    } else {
        showError('Ошибка обработки заявки');
    }
}

async function rejectRequest(requestId) {
    const notes = prompt('Причина отклонения (обязательно):');
    if (!notes) {
        showError('Укажите причину отклонения');
        return;
    }
    
    const data = await apiRequest(`/api/manager/requests/${requestId}`, 'PUT', {
        status: 'rejected',
        notes: notes
    });
    
    if (data.success) {
        showSuccess('Заявка отклонена');
        await loadRequests();
    } else {
        showError('Ошибка обработки заявки');
    }
}

async function markAsReviewed(requestId) {
    const data = await apiRequest(`/api/manager/requests/${requestId}`, 'PUT', {
        status: 'reviewed',
        notes: 'Рассмотрено'
    });
    
    if (data.success) {
        showSuccess('Заявка отмечена как рассмотренная');
        await loadRequests();
    } else {
        showError('Ошибка обработки заявки');
    }
}