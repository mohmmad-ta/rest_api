const Restaurant = require('../models/auth/restaurantModel');
const RestaurantCategory = require('../models/restaurantCategoryModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { DEFAULT_RESTAURANT_CATEGORY_ID } = require('../utils/defaultRestaurantCategory');

exports.getAllRestaurantCategories = factory.getAll(RestaurantCategory);
exports.getRestaurantCategory = factory.getOne(RestaurantCategory);
exports.createRestaurantCategory = factory.createOne(RestaurantCategory);
exports.updateRestaurantCategory = factory.updateOne(RestaurantCategory);

exports.deleteRestaurantCategory = catchAsync(async (req, res, next) => {
    if (String(req.params.id) === String(DEFAULT_RESTAURANT_CATEGORY_ID)) {
        return next(new AppError('لا يمكن حذف تصنيف المطعم الافتراضي.', 400));
    }

    const restaurantsCount = await Restaurant.countDocuments({ category: req.params.id });
    if (restaurantsCount) {
        return next(new AppError('لا يمكن حذف تصنيف مرتبط بمطاعم.', 400));
    }

    const category = await RestaurantCategory.findByIdAndDelete(req.params.id);
    if (!category) {
        return next(new AppError('تصنيف المطعم المطلوب غير موجود أو تم حذفه.', 404, {
            code: 'RESTAURANT_CATEGORY_NOT_FOUND',
        }));
    }

    res.status(204).json({
        status: 'success',
        data: null
    });
});
