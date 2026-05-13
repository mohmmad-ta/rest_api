const mongoose = require('mongoose');

const DELIVERED_STATUS = '4';
const ON_THE_WAY_STATUS = '3';
const PENDING_STATUS = '1';
const PROCESSING_STATUS = '2';
const REJECTED_STATUS = '0';
const SERVICE_FEES = 250;

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const createServiceFeesExpression = () => ({ $ifNull: ['$serviceFees', SERVICE_FEES] });

const createRestaurantRevenueExpression = () => {
    const serviceFees = createServiceFeesExpression();

    return {
        $cond: [
            { $gt: ['$totalPrice', serviceFees] },
            { $subtract: ['$totalPrice', serviceFees] },
            0
        ]
    };
};

const createPayableOrderMatch = () => ({
    status: { $ne: REJECTED_STATUS }
});

const createOrderMetricsFields = () => ({
    totalOrders: { $sum: 1 },
    totalRevenue: { $sum: '$totalPrice' },
    totalRevenueAfterDiscount: { $sum: '$totalPrice' },
    totalRevenueBeforeDiscount: { $sum: '$totalPriceBeforeDiscount' },
    totalServiceFees: { $sum: createServiceFeesExpression() },
    restaurantRevenue: {
        $sum: createRestaurantRevenueExpression()
    },
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

const createOrderMetricsGroup = () => ({
    _id: null,
    ...createOrderMetricsFields()
});

const createDateMatch = (startDate, endDate) => ({
    ...createPayableOrderMatch(),
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
    totalServiceFees: 0,
    restaurantRevenue: 0,
    pendingOrders: 0,
    processingOrders: 0,
    onTheWayOrders: 0,
    deliveredOrders: 0
});

module.exports = {
    DELIVERED_STATUS,
    ON_THE_WAY_STATUS,
    REJECTED_STATUS,
    SERVICE_FEES,
    createPayableOrderMatch,
    createOrderMetricsFields,
    createOrderMetricsGroup,
    createDateMatch,
    createRestaurantMatch,
    createDefaultMetrics,
    toObjectId
};
