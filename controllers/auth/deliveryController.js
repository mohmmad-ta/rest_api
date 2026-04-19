const Delivery = require('../../models/auth/deliveryModel');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/appError');


const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

exports.getMeDelivery = async (req, res, next) => {
    req.params.id = req.user.id;
    const user = await Delivery.findById(req.params.id);
    res.status(200).json({
        status: 'success',
        data: user
    });
};
exports.getAllMyDelivery = async (req, res, next) => {
    req.params.id = req.user.id;
    const user = await Delivery.find({restaurantId:req.user.id});
    res.status(200).json({
        status: 'success',
        data: user
    });
};

exports.updateMeDelivery = catchAsync(async (req, res, next) => {
    if (req.body.password || req.body.passwordConfirm) {
        return next(new AppError('This route is not for password updates. Please use /updateMyPassword.', 400));
    }
    const filteredBody = filterObj(req.body, 'name', 'email');
    if (req.file) filteredBody.photo = req.file.filename;
    const updatedUser = await Delivery.findByIdAndUpdate(req.user.id, filteredBody, {
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

exports.deleteMeDelivery = catchAsync(async (req, res, next) => {
    await Delivery.findByIdAndDelete(req.params.id);

    res.status(204).json({
        status: 'success',
        data: null
    });
});