const Restaurant = require('../../models/auth/restaurantModel');
const Delivery = require('../../models/auth/deliveryModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');
const multer = require("multer");
const sharp = require("sharp");

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
    fileFilter: multerFilter
});
exports.uploadProductPhoto = upload.fields([
    {name: 'image', maxCount: 1},
])
exports.resizeTourImages = catchAsync(async (req, res, next) => {
    const imageFile = req.files?.image?.[0];

    if (!imageFile) return next();

    const fileName = `${Date.now()}-${req.user.id}.jpeg`;
    req.body.image = `${req.protocol}://${req.get('host')}/public/images/users/${fileName}`;

    await sharp(imageFile.buffer)
        .toFormat('jpeg')
        .jpeg({ quality: 100 })
        .toFile(`public/images/users/${fileName}`);
    next();
});


const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

exports.getMeRestaurant = async (req, res, next) => {
    req.params.id = req.user.id;
    const user = await Restaurant.findById(req.params.id)
        .select('+couponCode +couponPercentage +couponExpiresAt')
        .populate('delivery')
    res.status(200).json({
        status: 'success',
        data: user
    });
};


exports.updateMeRestaurant = catchAsync(async (req, res, next) => {
    const filteredBody = filterObj(
        req.body,
        'name',
        'discount',
        'image',
        'deliveryTime',
        'location',
        'workingHours',
        'couponCode',
        'couponPercentage',
        'couponExpiresAt'
    );

    if (typeof filteredBody.location === 'string') {
        try {
            filteredBody.location = JSON.parse(filteredBody.location);
        } catch (error) {
            return next(new AppError('صيغة الموقع غير صحيحة.', 400));
        }
    }

    if (typeof filteredBody.workingHours === 'string') {
        try {
            filteredBody.workingHours = JSON.parse(filteredBody.workingHours);
        } catch (error) {
            return next(new AppError('صيغة وقت عمل المطعم غير صحيحة.', 400));
        }
    }

    if (typeof filteredBody.couponCode === 'string') {
        const normalizedCouponCode = filteredBody.couponCode.trim().toUpperCase();
        if (!normalizedCouponCode) {
            delete filteredBody.couponCode;
            delete filteredBody.couponPercentage;
            delete filteredBody.couponExpiresAt;
            filteredBody.$unset = {
                ...(filteredBody.$unset || {}),
                couponCode: 1,
                couponPercentage: 1,
                couponExpiresAt: 1,
            };
        } else {
            filteredBody.couponCode = normalizedCouponCode;
        }
    }

    if (filteredBody.couponPercentage !== undefined) {
        filteredBody.couponPercentage = Number(filteredBody.couponPercentage);

        if (!Number.isFinite(filteredBody.couponPercentage) || filteredBody.couponPercentage <= 0) {
            return next(new AppError('نسبة كود الخصم غير صحيحة.', 400));
        }
    }

    if (typeof filteredBody.couponExpiresAt === 'string') {
        const normalizedCouponExpiresAt = filteredBody.couponExpiresAt.trim();

        if (!normalizedCouponExpiresAt) {
            delete filteredBody.couponExpiresAt;
            filteredBody.$unset = {
                ...(filteredBody.$unset || {}),
                couponExpiresAt: 1,
            };
        } else {
            const expiresAtDate = new Date(normalizedCouponExpiresAt);

            if (Number.isNaN(expiresAtDate.getTime())) {
                return next(new AppError('وقت انتهاء كود الخصم غير صحيح.', 400));
            }

            if (expiresAtDate.getTime() <= Date.now()) {
                return next(new AppError('وقت انتهاء كود الخصم يجب أن يكون في المستقبل.', 400));
            }

            filteredBody.couponExpiresAt = expiresAtDate;
        }
    }

    if (filteredBody.couponCode) {
        if (filteredBody.couponPercentage === undefined) {
            return next(new AppError('يرجى إدخال نسبة كود الخصم.', 400));
        }

        if (!filteredBody.couponExpiresAt) {
            return next(new AppError('يرجى إدخال وقت انتهاء كود الخصم.', 400));
        }
    }

    if (req.file) filteredBody.photo = req.file.filename;
    const updatedUser = await Restaurant.findByIdAndUpdate(
        req.user.id,
        filteredBody,
        {
            new: true,
            runValidators: true
        }
    ).select('+couponCode +couponPercentage +couponExpiresAt');

    res.status(200).json({
        status: 'success',
        data: {
            user: updatedUser
        }
    });
});

exports.deleteMeRestaurant = catchAsync(async (req, res, next) => {
    await Restaurant.findByIdAndUpdate(req.user.id, { deleted: true });

    res.status(204).json({
        status: 'success',
        data: null
    });
});
