const AppError = require("./appError");

module.exports = (req, res, next) => {
    const expectedKey = process.env.APP_CLIENT_KEY;

    if (!expectedKey) {
        return next(new AppError("الخدمة غير متاحة حالياً. يرجى المحاولة مرة أخرى لاحقاً.", 500, {
            code: "APP_SERVICE_UNAVAILABLE",
        }));
    }

    const providedKey = req.headers["x-app-client-key"];

    if (!providedKey || providedKey !== expectedKey) {
        return next(new AppError("تعذر التحقق من التطبيق. يرجى تحديث التطبيق والمحاولة مرة أخرى.", 403, {
            code: "APP_CLIENT_NOT_AUTHORIZED",
        }));
    }

    next();
};
