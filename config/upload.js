const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
        // Защита от Path Traversal: используем UUID вместо оригинального имени
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = `${uuidv4()}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB по умолчанию
        files: 20
    },
    fileFilter: (req, file, cb) => {
        // Белый список MIME-типов
        const allowedMimeTypes = [
            'application/pdf', // PDF
            'application/msword', // DOC
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
            'application/vnd.ms-excel', // XLS
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
            'image/jpeg', // JPG/JPEG
            'image/png'   // PNG
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.warn(`🛑 Попытка загрузки небезопасного типа файла: ${file.mimetype}`);
            cb(new Error('Недопустимый формат файла. Разрешены только PDF, Word, Excel и изображения (JPG, PNG).'), false);
        }
    }
});

module.exports = upload;
