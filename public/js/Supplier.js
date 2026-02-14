// =============================================================================
// SUPPLIER.JS - Логика для кабинета снабженца
// =============================================================================

let currentProjects = [];

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
    
    const data = await apiRequest('/api/supplier/projects');
    
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
            <div class="alert alert-info">
                📋 У вас пока нет назначенных проектов
            </div>
        `;
        return;
    }
    
    let html = '<div class="row">';
    
    projects.forEach(project => {
        html += `
            <div class="col-md-6 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">${project.title}</h5>
                        <p class="text-muted">${project.address || ''}</p>
                        <hr>
                        <p><strong>Статус:</strong> ${getStatusBadge(project.status)}</p>
                        <p><strong>Менеджер:</strong> ${project.manager_name || '-'}</p>
                        <p><strong>Прораб:</strong> ${project.foreman_name || '-'}</p>
                        
                        <button class="btn btn-primary w-100 mb-2" onclick="viewMaterials(${project.id})">
                            📦 Просмотр материалов
                        </button>
                        <button class="btn btn-success w-100" onclick="exportToExcel(${project.id})">
                            📊 Экспорт в Excel
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// =============================================================================
// ПРОСМОТР МАТЕРИАЛОВ
// =============================================================================

async function viewMaterials(projectId) {
    showLoading('materialsView');
    
    const data = await apiRequest(`/api/supplier/projects/${projectId}/materials`);
    
    if (data.success) {
        renderMaterials(data.project, data.materials);
    } else {
        showError('Ошибка загрузки материалов');
    }
}

function renderMaterials(project, materials) {
    const container = document.getElementById('materialsView');
    if (!container) return;
    
    let html = `
        <div class="card mb-3">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0">📦 Материалы проекта: ${project.title}</h5>
            </div>
            <div class="card-body">
                <p><strong>Адрес:</strong> ${project.address || '-'}</p>
                <button class="btn btn-success" onclick="exportToExcel(${project.id})">
                    📊 Экспорт в Excel
                </button>
            </div>
        </div>
    `;
    
    if (!materials || materials.length === 0) {
        html += '<div class="alert alert-warning">Материалы еще не добавлены</div>';
    } else {
        // Группируем по этапам
        const grouped = {};
        materials.forEach(mat => {
            if (!grouped[mat.stage_name]) {
                grouped[mat.stage_name] = [];
            }
            grouped[mat.stage_name].push(mat);
        });
        
        // Выводим по этапам
        for (const [stageName, mats] of Object.entries(grouped)) {
            html += `
                <h5 class="mt-3">🔨 ${stageName}</h5>
                <div class="table-responsive">
                    <table class="table table-bordered">
                        <thead class="table-light">
                            <tr>
                                <th>Материал</th>
                                <th>Ед.</th>
                                <th>Планируется</th>
                                <th>Использовано</th>
                                <th>Получено</th>
                                <th>Статус</th>
                                <th>Остаток</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            mats.forEach(mat => {
                const deficit = mat.quantity_planned - mat.quantity_received;
                const statusBadge = mat.is_received 
                    ? '<span class="badge bg-success">✅ Получено</span>'
                    : '<span class="badge bg-warning">⏳ Ожидается</span>';
                
                html += `
                    <tr>
                        <td><strong>${mat.material_name}</strong></td>
                        <td>${mat.unit || '-'}</td>
                        <td>${mat.quantity_planned}</td>
                        <td>${mat.quantity_used || 0}</td>
                        <td>${mat.quantity_received || 0}</td>
                        <td>${statusBadge}</td>
                        <td class="${deficit > 0 ? 'text-danger' : 'text-success'}">
                            ${deficit > 0 ? `❌ Нужно: ${deficit}` : '✅ Достаточно'}
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        // Итоги
        const totalPlanned = materials.reduce((sum, m) => sum + parseFloat(m.quantity_planned || 0), 0);
        const totalReceived = materials.reduce((sum, m) => sum + parseFloat(m.quantity_received || 0), 0);
        const receivedCount = materials.filter(m => m.is_received).length;
        
        html += `
            <div class="card mt-3 bg-light">
                <div class="card-body">
                    <h6>📊 Статистика:</h6>
                    <div class="row">
                        <div class="col-md-4">
                            <p><strong>Всего позиций:</strong> ${materials.length}</p>
                        </div>
                        <div class="col-md-4">
                            <p><strong>Получено позиций:</strong> ${receivedCount} из ${materials.length}</p>
                        </div>
                        <div class="col-md-4">
                            <p><strong>Процент выполнения:</strong> ${Math.round(receivedCount / materials.length * 100)}%</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// =============================================================================
// ЭКСПОРТ В EXCEL
// =============================================================================

async function exportToExcel(projectId) {
    const project = currentProjects.find(p => p.id === projectId);
    
    if (!project) {
        showError('Проект не найден');
        return;
    }
    
    showInfo('Подготовка Excel файла...');
    
    try {
        const response = await fetch(`/api/supplier/projects/${projectId}/materials/export`);
        
        if (!response.ok) {
            throw new Error('Ошибка экспорта');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `materials_${project.title.replace(/[^a-zа-я0-9]/gi, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showSuccess('Файл загружен');
    } catch (error) {
        console.error('Export error:', error);
        showError('Ошибка экспорта в Excel');
    }
}

// =============================================================================
// ПЕЧАТЬ СПИСКА МАТЕРИАЛОВ
// =============================================================================

function printMaterialsList() {
    window.print();
}