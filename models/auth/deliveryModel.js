const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const deliverySchema = new mongoose.Schema({
        name: {
            type: String,
            required: [true, 'يرجى إدخال اسمك']
        },
        userID: {
            type: String,
            required: [true, 'يرجى إدخال id المستخدم'],
            unique: [true, 'رقم id مسجل مسبقًا'],
            lowercase: true,
        },
        role: {
            type: String,
            enum: ['delivery'],
            default: 'delivery'
        },
        phone: {
            type: String,
            required: [true, 'يرجى إدخال رقم الهاتف'],
            unique: [true, 'رقم الهاتف مسجل مسبقًا'],
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
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant'
        },
        active: {
            type: Boolean,
            default: true,
            select: false
        }
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    });

deliverySchema.pre('save',  async function (next) {
    if (!this.isModified('password')) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;
})
deliverySchema.pre(/^find/, function (next) {
    this.find({active: {$ne: false}})
    next()
})
deliverySchema.pre('save', function(next) {
    if (!this.isModified('password') || this.isNew) return next();

    this.passwordChangedAt = Date.now() - 1000;
    next();
});

deliverySchema.methods.correctPassword = async function(candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

deliverySchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
            this.passwordChangedAt.getTime() / 1000,
            10
        );

        return JWTTimestamp < changedTimestamp;
    }
    return false;
};

deliverySchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

const Delivery = mongoose.model('Delivery', deliverySchema);
module.exports = Delivery
