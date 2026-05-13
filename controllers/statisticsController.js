const catchAsync = require('../utils/catchAsync');
const Order = require('../models/orderModel');
const User = require('../models/auth/userModel');
const Delivery = require('../models/auth/deliveryModel');
const Restaurant = require('../models/auth/restaurantModel');
const Meal = require('../models/mealModel');
const Category = require('../models/categoryModel');
const {
    createOrderMetricsGroup,
    createOrderMetricsFields,
    createDateMatch,
    createRestaurantMatch,
    createDefaultMetrics,
    createPayableOrderMatch,
    toObjectId
} = require('../models/statisticsModel');

const STATISTICS_TIMEZONE = 'Asia/Baghdad';
const STATISTICS_TIMEZONE_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const toStatisticsDate = (date) => new Date(date.getTime() + STATISTICS_TIMEZONE_OFFSET_MS);

const startOfDay = (date = new Date()) => {
    const shiftedDate = toStatisticsDate(date);

    return new Date(
        Date.UTC(shiftedDate.getUTCFullYear(), shiftedDate.getUTCMonth(), shiftedDate.getUTCDate()) -
        STATISTICS_TIMEZONE_OFFSET_MS
    );
};

const startOfMonth = (date = new Date()) => {
    const shiftedDate = toStatisticsDate(date);

    return new Date(
        Date.UTC(shiftedDate.getUTCFullYear(), shiftedDate.getUTCMonth(), 1) -
        STATISTICS_TIMEZONE_OFFSET_MS
    );
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const addMonths = (date, months) => {
    const shiftedDate = toStatisticsDate(date);

    return new Date(
        Date.UTC(shiftedDate.getUTCFullYear(), shiftedDate.getUTCMonth() + months, 1) -
        STATISTICS_TIMEZONE_OFFSET_MS
    );
};

const formatDateKey = (date) => {
    const shiftedDate = toStatisticsDate(date);

    return `${shiftedDate.getUTCFullYear()}-${String(shiftedDate.getUTCMonth() + 1).padStart(2, '0')}-${String(shiftedDate.getUTCDate()).padStart(2, '0')}`;
};

const formatMonthKey = (date) => {
    const shiftedDate = toStatisticsDate(date);

    return `${shiftedDate.getUTCFullYear()}-${String(shiftedDate.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getSingleMetrics = async (match, label = null) => {
    const [result] = await Order.aggregate([
        { $match: match },
        { $group: createOrderMetricsGroup() }
    ]);

    return result
        ? { label, ...result, _id: undefined }
        : createDefaultMetrics(label);
};

const getRestaurantInfo = async (restaurantId, includeInactive = false) => {
    return Restaurant.findById(restaurantId)
        .setOptions(includeInactive ? { includeInactive: true } : {})
        .select('name phone image discount deliveryTime active');
};

const getRestaurantDailySeries = async (restaurantId, days = 7) => {
    const today = startOfDay();
    const startDate = addDays(today, -(days - 1));
    const restaurantMatch = { restaurantId: toObjectId(restaurantId) };

    const rows = await Order.aggregate([
        {
            $match: {
                ...restaurantMatch,
                ...createDateMatch(startDate, addDays(today, 1))
            }
        },
        {
            $group: {
                _id: {
                    date: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                            timezone: STATISTICS_TIMEZONE
                        }
                    }
                },
                ...createOrderMetricsFields()
            }
        }
    ]);

    const mapped = new Map(
        rows.map((row) => {
            const key = row._id.date;
            return [key, row];
        })
    );

    return Array.from({ length: days }, (_, index) => {
        const currentDate = addDays(startDate, index);
        const key = formatDateKey(currentDate);
        const row = mapped.get(key);

        return {
            date: key,
            totalOrders: row?.totalOrders || 0,
            totalRevenue: row?.totalRevenue || 0,
            totalRevenueAfterDiscount: row?.totalRevenueAfterDiscount || 0,
            totalRevenueBeforeDiscount: row?.totalRevenueBeforeDiscount || 0,
            totalServiceFees: row?.totalServiceFees || 0,
            restaurantRevenue: row?.restaurantRevenue || 0,
            pendingOrders: row?.pendingOrders || 0,
            processingOrders: row?.processingOrders || 0,
            onTheWayOrders: row?.onTheWayOrders || 0,
            deliveredOrders: row?.deliveredOrders || 0
        };
    });
};

const getRestaurantMonthlySeries = async (restaurantId, months = 6) => {
    const thisMonthStart = startOfMonth();
    const startDate = addMonths(thisMonthStart, -(months - 1));

    const rows = await Order.aggregate([
        {
            $match: createRestaurantMatch(restaurantId, startDate, addMonths(thisMonthStart, 1))
        },
        {
            $group: {
                _id: {
                    month: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: '$createdAt',
                            timezone: STATISTICS_TIMEZONE
                        }
                    }
                },
                ...createOrderMetricsFields()
            }
        }
    ]);

    const mapped = new Map(
        rows.map((row) => {
            const key = row._id.month;
            return [key, row];
        })
    );

    return Array.from({ length: months }, (_, index) => {
        const currentDate = addMonths(startDate, index);
        const key = formatMonthKey(currentDate);
        const row = mapped.get(key);

        return {
            month: key,
            totalOrders: row?.totalOrders || 0,
            totalRevenue: row?.totalRevenue || 0,
            totalRevenueAfterDiscount: row?.totalRevenueAfterDiscount || 0,
            totalRevenueBeforeDiscount: row?.totalRevenueBeforeDiscount || 0,
            totalServiceFees: row?.totalServiceFees || 0,
            restaurantRevenue: row?.restaurantRevenue || 0,
            pendingOrders: row?.pendingOrders || 0,
            processingOrders: row?.processingOrders || 0,
            onTheWayOrders: row?.onTheWayOrders || 0,
            deliveredOrders: row?.deliveredOrders || 0
        };
    });
};

const getRestaurantOverviewPayload = async (restaurantId, includeInactive = false) => {
    const today = startOfDay();
    const monthStart = startOfMonth();
    const tomorrow = addDays(today, 1);
    const nextMonth = addMonths(monthStart, 1);

    const [restaurant, allTime, todayStats, monthStats, daily, monthly] = await Promise.all([
        getRestaurantInfo(restaurantId, includeInactive),
        getSingleMetrics({ restaurantId: toObjectId(restaurantId), ...createPayableOrderMatch() }, 'allTime'),
        getSingleMetrics(createRestaurantMatch(restaurantId, today, tomorrow), 'today'),
        getSingleMetrics(createRestaurantMatch(restaurantId, monthStart, nextMonth), 'month'),
        getRestaurantDailySeries(restaurantId),
        getRestaurantMonthlySeries(restaurantId, 12)
    ]);

    return {
        restaurant,
        summary: {
            allTime,
            today: todayStats,
            month: monthStats
        },
        daily,
        monthly
    };
};

exports.getRestaurantStatistics = catchAsync(async (req, res) => {
    const payload = await getRestaurantOverviewPayload(req.user.id);

    res.status(200).json({
        status: 'success',
        data: payload
    });
});

exports.getAdminRestaurantStatistics = catchAsync(async (req, res) => {
    const payload = await getRestaurantOverviewPayload(req.params.id, true);

    res.status(200).json({
        status: 'success',
        data: payload
    });
});

exports.getAdminOverviewStatistics = catchAsync(async (req, res) => {
    const today = startOfDay();
    const monthStart = startOfMonth();
    const tomorrow = addDays(today, 1);
    const nextMonth = addMonths(monthStart, 1);

    const [
        totalUsers,
        totalDeliveries,
        totalRestaurants,
        totalMeals,
        totalCategories,
        allTime,
        todayStats,
        monthStats,
        restaurants
    ] = await Promise.all([
        User.countDocuments(),
        Delivery.countDocuments(),
        Restaurant.countDocuments(),
        Meal.countDocuments(),
        Category.countDocuments(),
        getSingleMetrics(createPayableOrderMatch(), 'allTime'),
        getSingleMetrics(createDateMatch(today, tomorrow), 'today'),
        getSingleMetrics(createDateMatch(monthStart, nextMonth), 'month'),
        Order.aggregate([
            { $match: createPayableOrderMatch() },
            {
                $group: {
                    _id: '$restaurantId',
                    ...createOrderMetricsFields()
                }
            },
            { $sort: { totalRevenue: -1, totalOrders: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'restaurants',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'restaurant'
                }
            },
            {
                $unwind: {
                    path: '$restaurant',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    restaurantId: '$_id',
                    restaurantName: '$restaurant.name',
                    phone: '$restaurant.phone',
                    totalOrders: 1,
                    totalRevenue: 1,
                    totalRevenueAfterDiscount: 1,
                    totalRevenueBeforeDiscount: 1,
                    totalServiceFees: 1,
                    restaurantRevenue: 1
                }
            }
        ])
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            totals: {
                totalUsers,
                totalDeliveries,
                totalRestaurants,
                totalMeals,
                totalCategories
            },
            orders: {
                allTime,
                today: todayStats,
                month: monthStats
            },
            topRestaurants: restaurants
        }
    });
});

exports.getAdminRestaurantsStatistics = catchAsync(async (req, res) => {
    const today = startOfDay();
    const monthStart = startOfMonth();
    const tomorrow = addDays(today, 1);
    const nextMonth = addMonths(monthStart, 1);

    const restaurants = await Order.aggregate([
        {
            $facet: {
                allTime: [
                    { $match: createPayableOrderMatch() },
                    {
                        $group: {
                            _id: '$restaurantId',
                            ...createOrderMetricsFields()
                        }
                    }
                ],
                today: [
                    { $match: createDateMatch(today, tomorrow) },
                    {
                        $group: {
                            _id: '$restaurantId',
                            todayOrders: { $sum: 1 },
                            todayRevenue: { $sum: '$totalPrice' },
                            todayRevenueAfterDiscount: { $sum: '$totalPrice' },
                            todayRevenueBeforeDiscount: { $sum: '$totalPriceBeforeDiscount' }
                        }
                    }
                ],
                month: [
                    { $match: createDateMatch(monthStart, nextMonth) },
                    {
                        $group: {
                            _id: '$restaurantId',
                            monthOrders: { $sum: 1 },
                            monthRevenue: { $sum: '$totalPrice' },
                            monthRevenueAfterDiscount: { $sum: '$totalPrice' },
                            monthRevenueBeforeDiscount: { $sum: '$totalPriceBeforeDiscount' }
                        }
                    }
                ]
            }
        }
    ]);

    const [restaurantDocs, ordersData] = await Promise.all([
        Restaurant.find()
            .setOptions({ includeInactive: true })
            .select('name phone image active discount deliveryTime createdAt'),
        Promise.resolve(restaurants[0] || { allTime: [], today: [], month: [] })
    ]);

    const allTimeMap = new Map(ordersData.allTime.map((row) => [String(row._id), row]));
    const todayMap = new Map(ordersData.today.map((row) => [String(row._id), row]));
    const monthMap = new Map(ordersData.month.map((row) => [String(row._id), row]));

    const data = restaurantDocs.map((restaurant) => {
        const id = String(restaurant._id);
        const allTime = allTimeMap.get(id) || {};
        const todayStats = todayMap.get(id) || {};
        const monthStats = monthMap.get(id) || {};

        return {
            restaurantId: restaurant._id,
            name: restaurant.name,
            phone: restaurant.phone,
            image: restaurant.image,
            active: restaurant.active,
            discount: restaurant.discount,
            deliveryTime: restaurant.deliveryTime,
            createdAt: restaurant.createdAt,
            totalOrders: allTime.totalOrders || 0,
            totalRevenue: allTime.totalRevenue || 0,
            totalRevenueAfterDiscount: allTime.totalRevenueAfterDiscount || 0,
            totalRevenueBeforeDiscount: allTime.totalRevenueBeforeDiscount || 0,
            todayOrders: todayStats.todayOrders || 0,
            todayRevenue: todayStats.todayRevenue || 0,
            todayRevenueAfterDiscount: todayStats.todayRevenueAfterDiscount || 0,
            todayRevenueBeforeDiscount: todayStats.todayRevenueBeforeDiscount || 0,
            monthOrders: monthStats.monthOrders || 0,
            monthRevenue: monthStats.monthRevenue || 0,
            monthRevenueAfterDiscount: monthStats.monthRevenueAfterDiscount || 0,
            monthRevenueBeforeDiscount: monthStats.monthRevenueBeforeDiscount || 0
        };
    }).sort((a, b) => {
        if (a.active !== b.active) {
            return Number(a.active) - Number(b.active);
        }

        return b.totalRevenue - a.totalRevenue || b.totalOrders - a.totalOrders;
    });

    res.status(200).json({
        status: 'success',
        results: data.length,
        data
    });
});
