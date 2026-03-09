const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const bucketName = process.env.SUPABASE_BUCKET || 'energoatlant-files';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Загрузка файла в Supabase Storage
 * @param {Object} file - Объект файла из multer (memoryStorage)
 * @param {string} folder - Папка внутри бакета (например 'documents' или 'photos')
 * @returns {string} - Путь к файлу в бакете
 */
const uploadToSupabase = async (file, folder = 'uploads') => {
    if (!file) return null;

    const ext = path.extname(file.originalname).toLowerCase();
    const fileName = `${uuidv4()}${ext}`;
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
        });

    if (error) {
        console.error('❌ Supabase Upload Error:', error.message);
        throw new Error('Ошибка при загрузке файла в облако');
    }

    return data.path; // Возвращаем путь внутри бакета
};

/**
 * Получение временной (signed) ссылки на файл
 * @param {string} filePath - Путь к файлу в бакете
 * @param {number} expiresIn - Время жизни ссылки в секундах
 */
const getSignedUrl = async (filePath, expiresIn = 3600) => {
    if (!filePath) return null;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, expiresIn);

    if (error) {
        console.error('❌ Supabase Signed URL Error:', error.message);
        return null;
    }

    return data.signedUrl;
};

/**
 * Удаление файла из хранилища
 */
const deleteFromSupabase = async (filePath) => {
    if (!filePath) return;
    const { error } = await supabase.storage.from(bucketName).remove([filePath]);
    if (error) console.error('❌ Supabase Delete Error:', error.message);
};

module.exports = {
    supabase,
    uploadToSupabase,
    getSignedUrl,
    deleteFromSupabase
};
