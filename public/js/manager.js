// =============================================================================
// MANAGER.JS - Кабинет менеджера
// =============================================================================

let currentProjects = [];
let currentRequests = [];
let staffList = [];
let currentManagerViewedMessage = null;

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadStaff();
    await loadProjects();
    await loadRequests();
    await loadManagerNotifications();

    const createForm = document.getElementById('createProjectForm');
    if (createForm) {
        const newForm = createForm.cloneNode(true);
        createForm.parentNode.replaceChild(newForm, createForm);
        newForm.addEventListener('submit', handleCreateProject);
    }

    // Загружаем архив когда переключаемся на вкладку
    document.getElementById('archive-tab')?.addEventListener('shown.bs.tab', loadArchive);

    // Загружаем почту при переключении
    document.getElementById('messages-tab')?.addEventListener('shown.bs.tab', loadManagerInbox);
    document.getElementById('inbox-tab')?.addEventListener('shown.bs.tab', loadManagerInbox);
    document.getElementById('sent-tab')?.addEventListener('shown.bs.tab', loadManagerSent);

    // Автообновление раз в 30 секунд
    setInterval(() => {
        loadProjects();
        loadRequests();
        loadManagerNotifications();
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
        renderFunnel(data.projects); // Отрисовка Канбан-доски (Воронка)
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

    // Очистка перед перерисовкой
    container.innerHTML = '';

    // Показываем только не завершённые в активной вкладке
    const active = projects.filter(p => !['won', 'lost', 'postponed'].includes(p.status));
    const completed = projects.filter(p => ['won', 'lost', 'postponed'].includes(p.status));

    // ДОБАВИЛ КОЛОНКУ "ЗАКАЗЧИК"
    let html = '<div class="row g-4">';

    active.forEach(p => {
        // Определяем имя заказчика для красивого вывода
        const clientDisplay = p.customer_name
            ? `<span class="badge bg-info text-dark border"><i class="bi bi-person-circle me-1"></i>${p.customer_name}</span>`
            : (p.client_name ? `<span class="badge bg-secondary border"><i class="bi bi-person me-1"></i>${p.client_name}</span>` : '<span class="text-muted small">Заказчик не назначен</span>');

        const foremanDisplay = p.foreman_name
            ? `<span class="badge border border-warning text-warning bg-transparent"><i class="bi bi-tools me-1"></i>${p.foreman_name}</span>`
            : `<span class="badge border border-secondary text-secondary bg-transparent"><i class="bi bi-exclamation-triangle me-1"></i>Прораб не назначен</span>`;

        html += `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="prj-card">
                    <div class="prj-card-header">
                         <div class="d-flex flex-column">
                            <h5 class="prj-card-title mb-1" onclick="editProject(${p.id})" title="${p.title}">${p.title}</h5>
                            <small class="text-muted"><i class="bi bi-hash"></i> ${p.id}</small>
                         </div>
                         ${getStatusBadge(p.status)}
                    </div>
                    <div class="prj-card-body">
                        <div class="mb-3 d-flex flex-wrap gap-2">
                             ${clientDisplay}
                             ${foremanDisplay}
                        </div>
                        <div class="prj-card-meta mb-3">
                            <div><i class="bi bi-geo-alt"></i>${p.address || '-'}</div>
                        </div>
                        <div class="mb-2">
                             <p class="mb-1 text-muted small"><i class="bi bi-key"></i> Код доступа</p>
                             <code class="user-select-all px-2 py-1 rounded" style="background-color: var(--bg-elevated); color: var(--primary-color); border: 1px solid var(--border-color);">${p.access_code}</code>
                        </div>
                    </div>
                    <div class="prj-card-body pt-0">
                        <div class="d-flex justify-content-between gap-2 mb-3">
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
                        <button class="btn btn-sm btn-success w-100 py-2 fw-bold" onclick="showCompleteProjectModal(${p.id})">
                             <i class="bi bi-check2-square"></i> ЗАВЕРШИТЬ ПРОЕКТ
                        </button>
                    </div>
                    <div class="prj-card-footer-line"></div>
                </div>
            </div>`;
    });

    html += '</div>';
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

// =============================================================================
// ВОРОНКА ОБЪЕКТОВ (KANBAN BOARD)
// =============================================================================
function renderFunnel(projects) {
    const container = document.getElementById('funnelBoard');
    if (!container) return;

    if (!projects || projects.length === 0) {
        container.innerHTML = '<div class="text-muted text-center w-100 py-4 mt-5">Нет проектов для отображения</div>';
        return;
    }

    // Определяем колонки
    const stages = [
        { id: 'lead', name: 'Новый лид', color: 'primary' },
        { id: 'qualification', name: 'Квалификация', color: 'info' },
        { id: 'visit_scheduled', name: 'Выезд назначен', color: 'warning' },
        { id: 'offer_in_progress', name: 'КП в работе', color: 'secondary' },
        { id: 'offer_sent', name: 'КП отправлено', color: 'info' },
        { id: 'negotiation', name: 'Переговоры', color: 'warning' },
        { id: 'contract_signing', name: 'Договор на согласовании', color: 'secondary' },
        { id: 'waiting_advance', name: 'Ожидание аванса', color: 'warning' },
        { id: 'in_progress', name: 'В работе', color: 'success' },
        { id: 'closing_docs', name: 'Закрытие документов', color: 'secondary' },
        { id: 'won', name: 'Закрыт — выигран', color: 'success' },
        { id: 'postponed', name: 'Отложен', color: 'dark' }
    ];

    let html = '';

    stages.forEach(stage => {
        // Фильтруем проекты
        let stageProjects = projects.filter(p => p.status === stage.id);

        html += `
            <div class="col-12 col-md-3" style="min-width: 280px;">
                <div class="card bg-transparent border-0 shadow-sm h-100">
                    <div class="card-header border-bottom-0 pt-3 pb-2 bg-transparent d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-${stage.color} text-uppercase" style="font-size: 0.85rem;">
                            ${stage.name}
                        </h6>
                        <span class="badge bg-${stage.color} rounded-pill">${stageProjects.length}</span>
                    </div>
                    <div class="card-body p-2 rounded" style="background-color: var(--bg-surface); min-height: 50vh;">
                        ${stageProjects.map(p => `
                            <div class="card border-0 shadow-sm mb-2 shadow-hover bg-dark" style="cursor: pointer; border-left: 4px solid var(--bs-${stage.color}) !important" onclick="editProject(${p.id})">
                                <div class="card-body p-3">
                                    <div class="d-flex justify-content-between mb-1">
                                        <small class="text-muted">#${p.id}</small>
                                    </div>
                                    <h6 class="fw-bold fs-6 mb-1 text-truncate" title="${p.title}">${p.title}</h6>
                                    <div class="small text-muted mb-2 text-truncate">
                                        <i class="bi bi-geo-alt"></i> ${p.address || 'Адрес не указан'}
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                                        <span class="badge bg-transparent text-muted border border-secondary"><i class="bi bi-person"></i> ${p.customer_name || '—'}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
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
                                        <option value="rd">РД (Рабочая документация)</option>
                                        <option value="estimate">Смета</option>
                                        <option value="act">Акты выполненных работ</option>
                                        <option value="tz">ТЗ (Техническое задание)</option>
                                        <option value="contract">Договор</option>
                                        <option value="ds">ДС (Доп. соглашение)</option>
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
        const typeNames = {
            'rd': 'РД',
            'estimate': 'Смета',
            'act': 'Акты',
            'tz': 'ТЗ',
            'contract': 'Договор',
            'ds': 'ДС',
            'other': 'Прочее',
            // Старые типы для обратной совместимости
            'initial': 'РД (стар.)',
            'executive': 'ИД'
        };
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

    // НОВЫЕ ПОЛЯ СДЕЛКИ
    const newFields = [
        'work_type', 'length_m', 'lead_source', 'offer_sum', 'visit_date',
        'offer_sent_date', 'offer_valid_until', 'contract_date',
        'advance_sum', 'advance_date', 'act_date', 'final_sum'
    ];

    newFields.forEach(field => {
        const el = e.target.querySelector(`[name="${field}"]`);
        if (el) {
            payload.append(field, el.value);
        }
    });

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
                                <form id="aiUploadForm" class="d-flex flex-column gap-3">
                                    <div>
                                        <label class="form-label mb-1 fw-bold text-secondary text-uppercase" style="font-size:0.75rem; letter-spacing:0.05em">ВЫБРАТЬ ИЗ ЗАГРУЖЕННЫХ</label>
                                        <select class="form-select" id="aiDocSelect">
                                            <option value="">-- Загрузить новый файл --</option>
                                        </select>
                                    </div>
                                    <div id="aiFileContainer">
                                        <label class="form-label mb-1 fw-bold text-secondary text-uppercase" style="font-size:0.75rem; letter-spacing:0.05em">ИЛИ ЗАГРУЗИТЬ НОВЫЙ</label>
                                        <input type="file" class="form-control" id="aiDoc" accept=".pdf,.jpg,.jpeg,.png,.webp">
                                    </div>
                                    <button class="btn btn-primary fw-bold w-100" type="submit">
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

    // Загружаем существующие документы проекта
    try {
        const docsRes = await apiRequest(`/api/manager/projects/${projectId}/documents`);
        if (docsRes.success && docsRes.documents.length > 0) {
            const select = document.getElementById('aiDocSelect');
            docsRes.documents.forEach(doc => {
                const opt = document.createElement('option');
                opt.value = doc.id;
                opt.textContent = `${doc.file_name} (${doc.document_type})`;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Ошибка загрузки документов для ИИ', e);
    }

    // Скрываем/показываем инпут файла в зависимости от выбора
    document.getElementById('aiDocSelect').addEventListener('change', (e) => {
        const fileContainer = document.getElementById('aiFileContainer');
        const fileInput = document.getElementById('aiDoc');
        if (e.target.value) {
            fileContainer.style.display = 'none';
            fileInput.removeAttribute('required');
        } else {
            fileContainer.style.display = 'block';
            fileInput.setAttribute('required', 'true');
        }
    });
    // Вызываем сразу, чтобы повесить required
    document.getElementById('aiDocSelect').dispatchEvent(new Event('change'));

    let aiData = null;

    document.getElementById('aiUploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const fileInput = document.getElementById('aiDoc');
        const file = fileInput.files[0];
        const docId = document.getElementById('aiDocSelect').value;

        if (!file && !docId) {
            return showError('Выберите документ');
        }

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-grow spinner-grow-sm me-2 text-warning"></span> Нейросеть думает...';

        // Временно прячем предыдущий результат, если был
        document.getElementById('aiResultContainer').classList.add('d-none');

        const formData = new FormData();
        if (docId) {
            formData.append('documentId', docId);
        } else if (file) {
            formData.append('document', file);
        }

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

    if (window.sharedEditProject) {
        window.sharedEditProject(p, loadProjects);
    } else {
        showError('Компонент редактирования временно недоступен.');
    }
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
            <div class="card mb-3 shadow-sm border-start border-4 border-primary">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="card-title text-primary d-inline-block me-2">${r.title || 'Заявка #' + r.id}</h5>
                            ${r.request_type === 'public' ? '<span class="badge bg-warning text-dark"><i class="bi bi-globe"></i> ГОСТЬ С САЙТА</span>' : '<span class="badge bg-info text-dark"><i class="bi bi-person-fill"></i> КЛИЕНТ</span>'}
                        </div>
                        <small class="text-muted">${formatDateShort(r.created_at)}</small>
                    </div>
                    <p class="card-text">${r.description || '-'}</p>

                    <div class="bg-light p-2 rounded mb-3 small">
                        <strong>От:</strong> ${r.customer_name}
                        ${r.phone ? ` | <a href="tel:${r.phone}">${r.phone}</a>` : ''}
                        ${r.contact_info ? `<br><strong>Контакт из заявки:</strong> ${r.contact_info}` : ''}
                    </div>

                    ${r.documents ? `
                    <div class="mb-3">
                        <strong class="small text-muted mb-1 d-block">📄 Прикрепленные файлы:</strong>
                        <div class="d-flex flex-wrap gap-2">
                            ${r.documents.split(',').map(doc => `
                                <a href="/${doc.replace(/\\/g, '/')}" target="_blank" class="btn btn-sm btn-outline-secondary">
                                    <i class="bi bi-file-earmark-text"></i> Скачать файл
                                </a>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

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
        </div>`).join('');
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

    const req = currentRequests.find(r => r.id === id);
    if (!req) return;

    // ИСПРАВЛЕН ПУТЬ АПИ (Убрано /review)
    const res = await apiRequest(`/api/manager/requests/${id}`, 'PUT', {
        status: 'accepted',
        notes: 'Заявка принята менеджером',
        requestType: req.request_type
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

    const req = currentRequests.find(r => r.id === id);
    if (!req) return;

    // ИСПРАВЛЕН ПУТЬ АПИ (Убрано /review)
    const res = await apiRequest(`/api/manager/requests/${id}`, 'PUT', {
        status: 'rejected',
        notes: reason || 'Отклонено менеджером',
        requestType: req.request_type
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

    container.innerHTML = `<div class="text-center py-4">
        <div class="spinner-border text-primary"></div>
        <p class="mt-2 text-muted">Загрузка архива...</p>
    </div>`;

    const [projData, reqData] = await Promise.all([
        apiRequest('/api/manager/projects'),
        apiRequest('/api/manager/requests/archive')
    ]);

    let html = '';

    // Завершённые проекты
    const completedProjects = (projData.projects || []).filter(p => ['won', 'lost', 'postponed'].includes(p.status));
    html += `<h5 class="border-bottom pb-2 mb-3">✅ Архив проектов (${completedProjects.length})</h5>`;

    if (completedProjects.length === 0) {
        html += '<p class="text-muted">Архивных проектов пока нет</p>';
    } else {
        html += '<div class="list-group mb-4">';
        completedProjects.forEach(p => {
            html += `
            <div class="list-group-item bg-dark border-secondary text-white">
                    <div class="d-flex justify-content-between">
                        <strong>${p.title}</strong>
                        ${getStatusBadge(p.status)}
                    </div>
                    <small class="text-muted">${p.address || '-'}</small>
                    ${p.foreman_name ? `<br><small>Прораб: ${p.foreman_name}</small>` : ''}
                </div> `;
        });
        html += '</div>';
    }

    // Обработанные заявки
    const archivedRequests = reqData.requests || [];
    html += `<h5 class="border-bottom pb-2 mb-3">📬 Обработанные заявки(${archivedRequests.length})</h5> `;

    if (archivedRequests.length === 0) {
        html += '<p class="text-muted">Обработанных заявок пока нет</p>';
    } else {
        html += '<div class="list-group">';
        archivedRequests.forEach(r => {
            const statusCls = r.status === 'accepted' ? 'success' : r.status === 'rejected' ? 'danger' : 'info';
            const statusLabel = r.status === 'accepted' ? 'Принята' : r.status === 'rejected' ? 'Отклонена' : 'Рассмотрено';
            html += `
            <div class="list-group-item">
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
                </div> `;
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
            <div class="modal fade" id = "codeModal" tabindex = "-1">
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
        </div> `);

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
    return map[status] || `<span class="badge bg-secondary"> ${status}</span> `;
}



// =============================================================================
// ПОЧТА (ОФИЦИАЛЬНАЯ ПЕРЕПИСКА)
// =============================================================================

// ===========================================
// ПОЧТА (ИСПОЛЬЗУЕМ SHARED)
// ===========================================

async function loadManagerInbox() {
    await sharedLoadInbox('inboxList', 'viewManagerMessage');
}

async function loadManagerSent() {
    await sharedLoadSent('sentList', 'viewManagerMessage');
}

async function viewManagerMessage(id, type, cardElement) {
    // В менеджере мы используем стандартный просмотрщик из shared
    // Но если нужно добавить специфику (например, кнопку reply), передаем текущие данные
    await sharedViewMessage(id, type, cardElement);
}

function composeManagerReply() {
    if (!currentSharedViewedMessage) return;

    const msg = currentSharedViewedMessage;
    const detailModal = bootstrap.Modal.getInstance(document.getElementById('messageDetailModal'));
    if (detailModal) detailModal.hide();

    showManagerComposeModal();

    const select = document.getElementById('composeReceiver');
    // Попробуем найти и выбрать того же заказчика
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].text.includes(msg.partner)) {
            select.options[i].selected = true;
            break;
        }
    }

    let subject = msg.subject.startsWith('RE:') ? msg.subject : 'RE: ' + msg.subject;
    document.getElementById('composeSubject').value = subject;

    const quote = `\n\n--- В ответ на сообщение от ${msg.partner} (${msg.date}) ---\n> ${msg.body.replace(/<[^>]*>/g, '').replace(/\n/g, '\n> ')}`;
    document.getElementById('composeBody').value = quote;
}

// ===========================================
// УВЕДОМЛЕНИЯ МЕНЕДЖЕРА
// ===========================================

async function loadManagerNotifications() {
    await sharedLoadNotifications({
        badgeId: 'mgrNotifBadge',
        listId: 'mgrNotifList',
        persistentListId: 'persistentNotifList',
        persistentContainerId: 'persistentNotifications',
        onMarkRead: 'markManagerNotifRead'
    });
}

function markManagerNotifRead(id, projectId, type) {
    if (type === 'message') {
        const tab = document.getElementById('messages-tab');
        if (tab) {
            tab.click();
            setTimeout(() => { document.getElementById('inbox-tab')?.click(); }, 250);
        }
        return;
    }
    if (type === 'new_request') {
        document.getElementById('requests-tab')?.click();
        return;
    }
    if (projectId) {
        document.getElementById('projects-tab')?.click();
    }
}

function showManagerComposeModal() {
    const select = document.getElementById('composeReceiver');
    if (!select) return;

    select.innerHTML = '<option value="">Выберите заказчика...</option>';

    if (currentProjects && currentProjects.length > 0) {
        const clients = new Map();
        currentProjects.forEach(p => {
            if (p.customer_id) {
                if (!clients.has(p.customer_id)) {
                    clients.set(p.customer_id, { name: p.customer_name || p.client_name, projects: [] });
                }
                clients.get(p.customer_id).projects.push({ id: p.id, title: p.title });
            }
        });

        if (clients.size > 0) {
            clients.forEach((data, customerId) => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `Заказчик: ${data.name || 'Аноним'}`;
                data.projects.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify({ receiver_id: customerId, project_id: p.id });
                    opt.textContent = `Проект: ${p.title}`;
                    optgroup.appendChild(opt);
                });
                select.appendChild(optgroup);
            });
            select.disabled = false;
        } else {
            select.innerHTML = '<option value="">У ваших проектов нет привязанных заказчиков</option>';
            select.disabled = true;
        }
    } else {
        select.innerHTML = '<option value="">Сначала создайте или примите проект</option>';
        select.disabled = true;
    }

    document.getElementById('composeSubject').value = '';
    document.getElementById('composeBody').value = '';
    const modal = new bootstrap.Modal(document.getElementById('composeMessageModal'));
    modal.show();
}

async function sendManagerMessage(e) {
    e.preventDefault();
    const btn = document.getElementById('sendMsgBtn');
    if (btn) btn.disabled = true;

    const recvVal = document.getElementById('composeReceiver').value;
    if (!recvVal) {
        showError('Выберите получателя');
        if (btn) btn.disabled = false;
        return;
    }

    const { receiver_id, project_id } = JSON.parse(recvVal);
    const subject = document.getElementById('composeSubject').value;
    const body = document.getElementById('composeBody').value;
    const fileInput = document.getElementById('composeAttachments');
    const files = fileInput ? fileInput.files : [];

    const formData = new FormData();
    formData.append('receiver_id', receiver_id);
    if (project_id) formData.append('project_id', project_id);
    formData.append('subject', subject);
    formData.append('body', body);

    for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i]);
    }

    try {
        const response = await fetch('/api/messages', {
            method: 'POST',
            body: formData
        });
        const res = await response.json();

        if (res.success) {
            showSuccess('Письмо отправлено');
            const modalEl = document.getElementById('composeMessageModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            // Если мы во вкладке почты, обновляем список отправленных
            if (document.getElementById('sent-tab')) {
                document.getElementById('sent-tab').click();
                await loadManagerSent();
            }
        } else {
            showError(res.message);
        }
    } catch (err) {
        console.error('Ошибка отправки:', err);
        showError('Ошибка отправки сообщения');
    }
    if (btn) btn.disabled = false;
}