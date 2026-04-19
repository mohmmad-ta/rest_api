const mongoose = require('mongoose');

const DELIVERED_STATUS = '4';
const ON_THE_WAY_STATUS = '3';
const PENDING_STATUS = '1';
const PROCESSING_STATUS = '2';

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const createOrderMetricsGroup = () => ({
    _id: null,
    totalOrders: { $sum: 1 },
    totalRevenue: { $sum: '$totalPrice' },
    totalRevenueAfterDiscount: { $sum: '$totalPrice' },
    totalRevenueBeforeDiscount: { $sum: '$totalPriceBeforeDiscount' },
    pendingOrders: {
        $sum: {
            $cond: [{ $eq: ['$status', PENDING_STATUS] }, 1, 0]
        }
    },
    processingOrders: {
        $sum: {
            $cond: [{ $eq: ['$status', PROCESSING_STATUS] }, 1, 0]
        }
    },
    onTheWayOrders: {
        $sum: {
            $cond: [{ $eq: ['$status', ON_THE_WAY_STATUS] }, 1, 0]
        }
    },
    deliveredOrders: {
        $sum: {
            $cond: [{ $eq: ['$status', DELIVERED_STATUS] }, 1, 0]
        }
    }
});

const createDateMatch = (startDate, endDate) => ({
    createdAt: {
        $gte: startDate,
        $lt: endDate
    }
});

const createRestaurantMatch = (restaurantId, startDate, endDate) => ({
    restaurantId: toObjectId(restaurantId),
    ...createDateMatch(startDate, endDate)
});

const createDefaultMetrics = (label = null) => ({
    label,
    totalOrders: 0,
    totalRevenue: 0,
    totalRevenueAfterDiscount: 0,
    totalRevenueBeforeDiscount: 0,
    pendingOrders: 0,
    processingOrders: 0,
    onTheWayOrders: 0,
    deliveredOrders: 0
});

module.exports = {
    DELIVERED_STATUS,
    ON_THE_WAY_STATUS,
    createOrderMetricsGroup,
    createDateMatch,
    createRestaurantMatch,
    createDefaultMetrics,
    toObjectId
};
