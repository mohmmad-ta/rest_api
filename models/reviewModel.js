// review / rating / createdAt / ref to tour / ref to user
const mongoose = require('mongoose');
const Restaurant = require('./auth/restaurantModel');

const reviewSchema = new mongoose.Schema(
    {
        review: {
            type: String,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            required: [true, 'Review can not be empty!']
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        restaurant: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: [true, 'Review must belong to a tour.']
        },
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'Review must belong to a user']
        }
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.pre(/^find/, function(next) {

    this.populate({
        path: 'user',
        select: 'name phone'
    });
    next();
});

// Middleware to calculate ratingsAverage & ratingsQuantity after save
reviewSchema.statics.calcAverageRatings = async function (restaurantId) {
    const stats = await this.aggregate([
        { $match: { restaurant: restaurantId } },
        {
            $group: {
                _id: "$restaurant",
                nRating: { $sum: 1 },
                avgRating: { $avg: "$rating" },
            },
        },
    ]);

    if (stats.length > 0) {
        await Restaurant.findByIdAndUpdate(restaurantId, {
            ratingsQuantity: stats[0].nRating,
            ratingsAverage: stats[0].avgRating,
        });
    } else {
        // Reset to defaults if no reviews
        await Restaurant.findByIdAndUpdate(restaurantId, {
            ratingsQuantity: 0,
            ratingsAverage: 0,
        });
    }
};

// Trigger when a review is saved
reviewSchema.post("save", function () {
    // @ts-ignore
    this.constructor.calcAverageRatings(this.restaurant);
});

// Trigger when a review is updated/deleted
reviewSchema.post(/^findOneAnd/, async function (doc) {
    if (doc) {
        // @ts-ignore
        await doc.constructor.calcAverageRatings(doc.restaurant);
    }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;