/**
 * SHARED.JS - Общая логика для всех личных кабинетов
 * Содержит функции для работы с уведомлениями и почтой, 
 * которые раньше дублировались в каждом файле роли.
 */

// Глобальное состояние для сообщения
let currentSharedViewedMessage = null;
/**
 * Инициализация уведомлений
 * @param {Object} config - { badgeId, listId, onMarkRead }
 */
async function sharedLoadNotifications(config) {
    const badge = document.getElementById(config.badgeId);
    const list = document.getElementById(config.listId);
    if (!badge || !list) return;

    const data = await apiRequest('/api/notifications');
    if (!data.success || !data.notifications) return;

    const unreadCount = data.notifications.filter(n => !n.is_read).length;
    if (unreadCount > 0) {
        badge.classList.remove('d-none');
        if (badge.tagName === 'SPAN' && !badge.classList.contains('p-1')) {
            badge.innerText = unreadCount;
        }
    } else {
        badge.classList.add('d-none');
    }

    const iconMap = {
        'new_request': { icon: 'bi-envelope-exclamation', color: '#f59e0b' },
        'message': { icon: 'bi-chat-dots', color: '#3b82f6' },
        'stage_complete': { icon: 'bi-check-circle', color: '#10b981' },
        'document': { icon: 'bi-file-earmark-check', color: '#8b5cf6' },
        'photo': { icon: 'bi-camera', color: '#ec4899' }
    };

    // Populate persistent list if ID provided
    const persistentList = config.persistentListId ? document.getElementById(config.persistentListId) : null;
    const persistentContainer = config.persistentContainerId ? document.getElementById(config.persistentContainerId) : null;

    if (persistentList) {
        if (unreadCount > 0) {
            if (persistentContainer) persistentContainer.classList.remove('d-none');
            persistentList.innerHTML = data.notifications.filter(n => !n.is_read).map(n => {
                const ic = iconMap[n.type] || { icon: 'bi-bell', color: '#6c757d' };
                return `
                    <button class="list-group-item list-group-item-action bg-dark text-white border-0 py-2 notification-item" 
                            data-notif-id="${n.id}" 
                            data-project-id="${n.project_id || 'null'}" 
                            data-type="${n.type}" 
                            data-on-mark-read="${config.onMarkRead || ''}">
                        <div class="d-flex align-items-center">
                            <i class="bi ${ic.icon} me-3 fs-5" style="color:${ic.color}"></i>
                            <div class="flex-grow-1 overflow-hidden">
                                <div class="d-flex justify-content-between">
                                    <small class="text-muted fw-bold" style="font-size:0.65rem;">${new Date(n.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
                                </div>
                                <div class="text-truncate small">${n.message}</div>
                            </div>
                        </div>
                    </button>`;
            }).join('');
        } else {
            if (persistentContainer) persistentContainer.classList.add('d-none');
            persistentList.innerHTML = '';
        }
    }

    if (data.notifications.length === 0) {
        list.innerHTML = '<li><span class="dropdown-item text-muted text-center py-3">Нет новых уведомлений</span></li>';
        return;
    }

    const notifHtml = data.notifications.map(n => {
        const ic = iconMap[n.type] || { icon: 'bi-bell', color: '#6c757d' };
        const isUnread = !n.is_read;
        const clickHandler = `sharedMarkNotificationRead(${n.id}, ${n.project_id || 'null'}, '${n.type}', '${config.onMarkRead || ''}')`;

        return `
            <li class="notification-item ${isUnread ? 'unread' : ''}" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <a class="dropdown-item text-wrap py-2 notification-link" 
                   href="#" 
                   data-notif-id="${n.id}" 
                   data-project-id="${n.project_id || 'null'}" 
                   data-type="${n.type}" 
                   data-on-mark-read="${config.onMarkRead || ''}">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <div class="d-flex align-items-center">
                            <i class="bi ${ic.icon} me-2" style="color:${ic.color}"></i>
                            <small class="text-secondary" style="font-size:0.7rem;">${new Date(n.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                        </div>
                        ${isUnread ? '<span class="unread-dot"></span>' : ''}
                    </div>
                    <div class="notif-message text-truncate-2">${n.message}</div>
                </a>
            </li>
        `;
    }).join('');

    list.innerHTML = notifHtml;

    // Обеспечиваем прокрутку после 5 элементов
    list.classList.add('notif-scroll-container');
}

async function markAllNotificationsRead() {
    await apiRequest('/api/notifications/read-all', 'POST');
    if (window.loadNotifications) window.loadNotifications();
}

// Делаем функцию глобально доступной
window.markAllNotificationsRead = markAllNotificationsRead;

async function sharedMarkNotificationRead(notifId, projectId, type, callbackName) {
    // Отметим на сервере
    await apiRequest(`/api/notifications/read/${notifId}`, 'POST');

    // Если была передана функция обратного вызова (например, для специфичной навигации роли)
    if (callbackName && typeof window[callbackName] === 'function') {
        window[callbackName](notifId, projectId, type);
    } else {
        // Стандартное поведение
        if (type === 'message') {
            const messagesTab = document.getElementById('messages-tab');
            if (messagesTab) {
                messagesTab.click();
                setTimeout(() => {
                    const inboxTab = document.getElementById('inbox-tab');
                    if (inboxTab) inboxTab.click();
                }, 200);
            }
        }
    }

    // Глобально перегрузим уведомления (нужна ссылка на конфиг или просто перезапуск текущего набора)
    // В идеале sharedLoadNotifications должен вызываться из кабинета
    if (window.loadNotifications) window.loadNotifications();
}

/**
 * ПОЧТА (SHARED)
 */
async function sharedLoadInbox(containerId, renderCallback) {
    const list = document.getElementById(containerId);
    if (!list) return;

    list.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    const data = await apiRequest('/api/messages/inbox');
    if (!data.success) {
        list.innerHTML = '<div class="alert alert-danger border-0 bg-dark text-danger">Ошибка загрузки входящих</div>';
        return;
    }
    sharedRenderMessages(data.messages, list, 'inbox', renderCallback);
}

async function sharedLoadSent(containerId, renderCallback) {
    const list = document.getElementById(containerId);
    if (!list) return;

    list.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    const data = await apiRequest('/api/messages/sent');
    if (!data.success) {
        list.innerHTML = '<div class="alert alert-danger border-0 bg-dark text-danger">Ошибка загрузки исходящих</div>';
        return;
    }
    sharedRenderMessages(data.messages, list, 'sent', renderCallback);
}

function sharedRenderMessages(messages, container, type, clickHandlerName) {
    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 px-3">
                <i class="bi bi-envelope-paper text-secondary" style="font-size: 3rem;"></i>
                <p class="mt-3 text-secondary fw-bold">У вас пока нет ${type === 'inbox' ? 'входящих' : 'исходящих'} писем</p>
            </div>`;
        return;
    }

    container.innerHTML = messages.map(m => {
        const isUnread = type === 'inbox' && !m.is_read;
        const mainName = type === 'inbox' ? m.sender_name : m.receiver_name;
        const projTitle = m.project_title ? `<span class="badge bg-secondary ms-1 x-small" style="font-size:0.6rem;">${m.project_title}</span>` : '';
        const hasAttachments = m.attachments && m.attachments !== '[]' && m.attachments !== 'null';

        const clickHandler = clickHandlerName ? `${clickHandlerName}(${m.id}, '${type}', this)` : `sharedViewMessage(${m.id}, '${type}', this)`;

        return `
            <div class="card bg-dark border-secondary mb-2 overflow-hidden message-card" 
                 data-message-id="${m.id}" 
                 data-type="${type}" 
                 data-click-handler="${clickHandlerName || 'sharedViewMessage'}">
                <div class="card-body p-2 p-md-3 shadow-none">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <div class="text-truncate fw-bold text-white small" style="max-width: 75%;">
                            ${isUnread ? '<span class="badge bg-warning p-1 me-1" style="width:8px;height:8px;border-radius:50%;display:inline-block;"></span>' : ''}
                            ${m.subject || 'Без темы'}
                        </div>
                        <small class="text-muted" style="font-size: 0.7rem;">${new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                    <div class="d-flex justify-content-between align-items-end">
                        <div class="text-muted x-small text-truncate" style="font-size: 0.75rem; max-width: 80%;">
                            ${type === 'inbox' ? 'От' : 'Кому'}: <span class="text-primary fw-bold">${mainName}</span>
                            ${projTitle}
                        </div>
                        ${hasAttachments ? '<i class="bi bi-paperclip text-muted fs-6"></i>' : ''}
                    </div>
                    <!-- Hidden data -->
                    <div class="d-none msg-body">${m.body ? m.body.replace(/"/g, '&quot;') : ''}</div>
                    <div class="d-none msg-partner">${mainName}</div>
                    <div class="d-none msg-subject">${m.subject || 'Без темы'}</div>
                    <div class="d-none msg-date">${new Date(m.created_at).toLocaleString('ru-RU')}</div>
                    <div class="d-none msg-attachments">${m.attachments ? m.attachments.replace(/"/g, '&quot;') : ''}</div>
                </div>
            </div>`;
    }).join('');
}

/**
 * Вспомогательная функция для получения защищенного URL файла
 */
function sharedGetFileUrl(path) {
    if (!path) return '#';
    if (path.startsWith('http') || path.startsWith('data:')) return path;

    // Если путь не содержит uploads/, но это файл из папки загрузок
    let fullPath = path;
    if (!path.startsWith('uploads/')) {
        fullPath = 'uploads/' + path;
    }

    return `/api/documents/serve?path=${encodeURIComponent(fullPath)}`;
}

async function sharedViewMessage(id, type, cardElement) {
    const subject = cardElement.querySelector('.msg-subject').textContent;
    const partner = cardElement.querySelector('.msg-partner').textContent;
    const date = cardElement.querySelector('.msg-date').textContent;
    const body = cardElement.querySelector('.msg-body').innerHTML;
    document.getElementById('msgDetailSubject').textContent = subject;
    document.getElementById('msgDetailDate').textContent = date;

    currentSharedViewedMessage = { id, partner, subject, body, type, date };

    if (type === 'inbox') {
        document.getElementById('msgDetailSender').textContent = partner;
        document.getElementById('msgDetailReceiver').textContent = 'Вы';
    } else {
        document.getElementById('msgDetailSender').textContent = 'Вы';
        document.getElementById('msgDetailReceiver').textContent = partner;
    }

    document.getElementById('msgDetailText').innerHTML = body;

    const attachmentsContainer = document.getElementById('msgDetailAttachments');
    const attachmentsList = document.getElementById('msgDetailAttachmentsList');
    const attachmentsData = cardElement.querySelector('.msg-attachments').textContent;

    if (attachmentsData && attachmentsList) {
        try {
            const files = JSON.parse(attachmentsData);
            if (files && files.length > 0) {
                attachmentsList.innerHTML = files.map(f => {
                    const isImg = f.originalName.match(/\.(jpg|jpeg|png)$/i);
                    const icon = isImg ? 'bi-image text-success' : 'bi-file-earmark-text text-primary';
                    const secureUrl = sharedGetFileUrl(f.filename);
                    return `
                        <a href="${secureUrl}" target="_blank" class="msg-attachment-link d-flex align-items-center mb-2 me-2" style="max-width:220px">
                            <i class="bi ${icon} me-2 fs-5"></i>
                            <div class="text-truncate text-start">
                                <span class="d-block text-truncate" style="font-size:0.8rem; font-weight:600">${f.originalName}</span>
                                <span class="text-muted" style="font-size:0.7rem">${(f.size / 1024).toFixed(1)} KB</span>
                            </div>
                        </a>
                    `;
                }).join('');
                attachmentsContainer.classList.remove('d-none');
            } else {
                attachmentsContainer.classList.add('d-none');
            }
        } catch (e) {
            attachmentsContainer.classList.add('d-none');
        }
    } else if (attachmentsContainer) {
        attachmentsContainer.classList.add('d-none');
    }

    const modal = new bootstrap.Modal(document.getElementById('messageDetailModal'));
    modal.show();

    if (type === 'inbox') {
        const unreadDot = cardElement.querySelector('.badge.bg-warning');
        if (unreadDot) {
            unreadDot.remove();
            await apiRequest(`/api/messages/${id}/read`, 'PUT');
        }
    }
}
// =============================================================================
// ПРОЕКТЫ (SHARED UI)
// =============================================================================

/**
 * Просмотр и загрузка документов проекта
 */
async function sharedShowProjectDocs(projectId, projectsArray) {
    const project = projectsArray.find(p => p.id === projectId);
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
                        <form id="uploadDocForm" class="mb-4 p-3 border rounded bg-light text-dark">
                            <h6 class="mb-3 fw-bold">➕ Загрузить документ</h6>
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
                                    <button type="submit" class="btn btn-primary w-100 fw-bold">Загрузить</button>
                                </div>
                            </div>
                        </form>
                        
                        <h6 class="fw-bold mb-3"><i class="bi bi-files"></i> Прикрепленные файлы</h6>
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

    await sharedLoadProjectDocsArray(projectId);

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
            await sharedLoadProjectDocsArray(projectId);
        } else {
            showError(res.message);
        }
        btn.disabled = false;
    });
}

async function sharedLoadProjectDocsArray(projectId) {
    const data = await apiRequest(`/api/manager/projects/${projectId}/documents`);
    const container = document.getElementById('docsListModal');
    if (!container) return;

    if (!data.success) {
        container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки</div>';
        return;
    }

    if (!data.documents || data.documents.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-3">Документов пока нет</div>';
        return;
    }

    const typeNames = {
        'rd': 'РД', 'estimate': 'Смета', 'act': 'Акты', 'tz': 'ТЗ',
        'contract': 'Договор', 'ds': 'ДС', 'other': 'Прочее',
        'initial': 'РД (стар.)', 'executive': 'ИД'
    };

    container.innerHTML = data.documents.map(d => {
        const secureUrl = sharedGetFileUrl(d.file_path || d.filename);
        return `
            <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-secondary me-2">${typeNames[d.document_type] || d.document_type}</span>
                    <a href="${secureUrl}" target="_blank" class="text-info text-decoration-none">${d.file_name}</a>
                    <div class="small text-muted">${new Date(d.uploaded_at).toLocaleString()}</div>
                </div>
                <button class="btn btn-sm btn-outline-danger delete-doc-btn" 
                        data-project-id="${projectId}" 
                        data-doc-id="${d.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

async function sharedDeleteProjectDoc(projectId, docId) {
    if (!confirm('Удалить этот документ?')) return;
    const res = await apiRequest(`/api/manager/projects/${projectId}/documents/${docId}`, 'DELETE');
    if (res.success) {
        showSuccess('Удалено');
        await sharedLoadProjectDocsArray(projectId);
    } else {
        showError(res.message);
    }
}

/**
 * ИИ Модалка (Beta)
 */
async function sharedShowAIModal(projectId, projectsArray) {
    const project = projectsArray.find(p => p.id === projectId);
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
                    <div class="modal-body bg-light text-dark">
                        <div class="row align-items-center mb-4">
                            <div class="col-md-7">
                                <h6 class="fw-bold text-primary mb-1">Смета проекта: ${project.title}</h6>
                                <p class="text-muted small mb-0">Файлы проекта могут быть проанализированы для генерации ВОР/ВОМ.</p>
                            </div>
                            <div class="col-md-5">
                                <form id="aiUploadForm" class="d-flex flex-column gap-3">
                                    <input type="file" class="form-control" id="aiDoc" accept=".pdf,.jpg,.jpeg,.png,.webp">
                                    <button class="btn btn-primary fw-bold w-100" type="submit">✨ Проанализировать</button>
                                </form>
                            </div>
                        </div>
                        <div id="aiResultContainer" class="d-none">
                            <!-- ИИ Результаты здесь -->
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('aiModal'));
    modal.show();

    // В реальности здесь больше логики обработки ИИ, но для общности пока скелет
}

// =============================================================================
// РЕДАКТИРОВАНИЕ ПРОЕКТА (SHARED) - используется и менеджером, и администратором
// =============================================================================

/**
 * Открывает модалку редактирования проекта.
 * @param {Object} project - объект проекта из currentProjects
 * @param {Function} onSuccess - callback после успешного сохранения (например, loadProjects)
 */
async function sharedEditProject(project, onSuccess) {
    const old = document.getElementById('sharedEditProjectModal');
    if (old) old.remove();

    // Загружаем список персонала для выпадающих списков
    const staffData = await apiRequest('/api/manager/staff');
    const staff = (staffData.success && staffData.staff) ? staffData.staff : [];

    const buildOptions = (role, selectedId) => {
        const filtered = staff.filter(s => s.role === role);
        let opts = `<option value="">— Не назначен —</option>`;
        filtered.forEach(s => {
            opts += `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${s.full_name}</option>`;
        });
        return opts;
    };

    const statusOptions = [
        { val: 'lead', label: 'Новый лид' },
        { val: 'qualification', label: 'Квалификация' },
        { val: 'visit_scheduled', label: 'Выезд назначен' },
        { val: 'offer_in_progress', label: 'КП в работе' },
        { val: 'offer_sent', label: 'КП отправлено' },
        { val: 'negotiation', label: 'Переговоры' },
        { val: 'contract_signing', label: 'Договор на согласовании' },
        { val: 'waiting_advance', label: 'Ожидание аванса' },
        { val: 'in_progress', label: 'В работе' },
        { val: 'closing_docs', label: 'Закрытие документов' },
        { val: 'won', label: 'Закрыт — выигран' },
        { val: 'lost', label: 'Закрыт — проигран' },
        { val: 'postponed', label: 'Отложен' }
    ].map(s => `<option value="${s.val}" ${project.status === s.val ? 'selected' : ''}>${s.label}</option>`).join('');

    const modalHtml = `
        <div class="modal fade" id="sharedEditProjectModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <form class="modal-content" id="sharedEditProjectForm" style="background: var(--bg-surface); border: 1px solid var(--primary-color);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--primary-color);">
                        <h5 class="modal-title fw-bold text-uppercase">
                            <i class="bi bi-pencil-square me-2 text-warning"></i>РЕДАКТИРОВАНИЕ ОБЪЕКТА
                        </h5>
                        <small class="text-muted ms-2">#${project.id} — ${project.title}</small>
                        <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" style="overflow-y: auto; max-height: calc(100vh - 250px);">
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Название объекта *</label>
                                <input type="text" class="form-control" name="title" value="${project.title || ''}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Адрес *</label>
                                <input type="text" class="form-control" name="address" value="${project.address || ''}" required>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-8">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Тип работ *</label>
                                    <input type="text" class="form-control" name="work_type" value="${project.work_type || ''}" required 
                                        placeholder="Краткое описание работ со слов заказчика">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Протяжённость, м *</label>
                                    <input type="number" class="form-control" name="length_m" value="${project.length_m || ''}" required min="0" 
                                        placeholder="Напр. 1500">
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Описание</label>
                                <textarea class="form-control" name="description" rows="3">${project.description || ''}</textarea>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Имя клиента</label>
                                    <input type="text" class="form-control" name="clientName" value="${project.client_name || ''}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Организация</label>
                                    <input type="text" class="form-control" name="clientOrganization" value="${project.client_organization || ''}">
                                </div>
                            </div>
                            
                            <hr style="border-color: var(--border-color);">
                            <h6 class="fw-bold text-uppercase small text-muted mb-3">Детали сделки</h6>
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Источник лида</label>
                                    <input type="text" class="form-control" name="lead_source" value="${project.lead_source || ''}" placeholder="Откуда пришёл">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Сумма КП, руб.</label>
                                    <input type="number" step="0.01" class="form-control" name="offer_sum" value="${project.offer_sum || ''}" placeholder="Напр. 500000">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Дата выезда</label>
                                    <input type="datetime-local" class="form-control" name="visit_date" value="${project.visit_date || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Дата отправки КП</label>
                                    <input type="date" class="form-control" name="offer_sent_date" value="${project.offer_sent_date || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Срок действия КП</label>
                                    <input type="date" class="form-control" name="offer_valid_until" value="${project.offer_valid_until || ''}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Сумма аванса, руб.</label>
                                    <input type="number" step="0.01" class="form-control" name="advance_sum" value="${project.advance_sum || ''}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Дата получения аванса</label>
                                    <input type="date" class="form-control" name="advance_date" value="${project.advance_date || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Подписание договора (дата)</label>
                                    <input type="date" class="form-control" name="contract_date" value="${project.contract_date || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Подписание Акта (дата)</label>
                                    <input type="date" class="form-control" name="act_date" value="${project.act_date || ''}">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Сумма финала, руб.</label>
                                    <input type="number" step="0.01" class="form-control" name="final_sum" value="${project.final_sum || ''}">
                                </div>
                            </div>

                            <hr style="border-color: var(--border-color);">
                            <div class="row g-3 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Прораб</label>
                                    <select class="form-select" name="foremanId">
                                        ${buildOptions('foreman', project.foreman_id)}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Снабженец</label>
                                    <select class="form-select" name="supplierId">
                                        ${buildOptions('supplier', project.supplier_id)}
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label fw-bold text-uppercase small text-muted">Инженер ПТО</label>
                                    <select class="form-select" name="ptoId">
                                        ${buildOptions('pto', project.pto_id)}
                                    </select>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Статус</label>
                                <select class="form-select" name="status">
                                    ${statusOptions}
                                </select>
                            </div>
                            <div class="alert alert-dark border border-secondary small mb-0">
                                <i class="bi bi-key text-warning me-2"></i>
                                <strong>Код доступа:</strong>
                                <code class="user-select-all ms-2 text-warning">${project.access_code}</code>
                                <span class="text-muted ms-2">(для прораба и заказчика)</span>
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid var(--border-color);">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">ОТМЕНА</button>
                            <button type="submit" class="btn btn-warning fw-bold px-4">
                                <i class="bi bi-floppy me-1"></i> СОХРАНИТЬ
                            </button>
                        </div>
                </form>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('sharedEditProjectModal'));
    modal.show();

    document.getElementById('sharedEditProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('[type=submit]');
        const ogText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>СОХРАНЕНИЕ...';

        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());

        const res = await apiRequest(`/api/manager/projects/${project.id}`, 'PUT', payload);
        if (res.success) {
            showSuccess('Объект обновлён!');
            modal.hide();
            if (typeof onSuccess === 'function') onSuccess();
        } else {
            showError(res.message || 'Ошибка сохранения');
            btn.disabled = false;
            btn.innerHTML = ogText;
        }
    });

    document.getElementById('sharedEditProjectModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// Экспортируем в глобальный scope для вызова из admin.js
window.sharedEditProject = sharedEditProject;

// Делегированные обработчики для уведомлений и документов
document.addEventListener('click', (e) => {
    // Обработка ссылок уведомлений (Dropdown)
    const notifLink = e.target.closest('.notification-link');
    if (notifLink) {
        e.preventDefault();
        const notifId = notifLink.dataset.notifId;
        const projectId = notifLink.dataset.projectId === 'null' ? null : parseInt(notifLink.dataset.projectId);
        const type = notifLink.dataset.type;
        const onMarkRead = notifLink.dataset.onMarkRead;

        if (notifId) {
            sharedMarkNotificationRead(parseInt(notifId), projectId, type, onMarkRead);
        }
        return;
    }

    // Обработка уведомлений (Persistent List)
    const notifItem = e.target.closest('.notification-item');
    if (notifItem && notifItem.dataset.notifId) {
        const notifId = notifItem.dataset.notifId;
        const projectId = notifItem.dataset.projectId === 'null' ? null : parseInt(notifItem.dataset.projectId);
        const type = notifItem.dataset.type;
        const onMarkRead = notifItem.dataset.onMarkRead;

        if (notifId) {
            sharedMarkNotificationRead(parseInt(notifId), projectId, type, onMarkRead);
        }
        return;
    }

    // Обработка сообщений
    const messageCard = e.target.closest('.message-card');
    if (messageCard) {
        const messageId = messageCard.dataset.messageId;
        const type = messageCard.dataset.type;
        const clickHandler = messageCard.dataset.clickHandler;

        if (messageId && window[clickHandler]) {
            window[clickHandler](parseInt(messageId), type, messageCard);
        }
        return;
    }

    // Обработка удаления документов
    const deleteBtn = e.target.closest('.delete-doc-btn');
    if (deleteBtn) {
        const projectId = parseInt(deleteBtn.dataset.projectId);
        const docId = parseInt(deleteBtn.dataset.docId);

        if (projectId && docId) {
            sharedDeleteProjectDoc(projectId, docId);
        }
        return;
    }
});

// Добавляем стили для hover эффектов вместо onmouseover
const style = document.createElement('style');
style.textContent = `
    .message-card {
        cursor: pointer;
        transition: 0.2s;
        border: 1px solid var(--border-color) !important;
    }
    .message-card:hover {
        border-color: var(--primary-color) !important;
    }
`;
document.head.appendChild(style);
