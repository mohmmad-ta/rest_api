const Restaurant = require('../models/auth/restaurantModel');
const RestaurantCategory = require('../models/restaurantCategoryModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { DEFAULT_RESTAURANT_CATEGORY_ID } = require('../utils/defaultRestaurantCategory');

const DEFAULT_RESTAURANT_RADIUS_KM = 10;
const getAllRestaurantCategories = factory.getAll(RestaurantCategory);
const toRadians = (value) => value * (Math.PI / 180);
const calculateDistanceKm = (from, to) => {
    const fromLatitude = Number(from?.latitude);
    const fromLongitude = Number(from?.longitude);
    const toLatitude = Number(to?.latitude);
    const toLongitude = Number(to?.longitude);

    if (
        !Number.isFinite(fromLatitude) ||
        !Number.isFinite(fromLongitude) ||
        !Number.isFinite(toLatitude) ||
        !Number.isFinite(toLongitude)
    ) {
        return null;
    }

    const earthRadiusKm = 6371;
    const dLat = toRadians(toLatitude - fromLatitude);
    const dLng = toRadians(toLongitude - fromLongitude);
    const lat1 = toRadians(fromLatitude);
    const lat2 = toRadians(toLatitude);
    const value =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

exports.getAllRestaurantCategories = (req, res, next) => {
    if (req.query.withRestaurants !== 'true') {
        return getAllRestaurantCategories(req, res, next);
    }

    return catchAsync(async (request, response) => {
        const latitude = Number(request.query.latitude);
        const longitude = Number(request.query.longitude);
        const radiusKm = Math.min(
            Math.max(Number(request.query.radiusKm) || DEFAULT_RESTAURANT_RADIUS_KM, 1),
            100
        );
        const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
        const restaurants = await Restaurant.find({ category: { $exists: true, $ne: null } })
            .select('category location')
            .lean();

        const availableCategoryIds = [
            ...new Set(
                restaurants
                    .filter((restaurant) => {
                        if (!hasCoordinates) {
                            return true;
                        }

                        const distance = calculateDistanceKm(
                            { latitude, longitude },
                            restaurant.location
                        );

                        return distance !== null && distance <= radiusKm;
                    })
                    .map((restaurant) => String(restaurant.category))
            ),
        ];

        const categories = await RestaurantCategory.find({
            _id: { $in: availableCategoryIds },
        }).sort('-createdAt');

        response.status(200).json({
            status: 'success',
            results: categories.length,
            data: categories,
        });
    })(req, res, next);
};
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
