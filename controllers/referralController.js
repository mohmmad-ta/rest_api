const crypto = require('crypto');
const Referral = require('../models/referralModel');
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

const createUniqueReferral = async (referrerUserId) => {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
        const code = buildReferralCode();
        try {
            // eslint-disable-next-line no-await-in-loop
            return await Referral.create({ referrerUserId, code });
        } catch (error) {
            // Duplicate code (unique index) -> retry with a fresh code
            if (error?.code === 11000) {
                continue;
            }
            throw error;
        }
    }
    return null;
};

// POST /auth/user/referral
// A user generates a new referral link to send to a restaurant.
exports.generateReferralLink = catchAsync(async (req, res, next) => {
    const referral = await createUniqueReferral(req.user.id);

    if (!referral) {
        return next(new AppError('تعذر إنشاء كود إحالة فريد. يرجى المحاولة مرة أخرى.', 500));
    }

    res.status(201).json({
        status: 'success',
        data: {
            id: referral._id,
            code: referral.code,
            link: buildReferralLink(referral.code),
            status: referral.status,
            createdAt: referral.createdAt,
        },
    });
});

// GET /auth/user/referral
// List the current user's referrals with their statuses.
exports.getMyReferrals = catchAsync(async (req, res) => {
    const referrals = await Referral.find({ referrerUserId: req.user.id })
        .populate('referredRestaurantId', 'name phone')
        .sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: referrals.length,
        data: referrals.map((referral) => ({
            id: referral._id,
            code: referral.code,
            link: buildReferralLink(referral.code),
            status: referral.status,
            referredRestaurant: referral.referredRestaurantId || null,
            registeredAt: referral.registeredAt,
            rewardedAt: referral.rewardedAt,
            createdAt: referral.createdAt,
        })),
    });
});
