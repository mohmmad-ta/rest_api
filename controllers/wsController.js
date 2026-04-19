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

  const notifications = {
    'create-order': {
      title: 'New order',
      body: `Order #${orderId} was created.`,
    },
    'change-status-to-rest': {
      title: 'Order status updated',
      body: `Order #${orderId} has a new status.`,
    },
    'change-status-to-user': {
      title: 'Order updated',
      body: `Your order #${orderId} status is now ${order?.status || ''}.`.trim(),
    },
    'change-status-to-deli': {
      title: 'New delivery order',
      body: `Order #${orderId} is ready for delivery review.`,
    },
    'change-status-to-delete-from-deli': {
      title: 'Order no longer available',
      body: `Order #${orderId} was assigned or removed.`,
    },
    'change-status-to-deli-forMe-3': {
      title: 'Delivery update',
      body: `Order #${orderId} has been delivered.`,
    },
    'change-status-to-deli-forMe-4': {
      title: 'Delivery update',
      body: `Order #${orderId} was cancelled.`,
    },
  };

  return notifications[type] || {
    title: 'Order update',
    body: `Order #${orderId} has a new update.`,
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
