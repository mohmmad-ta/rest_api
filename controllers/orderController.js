const Order = require('./../models/orderModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('./../utils/appError');
const APIFeatures = require('./../utils/apiFeatures');
const Delivery = require("../models/auth/deliveryModel");
const Restaurant = require("../models/auth/restaurantModel");
const {sendRealtimeOrderToUser, sendNotificationToUser, broadcastOrder} = require("./wsController");
const MAX_RESTAURANT_ORDER_RADIUS_KM = 10;

const getStartOfYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setHours(0, 0, 0, 0);
    return date;
};

const getValidCoordinates = (location) => {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return { latitude, longitude };
};

const calculateDistanceKm = (from, to) => {
    const toRadians = (value) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
};

exports.aliasTopTours = (req, res, next) => {
    req.query.limit = '5';
    req.query.sort = '-ratingsAverage,price';
    req.query.fields = 'name,price,ratingsAverage';
    next();
};

exports.createOrder = catchAsync(async (req, res, next)=>{
    const restaurant = await Restaurant.findById(req.body.restaurantId).select('location');

    if (!restaurant) {
        return next(new AppError('المطعم غير موجود.', 404));
    }

    const restaurantCoordinates = getValidCoordinates(restaurant.location);
    const userCoordinates = getValidCoordinates(req.body.location);

    if (!restaurantCoordinates) {
        return next(new AppError('موقع المطعم غير مضبوط بشكل صحيح.', 400));
    }

    if (!userCoordinates) {
        return next(new AppError('موقع العميل غير صالح.', 400));
    }

    const distanceKm = calculateDistanceKm(userCoordinates, restaurantCoordinates);

    if (distanceKm > MAX_RESTAURANT_ORDER_RADIUS_KM) {
        return next(
            new AppError(`موقع العميل خارج نطاق توصيل المطعم. الحد الأقصى ${MAX_RESTAURANT_ORDER_RADIUS_KM} كم.`, 400)
        );
    }

    const order = await Order.create({
        userId: req.user.id,
        restaurantId: req.body.restaurantId,
        item: req.body.item,
        location: req.body.location,
        antherPhone: req.body.antherPhone,
    });

    sendRealtimeOrderToUser(req.user.id, order, "create-order");
    sendRealtimeOrderToUser(req.body.restaurantId, order, "create-order");
    sendNotificationToUser(req.body.restaurantId, order, "create-order", {
        role: "restaurant",
        persistNotification: true,
    });

    res.status(200).json({
        status: 'success',
        data: {
            order: order
        }
    });
})

exports.getOrder = async (req, res, next) => {
    const query = Order.findById(req.params.id);

    if (req.query.includeDeleted === 'true') {
        query.setOptions({ includeDeleted: true });
    }

    const data = await query;
    res.status(200).json({
        status: 'success',
        data: data
    });
};
exports.getAllMyOrder = (id) => catchAsync(async (req, res, next) => {
    const features = new APIFeatures(
        Order.find({
            [id]: req.user.id,
            createdAt: { $gte: getStartOfYesterday() }
        }),
        req.query
    )
        .filter()
        .sort("-createdAt")
        .limitFields()
        .paginate();

    const data = await features.query;

    res.status(200).json({
        status: 'success',
        data: data
    });
});

exports.getLastActiveUserOrder = catchAsync(async (req, res) => {
    const data = await Order.findOne({
        userId: req.user.id,
        status: { $nin: ['0', '4'] },
    }).sort('-createdAt');

    res.status(200).json({
        status: 'success',
        data,
    });
});

exports.getOrderStatus = (id) => async (req, res, next) => {
    let idParams = req.user.id;
    let access = id;
    if (access === "deliveryId" && req.params.id === "2") {
        access = 'restaurantId'
        idParams = req.user.restaurantId.toHexString()
    }
    const data = await Order.find({
        [access]: idParams,
        status: req.params.id,
        createdAt: { $gte: getStartOfYesterday() }
    }).sort("-createdAt");
    res.status(200).json({
        status: 'success',
        data: data
    });
};

exports.changStatus = (id) => async (req, res, next) => {
    let idParams = req.user.id;
    let access = id;
    if (id === "deliveryId" && req.body.lastState === "2") {
        access = 'restaurantId';
        idParams = req.user.restaurantId.toHexString();
    }else if (id === "restaurantId" && req.body.lastState === "2"){
        return res.status(404).json({ status: 'fail', message: 'Order not found' });
    }

    const filter = { [access]: idParams, _id: req.body.id };
    const update = { status: req.body.status };
    if (req.body.lastState === "2") {
        update.deliveryId = req.user.id;
    }

    const data = await Order.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true
    });

    if (!data) {
        return res.status(404).json({ status: 'fail', message: 'Order not found' });
    }

    const restaurantId = data.restaurantId.id;
    const deli = await Restaurant.findById(restaurantId).populate('delivery');

    // Send to all delivery users
    if (data.status === "2") {
        if (deli?.delivery?.length) {
            deli.delivery.forEach((item) => {
                sendRealtimeOrderToUser(item._id.toString(), data, `change-status-to-deli`);
                sendNotificationToUser(item._id.toString(), data, `change-status-to-deli`, {
                    role: "delivery",
                    persistNotification: true,
                });
            });
        }
    }else if (data.status === "3"){
        if (deli?.delivery?.length) {
            deli.delivery.forEach((item) => {
                sendRealtimeOrderToUser(item._id.toString(), data, `change-status-to-delete-from-deli`);
                sendNotificationToUser(item._id.toString(), data, `change-status-to-delete-from-deli`, {
                    role: "delivery",
                    persistNotification: true,
                });
            });
        }
        sendRealtimeOrderToUser(data.deliveryId?.id || data.deliveryId?._id || data.deliveryId, data, `change-status-to-deli-forMe-3`);
        sendNotificationToUser(data.deliveryId?.id || data.deliveryId?._id || data.deliveryId, data, `change-status-to-deli-forMe-3`, {
            role: "delivery",
            persistNotification: true,
        });

    }else if (data.status === "4"){
        sendRealtimeOrderToUser(data.deliveryId?.id || data.deliveryId?._id || data.deliveryId, data, `change-status-to-deli-forMe-4`);
        sendNotificationToUser(data.deliveryId?.id || data.deliveryId?._id || data.deliveryId, data, `change-status-to-deli-forMe-4`, {
            role: "delivery",
            persistNotification: true,
        });
    }
    // Send to restaurant
    sendRealtimeOrderToUser(restaurantId, data, `change-status-to-rest`);
    sendNotificationToUser(restaurantId, data, `change-status-to-rest`, {
        role: "restaurant",
        persistNotification: false,
    });

    // Send to customer
    sendRealtimeOrderToUser(data.userId.id, data, `change-status-to-user`);
    sendNotificationToUser(data.userId.id, data, `change-status-to-user`, {
        role: "user",
        persistNotification: true,
        screen: data.status === "4" ? "rateRestaurant" : "notification",
        openStatusOrder: false,
    });

    res.status(200).json({
        status: 'success',
        data
    });
};
