const AppError = require('./../utils/appError');

const handleCastErrorDB = err => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

// const handleDuplicateFieldsDB = err => {
//   const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
//   console.log(value);
//
//   const message = `Duplicate field value: ${value}. Please use another value!`;
//   return new AppError(message, 400);
// };

const handleValidationErrorDB = err => {
    const errors = Object.values(err.errors).map(el => el.message);

    const message = `بيانات غير صحيحة: ${errors.join('. ')}`;
    return new AppError(message, 400);
};

const handleJWTError = () =>
    new AppError('رمز الدخول (Token) غير صالح. يرجى تسجيل الدخول مرة أخرى!', 401);

const handleJWTExpiredError = () =>
    new AppError('انتهت صلاحية رمز الدخول (Token). يرجى تسجيل الدخول مرة أخرى!', 401);

const sendErrorDev = (err, req, res) => {
    // A) API
    if (req.originalUrl.startsWith('/api')) {
        return res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
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
            return res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        }
        // B) أخطاء غير متوقعة (برمجية أو غير معروفة) -> لا نكشف التفاصيل
        console.error('خطأ غير متوقع 💥', err);

        return res.status(500).json({
            status: 'error',
            message: 'حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقًا.'
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
  // console.log(err.stack);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;

    if (error.name === 'CastError') error = handleCastErrorDB(error);
    // if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError')
      error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
