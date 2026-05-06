const Review = require('./../models/reviewModel');
const factory = require('./handlerFactory');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const Order = require('./../models/orderModel');

exports.setRestAndUserIds = (req, res, next) => {
    // Allow nested routes
    if (!req.body.restaurant) req.body.restaurant = req.params.restaurant;
    if (!req.body.user) req.body.user = req.user.id;
    next();
};

exports.getAllReviews = factory.getAll(Review);
exports.getReview = factory.getOne(Review);

exports.createReview = catchAsync(async (req, res, next) => {
    const orderId = req.body.order || req.params.order;

    if (!orderId) {
        return next(new AppError('يرجى تحديد الطلب المراد تقييمه.', 400));
    }

    const order = await Order.findOne({
        _id: orderId,
        userId: req.user.id,
    }).select('restaurantId status');

    if (!order) {
        return next(new AppError('الطلب غير موجود أو لا يخص هذا المستخدم.', 404));
    }

    if (String(order.status || '') !== '4') {
        return next(new AppError('لا يمكن تقييم الطلب قبل اكتمال التوصيل.', 400));
    }

    const existingReview = await Review.findOne({
        order: orderId,
        user: req.user.id,
    });

    if (existingReview) {
        return next(new AppError('تم تقييم هذا الطلب مسبقاً.', 400));
    }

    const review = await Review.create({
        review: req.body.review,
        rating: req.body.rating,
        restaurant: req.body.restaurant || order.restaurantId,
        order: orderId,
        user: req.user.id,
    });

    res.status(201).json({
        status: 'success',
        data: review,
    });
});

exports.updateReview = factory.updateOne(Review);
exports.deleteReview = factory.deleteOne(Review);
