# 🏗️ ЭнергоАтлант

> Полнофункциональная система управления строительными проектами с 7 типами пользователей, AI-анализом документов и партнерской программой

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Storage-Supabase-emerald.svg)](https://supabase.com/)
[![Argon2](https://img.shields.io/badge/Security-Argon2id-orange.svg)](https://github.com/ranisalt/node-argon2)

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Технологии](#-технологии)
- [Установка](#-установка)
- [Структура проекта](#-структура-проекта)
- [Роли пользователей](#-роли-пользователей)
- [API документация](#-api-документация)
- [Безопасность](#-безопасность)
- [Скриншоты](#-скриншоты)
- [Roadmap](#-roadmap)

---

## ⚡ Возможности

### 🎯 Для бизнеса
- **Управление полным циклом** строительных проектов от заявки до сдачи
- **7 типов пользователей** с разными уровнями доступа и правами
- **Воронка проектов** в стиле CRM (Lead → Qualification → Visit → Offer → Negotiation → Contract → Work → Won/Lost)
- **Партнерская программа** с реферальными кодами и комиссиями до 15% (уровни: Старт → Базовый → Профи → Эксперт)
- **AI-анализ документов** и смет (OpenAI/Google Gemini API)
- **Модерация регистраций** - новые пользователи требуют подтверждения администратором

### 👥 Для команды
- **Прораб**: Создание этапов работ, загрузка фото до/после, управление материалами, отметка завершения
- **Снабженец**: Закупка материалов, экспорт в Excel, учет остатков на складе, подтверждение поставок
- **ПТО**: Загрузка исполнительной документации, просмотр этапов работ
- **Менеджер**: Создание проектов, назначение команды, контроль прогресса, воронка сделок
- **Заказчик**: Отслеживание прогресса в реальном времени, просмотр фото этапов, документов
- **Партнер**: Реферальная система с личным кабинетом и статистикой привлеченных клиентов
- **Админ**: Управление пользователями, верификация, восстановление удаленных данных

### 🔔 Коммуникация
- **Система уведомлений** о важных событиях проекта
- **Внутренние сообщения** между участниками с вложениями
- **Архив переписки** с сохранением истории

### 📊 Аналитика
- **Прогресс проектов** в реальном времени (% выполнения)
- **План/факт по материалам** с контролем перерасходов
- **Воронка сделок** с визуализацией этапов
- **Архив проектов** и заявок (soft delete)
- **Статистика партнеров** с расчетом комиссий

---

## 🛠 Технологии

### Backend
- **Node.js** 18+ & **Express** 4.18
- **PostgreSQL** (через Supabase или локально) — отказоустойчивая реляционная БД
- **Supabase Storage** — облачное хранилище документов и фотографий
- **Argon2id** — хеширование паролей (OWASP Top 1 рекомендация)
- **Zod** — валидация данных с строгой типизацией
- **Multer** (Memory Storage) — безопасная загрузка файлов напрямую в облако

### Безопасность
- **Helmet** - защита HTTP заголовков (CSP, X-Frame-Options, HSTS)
- **XSS-Clean** - защита от XSS атак
- **CORS** - контроль источников запросов
- **Rate Limiting** - защита от брутфорса (5 попыток/15 мин для логина, 3 регистрации/час)
- **Soft Deletes** - безопасное удаление данных (is_deleted флаг)
- **Session-based auth** с PostgreSQL Store (connect-pg-simple)
- **SameSite: lax** - защита от CSRF
- **Защищенные облачные файлы** - доступ через Signed URLs с ограниченным временем жизни (1 час) и проверкой прав в БД

### Frontend
- **Bootstrap 5** - адаптивный дизайн
- **Vanilla JavaScript** - без фреймворков, чистый ES6+
- **AOS** - анимации при скролле на лендинге
- **Bootstrap Icons** - иконки

### Дополнительно
- **XLSX** - экспорт материалов в Excel
- **OpenAI / Google Gemini** - AI анализ документов и смет
- **PDF-Parse** - чтение PDF файлов
- **Compression** - сжатие HTTP ответов (gzip)
- **Morgan** - HTTP логирование в development режиме
- **UUID** - генерация уникальных идентификаторов

---

## 🚀 Установка

### Требования
- **Node.js** 18 или выше
- **npm** или **yarn**

### Быстрый старт

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/needyoast-collab/energo-atlant.git
cd energo-atlant

# 2. Установите зависимости
npm install

# 3. Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env (см. раздел Конфигурация)

# 4. Инициализируйте базу данных в облаке
npm run init-pg

# 5. Запустите сервер
npm start

# Или в режиме разработки с автоперезапуском
npm run dev
```

Сервер запустится на `http://localhost:3000`

### Демо-доступ

После инициализации БД доступен тестовый админ:
- **Логин:** `admin`
- **Пароль:** `admin123`

---

## 📁 Структура проекта

```
energo-atlant/
├── config/
│   ├── database.js          # Промисификация SQLite3
│   └── upload.js            # Multer конфигурация (файлы, размер)
│
├── controllers/             # Контроллеры (бизнес-логика)
│   ├── authController.js    # Логин, регистрация, выход
│   ├── adminController.js   # Управление пользователями
│   ├── managerController.js # Создание проектов, AI-анализ
│   ├── foremanController.js # Этапы работ, материалы
│   ├── supplierController.js # Снабжение, экспорт Excel
│   ├── ptoController.js     # Исполнительная документация
│   ├── customerController.js # Заявки, просмотр проектов
│   ├── partnerController.js # Партнерская программа
│   ├── messageController.js # Внутренние сообщения
│   ├── notificationController.js # Уведомления
│   ├── publicController.js  # Публичные заявки с сайта
│   ├── documentController.js # Защищенный доступ к файлам
│   └── projectController.js # Общие эндпоинты проектов
│
├── middleware/
│   ├── auth.js              # Проверка авторизации и ролей
│   └── errorHandler.js      # Централизованная обработка ошибок
│
├── routes/                  # Маршруты API
│   ├── authRoutes.js        # /api/login, /api/register, /api/logout
│   ├── adminRoutes.js       # /api/admin/*
│   ├── managerRoutes.js     # /api/manager/*
│   ├── foremanRoutes.js     # /api/foreman/*
│   ├── supplierRoutes.js    # /api/supplier/*
│   ├── ptoRoutes.js         # /api/pto/*
│   ├── customerRoutes.js    # /api/customer/*
│   ├── partnerRoutes.js     # /api/partner/*
│   ├── messageRoutes.js     # /api/messages/*
│   ├── notificationRoutes.js # /api/notifications/*
│   ├── projectRoutes.js     # /api/projects/*
│   ├── publicRoutes.js      # /api/public/*
│   └── documentRoutes.js    # /api/documents/serve (защищенные файлы)
│
├── public/                  # Статические файлы
│   ├── css/
│   │   └── style.css        # Кастомные стили (темная тема, industrial design)
│   ├── js/
│   │   ├── api.js           # Общие API функции (apiRequest, showToast)
│   │   ├── shared.js        # Общие утилиты
│   │   ├── admin.js         # Логика админ-панели
│   │   ├── manager.js       # Логика менеджера (воронка, AI)
│   │   ├── foreman.js       # Логика прораба (этапы, фото)
│   │   ├── supplier.js      # Логика снабженца (материалы, Excel)
│   │   ├── pto.js           # Логика ПТО
│   │   └── customer.js      # Логика заказчика
│   ├── img/                 # Изображения, логотипы
│   ├── index.html           # Лендинг (главная страница)
│   ├── login.html           # Страница входа
│   ├── register.html        # Регистрация заказчика
│   ├── services.html        # Услуги компании
│   ├── portfolio.html       # Портфолио проектов
│   ├── partners.html        # Партнерская программа
│   ├── contact.html         # Контакты
│   ├── dashboard_admin.html
│   ├── dashboard_manager.html
│   ├── dashboard_foreman.html
│   ├── dashboard_supplier.html
│   ├── dashboard_pto.html
│   ├── dashboard_customer.html
│   └── dashboard_partner.html
│
├── utils/
│   └── helpers.js           # Утилиты (generateProjectCode, sendNotification)
│
├── uploads/                 # Загруженные файлы (игнорируется Git)
│
├── .env.example             # Пример переменных окружения
├── .gitignore
├── init_db.js               # Инициализация БД (создание таблиц)
├── add_soft_deletes.js      # Миграция soft deletes
├── server.js                # Точка входа (Express app)
├── package.json
├── energo.db                # SQLite база (создаётся автоматически)
└── README.md
```

---

## 👥 Роли пользователей

### 1. 👨‍💼 Админ
**Уровень доступа:** Максимальный (все эндпоинты)

**Функции:**
- ✅ Управление пользователями (создание, редактирование, верификация, удаление)
- ✅ Просмотр удаленных пользователей и восстановление
- ✅ Доступ ко всем проектам и данным
- ✅ Просмотр всех заявок (аутентифицированные + публичные)

**Dashboard:** `/dashboard_admin.html`

**API эндпоинты:**
```
GET    /api/admin/users
POST   /api/admin/users
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/verify
GET    /api/admin/users/deleted
POST   /api/admin/users/:id/restore
```

---

### 2. 👨‍💼 Менеджер
**Уровень доступа:** Управление проектами и командой

**Функции:**
- ✅ Создание проектов с назначением команды (прораб, снабженец, ПТО)
- ✅ Генерация кода доступа к проекту (PRJ-XXXX)
- ✅ Управление воронкой проектов (12 статусов от Lead до Won/Lost)
- ✅ Просмотр и рассмотрение заявок от клиентов
- ✅ **AI-анализ документов и смет** (OpenAI/Gemini)
- ✅ Загрузка документов к проектам (договоры, сметы)
- ✅ Завершение проектов с актом выполненных работ
- ✅ Просмотр удаленных проектов и восстановление

**Dashboard:** `/dashboard_manager.html`

**Воронка проектов:**
```
1. Lead (Новый лид)
2. Qualification (Квалификация)
3. Visit Scheduled (Выезд назначен)
4. Offer In Progress (КП в работе)
5. Offer Sent (КП отправлено)
6. Negotiation (Переговоры)
7. Contract Signing (Договор на подписании)
8. Waiting Advance (Ожидание аванса)
9. In Progress (В работе)
10. Closing Docs (Закрытие документов)
11. Won (Выигран)
12. Lost (Проигран)
13. Postponed (Отложен)
```

**API эндпоинты:**
```
GET    /api/manager/staff
POST   /api/manager/projects
POST   /api/manager/ai-analyze          # AI анализ документа
POST   /api/manager/projects/:id/apply-ai-estimate
GET    /api/manager/projects
PUT    /api/manager/projects/:id
DELETE /api/manager/projects/:id
GET    /api/manager/projects/deleted
POST   /api/manager/projects/:id/restore
PUT    /api/manager/projects/:id/complete
GET    /api/manager/projects/:id/documents
POST   /api/manager/projects/:id/documents
GET    /api/manager/requests
GET    /api/manager/requests/archive
PUT    /api/manager/requests/:id
```

---

### 3. 👷 Прораб
**Уровень доступа:** Управление этапами работ

**Функции:**
- ✅ Присоединение к проекту по коду доступа (PRJ-XXXX)
- ✅ Создание этапов работ с описанием и материалами
- ✅ Загрузка фото выполненных работ (до/после)
- ✅ Отметка этапов как завершенных
- ✅ Учет расхода материалов (план vs факт)
- ✅ Заявки на дополнительные материалы
- ✅ Согласование материалов от снабженца
- ✅ Просмотр всех материалов по объектам

**Dashboard:** `/dashboard_foreman.html`

**Вкладки:**
- 🛠 Этапы работ
- 📦 Материалы
- ✅ Согласование материалов от снабженца

**API эндпоинты:**
```
POST   /api/foreman/join
GET    /api/foreman/projects
GET    /api/foreman/projects/:id
POST   /api/foreman/stages
PUT    /api/foreman/materials/:id/usage
POST   /api/foreman/stages/:id/photos
PUT    /api/foreman/stages/:id/complete
GET    /api/foreman/material-requests
PUT    /api/foreman/material-requests/:id
POST   /api/foreman/material-requests
GET    /api/foreman/materials
```

---

### 4. 📦 Снабженец
**Уровень доступа:** Управление материалами

**Функции:**
- ✅ Присоединение к проекту по коду
- ✅ Просмотр потребности в материалах по всем этапам
- ✅ **Экспорт списка материалов в Excel** (XLSX)
- ✅ Предложение материалов прорабу на согласование
- ✅ Обработка заявок на материалы от прораба
- ✅ Подтверждение поставки материалов на склад
- ✅ Статусы заявок: pending → ordered → delivered

**Dashboard:** `/dashboard_supplier.html`

**Вкладки:**
- 🏗 Мои проекты
- 📋 Заявки на материалы

**API эндпоинты:**
```
POST   /api/supplier/join
GET    /api/supplier/projects
GET    /api/supplier/projects/:id/materials
GET    /api/supplier/projects/:id/materials/export  # Excel export
GET    /api/supplier/projects/:id
POST   /api/supplier/materials
GET    /api/supplier/material-requests
PUT    /api/supplier/material-requests/:id
PUT    /api/supplier/materials/:id/deliver
```

---

### 5. 📐 Инженер ПТО
**Уровень доступа:** Загрузка исполнительной документации

**Функции:**
- ✅ Присоединение к проекту по коду
- ✅ Просмотр всех этапов работ и фото
- ✅ Загрузка исполнительных документов (РД)
- ✅ Просмотр всех документов проекта
- ✅ Доступ к фотоматериалам этапов

**Dashboard:** `/dashboard_pto.html`

**API эндпоинты:**
```
POST   /api/pto/join
GET    /api/pto/projects
GET    /api/pto/projects/:id
POST   /api/pto/projects/:id/documents
```

---

### 6. 👤 Заказчик
**Уровень доступа:** Мониторинг проектов

**Функции:**
- ✅ Создание заявок на работы с документами
- ✅ Присоединение к проекту по коду доступа
- ✅ Просмотр прогресса в реальном времени (%)
- ✅ Просмотр фото этапов работ
- ✅ Скачивание документов (договоры, акты, РД)
- ✅ Просмотр плана/факта по материалам
- ✅ Контакты менеджера и прораба

**Dashboard:** `/dashboard_customer.html`

**API эндпоинты:**
```
POST   /api/customer/requests
POST   /api/customer/join
GET    /api/customer/projects
GET    /api/customer/projects/:id
GET    /api/customer/requests
```

---

### 7. 🤝 Партнер
**Уровень доступа:** Реферальная программа

**Функции:**
- ✅ Уникальная реферальная ссылка `/ref/{code}`
- ✅ Статистика привлеченных клиентов
- ✅ Прозрачный расчет комиссий (7.5% → 15%)
- ✅ Запрос выплат из личного кабинета
- ✅ История выплат с статусами
- ✅ Геймификация с уровнями

**Уровни партнера:**
| Уровень | Клиентов | Комиссия |
|---------|----------|----------|
| 🥉 Старт | 1-2 | 7.5% |
| 🥈 Базовый | 3-4 | 10% |
| 🥇 Профи | 5-9 | 12% |
| 💎 Эксперт | 10+ | 15% |

**Dashboard:** `/dashboard_partner.html`

**API эндпоинты:**
```
GET    /api/partner/stats
POST   /api/partner/payout
```

---

### 8. 🌐 Гость (Публичный доступ)
**Функции:**
- ✅ Отправка заявки с сайта (без регистрации)
- ✅ Загрузка до 10 документов к заявке
- ✅ Просмотр услуг и портфолио компании
- ✅ Регистрация по реферальной ссылке партнера

**API эндпоинты:**
```
POST   /api/public/request
```

---

## 🔐 Безопасность

### Реализованные меры защиты

#### 1. Аутентификация и хеширование
```javascript
// Argon2id - современный алгоритм (победитель PHC 2015)
const hashedPassword = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,  // 64MB
    timeCost: 3,
    parallelism: 1
});

// Автоматическая миграция со старых Bcrypt хешей
if (user.password.startsWith('$argon2')) {
    passwordMatch = await argon2.verify(user.password, password);
} else {
    // Старый bcrypt -> мигрируем на argon2
    passwordMatch = await bcrypt.compare(user.password, password);
    if (passwordMatch) {
        const newHash = await argon2.hash(password);
        await dbRun("UPDATE users SET password = ? WHERE id = ?", [newHash, user.id]);
    }
}
```

#### 2. Защита от атак
```javascript
✅ SQL Injection     - Параметризованные запросы (100%)
✅ XSS               - xss-clean + Helmet CSP
✅ CSRF              - SameSite: 'lax' cookies
✅ Brute Force       - Rate limiting (5/15 мин)
✅ Path Traversal    - Валидация и нормализация путей
✅ File Upload       - Ограничение размера (10MB), типов
✅ Session Fixation  - httpOnly + secure cookies
```

#### 3. HTTP заголовки безопасности (Helmet)
```javascript
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            // ...
        }
    },
    referrerPolicy: { policy: 'same-origin' }
}));
```

**Устанавливаемые заголовки:**
- `Content-Security-Policy` ✅
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `Strict-Transport-Security` ✅
- `Referrer-Policy: same-origin` ✅

#### 4. Валидация данных (Zod)
```javascript
// Строгая валидация с regex и кастомными сообщениями
const registerSchema = z.object({
    login: z.string()
        .min(3).max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, "Только латиница, цифры, - и _"),
    password: z.string()
        .min(8)
        .regex(/[A-Z]/, "Нужна заглавная буква")
        .regex(/[0-9]/, "Нужна цифра"),
    email: z.string().email("Неверный формат email"),
    phone: z.string()
        .regex(/^[\+]?[78][-\s\(]?\d{3}[-\s\)]?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, 
               "Формат: +79991234567"),
    // ...
});
```

#### 5. Защита файлов от несанкционированного доступа
```javascript
// НЕТ прямого доступа к /uploads через express.static
// ТОЛЬКО через API с проверкой прав:

GET /api/documents/serve?path=uploads/document.pdf

async serveFile(req, res, next) {
    // 1. Проверка прав пользователя в БД (RLS логика)
    const hasAccess = await checkUserAccess(userId, filePath);
    
    // 2. Генерация временной ссылки на облако (Supabase Signed URL)
    const signedUrl = await getSignedUrl(filePath, 3600); 
    
    // 3. Редирект на защищенный файл
    return res.redirect(signedUrl);
}
```

#### 6. Soft Deletes (GDPR-compatible)
```javascript
// Данные не удаляются физически - только помечаются
DELETE /api/admin/users/123

→ UPDATE users SET is_deleted = 1, is_active = 0 WHERE id = 123

// Восстановление возможно
POST /api/admin/users/123/restore

→ UPDATE users SET is_deleted = 0, is_active = 1 WHERE id = 123
```

#### 7. Rate Limiting (многоуровневая защита)
```javascript
// Глобальный: 1000 запросов / 15 минут
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// Login: 5 попыток / 15 минут (только ошибки)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true  // Считаем только ошибки
});

// Register: 3 регистрации / час с одного IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3
});
```

#### 8. Модерация регистраций
```javascript
// Новые пользователи (кроме админа) требуют верификации
if (user.role !== 'admin' && user.is_verified === 0) {
    return res.status(403).json({
        message: "Ваш аккаунт находится на модерации"
    });
}

// Админ верифицирует через эндпоинт:
POST /api/admin/users/:id/verify
```

---

## 📡 API документация

### Базовый URL
```
http://localhost:3000/api
```

### Аутентификация

#### POST `/api/login`
Вход в систему

**Request:**
```json
{
  "login": "admin",      // Логин, email или телефон
  "password": "admin123"
}
```

**Response (успех):**
```json
{
  "success": true,
  "role": "admin",
  "user": {
    "id": 1,
    "login": "admin",
    "full_name": "Администратор",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Response (ошибка):**
```json
{
  "success": false,
  "message": "Неверный логин или пароль"
}
```

**Rate Limit:** 5 попыток / 15 минут

---

#### POST `/api/register`
Регистрация нового заказчика (требует модерации)

**Request:**
```json
{
  "login": "client1",
  "password": "SecurePass123",
  "email": "client@example.com",
  "phone": "+79991234567",
  "fullName": "Иванов Иван Иванович",
  "organization": "ООО Ромашка",
  "refCode": "EA12345"  // Опционально (реферальный код партнера)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Регистрация успешна. Ожидайте подтверждения администратором."
}
```

**Rate Limit:** 3 регистрации / час с одного IP

---

#### POST `/api/logout`
Выход из системы

**Response:**
```json
{
  "success": true,
  "message": "Осуществлен выход"
}
```

---

### Менеджер

#### GET `/api/manager/projects`
Получить все проекты

**Response:**
```json
{
  "success": true,
  "projects": [
    {
      "id": 1,
      "title": "Реконструкция ПС-110",
      "address": "г. Москва, ул. Ленина 1",
      "status": "in_progress",
      "access_code": "PRJ-A8F5",
      "manager_name": "Менеджер Иванов",
      "foreman_name": "Прораб Петров",
      "customer_name": "Заказчик Сидоров",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

#### POST `/api/manager/projects`
Создать новый проект

**Request (multipart/form-data):**
```
title: "Реконструкция ПС-110"
address: "г. Москва, ул. Ленина 1"
description: "Капитальный ремонт подстанции"
foremanId: 5
supplierId: 6
ptoId: 7
customerId: 8
documents: [file1.pdf, file2.pdf]  // До 10 файлов
```

**Response:**
```json
{
  "success": true,
  "projectId": 15,
  "accessCode": "PRJ-X9K2",
  "message": "Проект создан"
}
```

---

#### POST `/api/manager/ai-analyze`
AI-анализ документа (смета, проектная документация)

**Request (multipart/form-data):**
```
document: [file.pdf]
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "type": "estimate",
    "stages": [
      {
        "name": "Подготовительные работы",
        "materials": [
          { "name": "Песок", "quantity": 10, "unit": "м³" }
        ]
      }
    ],
    "total_cost": 1500000
  }
}
```

---

### Прораб

#### POST `/api/foreman/join`
Присоединиться к проекту

**Request:**
```json
{
  "accessCode": "PRJ-A8F5"
}
```

**Response:**
```json
{
  "success": true,
  "project": {
    "id": 1,
    "title": "Реконструкция ПС-110",
    "address": "г. Москва, ул. Ленина 1"
  }
}
```

---

#### POST `/api/foreman/stages`
Создать этап работ

**Request:**
```json
{
  "projectId": 1,
  "stageName": "Подготовительные работы",
  "description": "Очистка территории и подготовка фундамента",
  "materials": [
    {
      "name": "Песок речной",
      "unit": "м³",
      "quantity": 10
    },
    {
      "name": "Щебень фракция 20-40",
      "unit": "т",
      "quantity": 5
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stageId": 23,
  "message": "Этап успешно создан"
}
```

---

#### POST `/api/foreman/stages/:id/photos`
Загрузить фото этапа

**Request (multipart/form-data):**
```
photos: [photo1.jpg, photo2.jpg, ...]  // До 10 фото
description: "Фото после завершения работ"
```

**Response:**
```json
{
  "success": true,
  "message": "Фотографии загружены"
}
```

---

### Снабженец

#### GET `/api/supplier/projects/:id/materials/export`
Экспорт материалов в Excel

**Response:** Excel файл (XLSX)

Структура файла:
| stage_number | stage_name | material_name | unit | quantity_planned | quantity_used | quantity_received | is_received |
|--------------|-----------|---------------|------|------------------|---------------|-------------------|-------------|
| 1 | Подготовка | Песок | м³ | 10 | 8 | 10 | 1 |

---

### Партнер

#### GET `/api/partner/stats`
Статистика партнера

**Response:**
```json
{
  "success": true,
  "partner": {
    "id": 42,
    "full_name": "Партнер Иванов",
    "ref_code": "EA42ABC",
    "level": {
      "name": "Профи",
      "commission": 12,
      "next": "Эксперт (15%)",
      "needed": 2
    },
    "clients_count": 8
  },
  "clients": [
    {
      "id": 15,
      "referred_user_id": 103,
      "full_name": "Клиент Петров",
      "organization": "ООО Стройка",
      "created_at": "2024-01-10",
      "status": "paid",
      "commission_amount": 75000
    }
  ],
  "finance": {
    "total_paid": 150000,
    "pending_amount": 45000,
    "total_deals": 8
  },
  "payouts": [
    {
      "id": 5,
      "amount": 50000,
      "payment_details": "Карта Сбербанк 1234****5678",
      "status": "paid",
      "processed_at": "2024-01-05"
    }
  ]
}
```

---

#### POST `/api/partner/payout`
Запросить выплату

**Request:**
```json
{
  "amount": 40000,
  "payment_details": "Карта Сбербанк 1234 **** 5678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Запрос на выплату отправлен. Обработка 1-3 рабочих дня."
}
```

---

## ⚙️ Конфигурация

### .env файл

```env
# Сервер
PORT=3000
NODE_ENV=development           # production | development

# База данных
DB_PATH=./energo.db

# Сессии (ОБЯЗАТЕЛЬНО изменить в production!)
SESSION_SECRET=your-super-secret-key-min-32-chars

# Загрузка файлов
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760         # 10MB в байтах

# CORS (домены через запятую)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# OpenAI (опционально - для AI анализа)
OPENROUTER_API_KEY=your-openai-api-key

# Google Gemini (альтернатива OpenAI)
GEMINI_API_KEY=your-gemini-api-key

# Email (опционально - для уведомлений)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

---

## 🗄️ База данных

### Схема SQLite

**Основные таблицы:**

```sql
-- Пользователи (7 ролей)
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,              -- Argon2id hash
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,                  -- admin/manager/foreman/supplier/pto/customer/partner
    full_name TEXT NOT NULL,
    organization TEXT,
    ref_code TEXT UNIQUE,                -- Реферальный код партнера
    is_verified INTEGER DEFAULT 0,       -- Модерация регистраций
    is_active INTEGER DEFAULT 1,
    is_deleted INTEGER DEFAULT 0,        -- Soft delete
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Проекты
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    address TEXT,
    description TEXT,
    status TEXT DEFAULT 'lead',          -- Воронка: lead/qualification/.../won/lost
    access_code TEXT UNIQUE,             -- PRJ-XXXX
    manager_id INTEGER,
    customer_id INTEGER,
    foreman_id INTEGER,
    supplier_id INTEGER,
    pto_id INTEGER,
    budget REAL,
    stages_deadline DATE,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(manager_id) REFERENCES users(id),
    FOREIGN KEY(customer_id) REFERENCES users(id),
    FOREIGN KEY(foreman_id) REFERENCES users(id),
    FOREIGN KEY(supplier_id) REFERENCES users(id),
    FOREIGN KEY(pto_id) REFERENCES users(id)
);

-- Заявки от клиентов
CREATE TABLE project_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    documents TEXT,                      -- Пути к файлам (через запятую)
    contact_info TEXT,
    status TEXT DEFAULT 'pending',       -- pending/reviewed/accepted/rejected
    notes TEXT,
    reviewer_id INTEGER,
    reviewed_at DATETIME,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES users(id)
);

-- Публичные заявки (с сайта без регистрации)
CREATE TABLE public_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    organization TEXT,
    description TEXT,
    documents TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Этапы работ
CREATE TABLE project_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    created_by INTEGER,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

-- Материалы по этапам
CREATE TABLE project_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_id INTEGER NOT NULL,
    material_name TEXT NOT NULL,
    unit TEXT,
    quantity_planned REAL DEFAULT 0,
    quantity_used REAL DEFAULT 0,
    quantity_received REAL DEFAULT 0,
    is_received INTEGER DEFAULT 0,
    received_at DATETIME,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(stage_id) REFERENCES project_stages(id)
);

-- Заявки на материалы (прораб ↔ снабженец)
CREATE TABLE material_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    foreman_id INTEGER,
    supplier_id INTEGER,
    material_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',       -- pending/approved/rejected/ordered/delivered
    notes TEXT,
    reviewed_at DATETIME,
    delivered_at DATETIME,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(foreman_id) REFERENCES users(id),
    FOREIGN KEY(supplier_id) REFERENCES users(id)
);

-- Документы проектов
CREATE TABLE project_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    document_type TEXT,                  -- contract/estimate/executive/other
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by INTEGER,
    description TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
);

-- Фото этапов
CREATE TABLE project_stage_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by INTEGER,
    description TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(stage_id) REFERENCES project_stages(id),
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
);

-- Уведомления
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    type TEXT NOT NULL,                  -- photo/document/status_change/message
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Внутренние сообщения
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    project_id INTEGER,
    subject TEXT,
    body TEXT NOT NULL,
    attachments TEXT,                    -- JSON массив файлов
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- Реферальные клиенты партнеров
CREATE TABLE referral_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',       -- pending/paid
    commission_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(partner_id) REFERENCES users(id),
    FOREIGN KEY(referred_user_id) REFERENCES users(id)
);

-- Выплаты партнерам
CREATE TABLE partner_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_details TEXT NOT NULL,
    status TEXT DEFAULT 'pending',       -- pending/processing/paid/rejected
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(partner_id) REFERENCES users(id)
);
```

---

## 🖼️ Скриншоты

### Лендинг
![Главная страница](docs/screenshots/index.png)
*Современный industrial design с темной темой*

### Дашборд менеджера
![Менеджер](docs/screenshots/dashboard_manager.png)
*Воронка проектов, AI-анализ, управление командой*

### Воронка проектов (Kanban)
![Воронка](docs/screenshots/funnel.png)
*12 статусов от Lead до Won/Lost*

### Прораб - Этапы работ
![Прораб](docs/screenshots/foreman_stages.png)
*Создание этапов, загрузка фото, управление материалами*

### Заказчик - Прогресс проекта
![Заказчик](docs/screenshots/customer_progress.png)
*Просмотр прогресса, фото, документов в реальном времени*

### Партнерская программа
![Партнер](docs/screenshots/partner_stats.png)
*Статистика, комиссии, уровни*

---

## 📝 Скрипты package.json

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "init-db": "node init_db.js",
    "check-users": "node check_users.js"
  }
}
```

---

## 🚧 Roadmap

### v2.1 (В разработке)
- [ ] Telegram-бот для уведомлений
- [ ] QR-коды для быстрого доступа к проектам
- [ ] Геолокация объектов на карте (Yandex Maps)
- [ ] Голосовые заметки от прорабов (Whisper API)

### v2.5 (Планируется Q2 2026)
- [ ] Мобильное приложение (React Native)
- [ ] Чат в реальном времени (Socket.io)
- [ ] Календарь с дедлайнами и напоминаниями
- [ ] Фото "До/После" с слайдером сравнения

### v3.0 (Планируется Q4 2026)
- [ ] Интеграция с 1С Управление строительством
- [ ] Электронная подпись (УКЭП) для актов
- [ ] Аналитический дашборд для директора
- [ ] Автоматические акты выполненных работ (DOCX генерация)
- [ ] Email-уведомления (Nodemailer)
- [ ] Swagger документация API

---

## 🤝 Вклад в проект

Мы приветствуем любой вклад! Пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

### Гайдлайны
- Следуйте существующему стилю кода
- Добавляйте комментарии для сложной логики
- Обновляйте README при добавлении новых фич
- Тестируйте перед отправкой PR

---

## 📄 Лицензия

Проект распространяется под лицензией **ISC**. См. файл `LICENSE` для деталей.

---

## 👨‍💻 Автор

**ЭнергоАтлант**

- 🌐 GitHub: [@needyoast-collab](https://github.com/needyoast-collab)
- 🌐 Сайт: [energoatlant.ru](https://energoatlant.ru)
- 📧 Email: info@energoatlant.ru
- 📞 Телефон: +7 993 907-45-77

---

## 🙏 Благодарности

- [Express.js](https://expressjs.com/) - Минималистичный backend framework
- [Bootstrap 5](https://getbootstrap.com/) - Адаптивный UI
- [Argon2](https://github.com/ranisalt/node-argon2) - Безопасное хеширование паролей
- [Zod](https://zod.dev/) - Type-safe валидация схем
- [Helmet](https://helmetjs.github.io/) - Защита HTTP заголовков
- [OpenAI](https://openai.com/) - AI анализ документов

---

<div align="center">

**Сделано с ❤️ командой ЭнергоАтлант**

⭐ Поставьте звезду, если проект был полезен!

[🏗️ Главная](/) | [📖 Документация](#) | [🐛 Баг-репорты](https://github.com/needyoast-collab/energo-atlant/issues) | [💬 Обсуждения](https://github.com/needyoast-collab/energo-atlant/discussions)

</div>
