const Meal = require('./../models/mealModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('./../utils/appError');
const Restaurant = require("../models/auth/restaurantModel");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");
const qs = require("qs");

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        cb(new AppError('Not an image! Please upload only images.', 400), false);
    }
};
const upload = multer({
    storage: multerStorage,
    fileFilter: multerFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE_BYTES
    }
});
exports.uploadProductPhoto = (req, res, next) => {
    upload.fields([
        {name: 'image', maxCount: 1},
    ])(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('Image size must be 2MB or smaller.', 400));
        }

        if (err) {
            return next(err);
        }

        next();
    });
};
exports.resizeTourImages = catchAsync(async (req, res, next) => {
    const imageFile = req.files?.image?.[0];

    if (!imageFile) return next();

    const mealId = req.params.id || 'meal';
    const fileName = `${Date.now()}-${mealId}.jpeg`;
    req.body.image = `${req.protocol}://${req.get('host')}/public/images/meals/${fileName}`;

    await sharp(imageFile.buffer)
        .toFormat('jpeg')
        .jpeg({ quality: 100 })
        .toFile(`public/images/meals/${fileName}`);
    next();
});

const parseJsonArrayField = (value) => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value === 'object') {
        return Object.values(value);
    }

    if (typeof value !== 'string') {
        return [];
    }

    try {
        const parsedValue = JSON.parse(value);

        if (Array.isArray(parsedValue)) {
            return parsedValue;
        }

        if (parsedValue && typeof parsedValue === 'object') {
            return Object.values(parsedValue);
        }
    } catch (error) {
        return [];
    }

    return [];
};

const normalizePricedList = (value) =>
    parseJsonArrayField(value)
        .map((item) => ({
            title: String(item?.title || '').trim(),
            price: Number(item?.price || 0),
        }))
        .filter((item) => item.title || item.price !== 0);

const normalizeNotesList = (value) =>
    parseJsonArrayField(value)
        .map((item) => ({
            title: String(item?.title || '').trim(),
        }))
        .filter((item) => item.title);

exports.normalizeMealBody = (req, res, next) => {
    const parsedBody = qs.parse(req.body || {});

    req.body = {
        ...parsedBody,
        tags: normalizePricedList(parsedBody.tags),
        options: normalizePricedList(parsedBody.options),
        notes: normalizeNotesList(parsedBody.notes),
    };

    next();
};


exports.getAllRestaurant = factory.getAll(Restaurant);
exports.getMeal = catchAsync(async (req, res, next) => {
    const data = await Meal.findById(req.params.id).populate({
        path: 'restaurantId',
        select: 'name workingHours active',
    });

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    if (!data.restaurantId || data.restaurantId.active === false) {
        return next(new AppError('هذه الوجبة غير متاحة حالياً.', 404));
    }

    res.status(200).json({
        status: 'success',
        data,
    });
});

exports.getRestaurantMeal = catchAsync(async (req, res, next) => {
    const data = await Meal.findOne({
        _id: req.params.id,
        restaurantId: req.user.id,
    })
        .setOptions({ includeInactive: true })
        .populate({
            path: 'restaurantId',
            select: 'name workingHours active',
        });

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
        status: 'success',
        data,
    });
});

exports.updateMealActive = catchAsync(async (req, res, next) => {
    const active = Boolean(req.body.active);

    const data = await Meal.findOneAndUpdate(
        {
            _id: req.params.id,
            restaurantId: req.user.id,
        },
        { active },
        {
            new: true,
            runValidators: true,
        }
    ).setOptions({ includeInactive: true });

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
        status: 'success',
        data,
    });
});
exports.updateMeal = catchAsync(async (req, res, next) => {
    const data = await Meal.findOneAndUpdate(
        {
            _id: req.params.id,
            restaurantId: req.user.id,
        },
        req.body,
        {
            new: true,
            runValidators: true,
        }
    ).setOptions({ includeInactive: true });

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    res.status(200).json({
        status: 'success',
        data,
    });
});
exports.deleteMeal = catchAsync(async (req, res, next) => {
    const data = await Meal.findOneAndDelete({
        _id: req.params.id,
        restaurantId: req.user.id,
    }).setOptions({ includeInactive: true });

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    if (data?.image && data.image.includes('/public/')) {
        const imageRelativePath = data.image.split("/public/")[1];
        const imagePath = path.join(__dirname, "..", "public", imageRelativePath);

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    }

    res.status(204).json({ status: 'success', data: null });
});
exports.createMeal = factory.createOne(Meal);

exports.getRandomRestaurants = catchAsync(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
    const exclude = String(req.query.exclude || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => mongoose.Types.ObjectId.isValid(item))
        .map((item) => new mongoose.Types.ObjectId(item));

    const data = await Restaurant.aggregate([
        {
            $match: {
                deleted: { $ne: true },
                active: { $ne: false },
                ...(exclude.length ? { _id: { $nin: exclude } } : {})
            }
        },
        { $sample: { size: limit } },
        {
            $project: {
                id: { $toString: "$_id" },
                _id: 1,
                name: 1,
                phone: 1,
                discount: 1,
                ratingsAverage: 1,
                image: 1,
                role: 1,
                active: 1,
                deliveryTime: 1
            }
        }
    ]);

    res.status(200).json({
        status: 'success',
        results: data.length,
        data
    });
});


exports.getAllMyMeals = async (req, res, next) => {
    const data = await Meal.find({ restaurantId: req.user.id })
        .setOptions({ includeInactive: true })
        .sort({ createdAt: -1 });

    res.status(200).json({
        status: 'success',
        data
    });
};
exports.getRestaurantMeals = async (req, res, next) => {
    const data = await Restaurant.findById(req.params.id).lean();

    if (!data) {
        return next(new AppError('No document found with that ID', 404));
    }

    const meal = await Meal.find({ restaurantId: req.params.id }).sort({ createdAt: -1 });

    res.status(200).json({
        status: 'success',
        data: {
            ...data,
            meal,
        }
    });
};
exports.getRestaurantSearch = catchAsync(async (req, res, next) => {
    const searchTerm = String(req.query.q || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
    const skip = (page - 1) * limit;

    if (!searchTerm) {
        return res.status(200).json({
            status: 'success',
            results: 0,
            total: 0,
            page,
            limit,
            data: []
        });
    }

    const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lowerSearch = searchTerm.toLowerCase();
    const searchRegex = new RegExp(escapedSearch, 'i');
    const startsWithRegex = new RegExp(`^${escapedSearch}`, 'i');

    const directRestaurants = await Restaurant.find({
        $or: [
            { name: searchRegex },
            { phone: searchRegex }
        ]
    })
        .select('name phone discount ratingsAverage image role active deliveryTime')
        .lean();

    const matchedMealRestaurantIds = await Meal.find({
        $or: [
            { name: searchRegex },
            { description: searchRegex }
        ]
    }).distinct('restaurantId');

    const restaurantIdMap = new Map();

    directRestaurants.forEach((restaurant) => {
        restaurantIdMap.set(String(restaurant._id), restaurant);
    });

    if (matchedMealRestaurantIds.length) {
        const missingRestaurantIds = matchedMealRestaurantIds.filter(
            (id) => !restaurantIdMap.has(String(id))
        );

        if (missingRestaurantIds.length) {
            const mealMatchedRestaurants = await Restaurant.find({
                _id: { $in: missingRestaurantIds }
            })
                .select('name phone discount ratingsAverage image role active deliveryTime')
                .lean();

            mealMatchedRestaurants.forEach((restaurant) => {
                restaurantIdMap.set(String(restaurant._id), restaurant);
            });
        }
    }

    const matchedMealRestaurantIdSet = new Set(matchedMealRestaurantIds.map((id) => String(id)));

    const rankedRestaurants = Array.from(restaurantIdMap.values())
        .map((restaurant) => {
            const restaurantId = String(restaurant._id);
            const restaurantName = String(restaurant.name || '');
            const restaurantPhone = String(restaurant.phone || '');
            let searchScore = 0;

            if (restaurantName.toLowerCase() === lowerSearch) {
                searchScore += 6;
            }

            if (startsWithRegex.test(restaurantName)) {
                searchScore += 4;
            } else if (searchRegex.test(restaurantName)) {
                searchScore += 2;
            }

            if (searchRegex.test(restaurantPhone)) {
                searchScore += 1;
            }

            if (matchedMealRestaurantIdSet.has(restaurantId)) {
                searchScore += 2;
            }

            return {
                ...restaurant,
                id: restaurantId,
                searchScore,
            };
        })
        .filter((restaurant) => restaurant.searchScore > 0)
        .sort((a, b) => {
            if (b.searchScore !== a.searchScore) {
                return b.searchScore - a.searchScore;
            }

            if (Number(b.discount || 0) !== Number(a.discount || 0)) {
                return Number(b.discount || 0) - Number(a.discount || 0);
            }

            if (Number(b.ratingsAverage || 0) !== Number(a.ratingsAverage || 0)) {
                return Number(b.ratingsAverage || 0) - Number(a.ratingsAverage || 0);
            }

            return String(b._id).localeCompare(String(a._id));
        });

    const total = rankedRestaurants.length;
    const data = rankedRestaurants.slice(skip, skip + limit);

    res.status(200).json({
        status: 'success',
        results: data.length,
        total,
        page,
        limit,
        data
    });
});
