const mongoose = require('mongoose');

const restaurantDailyOrderCounterSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: true,
        },
        dayKey: {
            type: String,
            required: true,
            trim: true,
        },
        lastNumber: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

restaurantDailyOrderCounterSchema.index(
    { restaurantId: 1, dayKey: 1 },
    { unique: true }
);

module.exports = mongoose.model(
    'RestaurantDailyOrderCounter',
    restaurantDailyOrderCounterSchema
);
