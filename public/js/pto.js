// =============================================================================
// PTO.JS - Логика для кабинета инженера ПТО
// =============================================================================

let currentProjects = [];
let currentProject = null;

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
});

// =============================================================================
// ЗАГРУЗКА ПРОЕКТОВ
// =============================================================================

async function loadProjects() {
    showLoading('projectsList');

    const data = await apiRequest('/api/pto/projects');

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
        html += `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="prj-card">
                    <div class="prj-card-header">
                         <div class="d-flex flex-column">
                            <h5 class="prj-card-title mb-1" onclick="viewProjectDetails(${project.id})" title="${project.title}">${project.title}</h5>
                            <small class="text-muted"><i class="bi bi-hash"></i> ${project.id}</small>
                         </div>
                         ${getStatusBadge(project.status)}
                    </div>
                    <div class="prj-card-body">
                        <div class="mb-3 d-flex flex-wrap gap-2">
                             <span class="badge border border-info text-info bg-transparent"><i class="bi bi-person me-1"></i>МЕНЕДЖЕР: ${project.manager_name || '-'}</span>
                             <span class="badge border border-warning text-warning bg-transparent"><i class="bi bi-tools me-1"></i>ПРОРАБ: ${project.foreman_name || '-'}</span>
                        </div>
                        <div class="prj-card-meta">
                            <div><i class="bi bi-geo-alt"></i>${project.address || '-'}</div>
                        </div>
                    </div>
                    <div class="prj-card-body pt-0">
                        <div class="d-grid gap-2">
                            <button class="btn btn-outline-info w-100 py-2 fw-bold" onclick="viewProjectDetails(${project.id})">
                                 <i class="bi bi-eye"></i> ПРОСМОТР ЭТАПОВ
                            </button>
                            <button class="btn btn-success w-100 py-2 fw-bold" onclick="showUploadDocumentsModal(${project.id})">
                                 <i class="bi bi-upload"></i> ЗАГРУЗИТЬ ИД
                            </button>
                        </div>
                    </div>
                    <div class="prj-card-footer-line"></div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function joinProject() {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!code) { showError('Введите код проекта!'); return; }

    const data = await apiRequest('/api/pto/join', 'POST', { accessCode: code });
    if (data.success) {
        showSuccess('✅ Вы добавлены в проект!');
        document.getElementById('joinCode').value = '';
        await loadProjects();
    } else {
        showError(data.message || 'Неверный код проекта');
    }
}

// =============================================================================
// ПРОСМОТР ДЕТАЛЕЙ ПРОЕКТА
// =============================================================================

async function viewProjectDetails(projectId) {
    new bootstrap.Modal(document.getElementById('projectModal')).show();
    showLoading('projectDetails');

    const data = await apiRequest(`/api/pto/projects/${projectId}`);

    if (data.success) {
        currentProject = data.project;
        renderProjectDetails(data.project, data.stages, data.documents);
    } else {
        document.getElementById('projectDetails').innerHTML = '<div class="alert alert-danger">Ошибка загрузки</div>';
        showError('Ошибка загрузки проекта');
    }
}

function renderProjectDetails(project, stages, documents) {
    const container = document.getElementById('projectDetails');
    if (!container) return;

    let html = `
        <div class="card mb-3">
            <div class="card-header bg-primary text-white">
                <div class="d-flex justify-content-between align-items-center">
                    <h4 class="mb-0">📋 ${project.title}</h4>
                    <button class="btn btn-success" onclick="showUploadDocumentsModal(${project.id})">
                        📤 Загрузить ИД
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                        <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Прораб:</strong> ${project.foreman_name || '-'}</p>
                        <p><strong>Создан:</strong> ${formatDate(project.created_at)}</p>
                    </div>
                </div>
                ${project.description ? `<hr><p>${project.description}</p>` : ''}
            </div>
        </div>
        
        <h5 class="mt-4 mb-3">Этапы работ</h5>
    `;

    if (!stages || stages.length === 0) {
        html += '<div class="alert alert-warning">Этапы еще не созданы</div>';
    } else {
        stages.forEach(stage => {
            html += renderStage(stage);
        });
    }

    // Документы
    html += `
        <h5 class="mt-4 mb-3">📄 Документы проекта</h5>
        <div class="card">
            <div class="card-body">
    `;

    if (!documents || documents.length === 0) {
        html += '<p class="text-muted">Документов пока нет</p>';
    } else {
        // Группируем по типам
        const initialDocs = documents.filter(d => d.document_type === 'initial');
        const executiveDocs = documents.filter(d => d.document_type === 'executive');
        const otherDocs = documents.filter(d => !['initial', 'executive'].includes(d.document_type));

        if (initialDocs.length > 0) {
            html += '<h6 class="mb-2">📋 Начальные документы:</h6><div class="list-group mb-3">';
            initialDocs.forEach(doc => {
                html += `
                        <a href="${sharedGetFileUrl(doc.file_path)}" target="_blank" class="list-group-item list-group-item-action">
                            📎 ${doc.file_name}
                            <small class="text-muted float-end">${formatDate(doc.uploaded_at)}</small>
                        </a>
                    `;
            });
            html += '</div>';
        }

        if (executiveDocs.length > 0) {
            html += '<h6 class="mb-2">✅ Исполнительная документация:</h6><div class="list-group mb-3">';
            executiveDocs.forEach(doc => {
                html += `
                        <a href="${sharedGetFileUrl(doc.file_path)}" target="_blank" class="list-group-item list-group-item-action list-group-item-success">
                            📎 ${doc.file_name}
                            <small class="text-muted float-end">${formatDate(doc.uploaded_at)}</small>
                        </a>
                    `;
            });
            html += '</div>';
        }

        if (otherDocs.length > 0) {
            html += '<h6 class="mb-2">📁 Другие документы:</h6><div class="list-group">';
            otherDocs.forEach(doc => {
                html += `
                        <a href="${sharedGetFileUrl(doc.file_path)}" target="_blank" class="list-group-item list-group-item-action">
                            📎 ${doc.file_name}
                            <small class="text-muted float-end">${formatDate(doc.uploaded_at)}</small>
                        </a>
                    `;
            });
            html += '</div>';
        }
    }

    html += `
            </div>
        </div>
    `;

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
                
                <h6>Материалы:</h6>
                ${renderMaterials(stage.materials)}
                
                <h6 class="mt-3">Фото с объекта:</h6>
                ${renderPhotos(stage.photos)}
                
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

function renderMaterials(materials) {
    if (!materials || materials.length === 0) {
        return '<p class="text-muted">Материалы не добавлены</p>';
    }

    let html = '<div class="table-responsive"><table class="table table-sm">';
    html += `
        <thead>
            <tr>
                <th>Материал</th>
                <th>Ед.</th>
                <th>План</th>
                <th>Факт</th>
                <th>Статус</th>
            </tr>
        </thead>
        <tbody>
    `;

    materials.forEach(mat => {
        const percentage = mat.quantity_planned > 0
            ? Math.round((mat.quantity_used / mat.quantity_planned) * 100)
            : 0;

        html += `
            <tr>
                <td>${mat.material_name}</td>
                <td>${mat.unit || '-'}</td>
                <td>${mat.quantity_planned}</td>
                <td>${mat.quantity_used || 0}</td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar ${percentage > 100 ? 'bg-danger' : 'bg-success'}" 
                             style="width: ${Math.min(percentage, 100)}%">
                            ${percentage}%
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    return html;
}

function renderPhotos(photos) {
    if (!photos || photos.length === 0) {
        return '<p class="text-muted">Фото пока нет</p>';
    }

    let html = '<div class="row">';
    photos.forEach(photo => {
        html += `
            <div class="col-md-3 mb-3">
                <a href="${sharedGetFileUrl(photo.file_path)}" target="_blank" data-lightbox="stage-photos">
                    <img src="${sharedGetFileUrl(photo.file_path)}" class="img-thumbnail" alt="${photo.file_name}">
                </a>
                <small class="d-block text-muted text-center mt-1">
                    ${formatDateShort(photo.uploaded_at)}
                </small>
                ${photo.description ? `<small class="d-block text-center">${photo.description}</small>` : ''}
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// =============================================================================
// ЗАГРУЗКА ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ
// =============================================================================

function showUploadDocumentsModal(projectId) {
    const modal = `
        <div class="modal fade" id="uploadDocumentsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">📤 Загрузка исполнительной документации</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="uploadDocumentsForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Выберите файлы (до 10 шт)</label>
                                <input type="file" class="form-control" id="documentFiles" 
                                       accept=".pdf,.doc,.docx,.xls,.xlsx" multiple required>
                                <small class="text-muted">
                                    Форматы: PDF, DOC, DOCX, XLS, XLSX
                                </small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="documentDescription" rows="3" 
                                          placeholder="Укажите тип документации и комментарии"></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">📤 Загрузить</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('uploadDocumentsModal');

    document.getElementById('uploadDocumentsForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData();
        const files = document.getElementById('documentFiles').files;

        if (files.length === 0) {
            showError('Выберите файлы');
            return;
        }

        if (files.length > 10) {
            showError('Максимум 10 файлов за раз');
            return;
        }

        Array.from(files).forEach(file => {
            formData.append('documents', file);
        });

        formData.append('description', document.getElementById('documentDescription').value);

        showInfo('Загрузка файлов...');

        const result = await apiRequest(`/api/pto/projects/${projectId}/documents`, 'POST', formData);

        if (result.success) {
            showSuccess(`Загружено документов: ${result.count}`);
            hideModal('uploadDocumentsModal');

            // Обновляем детали проекта если он открыт
            if (currentProject && currentProject.id === projectId) {
                await viewProjectDetails(projectId);
            }
        } else {
            showError(result.message || 'Ошибка загрузки документов');
        }
    });

    document.getElementById('uploadDocumentsModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// ГЕНЕРАЦИЯ ОТЧЕТА
// =============================================================================

function generateReport(projectId) {
    // Здесь можно добавить функцию генерации отчета
    // Например, собрать все данные и создать PDF
    showInfo('Функция в разработке');
}