// =============================================================================
// CUSTOMER.JS - ИСПРАВЛЕННАЯ ВЕРСИЯ
// =============================================================================

let currentProjects = [];
let currentRequests = [];

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await loadRequests();
    
    // Приветственное модальное окно при первом посещении
    const hasVisited = localStorage.getItem('hasVisitedCustomer');
    if (!hasVisited) {
        setTimeout(() => showWelcomeModal(), 500);
        localStorage.setItem('hasVisitedCustomer', 'true');
    }
});

// =============================================================================
// ЗАГРУЗКА ПРОЕКТОВ
// =============================================================================

async function loadProjects() {
    const container = document.getElementById('projectsList');
    
    // Показываем загрузку
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка проектов...</p>
        </div>
    `;
    
    const data = await apiRequest('/api/customer/projects');
    
    if (data.success) {
        currentProjects = data.projects;
        renderProjects(data.projects);
    } else {
        container.innerHTML = '<div class="col-12"><div class="alert alert-danger">Ошибка загрузки проектов</div></div>';
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsList');
    
    // ИСПРАВЛЕНИЕ: Если нет проектов - показываем сообщение, а не загрузку
    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    <h5>📋 Проекты отсутствуют</h5>
                    <p class="mb-0">У вас пока нет активных проектов. Создайте заявку или введите код доступа от менеджера.</p>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    projects.forEach(project => {
        // Рассчитываем прогресс
        const totalStages = project.total_stages || 0;
        const completedStages = project.completed_stages || 0;
        const progress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
        
        html += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">${project.title}</h5>
                        <p class="text-muted small">${project.address || 'Адрес не указан'}</p>
                        <hr>
                        <p class="mb-2"><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p class="mb-2"><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        <p class="mb-2"><strong>Прораб:</strong> ${project.foreman_name || 'Не назначен'}</p>
                        
                        <div class="mb-2">
                            <small class="text-muted">Прогресс работ</small>
                            <div class="progress" style="height: 20px;">
                                <div class="progress-bar bg-success" style="width: ${progress}%">
                                    ${progress}%
                                </div>
                            </div>
                        </div>
                        
                        <button class="btn btn-primary w-100 mt-2" onclick="viewProjectDetails(${project.id})">
                            🔍 Подробнее
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// =============================================================================
// ЗАГРУЗКА ЗАЯВОК
// =============================================================================

async function loadRequests() {
    const container = document.getElementById('requestsStatus');
    
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка заявок...</p>
        </div>
    `;
    
    const data = await apiRequest('/api/customer/requests');
    
    if (data.success) {
        currentRequests = data.requests;
        renderRequests(data.requests);
    } else {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки заявок</div>';
    }
}

function renderRequests(requests) {
    const container = document.getElementById('requestsStatus');
    
    // ИСПРАВЛЕНИЕ: Если нет заявок
    if (!requests || requests.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <h5>📬 Заявки отсутствуют</h5>
                <p class="mb-0">Вы ещё не создавали заявок. Нажмите "Новая заявка" чтобы отправить запрос менеджеру.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="list-group">';
    
    requests.forEach(req => {
        html += `
            <div class="list-group-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${req.title || 'Заявка без названия'}</h6>
                        <p class="mb-1 small text-muted">${req.description || ''}</p>
                        <small class="text-muted">Создано: ${formatDate(req.created_at)}</small>
                    </div>
                    <div>
                        ${getStatusBadge(req.status)}
                    </div>
                </div>
                ${req.notes ? `
                    <div class="alert alert-info mt-2 mb-0 small">
                        <strong>Комментарий менеджера:</strong> ${req.notes}
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// =============================================================================
// СОЗДАНИЕ ЗАЯВКИ С ВАЛИДАЦИЕЙ ТЕЛЕФОНА
// =============================================================================

function showCreateRequestModal() {
    const modal = `
        <div class="modal fade" id="createRequestModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">📝 Новая заявка</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="createRequestForm">
                        <div class="modal-body">
                            <div class="alert alert-info">
                                💡 Заполните форму и менеджер свяжется с вами для обсуждения проекта
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Название проекта</label>
                                <input type="text" class="form-control" id="requestTitle" 
                                       placeholder="Например: Электромонтаж офиса" required>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Описание работ</label>
                                <textarea class="form-control" id="requestDescription" rows="4" 
                                          placeholder="Опишите что нужно сделать..." required></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Контактный телефон *</label>
                                <input type="tel" class="form-control" id="requestContact" 
                                       placeholder="+79991234567"
                                       pattern="^[\\+]?[78][-\\s\\(]?\\d{3}[-\\s\\)]?\\d{3}[-\\s]?\\d{2}[-\\s]?\\d{2}$"
                                       required>
                                <small class="text-muted">Формат: +79991234567 или 89991234567</small>
                                <div class="invalid-feedback">
                                    Введите корректный номер телефона в формате +79991234567
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Документы (необязательно)</label>
                                <input type="file" class="form-control" id="requestFiles" multiple 
                                       accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
                                <small class="text-muted">Можно загрузить до 5 файлов</small>
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
    
    document.getElementById('createRequestForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const form = e.target;
        
        // ИСПРАВЛЕНИЕ: Валидация формы (включая телефон)
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            showError('Проверьте правильность заполнения полей!');
            return;
        }
        
        const phone = document.getElementById('requestContact').value.trim();
        
        // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ТЕЛЕФОНА
        const phoneRegex = /^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;
        if (!phoneRegex.test(phone)) {
            showError('Введите корректный номер телефона в формате +79991234567');
            document.getElementById('requestContact').focus();
            return;
        }
        
        const formData = new FormData();
        formData.append('title', document.getElementById('requestTitle').value);
        formData.append('description', document.getElementById('requestDescription').value);
        formData.append('contactInfo', phone);
        
        const files = document.getElementById('requestFiles').files;
        if (files.length > 5) {
            showError('Максимум 5 файлов!');
            return;
        }
        
        Array.from(files).forEach(file => {
            formData.append('documents', file);
        });
        
        const result = await apiRequest('/api/customer/requests', 'POST', formData);
        
        if (result.success) {
            showSuccess('Заявка отправлена! Менеджер свяжется с вами в ближайшее время');
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

// =============================================================================
// ПРИСОЕДИНЕНИЕ ПО КОДУ
// =============================================================================

function showJoinProjectModal() {
    const modal = `
        <div class="modal fade" id="joinProjectModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">🔑 Ввести код проекта</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="joinProjectForm">
                        <div class="modal-body">
                            <p>Введите код доступа который вам предоставил менеджер</p>
                            
                            <div class="mb-3">
                                <label class="form-label">Код проекта</label>
                                <input type="text" class="form-control form-control-lg text-center" 
                                       id="accessCodeInput" 
                                       placeholder="PRJ-XXXXXX" 
                                       style="font-family: monospace; letter-spacing: 2px;"
                                       required>
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
    
    document.getElementById('joinProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const code = document.getElementById('accessCodeInput').value.trim().toUpperCase();
        
        if (!code) {
            showError('Введите код проекта!');
            return;
        }
        
        const result = await apiRequest('/api/customer/join', 'POST', { accessCode: code });
        
        if (result.success) {
            showSuccess(`Вы присоединились к проекту: ${result.project.title}`);
            hideModal('joinProjectModal');
            await loadProjects();
        } else {
            showError(result.message || 'Проект с таким кодом не найден');
        }
    });
    
    document.getElementById('joinProjectModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// =============================================================================
// ПРОСМОТР ДЕТАЛЕЙ ПРОЕКТА
// =============================================================================

async function viewProjectDetails(projectId) {
    showLoading('projectDetails');
    
    const data = await apiRequest(`/api/customer/projects/${projectId}`);
    
    if (data.success) {
        renderProjectDetails(data.project, data.stages);
    } else {
        showError('Ошибка загрузки проекта');
    }
}

function renderProjectDetails(project, stages) {
    // Детальная информация о проекте
    // (можно добавить позже)
}

// =============================================================================
// ПРИВЕТСТВЕННОЕ МОДАЛЬНОЕ ОКНО
// =============================================================================

function showWelcomeModal() {
    const modal = `
        <div class="modal fade" id="welcomeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">👋 Добро пожаловать!</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center py-4">
                        <h4>Как начать работу?</h4>
                        <p class="text-muted">Выберите один из вариантов:</p>
                        
                        <div class="d-grid gap-3 mt-4">
                            <button class="btn btn-primary btn-lg" onclick="hideModal('welcomeModal'); showCreateRequestModal();">
                                📝 Создать заявку
                                <br><small>Опишите свой проект</small>
                            </button>
                            
                            <button class="btn btn-success btn-lg" onclick="hideModal('welcomeModal'); showJoinProjectModal();">
                                🔑 Ввести код проекта
                                <br><small>Если код уже есть</small>
                            </button>
                        </div>
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