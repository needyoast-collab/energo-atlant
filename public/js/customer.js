// =============================================================================
// CUSTOMER.JS - Логика для кабинета заказчика
// =============================================================================

let currentProjects = [];
let myRequests = [];

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await loadRequests();
    
    // Показываем приветственное окно если нет проектов
    const projects = await apiRequest('/api/customer/projects');
    if (projects.success && projects.projects.length === 0) {
        showWelcomeModal();
    }
    
    // Обработчик формы создания заявки
    const createRequestForm = document.getElementById('createRequestForm');
    if (createRequestForm) {
        createRequestForm.addEventListener('submit', handleCreateRequest);
    }
    
    // Обработчик формы присоединения по коду
    const joinForm = document.getElementById('joinProjectForm');
    if (joinForm) {
        joinForm.addEventListener('submit', handleJoinProject);
    }
});

// =============================================================================
// ПРИВЕТСТВЕННОЕ ОКНО
// =============================================================================

function showWelcomeModal() {
    const modal = `
        <div class="modal fade" id="welcomeModal" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">👋 Добро пожаловать в ЭнергоАтлант!</h5>
                    </div>
                    <div class="modal-body">
                        <p class="lead">Выберите один из вариантов:</p>
                        
                        <div class="row mt-4">
                            <div class="col-md-6">
                                <div class="card h-100 border-primary">
                                    <div class="card-body text-center">
                                        <h2 class="text-primary mb-3">📝</h2>
                                        <h5 class="card-title">Создать новую заявку</h5>
                                        <p class="card-text">
                                            Опишите ваш проект, загрузите документы.
                                            Наш менеджер свяжется с вами в ближайшее время.
                                        </p>
                                        <button class="btn btn-primary w-100 mt-3" 
                                                onclick="showCreateRequestModal(); hideModal('welcomeModal')">
                                            Создать заявку
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-6">
                                <div class="card h-100 border-success">
                                    <div class="card-body text-center">
                                        <h2 class="text-success mb-3">🔑</h2>
                                        <h5 class="card-title">У меня есть код проекта</h5>
                                        <p class="card-text">
                                            Если менеджер уже создал проект и выдал вам код доступа,
                                            введите его здесь.
                                        </p>
                                        <button class="btn btn-success w-100 mt-3" 
                                                onclick="showJoinProjectModal(); hideModal('welcomeModal')">
                                            Ввести код
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <p class="text-muted text-center mt-4 mb-0">
                            <small>Вы всегда можете вернуться к этому окну через меню</small>
                        </p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('welcomeModal');
    
    document.getElementById('welcomeModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// =============================================================================
// СОЗДАНИЕ ЗАЯВКИ
// =============================================================================

function showCreateRequestModal() {
    const modal = `
        <div class="modal fade" id="createRequestModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">📝 Создание заявки на проект</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="createRequestFormModal">
                        <div class="modal-body">
                            <div class="alert alert-info">
                                💡 Заполните форму, и наш менеджер свяжется с вами в течение 24 часов
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Название проекта *</label>
                                <input type="text" class="form-control" id="requestTitle" required
                                       placeholder="Например: Электрификация склада">
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Описание проекта *</label>
                                <textarea class="form-control" id="requestDescription" rows="5" required
                                          placeholder="Опишите что нужно сделать, объем работ, сроки"></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Контактные данные *</label>
                                <input type="text" class="form-control" id="requestContact" required
                                       placeholder="Телефон, email для связи">
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Документы</label>
                                <input type="file" class="form-control" id="requestDocuments" 
                                       multiple accept=".pdf,.doc,.docx,.jpg,.png">
                                <small class="text-muted">
                                    Можете приложить планы, схемы, фото объекта (до 5 файлов)
                                </small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">📤 Отправить заявку</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('createRequestModal');
    
    document.getElementById('createRequestFormModal').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('title', document.getElementById('requestTitle').value);
        formData.append('description', document.getElementById('requestDescription').value);
        formData.append('contactInfo', document.getElementById('requestContact').value);
        
        const files = document.getElementById('requestDocuments').files;
        if (files.length > 5) {
            showError('Максимум 5 файлов');
            return;
        }
        
        Array.from(files).forEach(file => {
            formData.append('documents', file);
        });
        
        const result = await apiRequest('/api/customer/requests', 'POST', formData);
        
        if (result.success) {
            showSuccess(result.message);
            hideModal('createRequestModal');
            await loadRequests();
        } else {
            showError(result.message || 'Ошибка отправки заявки');
        }
    });
    
    document.getElementById('createRequestModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

async function handleCreateRequest(e) {
    e.preventDefault();
    // Для формы на главной странице если есть
}

// =============================================================================
// ПРИСОЕДИНЕНИЕ ПО КОДУ
// =============================================================================

function showJoinProjectModal() {
    const modal = `
        <div class="modal fade" id="joinProjectModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">🔑 Присоединение к проекту</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="joinProjectFormModal">
                        <div class="modal-body">
                            <div class="alert alert-info">
                                💡 Введите код, который вам выдал менеджер
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Код проекта *</label>
                                <input type="text" class="form-control form-control-lg text-center" 
                                       id="projectCode" required
                                       placeholder="PRJ-XXXXXX"
                                       style="font-family: monospace; font-size: 1.5rem;">
                                <small class="text-muted">
                                    Формат: PRJ-XXXXXX (6 символов)
                                </small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-success">✔️ Присоединиться</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('joinProjectModal');
    
    document.getElementById('joinProjectFormModal').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const code = document.getElementById('projectCode').value.trim().toUpperCase();
        
        const result = await apiRequest('/api/customer/join', 'POST', { accessCode: code });
        
        if (result.success) {
            showSuccess(`Вы присоединились к проекту: ${result.project.title}`);
            hideModal('joinProjectModal');
            await loadProjects();
        } else {
            showError(result.message || 'Проект не найден');
        }
    });
    
    document.getElementById('joinProjectModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

async function handleJoinProject(e) {
    e.preventDefault();
    // Для формы на главной странице если есть
}

// =============================================================================
// ЗАГРУЗКА ПРОЕКТОВ
// =============================================================================

async function loadProjects() {
    showLoading('projectsList');
    
    const data = await apiRequest('/api/customer/projects');
    
    if (data.success) {
        currentProjects = data.projects;
        renderProjects(data.projects);
    } else {
        document.getElementById('projectsList').innerHTML = `
            <div class="alert alert-danger">Ошибка загрузки проектов</div>
        `;
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsList');
    
    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center">
                <h5>У вас пока нет проектов</h5>
                <p>Создайте заявку или введите код проекта от менеджера</p>
                <button class="btn btn-primary me-2" onclick="showCreateRequestModal()">
                    📝 Создать заявку
                </button>
                <button class="btn btn-success" onclick="showJoinProjectModal()">
                    🔑 Ввести код
                </button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="row">';
    
    projects.forEach(project => {
        html += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">${project.title}</h5>
                        <p class="text-muted">${project.address || ''}</p>
                        <hr>
                        <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        ${project.manager_phone ? `<p><strong>Телефон:</strong> ${project.manager_phone}</p>` : ''}
                        ${project.manager_email ? `<p><strong>Email:</strong> ${project.manager_email}</p>` : ''}
                        
                        <button class="btn btn-primary w-100 mt-2" onclick="viewProjectDetails(${project.id})">
                            👁️ Просмотр проекта
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// =============================================================================
// ПРОСМОТР ДЕТАЛЕЙ ПРОЕКТА
// =============================================================================

async function viewProjectDetails(projectId) {
    showLoading('projectDetails');
    
    const data = await apiRequest(`/api/customer/projects/${projectId}`);
    
    if (data.success) {
        renderProjectDetails(data.project, data.stages, data.documents);
    } else {
        showError('Ошибка загрузки проекта');
    }
}

function renderProjectDetails(project, stages, documents) {
    const container = document.getElementById('projectDetails');
    if (!container) return;
    
    let html = `
        <div class="card mb-3">
            <div class="card-header bg-primary text-white">
                <h4 class="mb-0">📋 ${project.title}</h4>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                        <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p><strong>Создан:</strong> ${formatDate(project.created_at)}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        ${project.manager_phone ? `<p><strong>Телефон:</strong> <a href="tel:${project.manager_phone}">${project.manager_phone}</a></p>` : ''}
                        ${project.manager_email ? `<p><strong>Email:</strong> <a href="mailto:${project.manager_email}">${project.manager_email}</a></p>` : ''}
                    </div>
                </div>
                ${project.description ? `<hr><p>${project.description}</p>` : ''}
            </div>
        </div>
        
        <h5 class="mt-4 mb-3">🔨 Ход работ</h5>
    `;
    
    if (!stages || stages.length === 0) {
        html += '<div class="alert alert-info">Работы еще не начаты</div>';
    } else {
        // Прогресс
        const completedStages = stages.filter(s => s.is_completed === 1).length;
        const totalStages = stages.length;
        const progress = Math.round((completedStages / totalStages) * 100);
        
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <h6>Общий прогресс</h6>
                    <div class="progress" style="height: 30px;">
                        <div class="progress-bar bg-success" style="width: ${progress}%">
                            ${progress}% (${completedStages} из ${totalStages})
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Этапы
        stages.forEach(stage => {
            html += renderStage(stage);
        });
    }
    
    // Документы
    if (documents && documents.length > 0) {
        html += `
            <h5 class="mt-4 mb-3">📄 Документы</h5>
            <div class="card">
                <div class="card-body">
        `;
        
        const executiveDocs = documents.filter(d => d.document_type === 'executive');
        const otherDocs = documents.filter(d => d.document_type !== 'executive');
        
        if (executiveDocs.length > 0) {
            html += '<h6>✅ Исполнительная документация:</h6><div class="list-group mb-3">';
            executiveDocs.forEach(doc => {
                html += `
                    <a href="/${doc.file_path}" target="_blank" class="list-group-item list-group-item-action list-group-item-success">
                        📎 ${doc.file_name}
                    </a>
                `;
            });
            html += '</div>';
        }
        
        if (otherDocs.length > 0) {
            html += '<h6>📁 Документы проекта:</h6><div class="list-group">';
            otherDocs.forEach(doc => {
                html += `
                    <a href="/${doc.file_path}" target="_blank" class="list-group-item list-group-item-action">
                        📎 ${doc.file_name}
                    </a>
                `;
            });
            html += '</div>';
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderStage(stage) {
    const isCompleted = stage.is_completed === 1;
    
    let html = `
        <div class="card mb-3 ${isCompleted ? 'border-success' : ''}">
            <div class="card-header ${isCompleted ? 'bg-success text-white' : 'bg-light'}">
                <h5 class="mb-0">
                    ${isCompleted ? '✅' : '🔨'} Этап ${stage.stage_number}: ${stage.name}
                </h5>
            </div>
            <div class="card-body">
                ${stage.description ? `<p>${stage.description}</p><hr>` : ''}
                
                ${stage.photos && stage.photos.length > 0 ? `
                    <h6>📸 Фото с объекта:</h6>
                    <div class="row">
                        ${stage.photos.map(photo => `
                            <div class="col-md-3 mb-2">
                                <a href="/${photo.file_path}" target="_blank">
                                    <img src="/${photo.file_path}" class="img-thumbnail" alt="Фото этапа">
                                </a>
                                <small class="d-block text-muted text-center">${formatDateShort(photo.uploaded_at)}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="text-muted">Фото пока нет</p>'}
                
                ${isCompleted ? `
                    <div class="alert alert-success mt-3 mb-0">
                        ✅ Этап завершен ${formatDate(stage.completed_at)}
                    </div>
                ` : `
                    <div class="alert alert-warning mt-3 mb-0">
                        ⏳ Этап в работе
                    </div>
                `}
            </div>
        </div>
    `;
    
    return html;
}

// =============================================================================
// ЗАГРУЗКА ЗАЯВОК
// =============================================================================

async function loadRequests() {
    const data = await apiRequest('/api/customer/requests');
    
    if (data.success) {
        myRequests = data.requests;
        renderRequests(data.requests);
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requestsStatus');
    if (!container) return;
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="alert alert-info">У вас нет активных заявок</div>';
        return;
    }
    
    let html = '';
    requests.forEach(request => {
        html += `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="card-title">${request.title || 'Заявка'}</h5>
                            <p class="text-muted mb-2">${formatDate(request.created_at)}</p>
                        </div>
                        <div>
                            ${getStatusBadge(request.status)}
                        </div>
                    </div>
                    <p class="card-text">${request.description}</p>
                    ${request.notes ? `
                        <div class="alert alert-info mb-0">
                            <strong>Комментарий менеджера:</strong> ${request.notes}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}
