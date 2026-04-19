const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
        userID: {
            type: String,
            required: [true, 'يرجى إدخال id المستخدم'],
            unique: [true, 'id مسجل مسبقًا'],
        },
        phone: {
            type: String,
            required: [true, 'يرجى إدخال رقم الهاتف'],
            unique: [true, 'رقم الهاتف مسجل مسبقًا'],
            trim: true,
        },
        role: {
            type: String,
            enum: ['admin'],
            default: 'admin'
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
                validator: function(el) {
                    return el === this.password;
                },
                message: 'كلمتا المرور غير متطابقتين!'
            }
        },
        passwordChangedAt: Date,
        passwordResetToken: String,
        passwordResetExpires: Date,
        active: {
            type: Boolean,
            default: true,
            select: false
        },
        adminLoginOtpCode: {
            type: String,
            select: false
        },
        adminLoginOtpExpires: {
            type: Date,
            select: false
        },
        adminLoginOtpResendCount: {
            type: Number,
            default: 0,
            select: false
        },
        adminLoginOtpVerifyAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        adminLoginOtpBlockedUntil: {
            type: Date,
            select: false
        }
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    });

adminSchema.pre('save',  async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;
})
adminSchema.pre(/^find/, function (next) {
    if (!this.getOptions().includeInactive) {
        this.find({active: {$ne: false}})
    }
    next()
})
adminSchema.pre('save', function(next) {
    if (!this.isModified('password') || this.isNew) return next();

    this.passwordChangedAt = Date.now() - 1000;
    next();
});

adminSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

adminSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
            this.passwordChangedAt.getTime() / 1000,
            10
        );

        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

adminSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin
