// =============================================================================
// MANAGER.JS - Кабинет менеджера
// =============================================================================

let currentProjects = [];
let currentRequests = [];
let staffList = [];

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadStaff();
    await loadProjects();
    await loadRequests();

    const createForm = document.getElementById('createProjectForm');
    if (createForm) {
        const newForm = createForm.cloneNode(true);
        createForm.parentNode.replaceChild(newForm, createForm);
        newForm.addEventListener('submit', handleCreateProject);
    }

    // Загружаем архив когда переключаемся на вкладку
    document.getElementById('archive-tab')?.addEventListener('shown.bs.tab', loadArchive);

    // Автообновление раз в 30 секунд
    setInterval(() => {
        loadProjects();
        loadRequests();
    }, 30000);
});

// =============================================================================
// ПЕРСОНАЛ
// =============================================================================

async function loadStaff() {
    const data = await apiRequest('/api/manager/staff');
    if (data.success) {
        staffList = data.staff;
        populateStaffSelects();
    }
}

function populateStaffSelects() {
    const selects = {
        'sel_foreman': 'foreman',
        'sel_supplier': 'supplier',
        'sel_pto': 'pto'
    };

    for (const [id, role] of Object.entries(selects)) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<option value="">-- Не назначен --</option>';
            staffList.filter(s => s.role === role).forEach(s => {
                el.innerHTML += `<option value="${s.id}">${s.full_name}</option>`;
            });
        }
    }
}

// =============================================================================
// ПРОЕКТЫ
// =============================================================================

async function loadProjects() {
    const container = document.getElementById('projectsList');
    if (!container) return;
    if (!container.querySelector('table')) showLoading('projectsList');

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
        container.innerHTML = '<div class="alert alert-info m-3">Нет активных проектов</div>';
        return;
    }

    // Показываем только не завершённые в активной вкладке
    const active = projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled');
    const completed = projects.filter(p => p.status === 'completed');

    // ДОБАВИЛ КОЛОНКУ "ЗАКАЗЧИК"
    let html = `
        <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Заказчик</th>
                    <th>Адрес</th>
                    <th>Код доступа</th>
                    <th>Прораб</th>
                    <th>Статус</th>
                    <th class="text-end">Действия</th>
                </tr>
            </thead>
            <tbody>`;

    active.forEach(p => {
        // Определяем имя заказчика для красивого вывода
        const clientDisplay = p.customer_name
            ? `<span class="badge bg-info text-dark">${p.customer_name}</span>`
            : (p.client_name || '<span class="text-muted">-</span>');

        html += `
            <tr>
                <td class="text-muted small">${p.id}</td>
                <td class="fw-bold">${p.title}</td>
                <td>${clientDisplay}</td>
                <td class="small text-muted">${p.address || '-'}</td>
                <td><code class="user-select-all bg-light px-2 py-1 rounded">${p.access_code}</code></td>
                <td>${p.foreman_name || '<span class="text-muted">–</span>'}</td>
                <td>${getStatusBadge(p.status)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-warning me-1" onclick="editProject(${p.id})"
                        title="Редактировать">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info me-1" onclick="showProjectDocs(${p.id})"
                        title="Документы">
                        <i class="bi bi-file-earmark-text"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="showAIModal(${p.id})"
                        title="✨ ИИ: Составить Смету (ВОР/ВОМ)">
                        ✨ ИИ
                    </button>
                    <button class="btn btn-sm btn-success" onclick="showCompleteProjectModal(${p.id})"
                        title="Завершить проект (требуется акт)">
                        ✅ Завершить
                    </button>
                </td>
            </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Если есть завершённые — показываем счётчик
    if (completed.length > 0) {
        container.insertAdjacentHTML('beforeend', `
            <div class="p-3 text-muted small border-top">
                Завершённых проектов: ${completed.length} — 
                <a href="#" onclick="document.getElementById('archive-tab').click(); return false;">
                    посмотреть в архиве
                </a>
            </div>`);
    }
}

// Завершение проекта — требует загрузки акта
function showCompleteProjectModal(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    if (!project) return;

    const old = document.getElementById('completeProjectModal');
    if (old) old.remove();

    const modalHtml = `
        <div class="modal fade" id="completeProjectModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">✅ Завершение проекта</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="completeProjectForm">
                        <div class="modal-body">
                            <div class="alert alert-warning d-flex align-items-start">
                                <i class="bi bi-exclamation-triangle-fill me-2 mt-1"></i>
                                <div>
                                    <strong>Проект «${project.title}»</strong><br>
                                    Для завершения необходимо загрузить <strong>подписанный акт выполненных работ</strong>.
                                    Без акта завершение невозможно.
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="bi bi-file-earmark-check"></i>
                                    Акт выполненных работ *
                                </label>
                                <input type="file" class="form-control" id="actFile"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required>
                                <small class="text-muted">Скан или фото подписанного документа</small>
                                <label class="form-label fw-bold mt-3 text-warning">
                                    <i class="bi bi-phone"></i>
                                    Подписание по SMS-коду от Заказчика *
                                </label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="smsCode" placeholder="Код из СМС (например 1234)" required>
                                    <button class="btn btn-outline-warning" type="button" onclick="alert('Код 1234 отправлен на номер заказчика')">Запросить СМС</button>
                                </div>
                                <small class="text-muted">Для демо введите любой код, например 1234</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link text-muted text-decoration-none"
                                data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-success fw-bold px-4">
                                ✅ Завершить проект
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('completeProjectModal'));
    modal.show();

    document.getElementById('completeProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const actFile = document.getElementById('actFile').files[0];
        if (!actFile) {
            showError('Загрузите акт выполненных работ');
            return;
        }

        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Завершение...';

        const smsCode = document.getElementById('smsCode').value;
        if (!smsCode || smsCode.length < 4) {
            showError('Введите корректный СМС-код от заказчика');
            btn.disabled = false;
            btn.innerHTML = '✅ Завершить проект';
            return;
        }

        const formData = new FormData();
        formData.append('act', actFile);
        formData.append('smsCode', smsCode);

        const res = await apiRequest(`/api/manager/projects/${projectId}/complete`, 'PUT', formData);

        if (res.success) {
            showSuccess(res.message);
            modal.hide();
            await loadProjects();
            // Переключаемся на архив чтобы увидеть завершённый проект
            setTimeout(() => document.getElementById('archive-tab')?.click(), 500);
        } else {
            showError(res.message);
        }
        btn.disabled = false;
        btn.innerHTML = '✅ Завершить проект';
    });

    document.getElementById('completeProjectModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// ДОКУМЕНТЫ ПРОЕКТА
// =============================================================================

async function showProjectDocs(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    if (!project) return;

    const old = document.getElementById('projectDocsModal');
    if (old) old.remove();

    const modalHtml = `
        <div class="modal fade" id="projectDocsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-dark">
                        <h5 class="modal-title"><i class="bi bi-folder2-open"></i> Документы: ${project.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Форма загрузки нового документа -->
                        <form id="uploadDocForm" class="mb-4 p-3 border rounded bg-light">
                            <h6 class="mb-3">➕ Загрузить документ</h6>
                            <div class="row g-2">
                                <div class="col-md-4">
                                    <select class="form-select" id="docType" required>
                                        <option value="initial">РД (Рабочая документация)</option>
                                        <option value="contract">Договор</option>
                                        <option value="act">Акт выполненных работ</option>
                                        <option value="other">Прочее</option>
                                    </select>
                                </div>
                                <div class="col-md-5">
                                    <input type="file" class="form-control" id="docFile" required>
                                </div>
                                <div class="col-md-3">
                                    <button type="submit" class="btn btn-primary w-100">Загрузить</button>
                                </div>
                            </div>
                        </form>
                        
                        <!-- Список документов -->
                        <h6>📄 Прикрепленные документы</h6>
                        <div id="docsListModal" class="list-group mt-2">
                            <div class="text-center py-3"><div class="spinner-border text-info"></div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('projectDocsModal'));
    modal.show();

    await loadProjectDocsArray(projectId);

    document.getElementById('uploadDocForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('docFile').files[0];
        const docType = document.getElementById('docType').value;
        if (!file) return;

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;

        const fData = new FormData();
        fData.append('document', file);
        fData.append('docType', docType);

        const res = await apiRequest(`/api/manager/projects/${projectId}/documents`, 'POST', fData);
        if (res.success) {
            showSuccess('Документ загружен');
            document.getElementById('uploadDocForm').reset();
            await loadProjectDocsArray(projectId);
        } else {
            showError(res.message);
        }
        btn.disabled = false;
    });
}

async function loadProjectDocsArray(projectId) {
    const data = await apiRequest(`/api/manager/projects/${projectId}/documents`);
    const container = document.getElementById('docsListModal');
    if (!data.success) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки</div>';
        return;
    }

    if (!data.documents || data.documents.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Документов пока нет</div>';
        return;
    }

    container.innerHTML = data.documents.map(d => {
        const typeNames = { 'initial': 'РД', 'contract': 'Договор', 'act': 'Акт', 'executive': 'ИД', 'other': 'Прочее' };
        return `
        <a href="/${d.file_path}" target="_blank" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center pb-2">
            <div>
                <span class="badge bg-secondary me-2">${typeNames[d.document_type] || d.document_type}</span>
                <strong>${d.file_name}</strong>
                ${d.description ? `<br><small class="text-muted">${d.description}</small>` : ''}
            </div>
            <small class="text-muted">${formatDateShort(d.uploaded_at)}</small>
        </a>`;
    }).join('');
}

// =============================================================================
// СОЗДАНИЕ ПРОЕКТА
// =============================================================================

async function handleCreateProject(e) {
    e.preventDefault();

    const payload = new FormData();
    payload.append('title', document.getElementById('p_title').value);
    payload.append('address', document.getElementById('p_address').value);
    payload.append('description', document.getElementById('p_description').value);
    payload.append('clientName', document.getElementById('p_clientName').value);
    payload.append('clientOrganization', document.getElementById('p_clientOrg').value);
    payload.append('foremanId', document.getElementById('sel_foreman').value);
    payload.append('supplierId', document.getElementById('sel_supplier').value);
    payload.append('ptoId', document.getElementById('sel_pto').value);

    // ВАЖНО: Добавляем скрытые поля для автопривязки заказчика
    const customerId = document.getElementById('p_customerId')?.value;
    const requestId = document.getElementById('p_requestId')?.value;
    if (customerId) payload.append('customerId', customerId);
    if (requestId) payload.append('requestId', requestId);

    const fileInput = document.getElementById('p_files');
    if (fileInput) {
        for (let i = 0; i < fileInput.files.length; i++) {
            payload.append('documents', fileInput.files[i]);
        }
    }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Создание...';

    const res = await apiRequest('/api/manager/projects', 'POST', payload);

    if (res.success) {
        hideModal('createProjectModal');
        e.target.reset();

        // Очищаем скрытые поля
        if (document.getElementById('p_customerId')) document.getElementById('p_customerId').value = '';
        if (document.getElementById('p_requestId')) document.getElementById('p_requestId').value = '';

        showAccessCodeModal(res.accessCode);
        await loadProjects();
        await loadRequests(); // Чтобы заявка исчезла из "новых"
    } else {
        showError(res.message);
    }

    btn.disabled = false;
    btn.innerHTML = 'Создать проект';
}

// =============================================================================
// МАГИЯ ИИ: СОСТАВЛЕНИЕ ВОР И ВОМ ИЗ ФАЙЛА
// =============================================================================

async function showAIModal(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    if (!project) return;

    const old = document.getElementById('aiModal');
    if (old) old.remove();

    const modalHtml = `
        <div class="modal fade" id="aiModal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content border-primary border-2 shadow-lg">
                    <div class="modal-header bg-dark text-white border-bottom-0">
                        <h5 class="modal-title d-flex align-items-center">
                            <i class="bi bi-cpu fs-4 me-2 text-primary"></i> 
                            ✨ ИИ Ассистент (Beta)
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body bg-light">
                        <div class="row align-items-center mb-4">
                            <div class="col-md-7">
                                <h6 class="fw-bold text-primary mb-1">Генерация сметы: ${project.title}</h6>
                                <p class="text-muted small mb-0">Загрузите файл с чертежами или проектной документацией (PDF/Скан). Нейросеть проанализирует документ и извлечет необходимые этапы работ (ВОР) и список материалов (ВОМ).</p>
                            </div>
                            <div class="col-md-5">
                                <form id="aiUploadForm" class="d-flex gap-2">
                                    <input type="file" class="form-control" id="aiDoc" accept=".pdf,.jpg,.jpeg,.png,.webp" required>
                                    <button class="btn btn-primary fw-bold text-nowrap" type="submit">
                                        ✨ Читать файл
                                    </button>
                                </form>
                            </div>
                        </div>

                        <!-- Контейнер результата ИИ -->
                        <div id="aiResultContainer" class="d-none">
                            <hr class="my-4 border-primary opacity-25">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="fw-bold mb-0">📋 Распознанная смета</h5>
                                <button class="btn btn-success fw-bold px-4" id="aiApproveBtn">
                                    ✅ Применить к проекту (ВОР/ВОМ)
                                </button>
                            </div>
                            
                            <div class="row g-4">
                                <div class="col-md-6">
                                    <div class="card h-100 border-0 shadow-sm">
                                        <div class="card-header bg-transparent border-bottom-0 pt-3">
                                            <h6 class="fw-bold mb-0"><i class="bi bi-hammer text-warning"></i> Этапы Работ (ВОР) для Прораба</h6>
                                        </div>
                                        <div class="card-body">
                                            <ul class="list-group list-group-flush" id="aiWorksList"></ul>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card h-100 border-0 shadow-sm">
                                        <div class="card-header bg-transparent border-bottom-0 pt-3">
                                            <h6 class="fw-bold mb-0"><i class="bi bi-box-seam text-info"></i> Материалы (ВОМ) для Снабженца</h6>
                                        </div>
                                        <div class="card-body">
                                            <ul class="list-group list-group-flush" id="aiMaterialsList"></ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('aiModal'));
    modal.show();

    let aiData = null;

    document.getElementById('aiUploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = document.getElementById('aiDoc').files[0];
        if (!file) return;

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-grow spinner-grow-sm me-2 text-warning"></span> Нейросеть думает...';

        // Временно прячем предыдущий результат, если был
        document.getElementById('aiResultContainer').classList.add('d-none');

        const formData = new FormData();
        formData.append('document', file);

        try {
            const res = await apiRequest(`/api/manager/ai-analyze`, 'POST', formData);
            if (res.success && res.data) {
                aiData = res.data;

                // Рендерим ВОР
                const worksList = document.getElementById('aiWorksList');
                worksList.innerHTML = aiData.works.map(w =>
                    `<li class="list-group-item px-0 d-flex justify-content-between align-items-center">
                        <span>${w.name}</span>
                        <span class="badge bg-secondary rounded-pill">${w.quantity} ${w.unit}</span>
                    </li>`).join('');

                // Рендерим ВОМ
                const matList = document.getElementById('aiMaterialsList');
                matList.innerHTML = aiData.materials.map(m =>
                    `<li class="list-group-item px-0 d-flex justify-content-between align-items-center">
                        <span>${m.name}</span>
                        <span class="fw-bold text-success">${m.quantity} ${m.unit}</span>
                    </li>`).join('');

                document.getElementById('aiResultContainer').classList.remove('d-none');
                showSuccess('ИИ успешно разобрал документ!');
            } else {
                showError(res.message || 'Ошибка распознавания');
            }
        } catch (err) {
            showError('Сбой обращения к ИИ');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    document.getElementById('aiApproveBtn').addEventListener('click', async () => {
        if (!aiData) return;

        const btn = document.getElementById('aiApproveBtn');
        btn.disabled = true;
        btn.innerHTML = 'Сохранение...';

        // Отправляем утвержденную смету на сервер, чтобы она привязалась к проекту
        // Это создаст этапы для прораба и материалы для снабженца
        const res = await apiRequest(`/api/manager/projects/${projectId}/apply-ai-estimate`, 'POST', aiData);

        if (res.success) {
            showSuccess('✅ Смета ИИ успешно применена к проекту!');
            modal.hide();
            await loadProjects();
        } else {
            showError(res.message || 'Ошибка сохранения');
            btn.disabled = false;
            btn.innerHTML = '✅ Применить к проекту (ВОР/ВОМ)';
        }
    });
}

// =============================================================================
// РЕДАКТИРОВАНИЕ ПРОЕКТА
// =============================================================================

async function editProject(id) {
    const p = currentProjects.find(x => x.id === id);
    if (!p) return;

    const old = document.getElementById('editModal');
    if (old) old.remove();

    const modalHtml = `
            < div class= "modal fade" id = "editModal" tabindex = "-1" >
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-pencil"></i> Редактировать: ${p.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="editForm">
                        <div class="modal-body">
                            <div class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label">Название</label>
                                    <input class="form-control" id="e_title" value="${p.title}" required>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Статус</label>
                                    <select class="form-select" id="e_status">
                                        <option value="new" ${p.status === 'new' ? 'selected' : ''}>Новый</option>
                                        <option value="stages_pending" ${p.status === 'stages_pending' ? 'selected' : ''}>Ожидание этапов</option>
                                        <option value="in_progress" ${p.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                                        <option value="cancelled" ${p.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
                                    </select>
                                    <small class="text-muted">Для завершения используйте кнопку "✅ Завершить"</small>
                                </div>
                                <div class="col-12">
                                    <label class="form-label">Адрес</label>
                                    <input class="form-control" id="e_address" value="${p.address || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Прораб</label>
                                    <select class="form-select" id="e_foreman">
                                        <option value="">-- Не назначен --</option>
                                        ${staffList.filter(s => s.role === 'foreman').map(s =>
        `<option value="${s.id}" ${p.foreman_id === s.id ? 'selected' : ''}>${s.full_name}</option>`
    ).join('')}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Снабженец</label>
                                    <select class="form-select" id="e_supplier">
                                        <option value="">-- Не назначен --</option>
                                        ${staffList.filter(s => s.role === 'supplier').map(s =>
        `<option value="${s.id}" ${p.supplier_id === s.id ? 'selected' : ''}>${s.full_name}</option>`
    ).join('')}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Инженер ПТО</label>
                                    <select class="form-select" id="e_pto">
                                        <option value="">-- Не назначен --</option>
                                        ${staffList.filter(s => s.role === 'pto').map(s =>
        `<option value="${s.id}" ${p.pto_id === s.id ? 'selected' : ''}>${s.full_name}</option>`
    ).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link text-muted text-decoration-none"
                                data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary fw-bold">Сохранить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div > `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('editModal'));
    modal.show();

    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const res = await apiRequest(`/ api / manager / projects / ${id} `, 'PUT', {
            title: document.getElementById('e_title').value,
            address: document.getElementById('e_address').value,
            status: document.getElementById('e_status').value,
            description: p.description,
            clientName: p.client_name,
            clientOrganization: p.client_organization,
            foremanId: document.getElementById('e_foreman').value,
            supplierId: document.getElementById('e_supplier').value,
            ptoId: document.getElementById('e_pto').value
        });

        if (res.success) {
            modal.hide();
            showSuccess('Проект обновлён');
            loadProjects();
        } else {
            showError(res.message);
        }
    });

    document.getElementById('editModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// ЗАЯВКИ
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
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-center text-muted my-5">🎉 Нет новых заявок</p>';
        return;
    }

    container.innerHTML = requests.map(r => `
            < div class="card mb-3 shadow-sm border-start border-4 border-primary" >
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <h5 class="card-title text-primary">${r.title || 'Заявка #' + r.id}</h5>
                        <small class="text-muted">${formatDateShort(r.created_at)}</small>
                    </div>
                    <p class="card-text">${r.description || '-'}</p>

                    <div class="bg-light p-2 rounded mb-3 small">
                        <strong>От:</strong> ${r.customer_name}
                        ${r.phone ? ` | <a href="tel:${r.phone}">${r.phone}</a>` : ''}
                        ${r.contact_info ? `<br><strong>Контакт из заявки:</strong> ${r.contact_info}` : ''}
                    </div>

                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-primary btn-sm" onclick="createProjectFromRequest(${r.id})">
                            <i class="bi bi-folder-plus"></i> Создать проект
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="acceptRequest(${r.id})">
                            ✔️ Принять в архив
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="rejectRequest(${r.id})">
                            ✖️ Отклонить
                        </button>
                    </div>
                </div>
        </div > `).join('');
}

function createProjectFromRequest(reqId) {
    const req = currentRequests.find(r => r.id === reqId);
    if (!req) return;

    const modal = new bootstrap.Modal(document.getElementById('createProjectModal'));
    modal.show();

    setTimeout(() => {
        const titleEl = document.getElementById('p_title');
        const descEl = document.getElementById('p_description');
        const nameEl = document.getElementById('p_clientName');
        const custIdEl = document.getElementById('p_customerId');
        const reqIdEl = document.getElementById('p_requestId');

        if (titleEl) titleEl.value = req.title || '';
        if (descEl) descEl.value = req.description || '';
        if (nameEl) nameEl.value = req.customer_name || '';

        // ВАЖНО: Заполняем скрытые поля для привязки!
        if (custIdEl) custIdEl.value = req.customer_id || '';
        if (reqIdEl) reqIdEl.value = req.id || '';
    }, 300);
}

async function acceptRequest(id) {
    if (!confirm('Принять заявку и отправить в архив?')) return;

    // ИСПРАВЛЕН ПУТЬ АПИ (Убрано /review)
    const res = await apiRequest(`/ api / manager / requests / ${id} `, 'PUT', {
        status: 'accepted',
        notes: 'Заявка принята менеджером'
    });

    if (res.success) {
        showSuccess('Заявка принята и отправлена в архив');
        await loadRequests();
    } else {
        showError(res.message);
    }
}

async function rejectRequest(id) {
    const reason = prompt('Укажите причину отказа:');
    if (reason === null) return; // Нажал Отмена

    // ИСПРАВЛЕН ПУТЬ АПИ (Убрано /review)
    const res = await apiRequest(`/ api / manager / requests / ${id} `, 'PUT', {
        status: 'rejected',
        notes: reason || 'Отклонено менеджером'
    });

    if (res.success) {
        showSuccess('Заявка отклонена');
        await loadRequests();
    } else {
        showError(res.message);
    }
}

function updateBadge(count) {
    const badge = document.getElementById('newRequestsBadge');
    if (badge) {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// =============================================================================
// АРХИВ
// =============================================================================

async function loadArchive() {
    const container = document.getElementById('archiveList'); // ИСПРАВЛЕН ID (был archiveContent)
    if (!container) return;

    container.innerHTML = `< div class="text-center py-4" >
        <div class="spinner-border text-primary"></div>
        <p class="mt-2 text-muted">Загрузка архива...</p>
    </div > `;

    const [projData, reqData] = await Promise.all([
        apiRequest('/api/manager/projects'),
        apiRequest('/api/manager/requests/archive')
    ]);

    let html = '';

    // Завершённые проекты
    const completedProjects = (projData.projects || []).filter(p => p.status === 'completed');
    html += `< h5 class="border-bottom pb-2 mb-3" >✅ Завершённые проекты(${completedProjects.length})</h5 > `;

    if (completedProjects.length === 0) {
        html += '<p class="text-muted">Завершённых проектов пока нет</p>';
    } else {
        html += '<div class="list-group mb-4">';
        completedProjects.forEach(p => {
            html += `
            < div class="list-group-item" >
                    <div class="d-flex justify-content-between">
                        <strong>${p.title}</strong>
                        <span class="badge bg-success">Завершён</span>
                    </div>
                    <small class="text-muted">${p.address || '-'}</small>
                    ${p.foreman_name ? `<br><small>Прораб: ${p.foreman_name}</small>` : ''}
                </div > `;
        });
        html += '</div>';
    }

    // Обработанные заявки
    const archivedRequests = reqData.requests || [];
    html += `< h5 class="border-bottom pb-2 mb-3" >📬 Обработанные заявки(${archivedRequests.length})</h5 > `;

    if (archivedRequests.length === 0) {
        html += '<p class="text-muted">Обработанных заявок пока нет</p>';
    } else {
        html += '<div class="list-group">';
        archivedRequests.forEach(r => {
            const statusCls = r.status === 'accepted' ? 'success' : r.status === 'rejected' ? 'danger' : 'info';
            const statusLabel = r.status === 'accepted' ? 'Принята' : r.status === 'rejected' ? 'Отклонена' : 'Рассмотрено';
            html += `
            < div class="list-group-item" >
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${r.title || 'Заявка #' + r.id}</strong>
                        <br><small class="text-muted">
                            От: ${r.customer_name} | ${formatDateShort(r.created_at)}
                        </small>
                            ${r.notes ? `<br><small class="text-muted">Ответ: ${r.notes}</small>` : ''}
                    </div>
                    <span class="badge bg-${statusCls}">${statusLabel}</span>
                </div>
                </div > `;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ
// =============================================================================

function showAccessCodeModal(code) {
    const old = document.getElementById('codeModal');
    if (old) old.remove();

    document.body.insertAdjacentHTML('beforeend', `
            < div class="modal fade" id = "codeModal" tabindex = "-1" >
                <div class="modal-dialog">
                    <div class="modal-content text-center">
                        <div class="modal-header bg-success text-white justify-content-center">
                            <h5 class="modal-title">🎉 Проект создан!</h5>
                        </div>
                        <div class="modal-body py-4">
                            <p class="text-muted">Код доступа для участников проекта:</p>
                            <div class="display-4 fw-bold user-select-all bg-light py-3 px-4 rounded border"
                                style="letter-spacing: 4px; font-family: monospace;">${code}</div>
                            <p class="text-muted small mt-3">
                                Заказчик привязан автоматически (если проект создан из заявки).<br>
                                    Передайте этот код прорабу и снабженцу.
                            </p>
                        </div>
                        <div class="modal-footer justify-content-center">
                            <button type="button" class="btn btn-success" data-bs-dismiss="modal">Готово</button>
                        </div>
                    </div>
                </div>
        </div > `);

    const modal = new bootstrap.Modal(document.getElementById('codeModal'));
    modal.show();
    document.getElementById('codeModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function getStatusBadge(status) {
    const map = {
        'new': '<span class="badge bg-secondary">Новый</span>',
        'stages_pending': '<span class="badge bg-warning text-dark">Ожидание этапов</span>',
        'in_progress': '<span class="badge bg-primary">В работе</span>',
        'completed': '<span class="badge bg-success">Завершён</span>',
        'cancelled': '<span class="badge bg-danger">Отменён</span>'
    };
    return map[status] || `< span class="badge bg-secondary" > ${status}</span > `;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
}