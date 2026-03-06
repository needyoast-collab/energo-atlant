// =============================================================================
// PARTNER.JS — Кабинет партнёра ЭнергоАтлант
// =============================================================================

let partnerData = null;

document.addEventListener('DOMContentLoaded', () => {
    loadPartnerData();
    setInterval(loadPartnerData, 60000); // авто-обновление раз в минуту
});

// =============================================================================
// ЗАГРУЗКА ДАННЫХ
// =============================================================================

async function loadPartnerData() {
    const res = await apiRequest('/api/partner/stats');
    if (!res.success) {
        showError('Не удалось загрузить данные партнёра');
        return;
    }

    partnerData = res;
    renderDashboard(res);
    renderClients(res.clients);
    renderPayouts(res.payouts, res.finance);
}

// =============================================================================
// ДАШБОРД / ГЛАВНАЯ
// =============================================================================

function renderDashboard(data) {
    const { partner, finance } = data;

    // Имя в навбаре
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = partner.full_name;

    // Реферальная ссылка
    const refLinkEl = document.getElementById('refLink');
    if (refLinkEl) {
        const baseUrl = window.location.origin;
        refLinkEl.textContent = `${baseUrl}/ref/${partner.ref_code}`;
    }

    // Уровень
    const levelNameEl = document.getElementById('partnerLevelName');
    if (levelNameEl) levelNameEl.textContent = partner.level.name;

    const levelCommEl = document.getElementById('partnerCommission');
    if (levelCommEl) levelCommEl.textContent = partner.level.commission + '%';

    const levelNextEl = document.getElementById('partnerLevelNext');
    if (levelNextEl) {
        if (partner.level.next && partner.level.needed > 0) {
            levelNextEl.textContent = `Нужно ещё ${partner.level.needed} клиент(ов) для уровня "${partner.level.next}"`;
        } else {
            levelNextEl.textContent = 'Максимальный уровень — вы ЭКСПЕРТ! 🏆';
        }
    }

    // Прогресс до следующего уровня
    const progressBar = document.getElementById('levelProgressBar');
    if (progressBar) {
        const levelThresholds = { 'Старт': [0, 3], 'Базовый': [3, 5], 'Про': [5, 10], 'Эксперт': [10, 10] };
        const [from, to] = levelThresholds[partner.level.name] || [0, 10];
        const count = partner.clients_count;
        const pct = to > from ? Math.min(100, Math.round((count - from) / (to - from) * 100)) : 100;
        progressBar.style.width = pct + '%';
        progressBar.setAttribute('aria-valuenow', pct);
        document.getElementById('levelProgressText').textContent = pct + '%';
    }

    // Статистика
    setText('statClients', partner.clients_count);
    setText('statPaid', formatMoney(finance.total_paid));
    setText('statPending', formatMoney(finance.pending_amount));
    setText('statDeals', finance.total_deals);

    // Кнопка «Запросить выплату»
    const payoutBtn = document.getElementById('payoutBtn');
    if (payoutBtn) {
        payoutBtn.disabled = finance.pending_amount <= 0;
    }
    setText('pendingBalance', formatMoney(finance.pending_amount));
}

// =============================================================================
// КЛИЕНТЫ
// =============================================================================

function renderClients(clients) {
    const container = document.getElementById('clientsTable');
    if (!container) return;

    if (!clients || clients.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-people display-1 opacity-25 mb-3 d-block"></i>
                <p class="text-muted">Пока нет привлечённых клиентов</p>
                <p class="text-muted small">Поделитесь своей реферальной ссылкой, чтобы начать зарабатывать</p>
            </div>`;
        return;
    }

    const statusMap = {
        'pending': '<span class="badge bg-warning text-dark">Ожидает</span>',
        'active': '<span class="badge bg-success">Активный</span>',
        'paid': '<span class="badge bg-info">Выплачено</span>'
    };

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-dark table-hover mb-0">
                <thead style="border-bottom: 2px solid var(--primary-color);">
                    <tr>
                        <th class="text-uppercase small text-muted">КЛИЕНТ</th>
                        <th class="text-uppercase small text-muted">ОРГАНИЗАЦИЯ</th>
                        <th class="text-uppercase small text-muted">ДАТА</th>
                        <th class="text-uppercase small text-muted">СТАТУС</th>
                        <th class="text-uppercase small text-muted text-end">КОМИССИЯ</th>
                    </tr>
                </thead>
                <tbody>
                    ${clients.map(c => `
                        <tr>
                            <td class="fw-bold">${c.full_name}</td>
                            <td class="text-muted">${c.organization || '—'}</td>
                            <td><small class="text-muted">${formatDateShort(c.created_at)}</small></td>
                            <td>${statusMap[c.status] || c.status}</td>
                            <td class="text-end fw-bold ${c.commission_amount > 0 ? 'text-success' : 'text-muted'}">
                                ${c.commission_amount > 0 ? '+' + formatMoney(c.commission_amount) : '—'}
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

// =============================================================================
// ФИНАНСЫ / ВЫПЛАТЫ
// =============================================================================

function renderPayouts(payouts, finance) {
    const container = document.getElementById('payoutsHistory');
    if (!container) return;

    if (!payouts || payouts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">История выплат пуста</p>';
        return;
    }

    const statusMap = {
        'pending': '<span class="badge bg-warning text-dark">На рассмотрении</span>',
        'processing': '<span class="badge bg-info">Обрабатывается</span>',
        'paid': '<span class="badge bg-success">Выплачено</span>',
        'rejected': '<span class="badge bg-danger">Отклонено</span>'
    };

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-dark table-hover mb-0">
                <thead style="border-bottom: 2px solid var(--primary-color);">
                    <tr>
                        <th class="text-uppercase small text-muted">ДАТА</th>
                        <th class="text-uppercase small text-muted text-end">СУММА</th>
                        <th class="text-uppercase small text-muted">СТАТУС</th>
                        <th class="text-uppercase small text-muted">ПРИМЕЧАНИЕ</th>
                    </tr>
                </thead>
                <tbody>
                    ${payouts.map(p => `
                        <tr>
                            <td><small class="text-muted">${formatDateShort(p.created_at)}</small></td>
                            <td class="text-end fw-bold text-warning">${formatMoney(p.amount)}</td>
                            <td>${statusMap[p.status] || p.status}</td>
                            <td class="text-muted small">${p.admin_note || '—'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

// =============================================================================
// ЗАПРОС ВЫПЛАТЫ
// =============================================================================

function showPayoutModal() {
    const oldModal = document.getElementById('payoutModal');
    if (oldModal) oldModal.remove();

    const available = partnerData?.finance?.pending_amount || 0;

    const html = `
        <div class="modal fade" id="payoutModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content" style="background: var(--bg-surface); border: 1px solid var(--primary-color);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h5 class="modal-title fw-bold text-uppercase">
                            <i class="bi bi-wallet2 me-2 text-success"></i>Запрос выплаты
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="payoutForm">
                        <div class="modal-body">
                            <div class="alert alert-dark border border-success mb-4">
                                <div class="text-muted small">Доступно к выплате:</div>
                                <div class="h3 fw-bold text-success mb-0">${formatMoney(available)}</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Сумма (₽) *</label>
                                <input type="number" class="form-control" id="payoutAmount" 
                                    min="1000" max="${available}" step="100" 
                                    placeholder="Минимум 1 000 ₽" required>
                                <small class="text-muted">Минимальная выплата: 1 000 ₽</small>
                            </div>
                            <div class="mb-3">
                                <label class="form-label fw-bold text-uppercase small text-muted">Реквизиты * </label>
                                <textarea class="form-control" id="payoutDetails" rows="3" 
                                    placeholder="Карта Сбербанк: 4276 XXXX XXXX XXXX, Иванов Иван Иванович" required></textarea>
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid var(--border-color);">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">ОТМЕНА</button>
                            <button type="submit" class="btn btn-success fw-bold px-4">
                                <i class="bi bi-send me-1"></i> ОТПРАВИТЬ ЗАПРОС
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = new bootstrap.Modal(document.getElementById('payoutModal'));
    modal.show();

    document.getElementById('payoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Отправка...';

        const res = await apiRequest('/api/partner/payout', 'POST', {
            amount: parseFloat(document.getElementById('payoutAmount').value),
            payment_details: document.getElementById('payoutDetails').value
        });

        if (res.success) {
            showSuccess(res.message);
            modal.hide();
            loadPartnerData();
        } else {
            showError(res.message);
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-send me-1"></i> ОТПРАВИТЬ ЗАПРОС';
        }
    });

    document.getElementById('payoutModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// =============================================================================
// КОПИРОВАНИЕ РЕФЕРАЛЬНОЙ ССЫЛКИ
// =============================================================================

function copyRefLink() {
    const link = document.getElementById('refLink').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showSuccess('Ссылка скопирована в буфер обмена!');
    }).catch(() => {
        showError('Не удалось скопировать — скопируйте вручную');
    });
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ
// =============================================================================

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatMoney(n) {
    if (!n && n !== 0) return '—';
    return Number(n).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}
