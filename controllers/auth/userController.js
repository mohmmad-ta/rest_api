const User = require('../../models/auth/userModel');
const catchAsync = require('../../utils/catchAsync');
const Delivery = require("../../models/auth/deliveryModel");
const CouponCode = require("../../models/couponCodeModel");


const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

exports.getMe = async (req, res, next) => {
    console.log(req.user.id)
    const user = await User.findById(req.user.id);
    res.status(200).json({
        status: 'success',
        data: user
    });
};

exports.updateMe = catchAsync(async (req, res, next) => {
    const filteredBody = filterObj(req.body, 'location');
    const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
        new: true,
        runValidators: true
    });

    res.status(200).json({
        status: 'success',
        data: {
            user: updatedUser
        }
    });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
    await User.findByIdAndUpdate(req.user.id, { active: false });

    res.status(204).json({
        status: 'success',
        data: null
    });
});

// GET /auth/user/coupons — list the current user's own coupons with balances.
exports.getMyCoupons = catchAsync(async (req, res) => {
    const coupons = await CouponCode.find({ userId: req.user.id })
        .populate('restaurantId', 'name image')
        .sort('-createdAt');

    const now = Date.now();
    const data = coupons.map((coupon) => {
        const remaining = typeof coupon.remainingAmount === 'number'
            ? coupon.remainingAmount
            : coupon.totalAmount;
        const isExpired = coupon.expiresAt ? new Date(coupon.expiresAt).getTime() < now : false;
        const isDepleted = remaining <= 0;

        return {
            id: coupon._id,
            code: coupon.code,
            restaurant: coupon.restaurantId || null,
            totalAmount: coupon.totalAmount,
            remainingAmount: remaining,
            expiresAt: coupon.expiresAt,
            status: isDepleted ? 'depleted' : isExpired ? 'expired' : 'active',
        };
    });

    res.status(200).json({
        status: 'success',
        results: data.length,
        data,
    });
});
