const Order = require('../models/orderModel');

const PENDING_STATUS = '1';
const EXPIRED_STATUS = '0';
const TWO_DAYS_IN_MS = 2 * 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

let isExpiringOrders = false;

const getPendingOrderExpiryDate = () => new Date(Date.now() - TWO_DAYS_IN_MS);

const expireOldPendingOrders = async () => {
    if (isExpiringOrders) {
        return { matchedCount: 0, modifiedCount: 0, skipped: true };
    }

    isExpiringOrders = true;

    try {
        const result = await Order.updateMany(
            {
                status: PENDING_STATUS,
                createdAt: { $lte: getPendingOrderExpiryDate() },
            },
            {
                $set: { status: EXPIRED_STATUS },
            },
            {
                runValidators: true,
            }
        );

        return {
            matchedCount: result.matchedCount || 0,
            modifiedCount: result.modifiedCount || 0,
        };
    } finally {
        isExpiringOrders = false;
    }
};

const startOrderExpiryJob = (intervalMs = DEFAULT_INTERVAL_MS) => {
    expireOldPendingOrders().catch((error) => {
        console.error('Failed to expire old pending orders:', error);
    });

    const interval = setInterval(() => {
        expireOldPendingOrders().catch((error) => {
            console.error('Failed to expire old pending orders:', error);
        });
    }, intervalMs);

    interval.unref?.();

    return interval;
};

module.exports = {
    expireOldPendingOrders,
    startOrderExpiryJob,
};
