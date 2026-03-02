// =============================================================================
// FOREMAN.JS - Прораб: Этапы работ + Материалы
// =============================================================================

let currentProjects = [];
let currentProject = null;

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await checkPendingApprovals();
});

// =============================================================================
// ===== ВКЛАДКА: ЭТАПЫ РАБОТ =====
// =============================================================================

async function loadProjects() {
    const container = document.getElementById('projectsList');
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-warning"></div>
            <p class="mt-2 text-muted">Загружаем список объектов...</p>
        </div>`;

    const data = await apiRequest('/api/foreman/projects');

    if (data.success) {
        currentProjects = data.projects;
        renderProjects(data.projects);
    } else {
        container.innerHTML = '<div class="col-12"><div class="alert alert-danger">Ошибка загрузки проектов</div></div>';
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsList');

    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="alert bg-elevated border-secondary text-muted py-5 rounded-0">
                    <i class="bi bi-folder-x display-1 mb-3 d-block opacity-25"></i>
                    <h4 class="fw-bold">ОБЪЕКТЫ ОТСУТСТВУЮТ</h4>
                    <p>Введите код доступа от менеджера в верхней панели, чтобы присоединиться к объекту.</p>
                </div>
            </div>`;
        return;
    }

    let html = '<div class="row g-4">';
    projects.forEach(project => {
        const deadline = new Date(project.stages_deadline);
        const now = new Date();
        const isExpired = deadline < now;
        const hoursLeft = Math.max(0, Math.round((deadline - now) / (1000 * 60 * 60)));

        html += `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="card h-100 bg-transparent border-secondary shadow-hover" style="border: 1px solid var(--border-color);">
                    <div class="card-header border-bottom border-secondary bg-transparent d-flex justify-content-between align-items-start pt-3 pb-2">
                         <div class="d-flex flex-column">
                            <h5 class="fw-bold mb-1 text-white text-truncate" style="max-width: 250px;" title="${project.title}">${project.title}</h5>
                            <small class="text-muted"><i class="bi bi-hash"></i> ${project.id}</small>
                         </div>
                         ${getStatusBadge(project.status)}
                    </div>
                    <div class="card-body">
                        <div class="mb-3 d-flex flex-wrap gap-2">
                             <span class="badge border border-info text-info bg-transparent"><i class="bi bi-person"></i> МЕНЕДЖЕР: ${project.manager_name || '-'}</span>
                             <span class="badge border border-secondary text-secondary bg-transparent"><i class="bi bi-truck"></i> СНАБЖЕНЕЦ: ${project.supplier_name || 'НЕ НАЗНАЧЕН'}</span>
                        </div>
                        <div class="mb-3">
                            <p class="mb-1 text-muted small"><i class="bi bi-geo-alt"></i> Адрес</p>
                            <span class="text-white">${project.address || '<span class="text-muted">-</span>'}</span>
                        </div>
                        
                        ${project.status === 'stages_pending' ? `
                            <div class="alert ${isExpired ? 'alert-danger bg-danger bg-opacity-10 border-danger' : 'alert-warning bg-warning bg-opacity-10 border-warning'} py-2 mb-0 border small">
                                <i class="bi bi-clock-history"></i> ${isExpired
                    ? 'ДЕДЛАЙН ИСТЁК! Создание этапов недоступно'
                    : `Осталось ${hoursLeft} ч. для создания этапов`}
                            </div>` : ''}
                    </div>
                    <div class="card-footer bg-transparent border-top border-secondary pt-3 pb-3">
                        <button class="btn btn-warning w-100 py-2 fw-bold" onclick="openProjectModal(${project.id})">
                             <i class="bi bi-folder2-open"></i> ОТКРЫТЬ ОБЪЕКТ
                        </button>
                    </div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// =============================================================================
// МОДАЛЬНОЕ ОКНО ПРОЕКТА
// =============================================================================

async function openProjectModal(projectId) {
    const modal = new bootstrap.Modal(document.getElementById('projectModal'));
    document.getElementById('modalTitle').textContent = 'Загрузка...';
    document.getElementById('modalBody').innerHTML = `
        <div class="text-center py-4"><div class="spinner-border text-warning"></div></div>`;
    modal.show();

    const data = await apiRequest(`/api/foreman/projects/${projectId}`);

    if (!data.success) {
        document.getElementById('modalBody').innerHTML = '<div class="alert alert-danger">Ошибка загрузки</div>';
        return;
    }

    currentProject = data.project;
    document.getElementById('modalTitle').textContent = data.project.title;
    renderModalContent(data.project, data.stages, data.documents);
}

function renderModalContent(project, stages, documents) {
    const deadline = new Date(project.stages_deadline);
    const canCreateStages = deadline > new Date() && project.status === 'stages_pending';

    let html = `
        <div class="row mb-3">
            <div class="col-md-6">
                <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
            </div>
            <div class="col-md-6">
                <p><strong>Описание:</strong></p>
                <p class="text-muted">${project.description || 'Нет описания'}</p>
            </div>
        </div>

        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h5 class="mb-0">🛠 Этапы работ</h5>
            <div class="d-flex gap-2">
                <button class="btn btn-outline-warning btn-sm fw-bold"
                    onclick="showRequestMaterialModal(${project.id})"
                    title="Запросить дополнительный материал у снабженца">
                    ⚠️ Запросить материал
                </button>
                ${canCreateStages ? `
                <button class="btn btn-success btn-sm fw-bold" onclick="showCreateStageModal()">
                    ➕ Создать этап
                </button>` : ''}
            </div>
        </div>
    `;

    if (!stages || stages.length === 0) {
        html += `<div class="alert alert-warning">
            📝 Этапы ещё не созданы.
            ${canCreateStages ? 'Создайте первый этап!' : ''}
        </div>`;
    } else {
        stages.forEach(stage => { html += renderStage(stage); });
    }

    // Документы
    if (documents && documents.length > 0) {
        html += '<h5 class="border-bottom pb-2 mt-4">📄 Документы</h5><div class="list-group">';
        documents.forEach(doc => {
            html += `
                <a href="/${doc.file_path}" target="_blank" class="list-group-item list-group-item-action">
                    <i class="bi bi-paperclip"></i> ${doc.file_name}
                    <small class="text-muted float-end">${formatDate(doc.uploaded_at)}</small>
                </a>`;
        });
        html += '</div>';
    }

    document.getElementById('modalBody').innerHTML = html;
}

function renderStage(stage) {
    const done = stage.is_completed === 1;

    let html = `
        <div class="card mb-3 ${done ? 'border-success' : ''}">
            <div class="card-header d-flex justify-content-between align-items-center
                        ${done ? 'bg-success text-white' : 'bg-light'}">
                <h6 class="mb-0">
                    ${done ? '✅' : '🔨'} Этап ${stage.stage_number}: ${stage.name}
                </h6>
                <div class="d-flex gap-2 align-items-center">
                    ${done
            ? `<small>Завершён ${formatDateShort(stage.completed_at)}</small>`
            : `<button class="btn btn-sm btn-success" onclick="completeStage(${stage.id})">
                               ✔️ Завершить
                           </button>`}
                    <button class="btn btn-sm ${done ? 'btn-outline-light' : 'btn-outline-secondary'}"
                            onclick="showUploadPhotosModal(${stage.id})">
                        📸 Фото
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${stage.description ? `<p class="text-muted small">${stage.description}</p>` : ''}

                ${stage.materials && stage.materials.length > 0 ? `
                    <h6 class="mt-2">Материалы этапа:</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead class="table-light">
                                <tr>
                                    <th>Материал</th>
                                    <th>Ед.</th>
                                    <th>План</th>
                                    <th>На складе</th>
                                    <th>Расход</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stage.materials.map(mat => {
                const received = parseFloat(mat.quantity_received || 0);
                const used = parseFloat(mat.quantity_used || 0);
                return `
                                        <tr>
                                            <td>${mat.material_name}</td>
                                            <td>${mat.unit || '-'}</td>
                                            <td>${mat.quantity_planned}</td>
                                            <td class="${received > 0 ? 'text-success fw-bold' : 'text-muted'}">
                                                ${received > 0 ? received : 'Не получено'}
                                            </td>
                                            <td>
                                                <input type="number" class="form-control form-control-sm"
                                                    id="used_${mat.id}"
                                                    value="${used}"
                                                    min="0" max="${received}"
                                                    step="0.1"
                                                    ${received === 0 ? 'disabled title="Сначала получите материал на склад"' : ''}
                                                    style="width:90px;">
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary"
                                                    onclick="updateMaterial(${mat.id})"
                                                    ${received === 0 ? 'disabled' : ''}>
                                                    Сохранить
                                                </button>
                                            </td>
                                        </tr>`;
            }).join('')}
                            </tbody>
                        </table>
                    </div>` : '<p class="text-muted small mb-0">Материалы не добавлены</p>'}

                ${stage.photos && stage.photos.length > 0 ? `
                    <div class="photo-grid mt-3">
                        ${stage.photos.map(ph => `
                            <a href="/${ph.file_path}" target="_blank">
                                <img src="/${ph.file_path}" class="img-thumbnail"
                                     style="height:80px;object-fit:cover;">
                            </a>`).join('')}
                    </div>` : ''}
            </div>
        </div>`;

    return html;
}

// =============================================================================
// ===== ВКЛАДКА: МАТЕРИАЛЫ =====
// =============================================================================

async function loadAllMaterials() {
    const container = document.getElementById('materialsContainer');
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка материалов...</p>
        </div>`;

    const data = await apiRequest('/api/foreman/materials');

    if (!data.success) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки материалов</div>';
        return;
    }

    if (!data.materials || data.materials.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                📦 Материалы пока не добавлены ни в одном из ваших проектов.
            </div>`;
        return;
    }

    // Группируем по проекту
    const grouped = {};
    data.materials.forEach(mat => {
        const key = mat.project_title;
        if (!grouped[key]) grouped[key] = { items: [], projectId: mat.project_id };
        grouped[key].items.push(mat);
    });

    let html = '';

    for (const [projectTitle, group] of Object.entries(grouped)) {
        html += `
            <div class="card shadow-sm mb-4">
                <div class="card-header bg-dark text-white fw-bold">
                    🏗 ${projectTitle}
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Материал</th>
                                    <th>Этап</th>
                                    <th>Ед.</th>
                                    <th>План</th>
                                    <th>На складе</th>
                                    <th>Расход</th>
                                    <th>Статус</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.items.map(mat => {
            const received = parseFloat(mat.quantity_received || 0);
            const used = parseFloat(mat.quantity_used || 0);
            const deficit = parseFloat(mat.quantity_planned) - received;

            return `
                                        <tr>
                                            <td><strong>${mat.material_name}</strong></td>
                                            <td><small class="text-muted">${mat.stage_name}</small></td>
                                            <td>${mat.unit || '-'}</td>
                                            <td>${mat.quantity_planned}</td>
                                            <td class="${received > 0 ? 'text-success fw-bold' : 'text-danger'}">
                                                ${received > 0 ? received : '—'}
                                            </td>
                                            <td>
                                                <input type="number" class="form-control form-control-sm"
                                                    id="mat_used_${mat.id}"
                                                    value="${used}"
                                                    min="0" max="${received}"
                                                    step="0.1"
                                                    ${received === 0 ? 'disabled title="Материал ещё не получен на склад"' : ''}
                                                    style="width:90px;">
                                            </td>
                                            <td>
                                                ${received === 0
                    ? '<span class="badge bg-secondary">Ожидается</span>'
                    : used >= received
                        ? '<span class="badge bg-danger">Всё списано</span>'
                        : '<span class="badge bg-success">На складе</span>'}
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-primary"
                                                    onclick="updateMaterialFromTab(${mat.id})"
                                                    ${received === 0 ? 'disabled' : ''}>
                                                    💾
                                                </button>
                                            </td>
                                        </tr>`;
        }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    container.innerHTML = html;
}

// Сохранение расхода из вкладки Материалы
async function updateMaterialFromTab(materialId) {
    const input = document.getElementById(`mat_used_${materialId}`);
    const quantityUsed = parseFloat(input.value) || 0;
    const maxAllowed = parseFloat(input.max);

    if (quantityUsed > maxAllowed) {
        showError(`Нельзя списать больше ${maxAllowed} (получено на склад)`);
        input.value = maxAllowed;
        return;
    }

    const result = await apiRequest(`/api/foreman/materials/${materialId}/usage`, 'PUT', { quantityUsed });

    if (result.success) {
        showSuccess('Расход сохранён');
    } else {
        showError(result.message || 'Ошибка сохранения');
    }
}

// =============================================================================
// СОЗДАНИЕ ЭТАПА
// =============================================================================

function showCreateStageModal() {
    if (!currentProject) return;

    const modalHtml = `
        <div class="modal fade" id="createStageModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title">➕ Создать этап работ</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="createStageForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label fw-bold">Название этапа *</label>
                                <input type="text" class="form-control" id="stageName"
                                    placeholder="Например: Прокладка кабельных линий" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="stageDescription" rows="2"></textarea>
                            </div>

                            <hr>
                            <datalist id="unitOptions">
                                <option value="м">
                                <option value="пог.м">
                                <option value="кв.м">
                                <option value="куб.м">
                                <option value="шт">
                                <option value="кг">
                                <option value="т">
                                <option value="компл">
                                <option value="упак">
                                <option value="рулон">
                            </datalist>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h6 class="mb-0">📦 Материалы этапа</h6>
                                <button type="button" class="btn btn-sm btn-outline-primary"
                                    onclick="addMaterialRow()">
                                    + Добавить материал
                                </button>
                            </div>
                            <div id="materialsContainer"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-success fw-bold">Создать этап</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('createStageModal'));
    modal.show();

    document.getElementById('createStageForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const materials = [];
        let hasValidationError = false;
        document.querySelectorAll('.material-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            const name = inputs[0].value;
            const unit = inputs[1].value;
            let quantity = parseFloat(inputs[2].value) || 0;

            if (name) {
                // Валидация целых чисел для штучных товаров
                const wholeUnits = ['шт', 'шт.', 'упак', 'упак.', 'компл', 'компл.'];
                if (wholeUnits.includes(unit.toLowerCase().trim()) && !Number.isInteger(quantity)) {
                    showError(`Количество для "${name}" (${unit}) должно быть целым числом!`);
                    hasValidationError = true;
                }

                materials.push({
                    name,
                    unit,
                    quantity
                });
            }
        });

        if (hasValidationError) return;

        const result = await apiRequest('/api/foreman/stages', 'POST', {
            projectId: currentProject.id,
            stageName: document.getElementById('stageName').value,
            description: document.getElementById('stageDescription').value,
            materials
        });

        if (result.success) {
            showSuccess('Этап создан');
            modal.hide();
            await openProjectModal(currentProject.id);
        } else {
            showError(result.message || 'Ошибка создания этапа');
        }
    });

    document.getElementById('createStageModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function addMaterialRow() {
    document.getElementById('materialsContainer').insertAdjacentHTML('beforeend', `
        <div class="material-row row g-2 mb-2 align-items-center">
            <div class="col-5">
                <input type="text" class="form-control form-control-sm" placeholder="Название материала">
            </div>
            <div class="col-2">
                <input type="text" class="form-control form-control-sm unit-input" placeholder="Ед. (м, шт, кг)" list="unitOptions">
            </div>
            <div class="col-3">
                <input type="number" class="form-control form-control-sm qty-input" placeholder="Кол-во" step="any" min="0">
            </div>
            <div class="col-2">
                <button type="button" class="btn btn-sm btn-outline-danger w-100"
                    onclick="this.closest('.material-row').remove()">✕</button>
            </div>
        </div>`);
}

// =============================================================================
// ОБНОВЛЕНИЕ МАТЕРИАЛОВ (из окна этапа)
// =============================================================================

async function updateMaterial(materialId) {
    const input = document.getElementById(`used_${materialId}`);
    const quantityUsed = parseFloat(input.value) || 0;
    const maxAllowed = parseFloat(input.max);

    if (quantityUsed > maxAllowed) {
        showError(`Нельзя списать больше ${maxAllowed} — столько получено на склад`);
        input.value = maxAllowed;
        return;
    }

    const result = await apiRequest(`/api/foreman/materials/${materialId}/usage`, 'PUT', { quantityUsed });

    if (result.success) {
        showSuccess('Расход обновлён');
    } else {
        showError(result.message || 'Ошибка обновления');
    }
}

// =============================================================================
// ЗАВЕРШЕНИЕ ЭТАПА
// =============================================================================

async function completeStage(stageId) {
    if (!confirm('Отметить этап как завершённый? Это действие необратимо.')) return;

    const result = await apiRequest(`/api/foreman/stages/${stageId}/complete`, 'PUT');

    if (result.success) {
        showSuccess('Этап завершён!');
        await openProjectModal(currentProject.id);
    } else {
        showError(result.message || 'Ошибка завершения');
    }
}

// =============================================================================
// ЗАГРУЗКА ФОТО
// =============================================================================

function showUploadPhotosModal(stageId) {
    const modalHtml = `
        <div class="modal fade" id="uploadPhotosModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">📸 Загрузка фото к этапу</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="uploadPhotosForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Фото (до 10 штук)</label>
                                <input type="file" class="form-control" id="photoFiles"
                                    accept="image/*" multiple required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="photoDescription" rows="2"
                                    placeholder="Что изображено на фото..."></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary fw-bold">📤 Загрузить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('uploadPhotosModal'));
    modal.show();

    document.getElementById('uploadPhotosForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const files = document.getElementById('photoFiles').files;
        if (!files.length) { showError('Выберите файлы'); return; }
        if (files.length > 10) { showError('Максимум 10 фото'); return; }

        const formData = new FormData();
        Array.from(files).forEach(f => formData.append('photos', f));
        formData.append('description', document.getElementById('photoDescription').value);

        const result = await apiRequest(`/api/foreman/stages/${stageId}/photos`, 'POST', formData);

        if (result.success) {
            showSuccess(`Загружено фото: ${result.count}`);
            modal.hide();
            if (currentProject) await openProjectModal(currentProject.id);
        } else {
            showError(result.message || 'Ошибка загрузки');
        }
    });

    document.getElementById('uploadPhotosModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// ПРИСОЕДИНЕНИЕ К ПРОЕКТУ
// =============================================================================

window.joinProject = async function () {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) { alert('Введите код проекта!'); return; }

    const data = await apiRequest('/api/foreman/join', 'POST', { accessCode: code });

    if (data.success) {
        showSuccess('✅ Вы добавлены в проект: ' + data.project.title);
        document.getElementById('joinCode').value = '';
        await loadProjects();
    } else {
        showError('❌ ' + (data.message || 'Проект не найден'));
    }
};

// =============================================================================
// СОГЛАСОВАНИЕ МАТЕРИАЛОВ ОТ СНАБЖЕНЦА
// =============================================================================

async function loadMaterialApprovals() {
    const container = document.getElementById('approvalsContainer');
    container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-warning"></div></div>`;

    const data = await apiRequest('/api/foreman/material-requests');

    if (!data.success || !data.requests || data.requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-check2-all" style="font-size:3rem"></i>
                <p class="mt-3">Нет материалов ожидающих согласования</p>
            </div>`;
        return;
    }

    const pending = data.requests.filter(r => r.status === 'pending');
    const badge = document.getElementById('approvalsBadge');
    if (badge && pending.length > 0) {
        badge.textContent = pending.length;
        badge.style.display = 'inline-block';
    }

    const statusMap = {
        pending: { label: 'Ожидает', cls: 'warning text-dark' },
        approved: { label: 'Согласовано', cls: 'success' },
        rejected: { label: 'Отклонено', cls: 'danger' },
        delivered: { label: 'Доставлено', cls: 'info' }
    };

    container.innerHTML = `<div class="row g-3">${data.requests.map(r => {
        const st = statusMap[r.status] || { label: r.status, cls: 'secondary' };
        return `
            <div class="col-md-6">
                <div class="card shadow-sm border-start border-4 border-${st.cls.split(' ')[0]} h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="fw-bold mb-0">${r.material_name}</h6>
                            <span class="badge bg-${st.cls}">${st.label}</span>
                        </div>
                        <p class="mb-1 small"><i class="bi bi-building"></i> ${r.project_title}</p>
                        <p class="mb-1 small"><strong>Кол-во:</strong> ${r.quantity} ${r.unit || ''}</p>
                        ${r.supplier_name ? `<p class="mb-1 small"><strong>От снабженца:</strong> ${r.supplier_name}</p>` : ''}
                        ${r.reason ? `<p class="mb-1 small text-muted">${r.reason}</p>` : ''}
                        <small class="text-muted">${formatDate(r.created_at)}</small>

                        ${r.status === 'pending' ? `
                            <div class="d-flex gap-2 mt-3">
                                <button class="btn btn-success btn-sm flex-fill fw-bold"
                                    onclick="approveRequest(${r.id})">
                                    ✅ Согласовать
                                </button>
                                <button class="btn btn-outline-danger btn-sm"
                                    onclick="rejectRequest(${r.id})">
                                    ✖
                                </button>
                            </div>` : ''}

                        ${r.status === 'delivered' ? `
                            <div class="alert alert-success py-1 mt-2 mb-0 small">
                                🚚 Материал доставлен — доступен для списания
                            </div>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('')}</div>`;
}

async function approveRequest(requestId) {
    const data = await apiRequest(`/api/foreman/material-requests/${requestId}`, 'PUT', {
        status: 'approved'
    });

    if (data.success) {
        showSuccess('✅ Материал согласован — снабженец может заказывать');
        await loadMaterialApprovals();
    } else {
        showError(data.message || 'Ошибка');
    }
}

async function rejectRequest(requestId) {
    const reason = prompt('Причина отказа:');
    if (reason === null) return;

    const data = await apiRequest(`/api/foreman/material-requests/${requestId}`, 'PUT', {
        status: 'rejected',
        notes: reason
    });

    if (data.success) {
        showSuccess('Материал отклонён');
        await loadMaterialApprovals();
    } else {
        showError(data.message || 'Ошибка');
    }
}

// Счётчик при загрузке
async function checkPendingApprovals() {
    const data = await apiRequest('/api/foreman/material-requests');
    if (data.success && data.requests) {
        const pending = data.requests.filter(r => r.status === 'pending').length;
        const badge = document.getElementById('approvalsBadge');
        if (badge && pending > 0) {
            badge.textContent = pending;
            badge.style.display = 'inline-block';
        }
    }
}

// =============================================================================
// ПРОРАБ СОЗДАЁТ ЗАЯВКУ НА ДОПОЛНИТЕЛЬНЫЙ МАТЕРИАЛ
// =============================================================================

function showRequestMaterialModal(projectId) {
    const old = document.getElementById('requestMaterialModal');
    if (old) old.remove();

    const modalHtml = `
        <div class="modal fade" id="requestMaterialModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title fw-bold text-dark">
                            ⚠️ Запросить материал у снабженца
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="requestMaterialForm">
                        <div class="modal-body">
                            <datalist id="reqUnitOptions">
                                <option value="м">
                                <option value="пог.м">
                                <option value="кв.м">
                                <option value="куб.м">
                                <option value="шт">
                                <option value="кг">
                                <option value="т">
                                <option value="компл">
                                <option value="упак">
                                <option value="рулон">
                            </datalist>
                            <div class="alert alert-info small">
                                Запрос уйдёт снабженцу — он подтвердит и доставит материал
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold">Материал *</label>
                                <input type="text" class="form-control" id="req_mat_name"
                                    placeholder="Название материала" required>
                            </div>
                            <div class="row g-3">
                                <div class="col-6">
                                    <label class="form-label">Единица</label>
                                    <input type="text" class="form-control" id="req_mat_unit"
                                        placeholder="м, шт, кг..." list="reqUnitOptions">
                                </div>
                                <div class="col-6">
                                    <label class="form-label fw-bold">Количество *</label>
                                    <input type="number" class="form-control" id="req_mat_qty"
                                        step="any" min="0" required>
                                </div>
                            </div>
                            <div class="mb-3 mt-3">
                                <label class="form-label">Причина / комментарий</label>
                                <textarea class="form-control" id="req_mat_reason" rows="2"
                                    placeholder="Почему нужен дополнительный материал..."></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link text-muted text-decoration-none"
                                data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-warning fw-bold">
                                📨 Отправить снабженцу
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(document.getElementById('requestMaterialModal')).show();

    document.getElementById('requestMaterialForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;

        const unit = document.getElementById('req_mat_unit').value;
        const quantity = parseFloat(document.getElementById('req_mat_qty').value);
        const name = document.getElementById('req_mat_name').value;

        // Валидация целых чисел
        const wholeUnits = ['шт', 'шт.', 'упак', 'упак.', 'компл', 'компл.'];
        if (wholeUnits.includes(unit.toLowerCase().trim()) && !Number.isInteger(quantity)) {
            btn.disabled = false;
            return showError(`Количество для "${name}" (${unit}) должно быть целым числом!`);
        }

        const data = await apiRequest('/api/foreman/material-requests', 'POST', {
            projectId,
            materialName: name,
            unit: unit,
            quantity: quantity,
            reason: document.getElementById('req_mat_reason').value
        });

        if (data.success) {
            showSuccess('Заявка отправлена снабженцу!');
            bootstrap.Modal.getInstance(document.getElementById('requestMaterialModal')).hide();
        } else {
            showError(data.message || 'Ошибка');
        }

        btn.disabled = false;
    });

    document.getElementById('requestMaterialModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}