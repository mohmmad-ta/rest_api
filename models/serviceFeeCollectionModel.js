const mongoose = require('mongoose');

const serviceFeeCollectionSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: [true, 'Restaurant is required for service fee collection.']
        },
        month: {
            type: String,
            required: [true, 'Collection month is required.'],
            match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'صيغة الشهر غير صحيحة. يرجى اختيار شهر صالح.']
        },
        status: {
            type: String,
            enum: ['pending', 'collected'],
            default: 'pending'
        },
        collectedAt: Date
    },
    {
        timestamps: true
    }
);

serviceFeeCollectionSchema.index({ restaurantId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ServiceFeeCollection', serviceFeeCollectionSchema);
