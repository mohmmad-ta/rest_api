const User = require('../../models/auth/userModel');
const Admin = require('../../models/auth/adminModel');
const catchAsync = require('../../utils/catchAsync');
const Delivery = require("../../models/auth/deliveryModel");
const Restaurant = require("../../models/auth/restaurantModel");
const Order = require("../../models/orderModel");
const Meal = require("../../models/mealModel");
const Category = require("../../models/categoryModel");
const CouponCode = require("../../models/couponCodeModel");
const AppSetting = require("../../models/appSettingModel");
const AppError = require('../../utils/appError');
const APIFeatures = require("../../utils/apiFeatures");
const factory = require('./../handlerFactory');
const { createInAppNotification } = require('../notificationController');
const { sendPushToExternalUser } = require('../../utils/oneSignal');
const { finalizeReferralReward } = require('../../utils/referralService');

exports.getMeAdmin = async (req, res, next) => {
    req.params.id = req.user.id;
    const user = await Admin.findById(req.params.id);
    res.status(200).json({
        status: 'success',
        data: user
    });
};


// ###  === CRUD User ===  ###
exports.adminGetUser = factory.getOne(User);
exports.adminGetAllUsers = factory.getAll(User);

// Do NOT update passwords with this!
exports.adminUpdateUser = factory.updateOne(User);
exports.adminDeleteUser = factory.deleteOne(User);

// ###  === CRUD Delivery ===  ###
exports.adminGetDelivery = catchAsync(async (req, res) => {
    const user = await Delivery.findById(req.params.id).populate('restaurantId', 'name phone');
    res.status(200).json({
        status: 'success',
        data: user
    });
});
exports.adminGetAllDelivery = catchAsync(async (req, res) => {
    const features = new APIFeatures(Delivery.find().populate('restaurantId', 'name phone'), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    const data = await features.query;

    res.status(200).json({
        status: 'success',
        results: data.length,
        data
    });
});

// Do NOT update passwords with this!
exports.adminUpdateDelivery = factory.updateOne(Delivery);
exports.adminDeleteDelivery = factory.deleteOne(Delivery);

// ### === CRUD Restaurant === ###
exports.adminGetRestaurant = catchAsync(async (req, res, next) => {
    const user = await Restaurant.findById(req.params.id)
        .setOptions({ includeInactive: true })
        .populate('category', 'name description')
        .populate('delivery')
        .populate('meal');

    if (!user) {
        return next(new AppError('المطعم المطلوب غير موجود أو تم حذفه.', 404, {
            code: 'RESTAURANT_NOT_FOUND',
        }));
    }

    res.status(200).json({
        status: 'success',
        data: user
    });
});
exports.adminGetAllRestaurant = factory.getAll(Restaurant);

// Do NOT update passwords with this!
exports.adminUpdateRestaurant = catchAsync(async (req, res, next) => {
    const user = await Restaurant.findOneAndUpdate(
        { _id: req.params.id },
        req.body,
        {
            new: true,
            runValidators: true,
            includeInactive: true,
        }
    );

    if (!user) {
        return next(new AppError('المطعم المطلوب غير موجود أو تم حذفه.', 404, {
            code: 'RESTAURANT_NOT_FOUND',
        }));
    }

    await user.populate('category', 'name description');

    // If this request activated the restaurant, reward its referrer (if any).
    // Fire-and-forget + idempotent (only a 'registered' referral is processed).
    if ((req.body.active === true || req.body.active === 'true') && user.active === true) {
        finalizeReferralReward(user._id).catch((error) => {
            console.error('Failed to finalize referral reward:', error?.message || error);
        });
    }

    res.status(200).json({
        status: 'success',
        data: user
    });
});

exports.adminDeleteRestaurant = catchAsync(async (req, res, next) => {
    const user = await Restaurant.findOneAndDelete(
        { _id: req.params.id },
        { includeInactive: true }
    );

    if (!user) {
        return next(new AppError('المطعم المطلوب غير موجود أو تم حذفه.', 404, {
            code: 'RESTAURANT_NOT_FOUND',
        }));
    }

    res.status(204).json({
        status: 'success',
        data: null
    });
});

// ### === CRUD Orders === ###
exports.adminGetOrder = factory.getOne(Order);
exports.adminUpdateOrder = factory.updateOne(Order);
exports.adminDeleteOrder = factory.deleteOne(Order);

exports.adminGetAllOrders = catchAsync(async (req, res) => {
    const features = new APIFeatures(Order.find(), req.query)
        .filter()
        .sort("-createdAt")
        .limitFields()
        .paginate();

    const data = await features.query;

    res.status(200).json({
        status: 'success',
        results: data.length,
        data
    });
});

// ### === CRUD Meals === ###
exports.adminGetMeal = factory.getOne(Meal);
exports.adminCreateMeal = factory.createOne(Meal);
exports.adminUpdateMeal = factory.updateOne(Meal);
exports.adminDeleteMeal = factory.deleteOne(Meal);

exports.adminGetAllMeals = catchAsync(async (req, res) => {
    const features = new APIFeatures(Meal.find().populate('restaurantId', 'name phone'), req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    const data = await features.query;

    res.status(200).json({
        status: 'success',
        results: data.length,
        data
    });
});

exports.adminDashboardSummary = catchAsync(async (req, res) => {
    const [totalUsers, totalRestaurants, totalProducts, totalCategories, totalOrders, totalRevenue, recentOrders, chartRows] = await Promise.all([
        User.countDocuments(),
        Restaurant.countDocuments(),
        Meal.countDocuments(),
        Category.countDocuments(),
        Order.countDocuments(),
        Order.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: '$totalPrice' }
                }
            }
        ]),
        Order.find().sort('-createdAt').limit(5),
        Order.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    orders: { $sum: 1 },
                    revenue: { $sum: '$totalPrice' }
                }
            },
            {
                $sort: {
                    '_id.year': -1,
                    '_id.month': -1
                }
            },
            {
                $limit: 6
            }
        ])
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            stats: {
                totalUsers,
                totalRestaurants,
                totalProducts,
                totalCategories,
                totalOrders,
                totalRevenue: totalRevenue[0]?.total || 0
            },
            recentOrders,
            chartData: chartRows.reverse().map((row) => ({
                month: `${row._id.year}-${String(row._id.month).padStart(2, '0')}`,
                orders: row.orders,
                revenue: row.revenue
            }))
        }
    });
});

// ### === CRUD Coupons === ###
exports.adminCreateCoupon = catchAsync(async (req, res, next) => {
    const { code, userId, restaurantId, totalAmount, expiresAt } = req.body;

    const [user, restaurant] = await Promise.all([
        User.findById(userId),
        Restaurant.findById(restaurantId).setOptions({ includeInactive: true }),
    ]);

    if (!user) {
        return next(new AppError('المستخدم غير موجود.', 404));
    }

    if (!restaurant) {
        return next(new AppError('المطعم غير موجود.', 404));
    }

    const coupon = await CouponCode.create({ code, userId, restaurantId, totalAmount, expiresAt });

    await coupon.populate([
        { path: 'userId', select: 'name phone' },
        { path: 'restaurantId', select: 'name phone' },
    ]);

    // Notify the user about their new coupon via OneSignal
    const restaurantName = coupon.restaurantId?.name || '';
    const title = 'You have a new discount coupon!';
    const titleAr = 'لديك كود خصم جديد!';
    const body = `Use code ${coupon.code} at ${restaurantName} to get a discount on your order.`;
    const bodyAr = `استخدم الكود ${coupon.code} في مطعم ${restaurantName} للحصول على خصم على طلبك.`;
    const notificationData = {
        type: 'coupon-created',
        code: coupon.code,
        restaurantId: restaurantId?.toString(),
        restaurantName,
        screen: 'notification',
    };

    Promise.resolve()
        .then(async () => {
            await Promise.all([
                createInAppNotification({
                    recipientId: userId,
                    recipientRole: 'user',
                    type: 'coupon-created',
                    title,
                    titleAr,
                    message: body,
                    messageAr: bodyAr,
                    screen: 'notification',
                    data: notificationData,
                }),
                sendPushToExternalUser(`user:${userId}`, {
                    title,
                    titleAr,
                    body,
                    bodyAr,
                    data: notificationData,
                }),
            ]);
        })
        .catch((err) => {
            console.error('Failed to send coupon notification:', err?.message || err);
        });

    res.status(201).json({
        status: 'success',
        data: coupon,
    });
});

exports.adminGetAllCoupons = catchAsync(async (req, res) => {
    const coupons = await CouponCode.find()
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name phone')
        .sort('-createdAt');

    res.status(200).json({
        status: 'success',
        results: coupons.length,
        data: coupons,
    });
});

exports.adminGetCoupon = catchAsync(async (req, res, next) => {
    const coupon = await CouponCode.findById(req.params.id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name phone');

    if (!coupon) {
        return next(new AppError('كود الخصم غير موجود.', 404));
    }

    res.status(200).json({
        status: 'success',
        data: coupon,
    });
});

exports.adminDeleteCoupon = catchAsync(async (req, res, next) => {
    const coupon = await CouponCode.findByIdAndDelete(req.params.id);

    if (!coupon) {
        return next(new AppError('كود الخصم غير موجود.', 404));
    }

    res.status(204).json({
        status: 'success',
        data: null,
    });
});

// ### === Platform Settings === ###
exports.adminGetSettings = catchAsync(async (req, res) => {
    const settings = await AppSetting.getSettings();

    res.status(200).json({
        status: 'success',
        data: {
            referralsEnabled: settings.referralsEnabled,
        },
    });
});

exports.adminUpdateSettings = catchAsync(async (req, res) => {
    const settings = await AppSetting.getSettings();

    if (typeof req.body.referralsEnabled === 'boolean') {
        settings.referralsEnabled = req.body.referralsEnabled;
    }

    await settings.save();

    res.status(200).json({
        status: 'success',
        data: {
            referralsEnabled: settings.referralsEnabled,
        },
    });
});
