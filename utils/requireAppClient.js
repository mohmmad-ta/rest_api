const AppError = require("./appError");

module.exports = (req, res, next) => {
    const expectedKey = process.env.APP_CLIENT_KEY;

    if (!expectedKey) {
        return next(new AppError("App client key is missing from the server configuration.", 500));
    }

    const providedKey = req.headers["x-app-client-key"];

    if (!providedKey || providedKey !== expectedKey) {
        return next(new AppError("هذا الطلب مسموح فقط من التطبيق.", 403));
    }

    next();
};
