const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.createInAppNotification = async ({
    recipientId,
    recipientRole,
    order,
    type,
    title,
    titleAr,
    message,
    messageAr,
    screen = 'notification',
    openStatusOrder = false,
    data = {},
}) => {
    if (!recipientId || !recipientRole || !type || !title || !message) {
        return null;
    }

    return Notification.create({
        recipientId,
        recipientRole,
        orderId: order?._id || order?.id || undefined,
        type,
        title,
        titleAr,
        message,
        messageAr,
        screen,
        openStatusOrder,
        data,
    });
};

exports.getMyNotifications = (role) =>
    catchAsync(async (req, res) => {
        const notifications = await Notification.find({
            recipientId: req.user.id,
            recipientRole: role,
        }).sort('-createdAt');

        res.status(200).json({
            status: 'success',
            results: notifications.length,
            data: notifications,
        });
    });

exports.markNotificationAsRead = (role) =>
    catchAsync(async (req, res, next) => {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                recipientId: req.user.id,
                recipientRole: role,
            },
            {
                isRead: true,
                readAt: new Date(),
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!notification) {
            return next(new AppError('Notification not found', 404));
        }

        res.status(200).json({
            status: 'success',
            data: notification,
        });
    });
