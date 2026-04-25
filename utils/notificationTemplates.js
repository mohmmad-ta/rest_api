const buildNotificationTemplate = (type, order) => {
    const orderStatus = `${order?.status || ''}`;

    const templates = {
        'create-order': {
            key: 'create-order',
            title: 'New order received',
            titleAr: 'تم استلام طلب جديد',
            body: 'A new order has been placed.',
            bodyAr: 'تم إنشاء طلب جديد.',
        },
        'change-status-to-rest': {
            key: 'change-status-to-rest',
            title: 'Order status changed',
            titleAr: 'تم تغيير حالة الطلب',
            body: 'An order has a new status update.',
            bodyAr: 'يوجد تحديث جديد على حالة الطلب.',
        },
        'change-status-to-user': {
            key: orderStatus === '4' ? 'rate-restaurant' : 'change-status-to-user',
            title:
                orderStatus === '2'
                    ? 'Your order is being prepared'
                    : orderStatus === '3'
                        ? 'Your order is on the way'
                        : orderStatus === '4'
                            ? 'Rate your restaurant'
                            : orderStatus === '0'
                                ? 'Your order was rejected'
                                : 'Order update',
            titleAr:
                orderStatus === '2'
                    ? 'طلبك قيد التجهيز'
                    : orderStatus === '3'
                        ? 'طلبك في الطريق'
                        : orderStatus === '4'
                            ? 'قيّم المطعم'
                            : orderStatus === '0'
                                ? 'تم رفض طلبك'
                                : 'تحديث الطلب',
            body:
                orderStatus === '2'
                    ? 'Restaurant started preparing your order.'
                    : orderStatus === '3'
                        ? 'Your order is now on the way to you.'
                        : orderStatus === '4'
                            ? 'Your order has been delivered. Rate the restaurant now.'
                            : orderStatus === '0'
                                ? 'Your order was rejected by the restaurant.'
                                : 'Your order has a new update.',
            bodyAr:
                orderStatus === '2'
                    ? 'بدأ المطعم بتجهيز طلبك.'
                    : orderStatus === '3'
                        ? 'طلبك أصبح في الطريق إليك.'
                        : orderStatus === '4'
                            ? 'تم توصيل طلبك. قيّم المطعم الآن.'
                            : orderStatus === '0'
                                ? 'تم رفض طلبك من قبل المطعم.'
                                : 'يوجد تحديث جديد على طلبك.',
        },
        'change-status-to-deli': {
            key: 'change-status-to-deli',
            title: 'New delivery request',
            titleAr: 'طلب توصيل جديد',
            body: 'An order is ready for delivery.',
            bodyAr: 'يوجد طلب جاهز للتوصيل.',
        },
        'change-status-to-delete-from-deli': {
            key: 'change-status-to-delete-from-deli',
            title: 'Order no longer available',
            titleAr: 'الطلب لم يعد متاحاً',
            body: 'This order has already been assigned.',
            bodyAr: 'تم إسناد هذا الطلب بالفعل.',
        },
        'change-status-to-deli-forMe-3': {
            key: 'change-status-to-deli-forMe-3',
            title: 'Order assigned to you',
            titleAr: 'تم إسناد الطلب إليك',
            body: 'You are now responsible for this order.',
            bodyAr: 'أصبحت مسؤولاً الآن عن هذا الطلب.',
        },
        'change-status-to-deli-forMe-4': {
            key: 'change-status-to-deli-forMe-4',
            title: 'Delivery completed',
            titleAr: 'تم إنهاء التوصيل',
            body: 'The order has been completed successfully.',
            bodyAr: 'تم إنهاء الطلب بنجاح.',
        },
    };

    return templates[type] || {
        key: 'order-update',
        title: 'Order update',
        titleAr: 'تحديث الطلب',
        body: 'An order has a new update.',
        bodyAr: 'يوجد تحديث جديد على الطلب.',
    };
};

module.exports = {
    buildNotificationTemplate,
};
