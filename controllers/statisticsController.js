const catchAsync = require('../utils/catchAsync');
const Order = require('../models/orderModel');
const User = require('../models/auth/userModel');
const Delivery = require('../models/auth/deliveryModel');
const Restaurant = require('../models/auth/restaurantModel');
const Meal = require('../models/mealModel');
const Category = require('../models/categoryModel');
const ServiceFeeCollection = require('../models/serviceFeeCollectionModel');
const AppError = require('../utils/appError');
const { sendNotificationToUser } = require('./wsController');
const {
    createOrderMetricsGroup,
    createOrderMetricsFields,
    createDateMatch,
    createRestaurantMatch,
    createDefaultMetrics,
    createDeliveredMetricExpression,
    createPayableOrderMatch,
    DELIVERED_STATUS,
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

const getCollectionMonthRange = (monthKey) => {
    if (!monthKey) {
        const start = startOfMonth();

        return {
            key: formatMonthKey(start),
            start,
            end: addMonths(start, 1)
        };
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey))) {
        return null;
    }

    const [year, month] = String(monthKey).split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1) - STATISTICS_TIMEZONE_OFFSET_MS);

    return {
        key: formatMonthKey(start),
        start,
        end: addMonths(start, 1)
    };
};

const isCollectionMonthClosed = (monthRange) => monthRange.end.getTime() <= Date.now();

const createDeliveredCollectionDateMatch = (startDate, endDate) => ({
    status: DELIVERED_STATUS,
    createdAt: {
        $gte: startDate,
        $lt: endDate
    }
});

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
    const monthKeys = Array.from({ length: months }, (_, index) => {
        return formatMonthKey(addMonths(startDate, index));
    });
    const collections = await ServiceFeeCollection.find({
        restaurantId,
        month: { $in: monthKeys }
    }).lean();
    const collectionMap = new Map(collections.map((collection) => [collection.month, collection]));

    return Array.from({ length: months }, (_, index) => {
        const currentDate = addMonths(startDate, index);
        const key = formatMonthKey(currentDate);
        const row = mapped.get(key);
        const collection = collectionMap.get(key);
        const monthRange = getCollectionMonthRange(key);
        const collectionDue = isCollectionMonthClosed(monthRange);
        const isCollected = collection?.status === 'collected';

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
            deliveredOrders: row?.deliveredOrders || 0,
            serviceFeeCollectionStatus: isCollected ? 'collected' : collectionDue ? 'pending' : 'not_due',
            serviceFeeCollectedAt: isCollected ? collection?.collectedAt || null : null,
            serviceFeeCollectionDueAt: monthRange.end
        };
    });
};

const getServiceFeeCollectionRows = async (monthRange) => {
    const orderRows = await Order.aggregate([
        {
            $match: createDeliveredCollectionDateMatch(monthRange.start, monthRange.end)
        },
        {
            $group: {
                _id: '$restaurantId',
                ...createOrderMetricsFields()
            }
        },
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
                restaurantPhone: '$restaurant.phone',
                restaurantActive: '$restaurant.active',
                totalOrders: 1,
                totalRevenue: 1,
                totalServiceFees: 1,
                restaurantRevenue: 1,
                deliveredOrders: 1
            }
        },
        {
            $sort: {
                totalServiceFees: -1,
                totalOrders: -1
            }
        }
    ]);

    const collections = await ServiceFeeCollection.find({
        month: monthRange.key,
        restaurantId: { $in: orderRows.map((row) => row.restaurantId) }
    }).lean();
    const collectionMap = new Map(collections.map((item) => [String(item.restaurantId), item]));
    const collectionDue = isCollectionMonthClosed(monthRange);

    return orderRows.map((row) => {
        const collection = collectionMap.get(String(row.restaurantId));
        const isCollected = collection?.status === 'collected';

        return {
            ...row,
            collectionStatus: isCollected ? 'collected' : collectionDue ? 'pending' : 'not_due',
            collectedAt: isCollected ? collection.collectedAt || null : null,
            collectionDue,
            collectionDueAt: monthRange.end
        };
    });
};

const getServiceFeeCollectionSummary = (rows) => {
    return rows.reduce(
        (summary, row) => {
            const serviceFees = Number(row.totalServiceFees || 0);
            const isCollected = row.collectionStatus === 'collected';

            summary.totalRestaurants += 1;
            summary.totalOrders += Number(row.totalOrders || 0);
            summary.totalServiceFees += serviceFees;
            summary.collectedServiceFees += isCollected ? serviceFees : 0;
            summary.pendingServiceFees += row.collectionStatus === 'pending' ? serviceFees : 0;
            summary.notDueServiceFees += row.collectionStatus === 'not_due' ? serviceFees : 0;
            summary.collectedRestaurants += isCollected ? 1 : 0;
            summary.pendingRestaurants += row.collectionStatus === 'pending' ? 1 : 0;
            summary.notDueRestaurants += row.collectionStatus === 'not_due' ? 1 : 0;

            return summary;
        },
        {
            totalRestaurants: 0,
            totalOrders: 0,
            totalServiceFees: 0,
            collectedServiceFees: 0,
            pendingServiceFees: 0,
            notDueServiceFees: 0,
            collectedRestaurants: 0,
            pendingRestaurants: 0,
            notDueRestaurants: 0
        }
    );
};

const getServiceFeeMonthlyCollectionSeries = async (anchorMonthStart, months = 12) => {
    const startDate = addMonths(anchorMonthStart, -(months - 1));
    const endDate = addMonths(anchorMonthStart, 1);

    const orderRows = await Order.aggregate([
        {
            $match: createDeliveredCollectionDateMatch(startDate, endDate)
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
                    },
                    restaurantId: '$restaurantId'
                },
                ...createOrderMetricsFields()
            }
        }
    ]);

    const monthKeys = Array.from({ length: months }, (_, index) => {
        return formatMonthKey(addMonths(startDate, index));
    });
    const collections = await ServiceFeeCollection.find({
        month: { $in: monthKeys },
        restaurantId: { $in: orderRows.map((row) => row._id.restaurantId) }
    }).lean();
    const collectionMap = new Map(
        collections.map((collection) => [`${collection.month}:${String(collection.restaurantId)}`, collection])
    );
    const rowsByMonth = new Map(monthKeys.map((month) => [month, []]));

    orderRows.forEach((row) => {
        const month = row._id.month;

        if (rowsByMonth.has(month)) {
            rowsByMonth.get(month).push(row);
        }
    });

    return monthKeys.map((month) => {
        const rows = rowsByMonth.get(month) || [];
        const monthRange = getCollectionMonthRange(month);
        const collectionDue = isCollectionMonthClosed(monthRange);

        return rows.reduce(
            (summary, row) => {
                const key = `${month}:${String(row._id.restaurantId)}`;
                const isCollected = collectionMap.get(key)?.status === 'collected';
                const serviceFees = Number(row.totalServiceFees || 0);

                summary.totalRestaurants += 1;
                summary.totalOrders += Number(row.totalOrders || 0);
                summary.totalServiceFees += serviceFees;
                summary.collectedServiceFees += isCollected ? serviceFees : 0;
                summary.pendingServiceFees += !isCollected && collectionDue ? serviceFees : 0;
                summary.notDueServiceFees += !isCollected && !collectionDue ? serviceFees : 0;

                return summary;
            },
            {
                month,
                totalRestaurants: 0,
                totalOrders: 0,
                totalServiceFees: 0,
                collectedServiceFees: 0,
                pendingServiceFees: 0,
                notDueServiceFees: 0,
                collectionDue
            }
        );
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

exports.getAdminServiceFeeCollections = catchAsync(async (req, res, next) => {
    const monthRange = getCollectionMonthRange(req.query.month);

    if (!monthRange) {
        return next(new AppError('Collection month must use YYYY-MM format.', 400));
    }

    const currentMonthStart = startOfMonth();
    const monthlySeriesEnd = monthRange.start.getTime() > currentMonthStart.getTime()
        ? monthRange.start
        : currentMonthStart;

    const [restaurants, monthly] = await Promise.all([
        getServiceFeeCollectionRows(monthRange),
        getServiceFeeMonthlyCollectionSeries(monthlySeriesEnd)
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            month: monthRange.key,
            summary: getServiceFeeCollectionSummary(restaurants),
            monthly,
            restaurants
        }
    });
});

exports.updateAdminServiceFeeCollection = catchAsync(async (req, res, next) => {
    const monthRange = getCollectionMonthRange(req.body.month);
    const status = String(req.body.status || '').trim();

    if (!monthRange) {
        return next(new AppError('Collection month must use YYYY-MM format.', 400));
    }

    if (!['pending', 'collected'].includes(status)) {
        return next(new AppError('Collection status must be pending or collected.', 400));
    }

    if (status === 'collected' && !isCollectionMonthClosed(monthRange)) {
        return next(new AppError('Service fees can be collected after the month ends.', 400));
    }

    const restaurant = await Restaurant.findById(req.params.restaurantId)
        .setOptions({ includeInactive: true })
        .select('_id');

    if (!restaurant) {
        return next(new AppError('Restaurant was not found.', 404));
    }

    const collectionUpdate = status === 'collected'
        ? {
            $set: {
                status,
                collectedAt: new Date()
            }
        }
        : {
            $set: { status },
            $unset: { collectedAt: 1 }
        };

    const collectionFilters = {
        restaurantId: restaurant._id,
        month: monthRange.key
    };
    const previousCollection = await ServiceFeeCollection.findOne(collectionFilters).lean();
    const previousStatus = previousCollection?.status || 'pending';
    const collection = await ServiceFeeCollection.findOneAndUpdate(
        collectionFilters,
        collectionUpdate,
        {
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
            upsert: true
        }
    );

    if (previousStatus !== collection.status) {
        sendNotificationToUser(
            restaurant._id,
            {
                month: monthRange.key,
                collectionStatus: collection.status
            },
            collection.status === 'collected'
                ? 'service-fee-collection-collected'
                : 'service-fee-collection-pending',
            {
                role: 'restaurant',
                screen: 'restaurantStatistics',
                data: {
                    month: monthRange.key,
                    collectionStatus: collection.status
                }
            }
        );
    }

    res.status(200).json({
        status: 'success',
        data: {
            restaurantId: collection.restaurantId,
            month: collection.month,
            collectionStatus: collection.status,
            collectedAt: collection.collectedAt || null
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
                            todayRevenue: { $sum: createDeliveredMetricExpression('$totalPrice') },
                            todayRevenueAfterDiscount: { $sum: createDeliveredMetricExpression('$totalPrice') },
                            todayRevenueBeforeDiscount: { $sum: createDeliveredMetricExpression('$totalPriceBeforeDiscount') }
                        }
                    }
                ],
                month: [
                    { $match: createDateMatch(monthStart, nextMonth) },
                    {
                        $group: {
                            _id: '$restaurantId',
                            monthOrders: { $sum: 1 },
                            monthRevenue: { $sum: createDeliveredMetricExpression('$totalPrice') },
                            monthRevenueAfterDiscount: { $sum: createDeliveredMetricExpression('$totalPrice') },
                            monthRevenueBeforeDiscount: { $sum: createDeliveredMetricExpression('$totalPriceBeforeDiscount') }
                        }
                    }
                ]
            }
        }
    ]);

    const [restaurantDocs, ordersData] = await Promise.all([
        Restaurant.find()
            .setOptions({ includeInactive: true })
            .select('name phone image active category discount deliveryTime createdAt')
            .populate('category', 'name'),
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
            category: restaurant.category,
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
