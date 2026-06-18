const mongoose = require('mongoose');

// One claim per restaurant that signed up using a referral code.
// A restaurant can only be claimed once (unique restaurantId).
const referralClaimSchema = new mongoose.Schema(
    {
        referralId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Referral',
            required: true,
        },
        // Denormalized for convenient lookups / rewarding
        referrerUserId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: true,
            unique: true,
        },
        // registered -> restaurant signed up (awaiting admin approval)
        // done       -> admin approved the restaurant and the reward coupon was issued
        status: {
            type: String,
            enum: ['registered', 'done'],
            default: 'registered',
        },
        rewardCouponId: {
            type: mongoose.Schema.ObjectId,
            ref: 'CouponCode',
            default: null,
        },
        registeredAt: {
            type: Date,
            default: Date.now,
        },
        rewardedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

const ReferralClaim = mongoose.model('ReferralClaim', referralClaimSchema);
module.exports = ReferralClaim;
