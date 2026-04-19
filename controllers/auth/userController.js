const User = require('../../models/auth/userModel');
const catchAsync = require('../../utils/catchAsync');
const Delivery = require("../../models/auth/deliveryModel");


const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

exports.getMe = async (req, res, next) => {
    console.log(req.user.id)
    const user = await User.findById(req.user.id);
    res.status(200).json({
        status: 'success',
        data: user
    });
};

exports.updateMe = catchAsync(async (req, res, next) => {
    const filteredBody = filterObj(req.body, 'location');
    const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
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

exports.deleteMe = catchAsync(async (req, res, next) => {
    await User.findByIdAndUpdate(req.user.id, { active: false });

    res.status(204).json({
        status: 'success',
        data: null
    });
});
