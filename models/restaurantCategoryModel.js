const mongoose = require('mongoose');

const restaurantCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'يرجى إدخال اسم تصنيف المطعم'],
            unique: true,
            trim: true
        },
        description: {
            type: String,
            trim: true,
            default: ''
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

module.exports = mongoose.model('RestaurantCategory', restaurantCategorySchema);
