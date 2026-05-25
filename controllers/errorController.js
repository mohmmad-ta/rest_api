const AppError = require('./../utils/appError');

const handleCastErrorDB = err => {
    const fieldLabels = {
        _id: 'المعرّف',
        id: 'المعرّف',
        restaurantId: 'معرّف المطعم',
        userId: 'معرّف المستخدم',
        deliveryId: 'معرّف المندوب',
        category: 'معرّف التصنيف',
    };
    const fieldLabel = fieldLabels[err.path] || 'القيمة المطلوبة';

    return new AppError(`${fieldLabel} غير صالح. يرجى إعادة المحاولة من داخل التطبيق.`, 400, {
        code: 'INVALID_REFERENCE',
    });
};

const handleDuplicateFieldsDB = err => {
    const duplicateKey = Object.keys(err.keyValue || {})[0];
    const keyPattern = err.keyPattern || {};

    if (keyPattern.order && keyPattern.user) {
        return new AppError('تم تقييم هذا الطلب مسبقاً. لا يمكن إرسال تقييم آخر لنفس الطلب.', 409, {
            code: 'ORDER_ALREADY_RATED',
        });
    }

    if (keyPattern.restaurant && keyPattern.user) {
        return new AppError('تم إرسال تقييم لهذا المطعم مسبقاً. يمكنك تحديث تقييمك من طلب جديد مكتمل.', 409, {
            code: 'RESTAURANT_ALREADY_RATED',
        });
    }

    const duplicateMessages = {
        name: 'هذا الاسم مستخدم مسبقاً. يرجى اختيار اسم آخر.',
        phone: 'رقم الهاتف مسجل مسبقاً. يرجى تسجيل الدخول أو استخدام استعادة كلمة المرور.',
        email: 'البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول أو استخدام استعادة كلمة المرور.',
        userID: 'معرّف المستخدم مستخدم مسبقاً. يرجى اختيار معرّف آخر.',
        couponCode: 'كود الخصم مستخدم من مطعم آخر. يرجى اختيار كود مختلف.',
    };

    if (duplicateMessages[duplicateKey]) {
        return new AppError(duplicateMessages[duplicateKey], 409, {
            code: 'DUPLICATE_FIELD',
            details: { field: duplicateKey },
        });
    }

    return new AppError('هذه البيانات مستخدمة مسبقاً. يرجى إدخال بيانات مختلفة.', 409, {
        code: 'DUPLICATE_FIELD',
    });
};

const handleValidationErrorDB = err => {
    const errors = Object.values(err.errors || {})
        .map(el => el.message)
        .filter(Boolean);

    const message = errors.length > 1
        ? `يرجى تصحيح البيانات التالية:\n- ${errors.join('\n- ')}`
        : errors[0] || 'البيانات المدخلة غير صحيحة. يرجى مراجعتها والمحاولة مرة أخرى.';

    return new AppError(message, 400, {
        code: 'VALIDATION_ERROR',
        errors,
    });
};

const handleJWTError = () =>
    new AppError('انتهت جلسة الدخول أو أصبحت غير صالحة. يرجى تسجيل الدخول مرة أخرى.', 401, {
        code: 'INVALID_SESSION',
        action: 'login',
    });

const handleJWTExpiredError = () =>
    new AppError('انتهت صلاحية جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.', 401, {
        code: 'SESSION_EXPIRED',
        action: 'login',
    });

const handleMalformedJson = () =>
    new AppError('تعذر قراءة البيانات المرسلة. يرجى المحاولة مرة أخرى.', 400, {
        code: 'INVALID_REQUEST_BODY',
    });

const handleMulterError = err => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return new AppError('حجم الصورة كبير جداً. يرجى اختيار صورة أصغر ثم المحاولة مرة أخرى.', 400, {
            code: 'IMAGE_TOO_LARGE',
        });
    }

    return new AppError('تعذر رفع الملف. يرجى اختيار صورة صحيحة والمحاولة مرة أخرى.', 400, {
        code: 'UPLOAD_FAILED',
    });
};

const formatApiError = err => {
    const payload = {
        status: err.status,
        message: err.message,
    };

    if (err.code) payload.code = err.code;
    if (err.action) payload.action = err.action;
    if (Array.isArray(err.errors) && err.errors.length) payload.errors = err.errors;

    return payload;
};

const normalizeError = (err) => {
    if (err.name === 'CastError') return handleCastErrorDB(err);
    if (err.code === 11000) return handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') return handleValidationErrorDB(err);
    if (err.name === 'JsonWebTokenError') return handleJWTError();
    if (err.name === 'TokenExpiredError') return handleJWTExpiredError();
    if (err.type === 'entity.parse.failed') return handleMalformedJson();
    if (err.name === 'MulterError') return handleMulterError(err);

    return err;
};

const sendErrorDev = (err, req, res) => {
    // A) API
    if (req.originalUrl.startsWith('/api')) {
        return res.status(err.statusCode).json({
            ...formatApiError(err),
            error: err,
            stack: err.stack
        });
    }

    // B) RENDERED WEBSITE
    console.error('خطأ 💥', err);
    return res.status(err.statusCode).render('error', {
        title: 'حدث خطأ!',
        msg: err.message
    });
};

const sendErrorProd = (err, req, res) => {
    // A) API
    if (req.originalUrl.startsWith('/api')) {
        // A) أخطاء متوقعة (Operational) -> إرجاع رسالة للمستخدم
        if (err.isOperational) {
            return res.status(err.statusCode).json(formatApiError(err));
        }
        // B) أخطاء غير متوقعة (برمجية أو غير معروفة) -> لا نكشف التفاصيل
        console.error('خطأ غير متوقع 💥', err);

        return res.status(500).json({
            status: 'error',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.'
        });
    }

    // B) RENDERED WEBSITE
    if (err.isOperational) {
        return res.status(err.statusCode).render('error', {
            title: 'حدث خطأ!',
            msg: err.message
        });
    }

    console.error('خطأ غير متوقع 💥', err);
    return res.status(err.statusCode).render('error', {
        title: 'حدث خطأ!',
        msg: 'حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقًا.'
    });
};


module.exports = (err, req, res, next) => {
    let error = normalizeError(err);

    error.statusCode = error.statusCode || 500;
    error.status = error.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        return sendErrorDev(error, req, res);
    }

    return sendErrorProd(error, req, res);
};
