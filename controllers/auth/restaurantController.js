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
    const user = await Restaurant.findById(req.params.id).populate('delivery')
    res.status(200).json({
        status: 'success',
        data: user
    });
};


exports.updateMeRestaurant = catchAsync(async (req, res, next) => {
    const filteredBody = filterObj(req.body, 'name', 'discount', 'image', 'deliveryTime', 'location');

    if (typeof filteredBody.location === 'string') {
        try {
            filteredBody.location = JSON.parse(filteredBody.location);
        } catch (error) {
            return next(new AppError('صيغة الموقع غير صحيحة.', 400));
        }
    }

    if (req.file) filteredBody.photo = req.file.filename;
    const updatedUser = await Restaurant.findByIdAndUpdate(req.user.id, filteredBody, {
        new: true,
        runValidators: true
    });

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
