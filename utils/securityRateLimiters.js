const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const createLimiter = ({
    windowMs,
    max,
    message,
    skipSuccessfulRequests = false,
}) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || ""),
        message: {
            status: "fail",
            message,
        },
    });

exports.authLoginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: "تم تجاوز عدد محاولات تسجيل الدخول. حاول مرة أخرى بعد 15 دقيقة.",
});

exports.authSignupLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: "تم تجاوز عدد محاولات إنشاء الحساب. حاول مرة أخرى بعد ساعة.",
});

exports.otpVerifyLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: "تم تجاوز عدد محاولات التحقق من الرمز. حاول مرة أخرى بعد 15 دقيقة.",
});

exports.otpResendLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 6,
    message: "تم تجاوز عدد مرات إعادة إرسال الرمز. حاول مرة أخرى بعد ساعة.",
});
