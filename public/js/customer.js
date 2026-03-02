// =============================================================================
// CUSTOMER.JS - Логика кабинета заказчика
// =============================================================================
console.log('--- CUSTOMER JS LOADED (V2 - NEW DESIGN) ---');

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await loadRequests();

    // Форма создания заявки
    document.getElementById('createRequestForm').addEventListener('submit', submitRequest);

    // Подгружаем заявки при переключении на вкладку
    document.getElementById('requests-tab').addEventListener('shown.bs.tab', loadRequests);

    // Чекбокс использования телефона из профиля
    const useProfilePhoneBtn = document.getElementById('useProfilePhone');
    if (useProfilePhoneBtn) {
        useProfilePhoneBtn.addEventListener('change', function () {
            const phoneInput = document.getElementById('req_contact');
            if (this.checked) {
                if (window.currentUserPhone) {
                    phoneInput.value = window.currentUserPhone;
                } else {
                    showError('Телефон в профиле не указан');
                    this.checked = false;
                }
            } else {
                phoneInput.value = '';
            }
        });
    }
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

    const data = await apiRequest('/api/customer/projects');

    if (!data.success) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-danger">Ошибка загрузки проектов</div></div>';
        return;
    }

    if (!data.projects || data.projects.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="bi bi-folder-x" style="font-size:3rem"></i>
                <p class="mt-3">У вас пока нет проектов.<br>
                    Введите код от менеджера или создайте заявку.
                </p>
                <div class="d-flex gap-2 justify-content-center">
                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createRequestModal">
                        + Создать заявку
                    </button>
                    <button class="btn btn-outline-primary" data-bs-toggle="modal" data-bs-target="#joinProjectModal">
                        🔗 Ввести код проекта
                    </button>
                </div>
            </div>`;
        return;
    }

    let html = '<div class="row g-4">';
    data.projects.forEach(p => {
        const progress = p.total_stages > 0
            ? Math.round((p.completed_stages / p.total_stages) * 100)
            : 0;

        const statusMap = {
            'new': 'НОВЫЙ',
            'in_progress': 'В РАБОТЕ',
            'stages_pending': 'ПЛАНИРОВАНИЕ',
            'completed': 'ЗАВЕРШЕН',
            'cancelled': 'ОТМЕНЕН'
        };

        html += `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="project-summary-card">
                    <div class="summary-header">
                        <div class="summary-title">
                            <i class="fas fa-desktop"></i> СВОДКА ОБЪЕКТА
                        </div>
                        <div class="status-badge ${p.status}">
                            ${statusMap[p.status] || p.status}
                        </div>
                    </div>

                    <div class="project-name-row" onclick="viewProject(${p.id})" style="cursor:pointer">
                        <h4 class="project-name text-truncate" title="${p.title}">${p.title}</h4>
                        <div class="progress-percent">${progress}%</div>
                    </div>

                    <div class="custom-progress" onclick="viewProject(${p.id})" style="cursor:pointer">
                        <div class="custom-progress-bar" style="width: ${progress}%"></div>
                    </div>

                    <div class="stats-grid">
                        <div class="stats-box" onclick="viewProject(${p.id})">
                            <i class="fas fa-camera stats-icon"></i>
                            <span class="stats-label">Новых фото</span>
                            <span class="stats-value">${p.photo_count || 0}</span>
                        </div>
                        <div class="stats-box" onclick="viewDocuments(${p.id}, '${p.title.replace(/'/g, "\\'")}')">
                            <i class="fas fa-file-alt stats-icon"></i>
                            <span class="stats-label">Документация</span>
                            <span class="stats-value">ОТКРЫТЬ</span>
                        </div>
                    </div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Просмотр документов (категоризированный)
async function viewDocuments(projectId, title) {
    const modal = document.getElementById('docsModal');
    const titleEl = document.getElementById('modalProjectTitle');
    const body = document.getElementById('modalDocsBody');

    titleEl.innerText = title;
    body.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Загрузка документов...</div>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/projects/${projectId}/documents`);
        const data = await res.json();

        if (!data.success || !data.documents || data.documents.length === 0) {
            body.innerHTML = '<div style="text-align:center; padding:40px; color:#8b949e;">Документы пока не загружены для этого проекта.</div>';
            return;
        }

        // Группировка
        const categories = {
            'rd': { name: 'РД (Рабочая документация)', items: [], icon: 'fa-pencil-ruler' },
            'estimate': { name: 'Сметы', items: [], icon: 'fa-file-invoice-dollar' },
            'act': { name: 'Акты', items: [], icon: 'fa-file-signature' },
            'contract': { name: 'Договоры', items: [], icon: 'fa-file-contract' },
            'tz': { name: 'ТЗ (Техническое задание)', items: [], icon: 'fa-clipboard-list' },
            'other': { name: 'Прочее', items: [], icon: 'fa-folder' }
        };

        const typeMap = { 'initial': 'rd', 'executive': 'act' };

        data.documents.forEach(doc => {
            let type = doc.document_type;
            if (typeMap[type]) type = typeMap[type];
            if (!categories[type]) type = 'other';
            categories[type].items.push(doc);
        });

        let html = '';
        for (const [key, cat] of Object.entries(categories)) {
            if (cat.items.length === 0) continue;
            html += `
                <div class="doc-category">
                    <div class="category-title"><i class="fas ${cat.icon}"></i> ${cat.name}</div>
                    ${cat.items.map(d => `
                        <a href="/${d.file_path}" target="_blank" class="doc-item">
                            <div class="doc-info">
                                <i class="fas fa-file-pdf doc-icon"></i>
                                <span>${d.file_name}</span>
                            </div>
                            <i class="fas fa-download" style="font-size:0.8rem; opacity:0.5;"></i>
                        </a>
                    `).join('')}
                </div>`;
        }
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = '<div style="color:red; text-align:center; padding:40px;">Ошибка при загрузке документов.</div>';
    }
}

function closeDocsModal() {
    document.getElementById('docsModal').style.display = 'none';
}

// Закрытие по клику вне модалки
window.addEventListener('click', (event) => {
    const modal = document.getElementById('docsModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

async function viewProject(projectId) {
    document.getElementById('projectDetailTitle').textContent = 'Загрузка...';
    document.getElementById('projectDetailBody').innerHTML = `
        <div class="text-center py-4"><div class="spinner-border text-primary"></div></div>`;
    new bootstrap.Modal(document.getElementById('projectDetailModal')).show();

    const data = await apiRequest(`/api/customer/projects/${projectId}`);

    if (!data.success) {
        document.getElementById('projectDetailBody').innerHTML =
            '<div class="alert alert-danger">Ошибка загрузки проекта</div>';
        return;
    }

    const { project, stages, documents } = data;
    document.getElementById('projectDetailTitle').textContent = project.title;

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
        <h5 class="border-bottom pb-2">🛠 Этапы работ</h5>
    `;

    if (!stages || stages.length === 0) {
        html += '<p class="text-muted">Этапы ещё не созданы</p>';
    } else {
        stages.forEach(stage => {
            const done = stage.is_completed === 1;
            html += `
                <div class="card mb-3 ${done ? 'border-success' : ''}">
                    <div class="card-header d-flex justify-content-between align-items-center
                                ${done ? 'bg-success text-white' : 'bg-light'}">
                        <span>${done ? '✅' : '🔨'} Этап ${stage.stage_number}: ${stage.name}</span>
                        ${done
                    ? `<small>Завершён ${formatDateShort(stage.completed_at)}</small>`
                    : '<span class="badge bg-warning text-dark">В работе</span>'}
                    </div>
                    <div class="card-body">
                        ${stage.description ? `<p class="text-muted">${stage.description}</p>` : ''}
                        ${stage.photos && stage.photos.length > 0
                    ? `<div class="photo-grid">
                                ${stage.photos.map(ph => `
                                    <a href="/${ph.file_path}" target="_blank">
                                        <img src="/${ph.file_path}" class="img-thumbnail"
                                             style="height:100px;object-fit:cover;">
                                    </a>`).join('')}
                               </div>`
                    : '<small class="text-muted">Фото ещё не загружены</small>'}
                    </div>
                </div>`;
        });
    }

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

    document.getElementById('projectDetailBody').innerHTML = html;
}

// =============================================================================
// ЗАЯВКИ
// =============================================================================

async function loadRequests() {
    const container = document.getElementById('requestsList');
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка заявок...</p>
        </div>`;

    const data = await apiRequest('/api/customer/requests');

    if (!data.success) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки заявок</div>';
        return;
    }

    if (!data.requests || data.requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox" style="font-size:3rem"></i>
                <p class="mt-3">У вас пока нет заявок</p>
                <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createRequestModal">
                    + Создать первую заявку
                </button>
            </div>`;
        return;
    }

    const statusMap = {
        pending: { label: 'На рассмотрении', cls: 'warning text-dark' },
        reviewed: { label: 'Рассмотрено', cls: 'info text-dark' },
        accepted: { label: 'Принято', cls: 'success' },
        rejected: { label: 'Отклонено', cls: 'danger' }
    };

    container.innerHTML = `<div class="list-group">${data.requests.map(r => {
        const st = statusMap[r.status] || { label: r.status, cls: 'secondary' };
        return `
            <div class="list-group-item list-group-item-action" style="cursor:pointer;"
                 onclick='viewRequest(${JSON.stringify(r)})'>
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-1 fw-bold">${r.title || 'Заявка #' + r.id}</h6>
                    <span class="badge bg-${st.cls}">${st.label}</span>
                </div>
                <small class="text-muted">${formatDate(r.created_at)}</small>
                ${r.notes
                ? `<p class="mt-1 mb-0 small text-muted">
                            <strong>Ответ:</strong> ${r.notes}</p>`
                : ''}
            </div>`;
    }).join('')}</div>`;
}

function viewRequest(request) {
    const statusMap = {
        pending: { label: 'На рассмотрении', cls: 'warning text-dark' },
        reviewed: { label: 'Рассмотрено', cls: 'info text-dark' },
        accepted: { label: 'Принято', cls: 'success' },
        rejected: { label: 'Отклонено', cls: 'danger' }
    };
    const st = statusMap[request.status] || { label: request.status, cls: 'secondary' };

    document.getElementById('requestDetailTitle').textContent = request.title || 'Заявка #' + request.id;
    document.getElementById('requestDetailBody').innerHTML = `
        <div class="mb-3">
            <span class="badge bg-${st.cls} fs-6 px-3 py-2">${st.label}</span>
        </div>
        <p><strong>Дата подачи:</strong> ${formatDate(request.created_at)}</p>
        ${request.reviewed_at ? `<p><strong>Дата рассмотрения:</strong> ${formatDate(request.reviewed_at)}</p>` : ''}
        <hr>
        <p><strong>Описание:</strong></p>
        <p class="text-muted">${request.description || '-'}</p>
        ${request.contact_info ? `<p><strong>Контакт:</strong> ${request.contact_info}</p>` : ''}
        ${request.notes ? `
            <div class="alert alert-info mt-3">
                <strong><i class="bi bi-chat-left-text"></i> Ответ менеджера:</strong><br>
                ${request.notes}
            </div>` : ''}
        ${request.status === 'accepted' && request.project_id ? `
            <div class="alert alert-success mt-3">
                ✅ <strong>Заявка принята!</strong> По вашей заявке создан проект.
            </div>` : ''}
    `;

    new bootstrap.Modal(document.getElementById('requestDetailModal')).show();
}

async function submitRequest(e) {
    e.preventDefault();

    const btn = document.getElementById('submitRequestBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Отправка...';

    const phone = document.getElementById('req_contact').value.trim();
    const phoneRegex = /^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;
    if (!phoneRegex.test(phone)) {
        showError('Введите корректный номер телефона (+79991234567)');
        btn.disabled = false;
        btn.innerHTML = '📤 Отправить заявку';
        return;
    }

    const files = document.getElementById('req_files').files;
    if (files.length > 5) {
        showError('Максимум 5 файлов');
        btn.disabled = false;
        btn.innerHTML = '📤 Отправить заявку';
        return;
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('req_title').value);
    formData.append('description', document.getElementById('req_description').value);
    formData.append('contactInfo', phone);
    Array.from(files).forEach(f => formData.append('documents', f));

    const data = await apiRequest('/api/customer/requests', 'POST', formData);

    if (data.success) {
        showSuccess('Заявка отправлена! Менеджер свяжется с вами.');
        bootstrap.Modal.getInstance(document.getElementById('createRequestModal')).hide();
        e.target.reset();
        if (document.getElementById('useProfilePhone')) document.getElementById('useProfilePhone').checked = false;
        await loadRequests();
        document.getElementById('requests-tab').click();
    } else {
        showError(data.message || 'Ошибка отправки заявки');
    }

    btn.disabled = false;
    btn.innerHTML = '📤 Отправить заявку';
}

// =============================================================================
// ПРИСОЕДИНЕНИЕ К ПРОЕКТУ
// =============================================================================

async function joinProject() {
    const code = document.getElementById('joinProjectCode').value.trim().toUpperCase();
    const resultDiv = document.getElementById('joinProjectResult');

    if (!code) {
        resultDiv.innerHTML = '<div class="alert alert-warning mb-0">Введите код проекта</div>';
        return;
    }

    const data = await apiRequest('/api/customer/join', 'POST', { accessCode: code });

    if (data.success) {
        resultDiv.innerHTML = `<div class="alert alert-success mb-0">
            ✅ Вы добавлены в проект: <strong>${data.project.title}</strong>
        </div>`;
        document.getElementById('joinProjectCode').value = '';
        await loadProjects();
        setTimeout(() => {
            bootstrap.Modal.getInstance(document.getElementById('joinProjectModal')).hide();
            resultDiv.innerHTML = '';
        }, 2000);
    } else {
        resultDiv.innerHTML = `<div class="alert alert-danger mb-0">❌ ${data.message}</div>`;
    }
}