const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
    {
        // The user who generated this referral and will receive the reward coupon
        referrerUserId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'يرجى تحديد المستخدم صاحب الإحالة'],
            index: true,
        },
        // Shareable, human-typable code embedded in the referral link
        code: {
            type: String,
            required: [true, 'كود الإحالة مطلوب'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        // pending   -> link generated, no restaurant has signed up yet
        // registered -> a restaurant signed up using this code (awaiting admin approval)
        // rewarded   -> admin approved the restaurant and the reward coupon was issued
        status: {
            type: String,
            enum: ['pending', 'registered', 'rewarded'],
            default: 'pending',
        },
        // Set when a restaurant signs up using this code (future signup-capture step)
        referredRestaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            default: null,
        },
        // Set when the reward coupon is issued (future approval-reward step)
        rewardCouponId: {
            type: mongoose.Schema.ObjectId,
            ref: 'CouponCode',
            default: null,
        },
        registeredAt: {
            type: Date,
            default: null,
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

const Referral = mongoose.model('Referral', referralSchema);
module.exports = Referral;
