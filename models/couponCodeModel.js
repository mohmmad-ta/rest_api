const mongoose = require('mongoose');

const couponCodeSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: [true, 'يرجى إدخال كود الخصم'],
            trim: true,
            uppercase: true,
            minlength: [3, 'كود الخصم يجب ألا يقل عن 3 أحرف'],
            maxlength: [20, 'كود الخصم يجب ألا يزيد عن 20 حرفًا'],
        },
        userId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'يرجى تحديد المستخدم'],
        },
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: [true, 'يرجى تحديد المطعم'],
        },
        totalAmount: {
            type: Number,
            required: [true, 'يرجى إدخال مبلغ الخصم'],
            min: [1, 'مبلغ الخصم يجب أن يكون 1 على الأقل'],
        },
        remainingAmount: {
            type: Number,
            min: [0, 'المبلغ المتبقي لا يمكن أن يكون سالباً'],
        },
        expiresAt: {
            type: Date,
            required: [true, 'يرجى إدخال تاريخ انتهاء الصلاحية'],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

couponCodeSchema.index({ code: 1, restaurantId: 1, userId: 1 }, { unique: true });

// Initialize remainingAmount to totalAmount on first save
couponCodeSchema.pre('save', function (next) {
    if (this.isNew) {
        this.remainingAmount = this.totalAmount;
    }
    next();
});

const CouponCode = mongoose.model('CouponCode', couponCodeSchema);
module.exports = CouponCode;
