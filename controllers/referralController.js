const crypto = require('crypto');
const Referral = require('../models/referralModel');
const ReferralClaim = require('../models/referralClaimModel');
const AppSetting = require('../models/appSettingModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Base URL for the shareable referral/landing link. The custom (no-service) flow
// points the restaurant to a landing page that shows the code + app-store links.
const REFERRAL_LINK_BASE_URL =
    process.env.REFERRAL_LINK_BASE_URL || 'https://khaleeaapp.com/invite';

// Unambiguous, human-typable charset (no 0/O, 1/I/L) because the restaurant
// enters the code manually at signup.
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 5;

const buildReferralCode = () => {
    let code = '';
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
    }
    return code;
};

const buildReferralLink = (code) => `${REFERRAL_LINK_BASE_URL}/${code}`;

// Return the user's single permanent referral, creating it on first request.
const getOrCreateReferral = async (referrerUserId) => {
    const existing = await Referral.findOne({ referrerUserId });
    if (existing) {
        return existing;
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
        const code = buildReferralCode();
        try {
            // eslint-disable-next-line no-await-in-loop
            return await Referral.create({ referrerUserId, code });
        } catch (error) {
            // Another request created it first -> return that one
            if (error?.code === 11000 && error?.keyPattern?.referrerUserId) {
                // eslint-disable-next-line no-await-in-loop
                return Referral.findOne({ referrerUserId });
            }
            // Duplicate code -> retry with a fresh code
            if (error?.code === 11000) {
                continue;
            }
            throw error;
        }
    }
    return null;
};

const serializeClaim = (claim) => ({
    id: claim._id,
    restaurant: claim.restaurantId || null,
    status: claim.status,
    registeredAt: claim.registeredAt,
    rewardedAt: claim.rewardedAt,
    createdAt: claim.createdAt,
});

// POST /auth/user/referral
// Returns the user's single permanent referral link (creating it if needed).
exports.generateReferralLink = catchAsync(async (req, res, next) => {
    const settings = await AppSetting.getSettings();

    if (!settings.referralsEnabled) {
        return next(new AppError('برنامج الإحالة متوقف حالياً.', 403, {
            code: 'REFERRALS_DISABLED',
        }));
    }

    const referral = await getOrCreateReferral(req.user.id);

    if (!referral) {
        return next(new AppError('تعذر إنشاء كود إحالة فريد. يرجى المحاولة مرة أخرى.', 500));
    }

    res.status(200).json({
        status: 'success',
        data: {
            code: referral.code,
            link: buildReferralLink(referral.code),
            createdAt: referral.createdAt,
        },
    });
});

// GET /auth/user/referral
// Returns the user's permanent code/link (if any), the list of restaurants that
// used it, and whether the referral program is enabled.
exports.getMyReferrals = catchAsync(async (req, res) => {
    const [settings, referral, claims] = await Promise.all([
        AppSetting.getSettings(),
        Referral.findOne({ referrerUserId: req.user.id }),
        ReferralClaim.find({ referrerUserId: req.user.id })
            .populate('restaurantId', 'name phone')
            .sort('-createdAt'),
    ]);

    res.status(200).json({
        status: 'success',
        enabled: settings.referralsEnabled,
        code: referral?.code || null,
        link: referral ? buildReferralLink(referral.code) : null,
        results: claims.length,
        data: claims.map(serializeClaim),
    });
});
