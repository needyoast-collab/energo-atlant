const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const s3Client = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
        accessKeyId: process.env.YC_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.YC_S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // обязательно для Яндекс Object Storage
});

const bucketName = process.env.YC_S3_BUCKET;

/**
 * Загрузка файла из multer (memoryStorage) в Яндекс Object Storage.
 * @param {Object} file - файл из multer
 * @param {string} folder - префикс внутри бакета (например 'projects/docs')
 * @returns {Promise<string>} - относительный ключ, сохраняемый в БД (например 'projects/docs/uuid.pdf')
 */
const uploadToStorage = async (file, folder = 'uploads') => {
    if (!file) return null;
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${folder}/${uuidv4()}${ext}`;
    await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
    }));
    return key;
};

/**
 * Генерация временной presigned ссылки для скачивания файла.
 * @param {string} key - ключ объекта в бакете
 * @param {number} expiresIn - время жизни ссылки в секундах (по умолчанию 1 час)
 * @returns {Promise<string|null>}
 */
const getPresignedUrl = async (key, expiresIn = 3600) => {
    if (!key) return null;
    try {
        return await awsGetSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucketName, Key: key }),
            { expiresIn }
        );
    } catch (err) {
        console.error('S3 Presigned URL Error:', err.message);
        return null;
    }
};

/**
 * Удаление файла из Яндекс Object Storage.
 * @param {string} key - ключ объекта
 */
const deleteFromStorage = async (key) => {
    if (!key) return;
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    } catch (err) {
        console.error('S3 Delete Error:', err.message);
    }
};

module.exports = { s3Client, uploadToStorage, getPresignedUrl, deleteFromStorage };
