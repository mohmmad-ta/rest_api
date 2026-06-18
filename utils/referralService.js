const crypto = require('crypto');
const Referral = require('../models/referralModel');
const ReferralClaim = require('../models/referralClaimModel');
const CouponCode = require('../models/couponCodeModel');
const Restaurant = require('../models/auth/restaurantModel');
const AppSetting = require('../models/appSettingModel');
const { createInAppNotification } = require('../controllers/notificationController');
const { sendPushToExternalUser } = require('./oneSignal');

// Reward configuration for a successful referral
const REWARD_AMOUNT = 25000;
const REWARD_VALIDITY_DAYS = 30; // ~1 month

const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const buildCouponCode = (length = 8) => {
    const bytes = crypto.randomBytes(length);
    let code = 'KH';
    for (let i = 0; i < length; i += 1) {
        code += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
    }
    return code;
};

// When a restaurant signs up with a referral code, record a claim for it.
// A restaurant can only be claimed once (unique restaurantId), and the code
// must belong to a real referral. Returns the claim, or null if not applicable.
const claimReferralAtSignup = async (code, restaurantId) => {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode || !restaurantId) {
        return null;
    }

    const referral = await Referral.findOne({ code: normalizedCode });
    if (!referral) {
        return null; // invalid code
    }

    try {
        return await ReferralClaim.create({
            referralId: referral._id,
            referrerUserId: referral.referrerUserId,
            restaurantId,
            status: 'registered',
            registeredAt: new Date(),
        });
    } catch (error) {
        if (error?.code === 11000) {
            return null; // this restaurant was already claimed
        }
        throw error;
    }
};

const notifyReferrer = async (userId, restaurantName, couponCode) => {
    const title = 'You earned a referral reward!';
    const titleAr = 'حصلت على مكافأة الإحالة!';
    const body = `Your invited restaurant ${restaurantName} was approved. Use code ${couponCode} for a ${REWARD_AMOUNT} discount.`;
    const bodyAr = `تمت الموافقة على المطعم ${restaurantName} الذي قمت بدعوته. استخدم الكود ${couponCode} للحصول على خصم بقيمة ${REWARD_AMOUNT}.`;
    const data = { type: 'referral-reward', code: couponCode, restaurantName, screen: 'notification' };

    await Promise.all([
        createInAppNotification({
            recipientId: userId,
            recipientRole: 'user',
            type: 'referral-reward',
            title,
            titleAr,
            message: body,
            messageAr: bodyAr,
            screen: 'notification',
            data,
        }),
        sendPushToExternalUser(`user:${userId}`, { title, titleAr, body, bodyAr, data }),
    ]);
};

// Called when an admin activates a restaurant. If that restaurant came from a
// referral claim that hasn't been rewarded yet, issue the reward coupon to the
// referrer and mark the claim done. Idempotent: only a 'registered' claim is
// processed, so it runs at most once per restaurant.
const finalizeReferralReward = async (restaurantId) => {
    const settings = await AppSetting.getSettings();
    if (!settings.referralsEnabled) {
        return null; // referral program is turned off
    }

    const claim = await ReferralClaim.findOne({
        restaurantId,
        status: 'registered',
    });

    if (!claim) {
        return null;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REWARD_VALIDITY_DAYS);

    let coupon = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            coupon = await CouponCode.create({
                code: buildCouponCode(),
                userId: claim.referrerUserId,
                restaurantId,
                totalAmount: REWARD_AMOUNT,
                expiresAt,
            });
            break;
        } catch (error) {
            if (error?.code === 11000) {
                continue; // duplicate code -> retry
            }
            throw error;
        }
    }

    if (!coupon) {
        return null;
    }

    claim.status = 'done';
    claim.rewardedAt = new Date();
    claim.rewardCouponId = coupon._id;
    await claim.save();

    // Notify the referrer (best-effort)
    try {
        const restaurant = await Restaurant.findById(restaurantId)
            .setOptions({ includeInactive: true })
            .select('name');
        await notifyReferrer(claim.referrerUserId, restaurant?.name || '', coupon.code);
    } catch (error) {
        console.error('Failed to notify referrer:', error?.message || error);
    }

    return { claim, coupon };
};

module.exports = {
    claimReferralAtSignup,
    finalizeReferralReward,
    REWARD_AMOUNT,
    REWARD_VALIDITY_DAYS,
};
