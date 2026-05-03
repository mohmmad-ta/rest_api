const Meal = require('./../models/mealModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('./../utils/appError');
const Restaurant = require("../models/auth/restaurantModel");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");

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


exports.getAllRestaurant = factory.getAll(Restaurant);
exports.getMeal = catchAsync(async (req, res, next) => {
    const data = await Meal.findById(req.params.id).populate({
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
exports.updateMeal = factory.updateOne(Meal);
exports.deleteMeal = factory.deleteOne(Meal);
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
    const data = await Restaurant.findById(req.user.id).populate('meal');
    res.status(200).json({
        status: 'success',
        data: data.meal
    });
};
exports.getRestaurantMeals = async (req, res, next) => {
    const data = await Restaurant.findById(req.params.id).populate('meal');
    res.status(200).json({
        status: 'success',
        data: data
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

    const [searchResult] = await Restaurant.aggregate([
        {
            $match: {
                deleted: { $ne: true },
                active: { $ne: false }
            }
        },
        {
            $lookup: {
                from: 'meals',
                localField: '_id',
                foreignField: 'restaurantId',
                as: 'meals'
            }
        },
        {
            $addFields: {
                exactNameMatch: {
                    $cond: [
                        { $eq: [{ $toLower: '$name' }, lowerSearch] },
                        6,
                        0
                    ]
                },
                startsWithNameMatch: {
                    $cond: [
                        {
                            $regexMatch: {
                                input: { $toLower: '$name' },
                                regex: `^${escapedSearch.toLowerCase()}`
                            }
                        },
                        4,
                        0
                    ]
                },
                nameMatch: {
                    $cond: [
                        {
                            $regexMatch: {
                                input: { $toLower: '$name' },
                                regex: escapedSearch.toLowerCase()
                            }
                        },
                        2,
                        0
                    ]
                },
                phoneMatch: {
                    $cond: [
                        {
                            $regexMatch: {
                                input: { $toString: { $ifNull: ['$phone', ''] } },
                                regex: escapedSearch
                            }
                        },
                        1,
                        0
                    ]
                },
                mealMatch: {
                    $cond: [
                        {
                            $gt: [
                                {
                                    $size: {
                                        $filter: {
                                            input: '$meals',
                                            as: 'meal',
                                            cond: {
                                                $or: [
                                                    {
                                                        $regexMatch: {
                                                            input: { $toLower: { $toString: { $ifNull: ['$$meal.name', ''] } } },
                                                            regex: escapedSearch.toLowerCase()
                                                        }
                                                    },
                                                    {
                                                        $regexMatch: {
                                                            input: { $toLower: { $toString: { $ifNull: ['$$meal.description', ''] } } },
                                                            regex: escapedSearch.toLowerCase()
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                },
                                0
                            ]
                        },
                        2,
                        0
                    ]
                }
            }
        },
        {
            $addFields: {
                searchScore: {
                    $add: [
                        '$exactNameMatch',
                        '$startsWithNameMatch',
                        '$nameMatch',
                        '$phoneMatch',
                        '$mealMatch'
                    ]
                }
            }
        },
        {
            $match: {
                searchScore: { $gt: 0 }
            }
        },
        {
            $sort: {
                searchScore: -1,
                discount: -1,
                ratingsAverage: -1,
                _id: -1
            }
        },
        {
            $project: {
                id: { $toString: '$_id' },
                meals: 0,
                exactNameMatch: 0,
                startsWithNameMatch: 0,
                nameMatch: 0,
                phoneMatch: 0,
                mealMatch: 0,
                searchScore: 0,
                __v: 0,
                deleted: 0,
                password: 0,
                passwordConfirm: 0,
                passwordChangedAt: 0,
                passwordResetToken: 0,
                passwordResetExpires: 0
            }
        },
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [{ $skip: skip }, { $limit: limit }]
            }
        }
    ]);

    const total = searchResult?.metadata?.[0]?.total || 0;
    const data = searchResult?.data || [];

    res.status(200).json({
        status: 'success',
        results: data.length,
        total,
        page,
        limit,
        data
    });
});
