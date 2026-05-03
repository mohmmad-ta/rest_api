const mongoose = require('mongoose');
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const restaurantSchema = new mongoose.Schema({
        name: {
            type: String,
            required: [true, 'يرجى إدخال اسم المطعم'],
            unique: true,
            trim: true,
            maxlength: [40, 'اسم المطعم يجب ألا يزيد عن 40 حرفًا'],
            minlength: [3, 'اسم المطعم يجب ألا يقل عن 3 أحرف']
        },
        phone: {
            type: String,
            trim: true,
            unique: [true, 'رقم الهاتف مسجل مسبقًا'],
            required: [true, 'يرجى إدخال رقم الهاتف']
        },
        discount: {
            type: Number,
            trim: true,
            enum: [0, 10, 15, 20, 25, 30, 35, 40, 45, 50],
            default: 0
        },
        ratingsAverage: {
            type: Number,
            default: 1,
            min: [1, 'التقييم يجب أن يكون أكبر من 1.0'],
            max: [5, 'التقييم يجب أن يكون أقل من 5.0'],
            set: (val) => Math.round(val * 10) / 10, // round to 1 decimal
        },
        ratingsQuantity: {
            type: Number,
            default: 0,
        },
        image: {
            type: String,
            default: 'https://rest.napoltech.com/public/images/users/user.png'
        },
        role: {
            type: String,
            enum: ['restaurant'],
            default: 'restaurant'
        },
        deliveryTime: {
            type: String,
            default: '15 - 25'
        },
        workingHours: {
            open: {
                type: String,
                default: '09:00'
            },
            close: {
                type: String,
                default: '23:00'
            }
        },
        location: {
            title: {
                type: String,
                required: [true, 'يرجى إدخال عنوان موقع المطعم']
            },
            latitude: {
                type: Number,
                required: [true, 'يرجى إدخال خط العرض']
            },
            longitude: {
                type: Number,
                required: [true, 'يرجى إدخال خط الطول']
            }
        },
        active: {
            type: Boolean,
            default: false,
        },
        deleted: {
            type: Boolean,
            default: false,
            select: false
        },
        password: {
            type: String,
            required: [true, 'يرجى إدخال كلمة المرور'],
            minlength: [8, 'كلمة المرور يجب ألا تقل عن 8 أحرف'],
            select: false
        },
        passwordConfirm: {
            type: String,
            required: [true, 'يرجى تأكيد كلمة المرور'],
            validate: {
                validator: function (el) {
                    return el === this.password;
                },
                message: 'كلمتا المرور غير متطابقتين!'
            }
        },
        passwordChangedAt: Date,
        passwordResetToken: String,
        passwordResetExpires: Date,
        signupOtpCode: {
            type: String,
            select: false
        },
        signupOtpExpires: {
            type: Date,
            select: false
        },
        signupOtpResendCount: {
            type: Number,
            default: 0,
            select: false
        },
        signupOtpVerifyAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        signupOtpBlockedUntil: {
            type: Date,
            select: false
        },
        passwordResetOtpCode: {
            type: String,
            select: false
        },
        passwordResetOtpExpires: {
            type: Date,
            select: false
        },
        passwordResetOtpResendCount: {
            type: Number,
            default: 0,
            select: false
        },
        passwordResetOtpVerifyAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        passwordResetOtpBlockedUntil: {
            type: Date,
            select: false
        },
        passwordResetSessionToken: {
            type: String,
            select: false
        },
        passwordResetSessionExpires: {
            type: Date,
            select: false
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    });



restaurantSchema.pre(/^find/, function (next) {
    const filter = {deleted: {$ne: true}};
    if (!this.getOptions().includeInactive) {
        filter.active = {$ne: false};
    }
    this.find(filter)
    next()
})
restaurantSchema.virtual('delivery', {
    ref: 'Delivery',
    foreignField: 'restaurantId',
    localField: '_id'
});
restaurantSchema.virtual('meal', {
    ref: 'Meal',
    foreignField: 'restaurantId',
    localField: '_id'
});

restaurantSchema.pre('save',  async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;
})

restaurantSchema.pre('save', function(next) {
    if (!this.isModified('password') || this.isNew) return next();

    this.passwordChangedAt = Date.now() - 1000;
    next();
});

restaurantSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

restaurantSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
            this.passwordChangedAt.getTime() / 1000,
            10
        );

        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

restaurantSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
module.exports = Restaurant
