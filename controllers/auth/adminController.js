const User = require('../../models/auth/userModel');
const Admin = require('../../models/auth/adminModel');
const catchAsync = require('../../utils/catchAsync');
const Delivery = require("../../models/auth/deliveryModel");
const Restaurant = require("../../models/auth/restaurantModel");
const Order = require("../../models/orderModel");
const Meal = require("../../models/mealModel");
const Category = require("../../models/categoryModel");
const AppError = require('../../utils/appError');
const APIFeatures = require("../../utils/apiFeatures");
const factory = require('./../handlerFactory');

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
        .populate('delivery')
        .populate('meal');

    if (!user) {
        return next(new AppError('No document found with that ID', 404));
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
        return next(new AppError('No document found with that ID', 404));
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
        return next(new AppError('No document found with that ID', 404));
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
