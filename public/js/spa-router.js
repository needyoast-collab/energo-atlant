// =============================================================================
// SPA ROUTER - Одностраничное приложение для EnergoAtlant Pro
// =============================================================================

class EnergoAtlantSPA {
    constructor() {
        this.routes = new Map();
        this.cache = new Map();
        this.currentPath = window.location.pathname;
        this.loading = false;
        this.init();
    }

    init() {
        console.log('🚀 Инициализация SPA...');
        
        // Показываем прелоадер при загрузке
        this.createPageLoader();
        
        // Перехватываем клики по ссылкам
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.isInternalLink(link)) {
                e.preventDefault();
                this.navigate(link.href);
            }
        });

        // Перехватываем кнопки браузера "назад/вперед"
        window.addEventListener('popstate', (e) => {
            this.loadPage(window.location.pathname, false);
        });

        // Предзагрузка популярных страниц
        this.prefetchPopularPages();
    }

    createPageLoader() {
        if (!document.getElementById('spaLoader')) {
            const loader = document.createElement('div');
            loader.id = 'spaLoader';
            loader.className = 'spa-loader';
            loader.innerHTML = `
                <div class="spa-loader-content">
                    <div class="spa-spinner"></div>
                    <div class="spa-loader-text">Загрузка...</div>
                </div>
            `;
            document.body.appendChild(loader);
        }
    }

    showLoader() {
        const loader = document.getElementById('spaLoader');
        if (loader) {
            loader.style.display = 'flex';
            setTimeout(() => {
                loader.classList.add('spa-loader-active');
            }, 10);
        }
    }

    hideLoader() {
        const loader = document.getElementById('spaLoader');
        if (loader) {
            loader.classList.remove('spa-loader-active');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }
    }

    isInternalLink(link) {
        return link.hostname === window.location.hostname &&
               !link.hasAttribute('target') &&
               !link.hasAttribute('download') &&
               link.href !== window.location.href &&
               !link.hash && // не перехватываем хэш-ссылки (#tab, #section)
               link.pathname !== window.location.pathname; // не перехватываем ссылки на ту же страницу
    }

    async navigate(url) {
        if (this.loading) return;
        
        const path = new URL(url).pathname + new URL(url).search;
        
        // Обновляем URL в браузере
        history.pushState({}, '', url);
        
        // Загружаем страницу
        await this.loadPage(path, true);
    }

    async loadPage(path, showLoader = true) {
        if (this.loading) return;
        
        this.loading = true;
        this.currentPath = path;

        try {
            // Показываем прелоадер
            if (showLoader) {
                this.showLoader();
            }

            // Проверяем кеш
            if (this.cache.has(path)) {
                console.log('📦 Загрузка из кеша:', path);
                this.renderContent(this.cache.get(path));
                this.loading = false;
                this.hideLoader();
                return;
            }

            console.log('🌐 Загрузка страницы:', path);
            
            // Загружаем HTML страницы
            const response = await fetch(path, {
                headers: {
                    'X-Requested-With': 'SPA',
                    'Accept': 'text/html'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const html = await response.text();
            
            // Сохраняем в кеш
            this.cache.set(path, html);
            
            // Отрисовываем контент
            this.renderContent(html);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки страницы:', error);
            this.showError(error);
        } finally {
            this.loading = false;
            this.hideLoader();
        }
    }

    renderContent(html) {
        // Извлекаем контент из загруженной страницы
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Находим основной контент
        const newMain = doc.querySelector('main') || 
                      doc.querySelector('.container') || 
                      doc.querySelector('body > div');
        
        const currentMain = document.querySelector('main') || 
                           document.querySelector('.container');
        
        if (newMain && currentMain) {
            currentMain.innerHTML = newMain.innerHTML;
            this.initPageScripts();
            this.updateActiveMenu();
        }
    }

    initPageScripts() {
        // Переинициализируем скрипты для новой страницы
        try {
            // Инициализация общих скриптов
            if (typeof checkAuth === 'function') {
                checkAuth();
            }
            
            // Инициализация специфичных для страницы скриптов
            if (typeof initPage === 'function') {
                initPage();
            }
            
            // Переинициализация кнопок выхода
            this.initLogoutButtons();
            
            // Переинициализация форм
            this.initForms();
            
        } catch (error) {
            console.error('Ошибка инициализации скриптов:', error);
        }
    }

    initLogoutButtons() {
        const logoutBtns = document.querySelectorAll('[id="logoutBtn"], [data-logout]');
        logoutBtns.forEach(btn => {
            if (!btn.hasAttribute('data-spa-initialized')) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('🚪 SPA: Клик по выходу');
                    window.location.href = '/login.html';
                });
                btn.setAttribute('data-spa-initialized', 'true');
            }
        });
    }

    initForms() {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            if (!form.hasAttribute('data-spa-initialized')) {
                form.addEventListener('submit', (e) => {
                    // Для форм выхода или перенаправления используем полную перезагрузку
                    if (form.action.includes('/login') || 
                        form.action.includes('/logout') ||
                        form.hasAttribute('data-full-reload')) {
                        return; // Позволяем стандартную отправку
                    }
                    
                    // Для остальных форм можно добавить SPA обработку
                    console.log('📝 SPA: Отправка формы:', form.action);
                });
                form.setAttribute('data-spa-initialized', 'true');
            }
        });
    }

    updateActiveMenu() {
        // Удаляем все активные классы
        document.querySelectorAll('.sidebar-menu .active, .nav-link.active').forEach(link => {
            link.classList.remove('active');
        });
        
        // Добавляем активный класс для текущей страницы
        const currentLinks = document.querySelectorAll(`a[href="${this.currentPath}"], a[href="${this.currentPath}/"]`);
        currentLinks.forEach(link => {
            link.classList.add('active');
        });
    }

    prefetchPopularPages() {
        // Предзагрузка популярных страниц через 2 секунды
        setTimeout(() => {
            const popularPages = [
                '/dashboard_manager.html',
                '/dashboard_customer.html',
                '/manager.html',
                '/cabinet.html'
            ];
            
            popularPages.forEach(path => {
                if (!this.cache.has(path)) {
                    fetch(path).then(response => response.text())
                        .then(html => {
                            this.cache.set(path, html);
                            console.log('📦 Предзагружена страница:', path);
                        })
                        .catch(() => {}); // Игнорируем ошибки предзагрузки
                }
            });
        }, 2000);
    }

    showError(error) {
        const errorHtml = `
            <div class="spa-error">
                <h2>❌ Ошибка загрузки страницы</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()" class="btn">Перезагрузить</button>
            </div>
        `;
        
        const container = document.querySelector('.container') || document.querySelector('main');
        if (container) {
            container.innerHTML = errorHtml;
        }
    }

    // Публичные методы
    reload() {
        this.cache.clear();
        this.loadPage(this.currentPath, true);
    }

    clearCache() {
        this.cache.clear();
        console.log('🗑️ Кеш SPA очищен');
    }
}

// Глобальный экземпляр
window.spaRouter = new EnergoAtlantSPA();

// Добавляем глобальные функции для доступа из других скриптов
window.spaNavigate = (url) => window.spaRouter.navigate(url);
window.spaReload = () => window.spaRouter.reload();
window.spaClearCache = () => window.spaRouter.clearCache();

console.log('✅ SPA Router загружен');
