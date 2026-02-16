// =============================================================================
// FOREMAN.JS - ПОЛНОСТЬЮ ИСПРАВЛЕННАЯ ВЕРСИЯ
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
    const container = document.getElementById('projectsList');
    
    // Показываем загрузку
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-warning"></div>
            <p class="mt-2 text-muted">Загружаем список объектов...</p>
        </div>
    `;
    
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
    
    // ИСПРАВЛЕНО: Если нет проектов - показываем сообщение
    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    <h5>📋 Проекты отсутствуют</h5>
                    <p class="mb-0">У вас пока нет проектов. Введите код доступа от менеджера чтобы присоединиться.</p>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    projects.forEach(project => {
        // Проверяем дедлайн для этапов
        const deadline = new Date(project.stages_deadline);
        const now = new Date();
        const isExpired = deadline < now;
        const hoursLeft = Math.max(0, Math.round((deadline - now) / (1000 * 60 * 60)));
        
        html += `
            <div class="col-md-6 mb-3">
                <div class="card h-100 ${isExpired ? 'border-danger' : ''}">
                    <div class="card-body">
                        <h5 class="card-title">${project.title}</h5>
                        <p class="text-muted">${project.address || ''}</p>
                        <hr>
                        <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        <p><strong>Снабженец:</strong> ${project.supplier_name || '-'}</p>
                        
                        ${project.status === 'stages_pending' ? `
                            <div class="alert ${isExpired ? 'alert-danger' : 'alert-warning'} mb-2">
                                ⏰ ${isExpired 
                                    ? 'Дедлайн истек! Создание этапов недоступно' 
                                    : `Осталось ${hoursLeft} часов для создания этапов`}
                            </div>
                        ` : ''}
                        
                        <button class="btn btn-primary w-100" onclick="viewProjectDetails(${project.id})">
                            🔍 Детали проекта
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// =============================================================================
// ПРОСМОТР ДЕТАЛЕЙ ПРОЕКТА
// =============================================================================

async function viewProjectDetails(projectId) {
    const container = document.getElementById('projectsList');
    
    // Показываем загрузку
    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Загрузка проекта...</p>
        </div>
    `;
    
    const data = await apiRequest(`/api/foreman/projects/${projectId}`);
    
    if (data.success) {
        currentProject = data.project;
        renderProjectDetails(data.project, data.stages, data.documents);
    } else {
        showError('Ошибка загрузки проекта');
        await loadProjects(); // Вернуться к списку
    }
}

function renderProjectDetails(project, stages, documents) {
    const container = document.getElementById('projectsList');
    
    // Проверка дедлайна
    const deadline = new Date(project.stages_deadline);
    const now = new Date();
    const canCreateStages = deadline > now && project.status === 'stages_pending';
    
    let html = `
        <div class="col-12">
            <button class="btn btn-secondary mb-3" onclick="loadProjects()">
                ← Назад к списку проектов
            </button>
            
            <div class="card mb-3">
                <div class="card-header bg-primary text-white">
                    <h4 class="mb-0">📋 ${project.title}</h4>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                            <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                            <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Описание:</strong></p>
                            <p>${project.description || 'Нет описания'}</p>
                        </div>
                    </div>
                    
                    ${canCreateStages ? `
                        <button class="btn btn-success mt-2" onclick="showCreateStageModal()">
                            ➕ Создать этап работ
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <h5 class="mt-4 mb-3">Этапы работ</h5>
    `;
    
    if (!stages || stages.length === 0) {
        html += `
            <div class="alert alert-warning">
                📝 Этапы еще не созданы. 
                ${canCreateStages ? 'Создайте первый этап!' : ''}
            </div>
        `;
    } else {
        stages.forEach(stage => {
            html += renderStage(stage);
        });
    }
    
    // Документы
    if (documents && documents.length > 0) {
        html += `
            <h5 class="mt-4 mb-3">📄 Документы</h5>
            <div class="list-group">
        `;
        documents.forEach(doc => {
            html += `
                <a href="/${doc.file_path}" target="_blank" class="list-group-item list-group-item-action">
                    📎 ${doc.file_name}
                    <small class="text-muted float-end">${formatDate(doc.uploaded_at)}</small>
                </a>
            `;
        });
        html += '</div>';
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function renderStage(stage) {
    const isCompleted = stage.is_completed === 1;
    
    let html = `
        <div class="card mb-3 ${isCompleted ? 'border-success' : ''}">
            <div class="card-header ${isCompleted ? 'bg-success text-white' : 'bg-light'}">
                <div class="d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        ${isCompleted ? '✅' : '🔨'} Этап ${stage.stage_number}: ${stage.name}
                    </h5>
                    ${!isCompleted ? `
                        <button class="btn btn-sm btn-success" onclick="completeStage(${stage.id})">
                            ✔️ Завершить
                        </button>
                    ` : `
                        <span class="badge bg-light text-success">Завершен ${formatDateShort(stage.completed_at)}</span>
                    `}
                </div>
            </div>
            <div class="card-body">
                ${stage.description ? `<p>${stage.description}</p><hr>` : ''}
                
                <h6>Материалы:</h6>
                ${renderMaterials(stage.materials, stage.id)}
                
                <h6 class="mt-3">Фото:</h6>
                ${renderPhotos(stage.photos, stage.id)}
                
                <button class="btn btn-primary mt-2" onclick="showUploadPhotosModal(${stage.id})">
                    📸 Загрузить фото
                </button>
            </div>
        </div>
    `;
    
    return html;
}

function renderMaterials(materials, stageId) {
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
                <th>Приход</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    materials.forEach(mat => {
        html += `
            <tr>
                <td>${mat.material_name}</td>
                <td>${mat.unit || '-'}</td>
                <td>${mat.quantity_planned}</td>
                <td>
                    <input type="number" 
                           class="form-control form-control-sm" 
                           value="${mat.quantity_used || 0}" 
                           id="used_${mat.id}" 
                           step="0.1"
                           style="width: 80px;">
                </td>
                <td>
                    ${mat.is_received ? 
                        `✅ ${mat.quantity_received}` : 
                        `<input type="number" 
                                class="form-control form-control-sm" 
                                id="received_${mat.id}" 
                                step="0.1"
                                placeholder="0"
                                style="width: 80px;">`
                    }
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="updateMaterial(${mat.id})">
                        💾
                    </button>
                    ${!mat.is_received ? `
                        <button class="btn btn-sm btn-success" onclick="receiveMaterial(${mat.id})">
                            ✔️
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    return html;
}

function renderPhotos(photos, stageId) {
    if (!photos || photos.length === 0) {
        return '<p class="text-muted">Фото пока нет</p>';
    }
    
    let html = '<div class="row">';
    photos.forEach(photo => {
        html += `
            <div class="col-md-3 mb-2">
                <a href="/${photo.file_path}" target="_blank">
                    <img src="/${photo.file_path}" class="img-thumbnail" alt="${photo.file_name}">
                </a>
                <small class="d-block text-muted">${formatDateShort(photo.uploaded_at)}</small>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// =============================================================================
// СОЗДАНИЕ ЭТАПА
// =============================================================================

function showCreateStageModal() {
    const modal = `
        <div class="modal fade" id="createStageModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">➕ Создание этапа работ</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="createStageFormModal">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Название этапа *</label>
                                <input type="text" class="form-control" id="stageName" required 
                                       placeholder="Например: Подготовительные работы">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="stageDescription" rows="2"></textarea>
                            </div>
                            
                            <h6>Материалы:</h6>
                            <div id="materialsContainer">
                                <div class="material-row row mb-2">
                                    <div class="col-5">
                                        <input type="text" class="form-control" placeholder="Название материала" required>
                                    </div>
                                    <div class="col-3">
                                        <input type="text" class="form-control" placeholder="Ед. (м, шт, кг)">
                                    </div>
                                    <div class="col-3">
                                        <input type="number" class="form-control" placeholder="Кол-во" step="0.1" required>
                                    </div>
                                    <div class="col-1">
                                        <button type="button" class="btn btn-danger" onclick="removeMaterialRow(this)">❌</button>
                                    </div>
                                </div>
                            </div>
                            <button type="button" class="btn btn-sm btn-secondary" onclick="addMaterialRow()">
                                ➕ Добавить материал
                            </button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">💾 Создать этап</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modal);
    showModal('createStageModal');
    
    document.getElementById('createStageFormModal').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Собираем материалы
        const materials = [];
        document.querySelectorAll('.material-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs[0].value) {
                materials.push({
                    name: inputs[0].value,
                    unit: inputs[1].value || '',
                    quantity: parseFloat(inputs[2].value) || 0
                });
            }
        });
        
        const stageData = {
            projectId: currentProject.id,
            stageName: document.getElementById('stageName').value,
            description: document.getElementById('stageDescription').value,
            materials: materials
        };
        
        const result = await apiRequest('/api/foreman/stages', 'POST', stageData);
        
        if (result.success) {
            showSuccess('Этап создан');
            hideModal('createStageModal');
            await viewProjectDetails(currentProject.id);
        } else {
            showError(result.message || 'Ошибка создания этапа');
        }
    });
    
    document.getElementById('createStageModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

function addMaterialRow() {
    const row = `
        <div class="material-row row mb-2">
            <div class="col-5">
                <input type="text" class="form-control" placeholder="Название материала" required>
            </div>
            <div class="col-3">
                <input type="text" class="form-control" placeholder="Ед. (м, шт, кг)">
            </div>
            <div class="col-3">
                <input type="number" class="form-control" placeholder="Кол-во" step="0.1" required>
            </div>
            <div class="col-1">
                <button type="button" class="btn btn-danger" onclick="removeMaterialRow(this)">❌</button>
            </div>
        </div>
    `;
    document.getElementById('materialsContainer').insertAdjacentHTML('beforeend', row);
}

function removeMaterialRow(btn) {
    btn.closest('.material-row').remove();
}

// =============================================================================
// ОБНОВЛЕНИЕ МАТЕРИАЛОВ
// =============================================================================

async function updateMaterial(materialId) {
    const quantityUsed = parseFloat(document.getElementById(`used_${materialId}`).value) || 0;
    
    const result = await apiRequest(`/api/foreman/materials/${materialId}`, 'PUT', { quantityUsed });
    
    if (result.success) {
        showSuccess('Расход обновлен');
    } else {
        showError('Ошибка обновления');
    }
}

async function receiveMaterial(materialId) {
    const quantityReceived = parseFloat(document.getElementById(`received_${materialId}`).value);
    
    if (!quantityReceived || quantityReceived <= 0) {
        showError('Укажите количество полученного материала');
        return;
    }
    
    const result = await apiRequest(`/api/foreman/materials/${materialId}/receive`, 'PUT', { quantityReceived });
    
    if (result.success) {
        showSuccess('Приход подтвержден');
        await viewProjectDetails(currentProject.id);
    } else {
        showError('Ошибка подтверждения прихода');
    }
}

// =============================================================================
// ЗАВЕРШЕНИЕ ЭТАПА
// =============================================================================

async function completeStage(stageId) {
    const confirmed = confirm('Отметить этап как завершенный?');
    if (!confirmed) return;
    
    const result = await apiRequest(`/api/foreman/stages/${stageId}/complete`, 'PUT');
    
    if (result.success) {
        showSuccess('Этап завершен');
        await viewProjectDetails(currentProject.id);
    } else {
        showError('Ошибка завершения этапа');
    }
}

// =============================================================================
// ЗАГРУЗКА ФОТО
// =============================================================================

function showUploadPhotosModal(stageId) {
    const modal = `
        <div class="modal fade" id="uploadPhotosModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">📸 Загрузка фото</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="uploadPhotosForm">
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Выберите фото (до 10 штук)</label>
                                <input type="file" class="form-control" id="photoFiles" 
                                       accept="image/*" multiple required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Описание</label>
                                <textarea class="form-control" id="photoDescription" rows="2"></textarea>
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
    showModal('uploadPhotosModal');
    
    document.getElementById('uploadPhotosForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        const files = document.getElementById('photoFiles').files;
        
        if (files.length === 0) {
            showError('Выберите файлы');
            return;
        }
        
        if (files.length > 10) {
            showError('Максимум 10 фото за раз');
            return;
        }
        
        Array.from(files).forEach(file => {
            formData.append('photos', file);
        });
        
        formData.append('description', document.getElementById('photoDescription').value);
        
        const result = await apiRequest(`/api/foreman/stages/${stageId}/photos`, 'POST', formData);
        
        if (result.success) {
            showSuccess(`Загружено фото: ${result.count}`);
            hideModal('uploadPhotosModal');
            await viewProjectDetails(currentProject.id);
        } else {
            showError(result.message || 'Ошибка загрузки фото');
        }
    });
    
    document.getElementById('uploadPhotosModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

// =============================================================================
// ГЛОБАЛЬНАЯ ФУНКЦИЯ ДЛЯ КНОПКИ joinProject() В HTML
// =============================================================================

// Эта функция вызывается из dashboard_foreman.html (onclick="joinProject()")
// НЕ УДАЛЯЙ ЭТУ ФУНКЦИЮ!
window.joinProject = async function() {
    const code = document.getElementById('joinCode').value.trim();
    
    if (!code) {
        alert('Введите код проекта!');
        return;
    }
    
    try {
        const res = await fetch('/api/foreman/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessCode: code })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('✅ Вы добавлены в проект: ' + data.project.title);
            document.getElementById('joinCode').value = '';
            if (typeof loadProjects === 'function') loadProjects();
        } else {
            alert('❌ Ошибка: ' + (data.message || 'Проект не найден'));
        }
    } catch (error) {
        console.error(error);
        alert('❌ Ошибка соединения с сервером');
    }
};