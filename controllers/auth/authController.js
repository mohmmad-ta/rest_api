const jwt = require('jsonwebtoken')
const Admin = require('../../models/auth/adminModel');
const User = require('../../models/auth/userModel');
const Delivery = require('../../models/auth/deliveryModel');
const Restaurant = require('../../models/auth/restaurantModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require("../../utils/appError");
const {promisify} = require("util");
const crypto = require("crypto");
const sendEmail = require("../../utils/email");
const axios = require('axios');

const LOGIN_OTP_TTL_MINUTES = 10;
const SIGNUP_OTP_MAX_VERIFY_ATTEMPTS = parseInt(process.env.SIGNUP_OTP_MAX_VERIFY_ATTEMPTS || "5", 10);
const SIGNUP_OTP_MAX_RESENDS = parseInt(process.env.SIGNUP_OTP_MAX_RESENDS || "3", 10);
const SIGNUP_OTP_BLOCK_MINUTES = parseInt(process.env.SIGNUP_OTP_BLOCK_MINUTES || "30", 10);
const PASSWORD_RESET_OTP_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_OTP_TTL_MINUTES || "10", 10);
const PASSWORD_RESET_OTP_MAX_VERIFY_ATTEMPTS = parseInt(process.env.PASSWORD_RESET_OTP_MAX_VERIFY_ATTEMPTS || "5", 10);
const PASSWORD_RESET_OTP_MAX_RESENDS = parseInt(process.env.PASSWORD_RESET_OTP_MAX_RESENDS || "3", 10);
const PASSWORD_RESET_OTP_BLOCK_MINUTES = parseInt(process.env.PASSWORD_RESET_OTP_BLOCK_MINUTES || "30", 10);
const PASSWORD_RESET_SESSION_TTL_MINUTES = parseInt(process.env.PASSWORD_RESET_SESSION_TTL_MINUTES || "15", 10);
const ADMIN_LOGIN_OTP_MAX_VERIFY_ATTEMPTS = parseInt(process.env.ADMIN_LOGIN_OTP_MAX_VERIFY_ATTEMPTS || "5", 10);
const ADMIN_LOGIN_OTP_MAX_RESENDS = parseInt(process.env.ADMIN_LOGIN_OTP_MAX_RESENDS || "3", 10);
const ADMIN_LOGIN_OTP_BLOCK_MINUTES = parseInt(process.env.ADMIN_LOGIN_OTP_BLOCK_MINUTES || "30", 10);

const parseBooleanEnv = (value, fallback = false) => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return fallback;
};

const getTokenFromRequest = (req) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        return req.headers.authorization.split(' ')[1];
    }

    if (req.cookies.jwt) {
        return req.cookies.jwt;
    }

    return null;
};

const normalizeOtpiqPhoneNumber = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');

    if (!digits) {
        return '';
    }

    if (digits.startsWith('964')) {
        return digits;
    }

    if (digits.startsWith('0')) {
        return `964${digits.slice(1)}`;
    }

    return digits;
};

const normalizeOtpInput = (value) =>
    String(value || '')
        .trim()
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));

const generateOtpCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const hashOtpCode = (otpCode) =>
    crypto.createHash('sha256').update(String(otpCode)).digest('hex');

const sendLoginOtpWithOtpiq = async (phoneNumber, verificationCode) => {
    const apiKey = process.env.OTPIQ_API_KEY;
    const templateName = process.env.OTPIQ_TEMPLATE_NAME || 'order_otp';
    const whatsappAccountId = process.env.OTPIQ_WHATSAPP_ACCOUNT_ID;
    const whatsappPhoneId = process.env.OTPIQ_WHATSAPP_PHONE_ID;

    if (!apiKey) {
        throw new AppError('OTPIQ API key is missing from the server configuration.', 500);
    }

    if (!whatsappAccountId || !whatsappPhoneId) {
        throw new AppError('OTPIQ WhatsApp account configuration is missing from the server environment.', 500);
    }

    try {
        await axios.post(
            `${process.env.OTPIQ_BASE_URL || 'https://api.otpiq.com/api'}/sms`,
            {
                phoneNumber: normalizeOtpiqPhoneNumber(phoneNumber),
                smsType: 'whatsapp-template',
                provider: 'whatsapp',
                templateName,
                whatsappAccountId,
                whatsappPhoneId,
                templateParameters: {
                    body: {
                        1: String(verificationCode),
                    },
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            }
        );
    } catch (error) {
        const providerMessage =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message;
        throw new AppError(
            `فشل إرسال رمز التحقق عبر OTPIQ${providerMessage ? `: ${providerMessage}` : '.'}`,
            502
        );
    }
};

const resetSignupOtpSecurityState = (user) => {
    user.signupOtpVerifyAttempts = 0;
    user.signupOtpBlockedUntil = undefined;
};

const resetAdminLoginOtpSecurityState = (user) => {
    user.adminLoginOtpVerifyAttempts = 0;
    user.adminLoginOtpBlockedUntil = undefined;
};

const resetPasswordResetOtpSecurityState = (user) => {
    user.passwordResetOtpVerifyAttempts = 0;
    user.passwordResetOtpBlockedUntil = undefined;
};

const clearPasswordResetOtpState = (user) => {
    user.passwordResetOtpCode = undefined;
    user.passwordResetOtpExpires = undefined;
    user.passwordResetOtpResendCount = 0;
    user.passwordResetSessionToken = undefined;
    user.passwordResetSessionExpires = undefined;
    resetPasswordResetOtpSecurityState(user);
};

const createPasswordResetSessionToken = () => crypto.randomBytes(32).toString('hex');

const respondWithSignupOtpChallenge = (res, user, identifierKey = 'phone') => {
    res.status(200).json({
        status: 'success',
        otpRequired: true,
        message: 'تم إرسال رمز التحقق إلى رقم الهاتف.',
        data: {
            role: user.role,
            [identifierKey]: user[identifierKey],
            phone: user.phone,
        }
    });
};

const respondWithAdminLoginOtpChallenge = (res, user) => {
    res.status(200).json({
        status: 'success',
        otpRequired: true,
        message: 'تم إرسال رمز التحقق إلى رقم هاتف المدير.',
        data: {
            role: user.role,
            userID: user.userID,
            phone: user.phone,
        }
    });
};

const respondWithInactiveRestaurantAccount = (res, user, message = 'هذا الحساب غير مفعل بعد. يرجى انتظار موافقة الإدارة.') => {
    res.status(200).json({
        status: 'success',
        pendingApproval: true,
        message,
        data: {
            role: user.role,
            phone: user.phone,
            active: false,
        }
    });
};

const respondWithPasswordResetOtpChallenge = (res, user) => {
    res.status(200).json({
        status: 'success',
        otpRequired: true,
        message: 'تم إرسال رمز إعادة تعيين كلمة المرور إلى رقم الهاتف.',
        data: {
            role: user.role,
            phone: user.phone,
        }
    });
};

const setSignupOtpForUser = async (user, { isResend = false } = {}) => {
    const otpCode = generateOtpCode();

    if (user.signupOtpBlockedUntil && user.signupOtpBlockedUntil.getTime() > Date.now()) {
        throw new AppError('تم حظر طلبات رمز التحقق مؤقتًا. حاول مرة أخرى لاحقًا.', 429);
    }

    if (isResend) {
        const currentResends = Number(user.signupOtpResendCount || 0);
        if (currentResends >= SIGNUP_OTP_MAX_RESENDS) {
            throw new AppError('تم الوصول إلى الحد الأقصى لإعادة إرسال الرمز.', 429);
        }
        user.signupOtpResendCount = currentResends + 1;
    } else {
        user.signupOtpResendCount = 0;
    }

    user.signupOtpCode = hashOtpCode(otpCode);
    user.signupOtpExpires = Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000;
    resetSignupOtpSecurityState(user);
    await user.save({ validateBeforeSave: false });

    try {
        await sendLoginOtpWithOtpiq(user.phone, otpCode);
    } catch (error) {
        user.signupOtpCode = undefined;
        user.signupOtpExpires = undefined;
        if (isResend) {
            user.signupOtpResendCount = Math.max(Number(user.signupOtpResendCount || 1) - 1, 0);
        } else {
            user.signupOtpResendCount = 0;
        }
        await user.save({ validateBeforeSave: false });
        throw error;
    }
};

const setAdminLoginOtpForUser = async (user, { isResend = false } = {}) => {
    const otpCode = generateOtpCode();

    if (user.adminLoginOtpBlockedUntil && user.adminLoginOtpBlockedUntil.getTime() > Date.now()) {
        throw new AppError('تم حظر طلبات رمز التحقق مؤقتًا. حاول مرة أخرى لاحقًا.', 429);
    }

    if (isResend) {
        const currentResends = Number(user.adminLoginOtpResendCount || 0);
        if (currentResends >= ADMIN_LOGIN_OTP_MAX_RESENDS) {
            throw new AppError('تم الوصول إلى الحد الأقصى لإعادة إرسال الرمز.', 429);
        }
        user.adminLoginOtpResendCount = currentResends + 1;
    } else {
        user.adminLoginOtpResendCount = 0;
    }

    user.adminLoginOtpCode = hashOtpCode(otpCode);
    user.adminLoginOtpExpires = Date.now() + LOGIN_OTP_TTL_MINUTES * 60 * 1000;
    resetAdminLoginOtpSecurityState(user);
    await user.save({ validateBeforeSave: false });

    try {
        await sendLoginOtpWithOtpiq(user.phone, otpCode);
    } catch (error) {
        user.adminLoginOtpCode = undefined;
        user.adminLoginOtpExpires = undefined;
        if (isResend) {
            user.adminLoginOtpResendCount = Math.max(Number(user.adminLoginOtpResendCount || 1) - 1, 0);
        } else {
            user.adminLoginOtpResendCount = 0;
        }
        await user.save({ validateBeforeSave: false });
        throw error;
    }
};

const setPasswordResetOtpForUser = async (user, { isResend = false } = {}) => {
    const otpCode = generateOtpCode();

    if (user.passwordResetOtpBlockedUntil && user.passwordResetOtpBlockedUntil.getTime() > Date.now()) {
        throw new AppError('تم حظر طلبات إعادة تعيين كلمة المرور مؤقتًا. حاول مرة أخرى لاحقًا.', 429);
    }

    if (isResend) {
        const currentResends = Number(user.passwordResetOtpResendCount || 0);
        if (currentResends >= PASSWORD_RESET_OTP_MAX_RESENDS) {
            throw new AppError('تم الوصول إلى الحد الأقصى لإعادة إرسال رمز إعادة التعيين.', 429);
        }
        user.passwordResetOtpResendCount = currentResends + 1;
    } else {
        user.passwordResetOtpResendCount = 0;
    }

    user.passwordResetOtpCode = hashOtpCode(otpCode);
    user.passwordResetOtpExpires = Date.now() + PASSWORD_RESET_OTP_TTL_MINUTES * 60 * 1000;
    user.passwordResetSessionToken = undefined;
    user.passwordResetSessionExpires = undefined;
    resetPasswordResetOtpSecurityState(user);
    await user.save({ validateBeforeSave: false });

    try {
        await sendLoginOtpWithOtpiq(user.phone, otpCode);
    } catch (error) {
        clearPasswordResetOtpState(user);
        if (isResend) {
            user.passwordResetOtpResendCount = Math.max(Number(user.passwordResetOtpResendCount || 1) - 1, 0);
        }
        await user.save({ validateBeforeSave: false });
        throw error;
    }
};

const createPendingAccountAndSendOtp = async (Model, payload) => {
    const account = await Model.create({
        ...payload,
        active: false,
    });

    try {
        await setSignupOtpForUser(account);
    } catch (error) {
        await Model.findByIdAndDelete(account._id);
        throw error;
    }

    return account;
};

const verifySignupOtpForModel = (Model, { activateOnVerify = true, onSuccess } = {}) =>
    catchAsync(async (req, res, next) => {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return next(new AppError('يرجى إدخال رقم الهاتف ورمز التحقق.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+signupOtpCode +signupOtpExpires +signupOtpResendCount +signupOtpVerifyAttempts +signupOtpBlockedUntil');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        if (user.signupOtpBlockedUntil && user.signupOtpBlockedUntil.getTime() > Date.now()) {
            return next(new AppError('تم حظر إدخال رمز التحقق مؤقتًا. حاول مرة أخرى لاحقًا.', 429));
        }

        if (!user.signupOtpCode || !user.signupOtpExpires || user.signupOtpExpires.getTime() < Date.now()) {
            return next(new AppError('رمز التحقق غير صالح أو انتهت صلاحيته.', 400));
        }

        const hashedOtp = hashOtpCode(normalizeOtpInput(otp));
        if (hashedOtp !== user.signupOtpCode) {
            user.signupOtpVerifyAttempts = Number(user.signupOtpVerifyAttempts || 0) + 1;

            if (user.signupOtpVerifyAttempts >= SIGNUP_OTP_MAX_VERIFY_ATTEMPTS) {
                user.signupOtpBlockedUntil = new Date(Date.now() + SIGNUP_OTP_BLOCK_MINUTES * 60 * 1000);
                user.signupOtpVerifyAttempts = 0;
            }

            await user.save({ validateBeforeSave: false });
            return next(new AppError('رمز التحقق غير صحيح.', 400));
        }

        user.signupOtpCode = undefined;
        user.signupOtpExpires = undefined;
        user.signupOtpResendCount = 0;
        resetSignupOtpSecurityState(user);

        if (activateOnVerify) {
            user.active = true;
        }

        await user.save({ validateBeforeSave: false });

        if (onSuccess) {
            return onSuccess(res, user);
        }

        createSendToken(user, 200, res);
    });

const resendSignupOtpForModel = (Model) =>
    catchAsync(async (req, res, next) => {
        const { phone } = req.body;

        if (!phone) {
            return next(new AppError('يرجى إدخال رقم الهاتف.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+signupOtpCode +signupOtpExpires +signupOtpResendCount +signupOtpVerifyAttempts +signupOtpBlockedUntil');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        await setSignupOtpForUser(user, { isResend: true });

        respondWithSignupOtpChallenge(res, user);
    });

const requestPasswordResetOtpForModel = (Model) =>
    catchAsync(async (req, res, next) => {
        const { phone } = req.body;

        if (!phone) {
            return next(new AppError('يرجى إدخال رقم الهاتف.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+passwordResetOtpCode +passwordResetOtpExpires +passwordResetOtpResendCount +passwordResetOtpVerifyAttempts +passwordResetOtpBlockedUntil +passwordResetSessionToken +passwordResetSessionExpires');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        await setPasswordResetOtpForUser(user);
        respondWithPasswordResetOtpChallenge(res, user);
    });

const resendPasswordResetOtpForModel = (Model) =>
    catchAsync(async (req, res, next) => {
        const { phone } = req.body;

        if (!phone) {
            return next(new AppError('يرجى إدخال رقم الهاتف.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+passwordResetOtpCode +passwordResetOtpExpires +passwordResetOtpResendCount +passwordResetOtpVerifyAttempts +passwordResetOtpBlockedUntil +passwordResetSessionToken +passwordResetSessionExpires');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        await setPasswordResetOtpForUser(user, { isResend: true });
        respondWithPasswordResetOtpChallenge(res, user);
    });

const verifyPasswordResetOtpForModel = (Model) =>
    catchAsync(async (req, res, next) => {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return next(new AppError('يرجى إدخال رقم الهاتف ورمز التحقق.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+passwordResetOtpCode +passwordResetOtpExpires +passwordResetOtpResendCount +passwordResetOtpVerifyAttempts +passwordResetOtpBlockedUntil +passwordResetSessionToken +passwordResetSessionExpires');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        if (user.passwordResetOtpBlockedUntil && user.passwordResetOtpBlockedUntil.getTime() > Date.now()) {
            return next(new AppError('تم حظر إدخال رمز إعادة التعيين مؤقتًا. حاول مرة أخرى لاحقًا.', 429));
        }

        if (!user.passwordResetOtpCode || !user.passwordResetOtpExpires || user.passwordResetOtpExpires.getTime() < Date.now()) {
            return next(new AppError('رمز إعادة التعيين غير صالح أو انتهت صلاحيته.', 400));
        }

        const hashedOtp = hashOtpCode(normalizeOtpInput(otp));
        if (hashedOtp !== user.passwordResetOtpCode) {
            user.passwordResetOtpVerifyAttempts = Number(user.passwordResetOtpVerifyAttempts || 0) + 1;

            if (user.passwordResetOtpVerifyAttempts >= PASSWORD_RESET_OTP_MAX_VERIFY_ATTEMPTS) {
                user.passwordResetOtpBlockedUntil = new Date(Date.now() + PASSWORD_RESET_OTP_BLOCK_MINUTES * 60 * 1000);
                user.passwordResetOtpVerifyAttempts = 0;
            }

            await user.save({ validateBeforeSave: false });
            return next(new AppError('رمز إعادة التعيين غير صحيح.', 400));
        }

        user.passwordResetOtpCode = undefined;
        user.passwordResetOtpExpires = undefined;
        user.passwordResetOtpResendCount = 0;
        resetPasswordResetOtpSecurityState(user);
        user.passwordResetSessionToken = createPasswordResetSessionToken();
        user.passwordResetSessionExpires = new Date(Date.now() + PASSWORD_RESET_SESSION_TTL_MINUTES * 60 * 1000);
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            status: 'success',
            data: {
                resetToken: user.passwordResetSessionToken,
                role: user.role,
                phone: user.phone,
            }
        });
    });

const resetPasswordWithOtpForModel = (Model) =>
    catchAsync(async (req, res, next) => {
        const { phone, resetToken, password, passwordConfirm } = req.body;

        if (!phone || !resetToken || !password || !passwordConfirm) {
            return next(new AppError('البيانات المطلوبة غير مكتملة.', 400));
        }

        const user = await Model.findOne({ phone })
            .setOptions({ includeInactive: true })
            .select('+passwordResetSessionToken +passwordResetSessionExpires');

        if (!user) {
            return next(new AppError('الحساب غير موجود.', 404));
        }

        if (
            !user.passwordResetSessionToken ||
            user.passwordResetSessionToken !== resetToken ||
            !user.passwordResetSessionExpires ||
            user.passwordResetSessionExpires.getTime() < Date.now()
        ) {
            return next(new AppError('جلسة إعادة تعيين كلمة المرور غير صالحة أو منتهية.', 400));
        }

        user.password = password;
        user.passwordConfirm = passwordConfirm;
        clearPasswordResetOtpState(user);
        await user.save();

        res.status(200).json({
            status: 'success',
            message: 'تم تحديث كلمة المرور بنجاح.',
            data: {
                role: user.role,
                phone: user.phone,
            }
        });
    });

const verifyAdminLoginOtpHandler = catchAsync(async (req, res, next) => {
    const { userID, otp } = req.body;

    if (!userID || !otp) {
        return next(new AppError('يرجى إدخال اسم المستخدم ورمز التحقق.', 400));
    }

    const user = await Admin.findOne({ userID })
        .setOptions({ includeInactive: true })
        .select('+adminLoginOtpCode +adminLoginOtpExpires +adminLoginOtpResendCount +adminLoginOtpVerifyAttempts +adminLoginOtpBlockedUntil +password');

    if (!user) {
        return next(new AppError('الحساب غير موجود.', 404));
    }

    if (user.adminLoginOtpBlockedUntil && user.adminLoginOtpBlockedUntil.getTime() > Date.now()) {
        return next(new AppError('تم حظر إدخال رمز التحقق مؤقتًا. حاول مرة أخرى لاحقًا.', 429));
    }

    if (!user.adminLoginOtpCode || !user.adminLoginOtpExpires || user.adminLoginOtpExpires.getTime() < Date.now()) {
        return next(new AppError('رمز التحقق غير صالح أو انتهت صلاحيته.', 400));
    }

    if (hashOtpCode(normalizeOtpInput(otp)) !== user.adminLoginOtpCode) {
        user.adminLoginOtpVerifyAttempts = Number(user.adminLoginOtpVerifyAttempts || 0) + 1;

        if (user.adminLoginOtpVerifyAttempts >= ADMIN_LOGIN_OTP_MAX_VERIFY_ATTEMPTS) {
            user.adminLoginOtpBlockedUntil = new Date(Date.now() + ADMIN_LOGIN_OTP_BLOCK_MINUTES * 60 * 1000);
            user.adminLoginOtpVerifyAttempts = 0;
        }

        await user.save({ validateBeforeSave: false });
        return next(new AppError('رمز التحقق غير صحيح.', 400));
    }

    user.adminLoginOtpCode = undefined;
    user.adminLoginOtpExpires = undefined;
    user.adminLoginOtpResendCount = 0;
    resetAdminLoginOtpSecurityState(user);
    await user.save({ validateBeforeSave: false });

    createSendToken(user, 200, res);
});

const resendAdminLoginOtpHandler = catchAsync(async (req, res, next) => {
    const { userID } = req.body;

    if (!userID) {
        return next(new AppError('يرجى إدخال اسم المستخدم.', 400));
    }

    const user = await Admin.findOne({ userID })
        .setOptions({ includeInactive: true })
        .select('+adminLoginOtpCode +adminLoginOtpExpires +adminLoginOtpResendCount +adminLoginOtpVerifyAttempts +adminLoginOtpBlockedUntil');

    if (!user) {
        return next(new AppError('الحساب غير موجود.', 404));
    }

    await setAdminLoginOtpForUser(user, { isResend: true });
    respondWithAdminLoginOtpChallenge(res, user);
});

// *** jwt token ***
const signToken = (id)=>{
    return jwt.sign({id}, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN
    })
}

const buildJwtCookieOptions = () => {
    const secureCookies = parseBooleanEnv(
        process.env.JWT_COOKIE_SECURE,
        process.env.NODE_ENV === 'production'
    );
    const sameSite = process.env.JWT_COOKIE_SAMESITE ||
        (secureCookies ? 'none' : 'lax');
    const cookieOptions = {
        expires: new Date(
            Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        sameSite,
        secure: secureCookies,
        path: process.env.JWT_COOKIE_PATH || '/',
    };

    if (process.env.JWT_COOKIE_DOMAIN) {
        cookieOptions.domain = process.env.JWT_COOKIE_DOMAIN;
    }

    return cookieOptions;
};

// *** jwt token ***
const createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);
    const cookieOptions = buildJwtCookieOptions();
    res.cookie('jwt', token, cookieOptions);
    user.password = undefined;

    res.status(statusCode).json({
        status: 'success',
        token: token,
        data: {
            user
        }
    });
};

// *** To create new admin ***
exports.signupAdmin = catchAsync(async (req, res, next)=>{
    const user = await Admin.create({
        userID: '12345678',
        password: '12345678',
        passwordConfirm: '12345678',
    });
    createSendToken(user, 201, res);
})

// *** To create new user ***
exports.signupUser = catchAsync(async (req, res, next) => {
    const { phone, name, password } = req.body;
    const user = await createPendingAccountAndSendOtp(User, {
        name:name,
        phone:phone,
        password: password,
        passwordConfirm: password,
    });
    respondWithSignupOtpChallenge(res, user);
});

// *** To create new Restaurant ***
exports.signupRestaurant = catchAsync(async (req, res, next)=>{
    const restaurant = await createPendingAccountAndSendOtp(Restaurant, {
        name: req.body.name,
        phone: req.body.phone,
        password: req.body.password,
        passwordConfirm: req.body.password,
        location: req.body.location,
    });
    respondWithSignupOtpChallenge(res, restaurant);
})

// *** To create new Delivery ***
exports.signupDelivery = catchAsync(async (req, res, next)=>{
    const delivery = await Delivery.create({
        name: req.body.name,
        userID: req.body.userID,
        password: req.body.password,
        passwordConfirm: req.body.passwordConfirm,
        restaurantId: req.user.id,
        phone: req.body.phone,
    });
    res.status(200).json({
        status: 'success',
        data: {
            user: delivery
        }
    });
})

// *** To user login ***
exports.loginUser = catchAsync(async (req, res, next) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return next(new AppError('يرجى إدخال رقم الهاتف وكلمة المرور!', 400));
    }
    const user = await User.findOne({ phone })
        .setOptions({ includeInactive: true })
        .select('+password +active +signupOtpCode +signupOtpExpires');

    if (!user || !(await user.correctPassword(password, user.password))) {
        return next(new AppError('رقم الهاتف أو كلمة المرور غير صحيحة!', 401));
    }

    if (user.active === false) {
        await setSignupOtpForUser(user);
        return respondWithSignupOtpChallenge(res, user);
    }

    createSendToken(user, 200, res);
});

// *** To login Restaurant ***
exports.loginRestaurant = catchAsync(async (req, res, next) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return next(new AppError('يرجى إدخال رقم الهاتف وكلمة المرور!', 400));
    }
    const user = await Restaurant.findOne({ phone })
        .setOptions({ includeInactive: true })
        .populate('delivery')
        .select('+password +signupOtpCode +signupOtpExpires');

    if (!user || !(await user.correctPassword(password, user.password))) {
        return next(new AppError('رقم الهاتف أو كلمة المرور غير صحيحة!', 401));
    }

    if (user.active === false) {
        if (user.signupOtpCode || user.signupOtpExpires) {
            await setSignupOtpForUser(user);
            return respondWithSignupOtpChallenge(res, user);
        }

        return respondWithInactiveRestaurantAccount(res, user);
    }

    createSendToken(user, 200, res);
});

// *** To login Delivery ***
exports.loginDelivery = catchAsync(async (req, res, next) => {
    const { userID, password } = req.body;
    if (!userID || !password) {
        return next(new AppError('يرجى إدخال اسم المستخدم وكلمة المرور!', 400));
    }
    const user = await Delivery.findOne({ userID }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
        return next(new AppError('اسم المستخدم أو كلمة المرور غير صحيحة!', 401));
    }

    createSendToken(user, 200, res);
});

// *** To login Admin ***
exports.loginAdmin = catchAsync(async (req, res, next) => {
    const { userID, password } = req.body;
    if (!userID || !password) {
        return next(new AppError('يرجى إدخال اسم المستخدم وكلمة المرور!', 400));
    }
    const user = await Admin.findOne({ userID }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
        return next(new AppError('اسم المستخدم أو كلمة المرور غير صحيحة!', 401));
    }

    await setAdminLoginOtpForUser(user);
    respondWithAdminLoginOtpChallenge(res, user);
});

// *** To Protecting Routes ***
exports.protect = Model => catchAsync(async (req, res, next) => {
    let token = getTokenFromRequest(req);
    if (!token) {
        return next(new AppError('أنت غير مسجل الدخول! يرجى تسجيل الدخول للوصول.', 401));
    }
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const currentUser = await Model.findById(decoded.id);
    if (!currentUser) {
        return next(new AppError('المستخدم المرتبط بهذا التوكن لم يعد موجودًا.', 401));
    }
    req.user = currentUser;
    res.locals.user = currentUser;
    next();
});

exports.protectAnyRole = catchAsync(async (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (!token) {
        return next(new AppError('أنت غير مسجل الدخول! يرجى تسجيل الدخول للوصول.', 401));
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const models = [Admin, User, Delivery, Restaurant];

    let currentUser = null;

    for (const Model of models) {
        currentUser = await Model.findById(decoded.id);
        if (currentUser) {
            break;
        }
    }

    if (!currentUser) {
        return next(new AppError('المستخدم المرتبط بهذا التوكن لم يعد موجودًا.', 401));
    }

    req.user = currentUser;
    res.locals.user = currentUser;
    next();
});

exports.checkToken = catchAsync(async (req, res, next) => {
    const token = getTokenFromRequest(req);

    if (!token) {
        return next(new AppError('أنت غير مسجل الدخول! يرجى إرسال التوكن أولاً.', 401));
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const models = [Admin, User, Delivery, Restaurant];

    let currentUser = null;

    for (const Model of models) {
        currentUser = await Model.findById(decoded.id);
        if (currentUser) break;
    }

    if (!currentUser) {
        return next(new AppError('المستخدم المرتبط بهذا التوكن لم يعد موجودًا.', 401));
    }

    currentUser.password = undefined;

    res.status(200).json({
        status: 'success',
        valid: true,
        data: {
            user: currentUser
        }
    });
});

// *** To user logout ***
exports.logout = catchAsync(async (req, res, next)=>{
    const cookieOptions = {
        ...buildJwtCookieOptions(),
        expires: new Date(0),
    };

    res.clearCookie('jwt', cookieOptions);
    res.clearCookie('id', cookieOptions);
    res.status(201).json({
        status: 'success',
    })
})

// *** User authorization ***
exports.restrictTo = (...roles)=>{
    return (req, res, next)=>{
        if (!roles.includes(req.user.role)){
            return next(new AppError('ليس لديك الصلاحية لتنفيذ هذا الإجراء', 403));
        }
        next()
    }
}

// *** if user forgot Password ***
exports.forgotPassword = catchAsync(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        return next(new AppError('لا يوجد مستخدم بهذا البريد الإلكتروني.', 404));
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetURL = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;
    const message = `هل نسيت كلمة المرور؟ أرسل طلب PATCH مع كلمة مرور جديدة إلى: ${resetURL}.\nإذا لم تطلب إعادة تعيين كلمة المرور، فتجاهل هذه الرسالة.`;

    try {
        await sendEmail({
            email: user.email,
            subject: 'رمز إعادة تعيين كلمة المرور (صالح لمدة 10 دقائق)',
            message
        });

        res.status(200).json({
            status: 'success',
            message: 'تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني!'
        });
    } catch (err) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });

        return next(new AppError('حدث خطأ أثناء إرسال البريد الإلكتروني. حاول مرة أخرى لاحقًا!', 500));
    }
});

// *** To reset user Password ***
exports.resetPassword = catchAsync(async (req, res, next) => {
    const hashedToken = crypto
        .createHash('sha256')
        .update(req.params.token)
        .digest('hex');

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
        return next(new AppError('الرمز غير صالح أو انتهت صلاحيته', 400));
    }
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    createSendToken(user, 200, res);
});

// *** To update user password ***
exports.updatePassword = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.correctPassword(req.body.passwordConfirm, user.password))) {
        return next(new AppError('كلمة المرور الحالية غير صحيحة.', 401));
    }
    user.password = req.body.password;
    user.passwordConfirm = req.body.password;
    await user.save();
    createSendToken(user, 200, res);
});

exports.verifyUserSignupOtp = verifySignupOtpForModel(User);
exports.verifyRestaurantSignupOtp = verifySignupOtpForModel(Restaurant, {
    activateOnVerify: false,
    onSuccess: (res, user) =>
        respondWithInactiveRestaurantAccount(
            res,
            user,
            'تم إنشاء حساب المطعم بنجاح، لكنه غير مفعل بعد. يرجى انتظار موافقة الإدارة قبل استخدام التطبيق.'
        ),
});
exports.resendUserSignupOtp = resendSignupOtpForModel(User);
exports.resendRestaurantSignupOtp = resendSignupOtpForModel(Restaurant);

exports.verifyAdminLoginOtp = verifyAdminLoginOtpHandler;
exports.resendAdminLoginOtp = resendAdminLoginOtpHandler;

exports.requestUserPasswordResetOtp = requestPasswordResetOtpForModel(User);
exports.requestRestaurantPasswordResetOtp = requestPasswordResetOtpForModel(Restaurant);
exports.resendUserPasswordResetOtp = resendPasswordResetOtpForModel(User);
exports.resendRestaurantPasswordResetOtp = resendPasswordResetOtpForModel(Restaurant);
exports.verifyUserPasswordResetOtp = verifyPasswordResetOtpForModel(User);
exports.verifyRestaurantPasswordResetOtp = verifyPasswordResetOtpForModel(Restaurant);
exports.resetUserPasswordWithOtp = resetPasswordWithOtpForModel(User);
exports.resetRestaurantPasswordWithOtp = resetPasswordWithOtpForModel(Restaurant);
