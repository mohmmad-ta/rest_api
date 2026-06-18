const mongoose = require('mongoose');

// One permanent referral code per user. The same code can be used by many
// restaurants; each restaurant's signup + reward is tracked in ReferralClaim.
const referralSchema = new mongoose.Schema(
    {
        referrerUserId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'يرجى تحديد المستخدم صاحب الإحالة'],
            unique: true, // exactly one code per user
        },
        code: {
            type: String,
            required: [true, 'كود الإحالة مطلوب'],
            unique: true,
            uppercase: true,
            trim: true,
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
