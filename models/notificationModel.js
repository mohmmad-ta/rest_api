const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        recipientId: {
            type: mongoose.Schema.ObjectId,
            required: [true, 'يرجى إدخال المستلم'],
        },
        recipientRole: {
            type: String,
            enum: ['user', 'restaurant', 'delivery', 'admin'],
            required: [true, 'يرجى إدخال نوع المستلم'],
        },
        orderId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Order',
        },
        type: {
            type: String,
            required: [true, 'يرجى إدخال نوع الإشعار'],
        },
        title: {
            type: String,
            required: [true, 'يرجى إدخال عنوان الإشعار'],
            trim: true,
        },
        titleAr: {
            type: String,
            trim: true,
        },
        message: {
            type: String,
            required: [true, 'يرجى إدخال نص الإشعار'],
            trim: true,
        },
        messageAr: {
            type: String,
            trim: true,
        },
        screen: {
            type: String,
            default: 'notification',
            trim: true,
        },
        openStatusOrder: {
            type: Boolean,
            default: false,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: Date,
        data: {
            type: Object,
            default: {},
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

notificationSchema.index({ recipientRole: 1, recipientId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
