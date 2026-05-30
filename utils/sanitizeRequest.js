const AppError = require('./appError');

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = value =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(Buffer.isBuffer(value));

const isUnsafeKey = key =>
    key.startsWith('$') ||
    key.includes('.') ||
    DANGEROUS_KEYS.has(key);

const findUnsafePath = (value, path = '') => {
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            const unsafePath = findUnsafePath(value[index], `${path}[${index}]`);
            if (unsafePath) return unsafePath;
        }
        return null;
    }

    if (!isPlainObject(value)) {
        return null;
    }

    for (const key of Object.keys(value)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (isUnsafeKey(key)) {
            return currentPath;
        }

        const unsafePath = findUnsafePath(value[key], currentPath);
        if (unsafePath) return unsafePath;
    }

    return null;
};

const assertSafeObject = (value, label = 'input') => {
    const unsafePath = findUnsafePath(value, label);

    if (unsafePath) {
        throw new AppError('تم رفض الطلب بسبب احتوائه على مفاتيح غير آمنة.', 400, {
            code: 'UNSAFE_REQUEST_KEYS',
            details: { field: unsafePath },
        });
    }
};

const sanitizeRequest = (req, res, next) => {
    const unsafePath =
        findUnsafePath(req.body, 'body') ||
        findUnsafePath(req.query, 'query') ||
        findUnsafePath(req.params, 'params');

    if (unsafePath) {
        return next(new AppError('تم رفض الطلب بسبب احتوائه على مفاتيح غير آمنة.', 400, {
            code: 'UNSAFE_REQUEST_KEYS',
            field: unsafePath,
        }));
    }

    next();
};

module.exports = sanitizeRequest;
module.exports.assertSafeObject = assertSafeObject;
