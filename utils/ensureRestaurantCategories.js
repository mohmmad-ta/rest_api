const Restaurant = require('../models/auth/restaurantModel');
const RestaurantCategory = require('../models/restaurantCategoryModel');
const {
    DEFAULT_RESTAURANT_CATEGORY_ID,
    DEFAULT_RESTAURANT_CATEGORY_NAME
} = require('./defaultRestaurantCategory');

const ensureRestaurantCategories = async () => {
    await RestaurantCategory.findByIdAndUpdate(
        DEFAULT_RESTAURANT_CATEGORY_ID,
        {
            $setOnInsert: {
                name: DEFAULT_RESTAURANT_CATEGORY_NAME,
                description: ''
            }
        },
        {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );

    await Restaurant.updateMany(
        {
            $or: [
                { category: { $exists: false } },
                { category: null }
            ]
        },
        {
            $set: {
                category: DEFAULT_RESTAURANT_CATEGORY_ID
            }
        }
    );
};

module.exports = ensureRestaurantCategories;
