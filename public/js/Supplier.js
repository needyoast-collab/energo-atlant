// =============================================================================
// SUPPLIER.JS — Полный функционал снабженца
// =============================================================================

let currentProjectId = null;
let currentProjectStages = [];

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await checkPendingRequests();

    document.getElementById('addMaterialForm')?.addEventListener('submit', submitMaterial);
});

// =============================================================================
// ПРОЕКТЫ
// =============================================================================

async function loadProjects() {
    const container = document.getElementById('projectsList');
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка проектов...</p>
        </div>`;

    const data = await apiRequest('/api/supplier/projects');

    if (!data.success || !data.projects || data.projects.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="bi bi-folder-x" style="font-size:3rem"></i>
                <p class="mt-3">У вас пока нет проектов.<br>Введите код от менеджера чтобы присоединиться.</p>
            </div>`;
        return;
    }

    container.innerHTML = data.projects.map(p => `
        <div class="col-md-6 col-xl-4">
            <div class="card h-100 shadow-sm" style="cursor:pointer;" onclick="openProject(${p.id})">
                <div class="card-body">
                    <h5 class="card-title fw-bold">${p.title}</h5>
                    <p class="text-muted small mb-2">
                        <i class="bi bi-geo-alt"></i> ${p.address || 'Адрес не указан'}
                    </p>
                    <hr>
                    <div class="d-flex justify-content-between align-items-center">
                        ${getStatusBadge(p.status)}
                        <small class="text-muted">${formatDateShort(p.created_at)}</small>
                    </div>
                    ${p.manager_name ? `<p class="mt-2 mb-0 small"><strong>Менеджер:</strong> ${p.manager_name}</p>` : ''}
                    ${p.foreman_name ? `<p class="mb-0 small"><strong>Прораб:</strong> ${p.foreman_name}</p>` : ''}
                </div>
                <div class="card-footer bg-transparent border-0 pt-0">
                    <button class="btn btn-primary btn-sm w-100 fw-bold" onclick="event.stopPropagation(); openProject(${p.id})">
                        <i class="bi bi-folder2-open"></i> Открыть проект
                    </button>
                </div>
            </div>
        </div>`).join('');
}

// =============================================================================
// ДЕТАЛИ ПРОЕКТА
// =============================================================================

async function openProject(projectId) {
    currentProjectId = projectId;

    document.getElementById('projectModalTitle').textContent = 'Загрузка...';
    document.getElementById('projectModalBody').innerHTML = `
        <div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
    new bootstrap.Modal(document.getElementById('projectModal')).show();

    const data = await apiRequest(`/api/supplier/projects/${projectId}`);

    if (!data.success) {
        document.getElementById('projectModalBody').innerHTML =
            '<div class="alert alert-danger">Ошибка загрузки проекта</div>';
        return;
    }

    currentProjectStages = data.stages || [];
    document.getElementById('projectModalTitle').textContent = data.project.title;
    renderProjectModal(data.project, data.stages, data.materials);
}

function renderProjectModal(project, stages, materials) {
    let html = `
        <div class="row mb-4">
            <div class="col-md-6">
                <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                ${project.foreman_name ? `<p><strong>Прораб:</strong> ${project.foreman_name}</p>` : ''}
            </div>
            <div class="col-md-6">
                <p><strong>Описание:</strong></p>
                <p class="text-muted">${project.description || 'Нет описания'}</p>
            </div>
        </div>

        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h5 class="mb-0">📦 Материалы проекта</h5>
            <button class="btn btn-success btn-sm fw-bold" onclick="showAddMaterialModal(${project.id})">
                <i class="bi bi-plus-lg"></i> Добавить материал
            </button>
        </div>
    `;

    if (!materials || materials.length === 0) {
        html += `
            <div class="alert alert-info">
                📋 Материалы ещё не добавлены. Нажмите "Добавить материал" чтобы внести позицию на согласование прорабу.
            </div>`;
    } else {
        // Группируем по этапам
        const grouped = {};
        materials.forEach(mat => {
            const key = mat.stage_name || 'Без этапа';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(mat);
        });

        for (const [stageName, mats] of Object.entries(grouped)) {
            html += `
                <h6 class="text-secondary mt-3 mb-2">🔨 ${stageName}</h6>
                <div class="table-responsive mb-3">
                    <table class="table table-sm table-hover">
                        <thead class="table-light">
                            <tr>
                                <th>Материал</th>
                                <th>Ед.</th>
                                <th>Кол-во</th>
                                <th>Согласование</th>
                                <th>На складе</th>
                                <th>Израсходовано</th>
                                <th>Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mats.map(mat => renderMaterialRow(mat)).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        // Итоги
        const total = materials.length;
        const approved = materials.filter(m => m.approval_status === 'approved').length;
        const received = materials.filter(m => m.is_received).length;

        html += `
            <div class="card bg-light border-0 mt-3">
                <div class="card-body py-2">
                    <div class="row text-center small">
                        <div class="col-4">
                            <div class="fw-bold text-primary">${total}</div>
                            <div class="text-muted">Всего позиций</div>
                        </div>
                        <div class="col-4">
                            <div class="fw-bold text-success">${approved}</div>
                            <div class="text-muted">Согласовано</div>
                        </div>
                        <div class="col-4">
                            <div class="fw-bold text-info">${received}</div>
                            <div class="text-muted">Получено на склад</div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    document.getElementById('projectModalBody').innerHTML = html;
}

function renderMaterialRow(mat) {
    const approvalStatus = mat.approval_status || 'approved'; // project_materials are already approved/planned
    const approvalBadge = {
        pending: '<span class="badge bg-warning text-dark">⏳ На согласовании</span>',
        approved: '<span class="badge bg-success">✅ Согласовано/План</span>',
        rejected: '<span class="badge bg-danger">❌ Отклонено</span>'
    }[approvalStatus] || '<span class="badge bg-secondary">—</span>';

    const received = parseFloat(mat.quantity_received || 0);
    const used = parseFloat(mat.quantity_used || 0);

    // Кнопка действия для снабженца — только если согласовано и ещё не поступило на склад
    let actionBtn = '—';
    if (approvalStatus === 'approved' && !mat.is_received) {
        actionBtn = `
            <button class="btn btn-sm btn-outline-primary" 
                onclick="confirmDelivery(${mat.id}, ${mat.quantity_planned})">
                🚚 Поставлено
            </button>`;
    } else if (mat.is_received) {
        actionBtn = `<span class="text-success small"><i class="bi bi-check-circle-fill"></i> Доставлено</span>`;
    } else if (approvalStatus === 'rejected') {
        actionBtn = `
            <button class="btn btn-sm btn-outline-warning"
                onclick="resubmitMaterial(${mat.id})">
                🔄 Пересмотреть
            </button>`;
    }

    return `
        <tr>
            <td>
                <strong>${mat.material_name}</strong>
                ${mat.notes ? `<br><small class="text-muted">${mat.notes}</small>` : ''}
            </td>
            <td>${mat.unit || '—'}</td>
            <td>${mat.quantity_planned}</td>
            <td>${approvalBadge}</td>
            <td class="${received > 0 ? 'text-success fw-bold' : 'text-muted'}">
                ${received > 0 ? received : '—'}
            </td>
            <td class="${used > 0 ? 'text-info' : 'text-muted'}">
                ${used > 0 ? used : '—'}
            </td>
            <td>${actionBtn}</td>
        </tr>`;
}

// =============================================================================
// ДОБАВЛЕНИЕ МАТЕРИАЛА (снабженец → прораб на согласование)
// =============================================================================

function showAddMaterialModal(projectId) {
    currentProjectId = projectId;

    // Заполняем выпадающий список этапов
    const stageSelect = document.getElementById('mat_stage');
    stageSelect.innerHTML = '<option value="">Выберите этап...</option>';

    if (currentProjectStages && currentProjectStages.length > 0) {
        currentProjectStages.forEach(s => {
            stageSelect.innerHTML += `<option value="${s.id}">Этап ${s.stage_number}: ${s.name}</option>`;
        });
    } else {
        stageSelect.innerHTML = '<option value="">Этапы ещё не созданы прорабом</option>';
        stageSelect.disabled = true;
    }

    document.getElementById('addMaterialForm').reset();
    new bootstrap.Modal(document.getElementById('addMaterialModal')).show();
}

async function submitMaterial(e) {
    e.preventDefault();

    const stageId = document.getElementById('mat_stage').value;
    if (!stageId) {
        showError('Выберите этап работ');
        return;
    }

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Отправка...';

    const data = await apiRequest('/api/supplier/materials', 'POST', {
        stageId,
        materialName: document.getElementById('mat_name').value,
        unit: document.getElementById('mat_unit').value,
        quantity: parseFloat(document.getElementById('mat_qty').value),
        notes: document.getElementById('mat_notes').value
    });

    if (data.success) {
        showSuccess('Материал отправлен прорабу на согласование');
        bootstrap.Modal.getInstance(document.getElementById('addMaterialModal')).hide();
        await openProject(currentProjectId); // Обновляем список
    } else {
        showError(data.message || 'Ошибка добавления материала');
    }

    btn.disabled = false;
    btn.innerHTML = '📨 Отправить на согласование';
}

// =============================================================================
// ПОДТВЕРЖДЕНИЕ ДОСТАВКИ (снабженец отмечает что привёз)
// =============================================================================

async function confirmDelivery(materialId, plannedQty) {
    const qty = prompt(`Укажите фактически доставленное количество (план: ${plannedQty}):`, plannedQty);
    if (qty === null) return;

    const quantityReceived = parseFloat(qty);
    if (isNaN(quantityReceived) || quantityReceived <= 0) {
        showError('Укажите корректное количество');
        return;
    }

    const data = await apiRequest(`/api/supplier/materials/${materialId}/deliver`, 'PUT', {
        quantityReceived
    });

    if (data.success) {
        showSuccess('✅ Поступление на склад подтверждено. Прораб теперь может списывать расход.');
        await openProject(currentProjectId);
    } else {
        showError(data.message || 'Ошибка подтверждения');
    }
}

// =============================================================================
// ЗАЯВКИ НА МАТЕРИАЛЫ (от прораба)
// =============================================================================

async function loadMaterialRequests() {
    const container = document.getElementById('materialRequestsList');
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary"></div>
        </div>`;

    const data = await apiRequest('/api/supplier/material-requests');

    if (!data.success || !data.requests || data.requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox" style="font-size:3rem"></i>
                <p class="mt-3">Нет новых заявок от прорабов</p>
            </div>`;
        return;
    }

    const statusMap = {
        pending: { label: 'Новая', cls: 'warning text-dark' },
        approved: { label: 'Принято', cls: 'primary' },
        rejected: { label: 'Отклонено', cls: 'danger' },
        delivered: { label: 'Доставлено', cls: 'success' }
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
                        <p class="mb-1 small text-muted">
                            <i class="bi bi-building"></i> ${r.project_title}
                        </p>
                        <p class="mb-1 small">
                            <strong>Количество:</strong> ${r.quantity} ${r.unit || ''}
                        </p>
                        <p class="mb-1 small">
                            <strong>Прораб:</strong> ${r.foreman_name}
                        </p>
                        ${r.reason ? `<p class="mb-2 small text-muted"><strong>Причина:</strong> ${r.reason}</p>` : ''}
                        <small class="text-muted">${formatDate(r.created_at)}</small>

                        ${r.status === 'pending' ? `
                            <div class="d-flex gap-2 mt-3">
                                <button class="btn btn-primary btn-sm flex-fill fw-bold"
                                    onclick="processRequest(${r.id}, 'approved')">
                                    ✔️ Принять в работу
                                </button>
                                <button class="btn btn-outline-danger btn-sm"
                                    onclick="processRequest(${r.id}, 'rejected')">
                                    ✖
                                </button>
                            </div>` : ''}

                        ${r.status === 'approved' ? `
                            <button class="btn btn-success btn-sm w-100 mt-3 fw-bold"
                                onclick="markRequestDelivered(${r.id})">
                                🚚 Отметить как доставлено
                            </button>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('')}</div>`;
}

async function checkPendingRequests() {
    const data = await apiRequest('/api/supplier/material-requests');
    if (data.success && data.requests) {
        const pending = data.requests.filter(r => r.status === 'pending').length;
        const badge = document.getElementById('requestsBadge');
        if (badge && pending > 0) {
            badge.textContent = pending;
            badge.style.display = 'inline-block';
        }
    }
}

async function processRequest(requestId, status) {
    let notes = '';
    if (status === 'rejected') {
        notes = prompt('Причина отказа:');
        if (notes === null) return;
    }

    const data = await apiRequest(`/api/supplier/material-requests/${requestId}`, 'PUT', {
        status, notes
    });

    if (data.success) {
        showSuccess(status === 'approved' ? '✅ Заявка принята в работу' : 'Заявка отклонена');
        await loadMaterialRequests();
        await checkPendingRequests();
    } else {
        showError(data.message || 'Ошибка');
    }
}

async function markRequestDelivered(requestId) {
    const data = await apiRequest(`/api/supplier/material-requests/${requestId}`, 'PUT', {
        status: 'delivered'
    });

    if (data.success) {
        showSuccess('🚚 Доставка отмечена!');
        await loadMaterialRequests();
    } else {
        showError(data.message || 'Ошибка');
    }
}

// =============================================================================
// ПРИСОЕДИНЕНИЕ К ПРОЕКТУ
// =============================================================================

async function joinProject() {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) { alert('Введите код проекта!'); return; }

    const data = await apiRequest('/api/supplier/join', 'POST', { accessCode: code });

    if (data.success) {
        showSuccess('✅ Вы добавлены в проект!');
        document.getElementById('joinCode').value = '';
        await loadProjects();
    } else {
        showError(data.message || 'Неверный код');
    }
}