// wsServer.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken')
const { URL } = require('url');
const { sendPushToExternalUser } = require('../utils/oneSignal');
const { buildNotificationTemplate } = require('../utils/notificationTemplates');
const { createInAppNotification } = require('./notificationController');

let wss = null;
const userSockets = new Map();

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

function sendRealtimeOrderToUser(userId, order, type) {
  const normalizedUserId = userId?.toString?.() || `${userId || ''}`.trim();
  const ws = userSockets.get(normalizedUserId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: type, data: order }));
  }
}

function sendNotificationToUser(userId, order, type, options = {}) {
  const normalizedUserId = userId?.toString?.() || `${userId || ''}`.trim();

  Promise.resolve()
      .then(async () => {
        const payload = buildNotificationTemplate(type, order);
        const notificationData = {
          type,
          template: payload.key,
          orderId: order?._id?.toString?.() || order?.id || null,
          status: order?.status || null,
          screen: options.screen || 'notification',
          openStatusOrder: Boolean(options.openStatusOrder),
        };

        if (normalizedUserId && options.role && options.persistNotification !== false) {
          try {
            await createInAppNotification({
              recipientId: normalizedUserId,
              recipientRole: options.role,
              order,
              type,
              title: payload.title,
              titleAr: payload.titleAr,
              message: payload.body,
              messageAr: payload.bodyAr,
              screen: options.screen || 'notification',
              openStatusOrder: Boolean(options.openStatusOrder),
              data: notificationData,
            });
          } catch (error) {
            console.error(`Failed to persist notification for user ${userId}:`, error?.message || error);
          }
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
  sendRealtimeOrderToUser,
  sendNotificationToUser
};
