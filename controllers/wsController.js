// wsServer.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken')
const { URL } = require('url');
const { sendPushToExternalUser } = require('../utils/oneSignal');
const { createInAppNotification } = require('./notificationController');

let wss = null;
const userSockets = new Map();

function buildPushPayload(type, order) {
  const orderId = order?._id?.toString?.() || order?.id || '';
  const orderStatus = `${order?.status || ''}`;
  const statusLabelEn = {
    '0': 'rejected',
    '1': 'waiting',
    '2': 'preparing',
    '3': 'on the way',
    '4': 'delivered',
  }[orderStatus] || 'updated';
  const statusLabelAr = {
    '0': 'مرفوض',
    '1': 'قيد الانتظار',
    '2': 'قيد التجهيز',
    '3': 'في الطريق',
    '4': 'تم التوصيل',
  }[orderStatus] || 'تم التحديث';

  const notifications = {
    'create-order': {
      title: 'New order',
      titleAr: 'طلب جديد',
      body: `Order #${orderId} was created.`,
      bodyAr: `تم إنشاء الطلب رقم #${orderId}.`,
    },
    'change-status-to-rest': {
      title: 'Order updated',
      titleAr: 'تم تحديث الطلب',
      body: `Order #${orderId} status has been updated.`,
      bodyAr: `تم تحديث حالة الطلب رقم #${orderId}.`,
    },
    'change-status-to-user': {
      title: orderStatus === '4' ? 'Order delivered' : 'Order updated',
      titleAr: orderStatus === '4' ? 'تم توصيل الطلب' : 'تم تحديث الطلب',
      body:
          orderStatus === '4'
              ? `Your order #${orderId} has been delivered.`
              : `Your order #${orderId} is now ${statusLabelEn}.`.trim(),
      bodyAr:
          orderStatus === '4'
              ? `تم توصيل طلبك رقم #${orderId}.`
              : `حالة طلبك رقم #${orderId} أصبحت ${statusLabelAr}.`,
    },
    'change-status-to-deli': {
      title: 'New delivery order',
      titleAr: 'طلب توصيل جديد',
      body: `Order #${orderId} is ready for delivery review.`,
      bodyAr: `الطلب رقم #${orderId} جاهز لمراجعة التوصيل.`,
    },
    'change-status-to-delete-from-deli': {
      title: 'Order no longer available',
      titleAr: 'الطلب لم يعد متاحاً',
      body: `Order #${orderId} was assigned or removed.`,
      bodyAr: `تم إسناد الطلب رقم #${orderId} أو إزالته.`,
    },
    'change-status-to-deli-forMe-3': {
      title: 'Delivery update',
      titleAr: 'تحديث التوصيل',
      body: `Order #${orderId} has been assigned to you.`,
      bodyAr: `تم إسناد الطلب رقم #${orderId} إليك.`,
    },
    'change-status-to-deli-forMe-4': {
      title: 'Delivery update',
      titleAr: 'تحديث التوصيل',
      body: `Order #${orderId} has been completed.`,
      bodyAr: `تم إنهاء الطلب رقم #${orderId}.`,
    },
  };

  return notifications[type] || {
    title: 'Order update',
    titleAr: 'تحديث الطلب',
    body: `Order #${orderId} has a new update.`,
    bodyAr: `يوجد تحديث جديد على الطلب رقم #${orderId}.`,
  };
}

function buildExternalId(userId, role) {
  const normalizedUserId = userId?.toString?.() || `${userId || ''}`.trim();

  if (!normalizedUserId) {
    return null;
  }

  return role ? `${role}:${normalizedUserId}` : normalizedUserId;
}

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    // Parse user ID from query param or JWT token
    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log(url);

    const token = url.searchParams.get('token');

    console.log(token);
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET); // replace with real secret
      userId = decoded.id;
    } catch (err) {
      console.log('Invalid token, closing connection');
      ws.close();
      return;
    }

    // Save the socket by user ID
    userSockets.set(userId, ws);
    console.log(`User ${userId} connected`);

    ws.on('close', () => {
      userSockets.delete(userId);
      console.log(`User ${userId} disconnected`);
    });
  });
}

// Broadcast order to all connected clients
function broadcastOrder(order) {
  const message = JSON.stringify({ type: 'order', data: order });
  if (!wss) return;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function sendOrderToUser(userId, order, type, options = {}) {
  const normalizedUserId = userId?.toString?.() || `${userId || ''}`.trim();
  const ws = userSockets.get(normalizedUserId);
  console.log(`Sending order to user ${userId}`, order);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: type, data: order }));
  }

  Promise.resolve()
      .then(async () => {
        const payload = buildPushPayload(type, order);
        const notificationData = {
          type,
          orderId: order?._id?.toString?.() || order?.id || null,
          status: order?.status || null,
          screen: options.screen || 'notification',
          openStatusOrder: Boolean(options.openStatusOrder),
        };

        if (options.persistNotification) {
          await createInAppNotification({
            recipientId: normalizedUserId,
            recipientRole: options.role,
            order,
            type,
            title: payload.title,
            message: payload.body,
            screen: options.screen || 'notification',
            openStatusOrder: Boolean(options.openStatusOrder),
            data: {
              status: order?.status || null,
            },
          });
        }

        if (options.skipPush) {
          return;
        }

        await sendPushToExternalUser(buildExternalId(normalizedUserId, options.role), {
          ...payload,
          data: notificationData,
        });
      })
      .catch((error) => {
        console.error(`Failed to send OneSignal notification to user ${userId}:`, error.message);
      });
}



module.exports = {
  initWebSocket,
  broadcastOrder,
  sendOrderToUser
};
