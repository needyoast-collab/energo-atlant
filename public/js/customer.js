// =============================================================================
// CUSTOMER.JS - Логика кабинета заказчика
// =============================================================================
console.log('--- CUSTOMER JS LOADED (V2 - NEW DESIGN) ---');

let currentViewedMessage = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    await loadRequests();
    if (typeof loadNotifications === 'function') await loadNotifications();

    // Форма создания заявки
    document.getElementById('createRequestForm').addEventListener('submit', submitRequest);

    // Подгружаем заявки при переключении на вкладку
    document.getElementById('requests-tab').addEventListener('shown.bs.tab', loadRequests);

    if (document.getElementById('messages-tab')) document.getElementById('messages-tab').addEventListener('shown.bs.tab', loadInbox);
    if (document.getElementById('inbox-tab')) document.getElementById('inbox-tab').addEventListener('shown.bs.tab', loadInbox);
    if (document.getElementById('sent-tab')) document.getElementById('sent-tab').addEventListener('shown.bs.tab', loadSent);

    if (document.getElementById('composeMessageForm')) document.getElementById('composeMessageForm').addEventListener('submit', sendMessage);

    // Чекбокс использования телефона из профиля (ВОССТАНОВЛЕНО)
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

    // ПОИСК ПРОЕКТОВ
    const searchInput = document.getElementById('projectSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (!term) {
                renderProjects(allProjects);
            } else {
                const filtered = allProjects.filter(p =>
                    p.title?.toLowerCase().includes(term) ||
                    String(p.id).includes(term)
                );
                renderProjects(filtered);
            }
        });
    }
});

let allProjects = [];

// =============================================================================
// ПРОЕКТЫ
// =============================================================================

async function loadProjects() {
    const container = document.getElementById('projectsList');
    if (!container) return;

    const data = await apiRequest('/api/customer/projects');

    if (data.success) {
        allProjects = data.projects || [];
        window.customerProjects = allProjects; // Добавлено для корректной работы выбора получателя в сообщениях
        renderProjects(allProjects);
    } else {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки проектов</div>';
    }
}
function renderProjects(projects) {
    const container = document.getElementById('projectsList');
    if (!container) return;

    if (!projects || projects.length === 0) {
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
    projects.forEach(p => {
        const progress = p.total_stages > 0
            ? Math.round((p.completed_stages / p.total_stages) * 100)
            : 0;

        const statusConfig = {
            'lead': { label: 'Заявка принята', bg: '#0969da' },
            'qualification': { label: 'Уточняем детали', bg: '#0dcaf0' },
            'visit_scheduled': { label: 'Выезд запланирован', bg: '#ffc107' },
            'offer_in_progress': { label: 'Готовим КП', bg: '#adb5bd' },
            'offer_sent': { label: 'КП направлено', bg: '#0dcaf0' },
            'negotiation': { label: 'Согласование условий', bg: '#ffc107' },
            'contract_signing': { label: 'Договор на подписании', bg: '#6c757d' },
            'waiting_advance': { label: 'Ожидаем аванс', bg: '#fd7e14' },
            'in_progress': { label: 'Работы выполняются', bg: '#198754' },
            'closing_docs': { label: 'Оформление документации', bg: '#6c757d' },
            'won': { label: 'Объект сдан', bg: 'green' },
            'lost': { label: 'Отменён', bg: '#dc3545' },
            'postponed': { label: 'Остановлен', bg: '#343a40' }
        };
        const st = statusConfig[p.status] || { label: p.status || 'СТАТУС', bg: '#555' };
        const progressColor = progress > 0 ? 'var(--primary-color)' : '#21262d';

        // Используем белый цвет для иконки компьютера вручную или через класс
        const safeTitle = (p.title || 'Проект без названия').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        html += `
        <div class="col-md-6 col-lg-4" data-aos="fade-up">
            <div class="prj-card">
                <div class="prj-card-header">
                    <span class="prj-card-badge-label"><i class="bi bi-display me-1 text-white"></i> СВОДКА ОБЪЕКТА</span>
                    <span class="prj-card-status" style="background-color: ${st.bg}">${st.label}</span>
                    <div class="prj-card-percent" style="color: ${progress > 0 ? 'var(--primary-color)' : 'var(--text-muted)'}">${progress}%</div>
                </div>

                <div class="prj-card-body">
                    <h5 class="prj-card-title mb-3" data-action="view-project" data-id="${p.id}" title="${safeTitle}" style="cursor: pointer;">${p.title || 'Без названия'}</h5>

                    <div class="prj-progress-container mb-3" data-action="view-project" data-id="${p.id}" style="cursor: pointer;">
                        <div style="width: ${progress}%; background: ${progressColor}; height: 100%; transition: width 0.5s ease;"></div>
                    </div>

                    <div class="prj-card-meta">
                        <div class="text-truncate"><i class="bi bi-hash"></i> ID: ${p.id}</div>
                        <div class="text-truncate"><i class="bi bi-geo-alt"></i> ${p.address || 'Адрес не указан'}</div>
                    </div>

                    <div class="prj-card-actions">
                        <div class="prj-card-btn" data-action="view-documents" data-id="${p.id}" data-title="${safeTitle}">
                            <i class="bi bi-file-earmark-text"></i>
                            <span class="prj-card-btn-label">Документы</span>
                        </div>
                        <div class="prj-card-btn" data-action="view-project" data-id="${p.id}">
                            <i class="bi bi-laptop"></i>
                            <span class="prj-card-btn-label">Детали</span>
                        </div>
                    </div>
                </div>
                <div class="prj-card-footer-line"></div>
            </div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
    if (typeof AOS !== 'undefined') setTimeout(() => AOS.refresh(), 50);
}

// Просмотр документов (категоризированный)
async function viewDocuments(projectId, title) {
    // Сбрасываем уведомления по документам
    fetch(`/api/notifications/read-project/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'document' })
    }).catch(err => console.error('Error marking docs as read:', err));

    const modal = document.getElementById('docsModal');
    const titleEl = document.getElementById('modalProjectTitle');
    const body = document.getElementById('modalDocsBody');

    if (titleEl) titleEl.innerText = title;
    if (body) body.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Загрузка документов...</div>';
    if (modal) modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/projects/${projectId}/documents`);
        const data = await res.json();

        if (!data.success || !data.documents || data.documents.length === 0) {
            if (body) body.innerHTML = '<div style="text-align:center; padding:40px; color:#8b949e;">Документы пока не загружены для этого проекта.</div>';
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

        let catHtml = '';
        for (const [key, cat] of Object.entries(categories)) {
            if (cat.items.length === 0) continue;
            catHtml += `
                <div class="doc-category">
                    <div class="category-title"><i class="fas ${cat.icon}"></i> ${cat.name}</div>
                    ${cat.items.map(d => `
                        <a href="${sharedGetFileUrl(d.file_path)}" target="_blank" class="doc-item">
                            <div class="doc-info">
                                <i class="fas fa-file-pdf doc-icon"></i>
                                <span>${d.file_name}</span>
                            </div>
                            <i class="fas fa-download" style="font-size:0.8rem; opacity:0.5;"></i>
                        </a>
                    `).join('')}
                </div>`;
        }
        if (body) body.innerHTML = catHtml;
    } catch (err) {
        console.error('Error loading documents:', err);
        if (body) body.innerHTML = '<div style="color:red; text-align:center; padding:40px;">Ошибка при загрузке документов.</div>';
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
    // Сбрасываем уведомления по фото
    fetch(`/api/notifications/read-project/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'photo' })
    });

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

    const { project, stages, documents, materials } = data;
    document.getElementById('projectDetailTitle').textContent = project.title;

    let html = `
        <div class="row mb-4 bg-dark border border-secondary rounded p-3 text-white">
            <div class="col-md-6 mb-3 mb-md-0">
                <p class="mb-1"><small class="text-muted"><i class="bi bi-geo-alt"></i> Адрес:</small> <br><b>${project.address || '-'}</b></p>
                <p class="mb-1 mt-2"><small class="text-muted"><i class="bi bi-info-circle"></i> Статус:</small> <br>${getStatusBadge(project.status)}</p>
                <p class="mb-1 mt-2"><small class="text-muted"><i class="bi bi-person-badge"></i> Менеджер:</small> <br><b>${project.manager_name || 'Не назначен'}</b></p>
                ${project.foreman_name ? `<p class="mb-1 mt-2"><small class="text-muted"><i class="bi bi-tools"></i> Прораб:</small> <br><b>${project.foreman_name}</b></p>` : ''}
            </div>
            <div class="col-md-6 border-start border-secondary pl-3">
                <p class="mb-1"><small class="text-muted"><i class="bi bi-card-text"></i> Описание:</small></p>
                <p class="text-light" style="font-size: 0.9rem;">${project.description || 'Нет описания'}</p>
            </div>
        </div>

        <ul class="nav nav-pills mb-3" id="projectDetailsTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active rounded-pill px-4 fw-bold" id="stages-tab" data-bs-toggle="pill" data-bs-target="#stagesPane" type="button" role="tab">🛠 Работы / Этапы</button>
            </li>
            <li class="nav-item ms-2" role="presentation">
                <button class="nav-link rounded-pill px-4 fw-bold" id="materials-tab" data-bs-toggle="pill" data-bs-target="#materialsPane" type="button" role="tab">📦 Материалы</button>
            </li>
        </ul>

        <div class="tab-content" id="projectDetailsContents">
            <!-- Работы -->
            <div class="tab-pane fade show active" id="stagesPane" role="tabpanel">
    `;

    if (!stages || stages.length === 0) {
        html += `
            <div class="text-center py-5 text-muted bg-dark border border-secondary rounded">
                <i class="bi bi-list-task fs-1"></i>
                <p class="mt-2">Этапы работ ещё не созданы</p>
            </div>
        `;
    } else {
        stages.forEach(stage => {
            const done = stage.is_completed === 1;
            html += `
                <div class="card mb-3 bg-dark text-white border-${done ? 'success' : 'secondary'}">
                    <div class="card-header d-flex justify-content-between align-items-center bg-${done ? 'success bg-opacity-25' : 'dark'} border-bottom border-${done ? 'success' : 'secondary'}">
                        <span class="fw-bold fs-5">${done ? '<i class="bi bi-check-circle text-success me-2"></i>' : '<i class="bi bi-circle text-warning me-2"></i>'} Этап ${stage.stage_number}: ${stage.name}</span>
                        ${done
                    ? `<span class="badge bg-success"><i class="bi bi-check-all"></i> Завершён ${formatDateShort(stage.completed_at)}</span>`
                    : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split"></i> В работе</span>'}
                    </div>
                    <div class="card-body">
                        ${stage.description ? `<p class="text-secondary mb-3">${stage.description}</p>` : ''}

                        <div class="mb-2"><small class="text-muted text-uppercase fw-bold"><i class="bi bi-images"></i> Фотографии этапа</small></div>
                        ${stage.photos && stage.photos.length > 0
                    ? `<div class="d-flex flex-wrap gap-2">
                                ${stage.photos.map(ph => `
                                    <a href="${sharedGetFileUrl(ph.file_path)}" target="_blank" class="text-decoration-none">
                                        <div style="width: 120px; height: 120px; border-radius: 8px; overflow: hidden; border: 2px solid var(--border-color);">
                                            <img src="${sharedGetFileUrl(ph.file_path)}" style="width:100%; height:100%; object-fit:cover; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" alt="Фото">
                                        </div>
                                    </a>`).join('')}
                               </div>`
                    : '<div class="text-muted small p-2 bg-secondary bg-opacity-10 rounded border border-secondary border-opacity-50">Фото ещё не загружены</div>'}
                    </div>
                </div>`;
        });
    }

    html += '</div>'; // Конец вкладки Работы

    // Вкладка: Материалы
    html += `<div class="tab-pane fade" id="materialsPane" role="tabpanel">`;
    if (!materials || materials.length === 0) {
        html += `
            <div class="text-center py-5 text-muted bg-dark border border-secondary rounded">
                <i class="bi bi-box fs-1"></i>
                <p class="mt-2">Материалы для проекта ещё не добавлены</p>
            </div>
        `;
    } else {
        html += `<div class="row g-3">`;
        materials.forEach(m => {
            const plan = m.quantity_planned || 0;
            const used = m.quantity_used || 0;
            const received = m.quantity_received || 0;

            // Расчет прогресса (по доставке)
            let percentReceived = 0;
            if (plan > 0) percentReceived = Math.min(100, Math.round((received / plan) * 100));
            if (plan === 0 && received > 0) percentReceived = 100;

            // Расчет прогресса (по использованию из доставленного)
            let percentUsed = 0;
            if (plan > 0) percentUsed = Math.min(100, Math.round((used / plan) * 100));
            if (plan === 0 && used > 0) percentUsed = 100;

            const isOverused = used > plan && plan > 0;
            const isFullyReceived = received >= plan && plan > 0;

            html += `
                <div class="col-md-6 col-lg-4">
                    <div class="card bg-dark border-secondary h-100 shadow-sm">
                        <div class="card-header bg-secondary bg-opacity-10 border-bottom border-secondary py-2">
                             <h6 class="card-title text-white fw-bold mb-0 text-truncate" title="${m.material_name}">${m.material_name}</h6>
                        </div>
                        <div class="card-body p-3">
                            <small class="text-muted d-block mb-3"><i class="bi bi-tag"></i> Этап ${m.stage_number} - ${m.stage_name}</small>

                            <!-- Доставка -->
                            <div class="d-flex justify-content-between small text-secondary mb-1">
                                <span>Доставлено:</span>
                                <span class="${isFullyReceived ? 'text-success fw-bold' : 'text-primary'}">
                                    ${received} / ${plan} ${m.unit}
                                </span>
                            </div>
                            <div class="progress mb-3" style="height: 6px; background-color: #212529;">
                                <div class="progress-bar ${isFullyReceived ? 'bg-success' : 'bg-primary'}" role="progressbar" style="width: ${percentReceived}%" title="${percentReceived}%"></div>
                            </div>

                            <!-- Использование -->
                            <div class="d-flex justify-content-between small text-secondary mb-1">
                                <span>Израсходовано:</span>
                                <span class="${isOverused ? 'text-danger fw-bold' : (used === plan && plan > 0 ? 'text-success fw-bold' : 'text-warning')}">
                                    ${used} / ${plan} ${m.unit}
                                </span>
                            </div>
                            <div class="progress mb-2" style="height: 6px; background-color: #212529;">
                                <div class="progress-bar ${isOverused ? 'bg-danger' : (used === plan && plan > 0 ? 'bg-success' : 'bg-warning')}" role="progressbar" style="width: ${percentUsed}%" title="${percentUsed}%"></div>
                            </div>

                            ${isOverused ? `<div class="mt-2 small text-danger"><i class="bi bi-exclamation-triangle"></i> Перерасход материала</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += '</div>'; // Конец вкладки Материалы
    html += '</div>'; // Конец tab-content

    if (documents && documents.length > 0) {
        html += `
            <div class="mt-5">
                <h5 class="border-bottom border-secondary text-white pb-2 mb-3"><i class="bi bi-file-earmark-pdf"></i> Документы</h5>
                <div class="list-group">`;
        documents.forEach(doc => {
            html += `
                <a href="${sharedGetFileUrl(doc.file_path)}" target="_blank" class="list-group-item list-group-item-action bg-dark text-white border-secondary mb-1 rounded d-flex justify-content-between align-items-center">
                    <div>
                        <i class="bi bi-file-earmark-text text-primary fs-5 me-2"></i>
                        <span class="fw-bold" style="font-size: 0.95rem;">${doc.file_name}</span>
                    </div>
                    <small class="text-muted bg-secondary bg-opacity-25 px-2 py-1 rounded">${formatDate(doc.uploaded_at)}</small>
                </a>`;
        });
        html += `
                </div>
            </div>`;
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
            <div class="list-group-item list-group-item-action request-item" style="cursor:pointer;"
                 data-action="view-request" 
                 data-request='${JSON.stringify(r).replace(/'/g, '&apos;')}'>
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
        showError(data.message || 'Ошибка отправки заявки', data.errors);
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

// =============================================================================
// УВЕДОМЛЕНИЯ
// =============================================================================
// ===========================================
// УВЕДОМЛЕНИЯ (ИСПОЛЬЗУЕМ SHARED)
// ===========================================

async function loadNotifications() {
    await sharedLoadNotifications({
        badgeId: 'notifBadge',
        listId: 'notifList',
        persistentListId: 'persistentNotifList',
        persistentContainerId: 'persistentNotifications',
        onMarkRead: 'markNotificationRead'
    });
}

function markNotificationRead(notifId, projectId, type) {
    if (type === 'message') {
        const messagesTab = document.getElementById('messages-tab');
        if (messagesTab) {
            messagesTab.click();
            setTimeout(() => {
                const inboxTab = document.getElementById('inbox-tab');
                if (inboxTab) inboxTab.click();
            }, 200);
        }
        return;
    }

    if (projectId) {
        if (type === 'document') {
            const projTitle = document.querySelector(`[data-action="view-project"][data-id="${projectId}"]`)?.getAttribute('title') || 'Документы';
            viewDocuments(projectId, projTitle);
        } else {
            viewProject(projectId);
        }
    }
}

// =============================================================================
// ПОЧТА (ОФИЦИАЛЬНАЯ ПЕРЕПИСКА)
// =============================================================================

// ===========================================
// ПОЧТА (ИСПОЛЬЗУЕМ SHARED)
// ===========================================

async function loadInbox() {
    await sharedLoadInbox('inboxList', 'viewMessage');
}

async function loadSent() {
    await sharedLoadSent('sentList', 'viewMessage');
}

async function viewMessage(id, type, cardElement) {
    await sharedViewMessage(id, type, cardElement);
}

function composeReply() {
    if (!currentSharedViewedMessage) return;

    const msg = currentSharedViewedMessage;
    const detailModal = bootstrap.Modal.getInstance(document.getElementById('messageDetailModal'));
    if (detailModal) detailModal.hide();

    showComposeModal();

    const select = document.getElementById('composeReceiver');
    // Попробуем найти проект/менеджера по имени отправителя
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

function showComposeModal() {
    console.log('🔍 showComposeModal called');
    console.log('📊 window.customerProjects:', window.customerProjects);
    
    const select = document.getElementById('composeReceiver');
    console.log('🎯 composeReceiver element:', select);
    
    if (!select) {
        console.error('❌ composeReceiver element not found!');
        return;
    }
    
    select.innerHTML = '<option value="">Выберите проект/менеджера...</option>';

    if (window.customerProjects && window.customerProjects.length > 0) {
        const managers = new Map();
        window.customerProjects.forEach(p => {
            if (p.manager_id) {
                if (!managers.has(p.manager_id)) {
                    managers.set(p.manager_id, { name: p.manager_name, projects: [] });
                }
                managers.get(p.manager_id).projects.push({ id: p.id, title: p.title });
            }
        });

        console.log('👥 Managers map:', managers);

        managers.forEach((data, managerId) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `Менеджер: ${data.name || 'Аноним'}`;
            data.projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ receiver_id: managerId, project_id: p.id });
                opt.textContent = `Проект: ${p.title}`;
                optgroup.appendChild(opt);
            });
            select.appendChild(optgroup);
        });
        select.disabled = false;
    } else {
        select.innerHTML = '<option value="">Сначала необходимо присоединиться к проекту</option>';
        select.disabled = true;
    }

    document.getElementById('composeSubject').value = '';
    document.getElementById('composeBody').value = '';
    
    console.log('🎬 Opening modal...');
    const modal = new bootstrap.Modal(document.getElementById('composeMessageModal'));
    modal.show();
}

// Делаем функцию глобально доступной
window.showComposeModal = showComposeModal;

async function sendMessage(e) {
    e.preventDefault();
    const btn = document.getElementById('sendMsgBtn');
    btn.disabled = true;

    const recvVal = document.getElementById('composeReceiver').value;
    if (!recvVal) {
        showError('Выберите получателя');
        btn.disabled = false;
        return;
    }

    const { receiver_id, project_id } = JSON.parse(recvVal);
    const subject = document.getElementById('composeSubject').value;
    const body = document.getElementById('composeBody').value;
    const files = document.getElementById('composeAttachments').files;

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
            bootstrap.Modal.getInstance(document.getElementById('composeMessageModal')).hide();
            // Return to sent tab to show it
            const sentTab = new bootstrap.Tab(document.getElementById('sent-tab'));
            sentTab.show();
        } else {
            showError(res.message);
        }
    } catch (e) {
        showError('Ошибка отправки сообщения');
    }
    btn.disabled = false;
}

// Делаем функции глобально доступными
window.showComposeModal = showComposeModal;
window.sendMessage = sendMessage;
window.joinProject = joinProject;
window.composeReply = composeReply;
window.closeDocsModal = closeDocsModal;

const composeBtn = document.getElementById('composeMessageBtn');
if (composeBtn) {
    composeBtn.addEventListener('click', window.showComposeModal);
}

const composeForm = document.getElementById('composeMessageForm');
if (composeForm) {
    composeForm.addEventListener('submit', window.sendMessage);
}

const markAllReadBtn = document.getElementById('markAllReadBtn');
if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', window.markAllNotificationsRead);
}

const joinProjectBtn = document.getElementById('joinProjectBtn');
if (joinProjectBtn) {
    joinProjectBtn.addEventListener('click', window.joinProject);
}

const msgReplyBtn = document.getElementById('msgReplyBtn');
if (msgReplyBtn) {
    msgReplyBtn.addEventListener('click', window.composeReply);
}

const closeDocsModalBtn = document.getElementById('closeDocsModalBtn');
if (closeDocsModalBtn) {
    closeDocsModalBtn.addEventListener('click', window.closeDocsModal);
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.logout === 'function') {
            window.logout(e);
        } else {
            if (confirm('Вы точно хотите выйти?')) {
                window.location.href = '/login.html';
            }
        }
    });
}

// Делегированный обработчик для data-action элементов
document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    
    const action = target.dataset.action;
    const id = target.dataset.id ? parseInt(target.dataset.id) : null;
    const title = target.dataset.title;
    
    switch (action) {
        case 'view-project':
            if (id) viewProject(id);
            break;
        case 'view-documents':
            if (id && title) viewDocuments(id, title);
            break;
        case 'view-request':
            const requestData = target.dataset.request;
            if (requestData) {
                viewRequest(JSON.parse(requestData.replace(/&apos;/g, "'")));
            }
            break;
    }
});
