const multer = require('multer');
const fs = require('fs');

// Создаем папку uploads если её нет
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Создана папка uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const safeOriginalName = utf8Name.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_');
        const safeName = `${Date.now()}-${safeOriginalName}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
        files: 20 // Максимум 20 файлов
    },
    fileFilter: (req, file, cb) => {
        console.log(`📎 Загружается файл: ${file.originalname}`);
        // Разрешенные MIME-типы для загрузки
        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
            'text/plain',
            'text/csv'
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.error(`❌ Заблокирована загрузка файла недопустимого типа: ${file.originalname} (${file.mimetype})`);
            cb(new Error(`Недопустимый формат файла. Загрузка ${file.mimetype} запрещена.`), false);
        }
    }
});

module.exports = upload;
