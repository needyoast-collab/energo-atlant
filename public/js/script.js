// ==========================================
// 1. СЧЕТЧИКИ НА ГЛАВНОЙ СТРАНИЦЕ
// ==========================================
const counters = document.querySelectorAll('.counter');

counters.forEach(counter => {
    counter.innerText = '0';

    const updateCounter = () => {
        const target = +counter.getAttribute('data-target');
        const c = +counter.innerText;
        const increment = target / 100;

        if (c < target) {
            counter.innerText = `${Math.ceil(c + increment)}`;
            setTimeout(updateCounter, 20);
        } else {
            counter.innerText = target;
        }
    };

    updateCounter();
});

// ==========================================
// 2. ЛОГИКА ВХОДА (LOGIN)
// ==========================================
const loginBtn = document.getElementById('loginBtn');

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        // Находим поля
        const loginInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginContainer = document.querySelector('.login-container');

        // Сброс старых ошибок и анимаций
        loginInput.classList.remove('input-error');
        passwordInput.classList.remove('input-error');
        loginContainer.classList.remove('shake-animation');
        void loginContainer.offsetWidth; // Магия перезапуска анимации

        let hasError = false;

        // Проверка: пустой ли Логин?
        if (loginInput.value.trim() === "") {
            loginInput.classList.add('input-error');
            hasError = true;
        }

        // Проверка: пустой ли Пароль?
        if (passwordInput.value.trim() === "") {
            passwordInput.classList.add('input-error');
            hasError = true;
        }

        // Если поля пустые — трясем и не отправляем запрос
        if (hasError) {
            loginContainer.classList.add('shake-animation');
            return;
        }

        // ОТПРАВКА НА СЕРВЕР
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: loginInput.value,
                    password: passwordInput.value
                })
            });

            const result = await response.json();

            if (result.success) {
                // Успех -> Идем в кабинет
                window.location.href = "cabinet.html";
            } else {
                // Ошибка -> Показываем сообщение и трясем
                alert(result.message);
                loginContainer.classList.add('shake-animation');
                loginInput.classList.add('input-error');
                passwordInput.classList.add('input-error');
            }
        } catch (error) {
            console.error('Ошибка связи с сервером:', error);
            alert('Сервер не отвечает. Проверьте консоль.');
        }
    });
}

// ==========================================
// 3. ЛОГИКА РЕГИСТРАЦИИ (REGISTER)
// ==========================================
const regBtn = document.getElementById('regBtn');

if (regBtn) {
    regBtn.addEventListener('click', async () => {
        const login = document.getElementById('reg-login').value;
        const password = document.getElementById('reg-password').value;
        const email = document.getElementById('reg-email').value;
        const phone = document.getElementById('reg-phone').value;
        const secretCode = document.getElementById('reg-code').value;

        // Простая проверка заполненности
        if (!login || !password || !email || !phone || !secretCode) {
            alert("Заполните ВСЕ поля!");
            return;
        }
        // 1. Регулярные выражения для проверки
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Проверка на @ и точку
        const phonePattern = /^\+?[78][0-9]{10}$/; // Начинается с +7/7/8 и содержит 11 цифр

        // 2. Сама проверка
        if (!emailPattern.test(email)) {
            alert("Пожалуйста, введите корректный Email (например, user@mail.ru)");
            return;
        }

        if (!phonePattern.test(phone.replace(/\s/g, ''))) { // Убираем пробелы перед проверкой
            alert("Введите телефон в формате +79001112233 (11 цифр)");
            return;
        }

        if (password.length < 6) {
            alert("Пароль должен быть не менее 6 символов");
            return;
        }
        // Отправка на сервер
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password, email, phone, secretCode })
            });

            const result = await response.json();

            if (result.success) {
                alert("Вы успешно зарегистрированы!");
                window.location.href = "login.html";
            } else {
                // Если пользователь уже есть
                if (result.errorType === 'exists') {
                    if (confirm("Такой Email или Телефон уже есть. Хотите восстановить пароль?")) {
                        window.location.href = "login.html";
                    }
                } else {
                    alert("Ошибка: " + result.message);
                }
            }
        } catch (error) {
            console.error(error);
            alert("Ошибка сети");
        }
    });
}

// ==========================================
// 4. ВЫХОД ИЗ СИСТЕМЫ (LOGOUT)
// ==========================================
// Логика перенесена в api.js для централизованного управления.
// Старый обработчик удален во избежание конфликтов.
// ==========================================
// 5. АНИМАЦИЯ В КАБИНЕТЕ (ПРОГРЕСС-БАРЫ)
// ==========================================
// Я вернул этот кусок, чтобы полоски в кабинете красиво "выезжали"
const progressBars = document.querySelectorAll('.progress-bar .fill');

if (progressBars.length > 0) {
    setTimeout(() => {
        progressBars.forEach(bar => {
            const targetWidth = bar.getAttribute('style').replace('width:', '').replace(';', '').trim();
            bar.style.width = '0%'; // Сброс
            requestAnimationFrame(() => {
                bar.style.width = targetWidth; // Плавное заполнение
            });
        });
    }, 300);
}
// Функция для загрузки данных профиля в кабинете
async function loadUserProfile() {
    const userNameElement = document.querySelector('.user-profile p');
    if (!userNameElement) return; // Если мы не в кабинете, выходим

    try {
        const response = await fetch('/api/user/me');
        const data = await response.json();

        if (data.success) {
            // Заменяем текст на логин из базы
            userNameElement.innerText = data.login;

            // Если роль - админ, можно подсветить
            if (data.role === 'admin') {
                document.querySelector('.user-profile span').innerText = 'Администратор системы';
            }
        }
    } catch (err) {
        console.error("Ошибка загрузки профиля", err);
    }
}

// Запускаем проверку профиля при загрузке страницы
loadUserProfile();