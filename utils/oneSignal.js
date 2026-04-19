const axios = require('axios');

const ONE_SIGNAL_API_URL = 'https://api.onesignal.com/notifications';

const buildHeaders = () => ({
    Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
    'Content-Type': 'application/json',
});

const sendPushToExternalUser = async (externalId, payload) => {
    if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
        return null;
    }

    if (!externalId) return null;

    const body = {
        app_id: process.env.ONESIGNAL_APP_ID,
        include_aliases: {
            external_id: [externalId.toString()],
        },
        target_channel: 'push',
        headings: {
            en: payload.title || 'Notification',
        },
        contents: {
            en: payload.body || '',
        },
        data: payload.data || {},
    };

    const { data } = await axios.post(ONE_SIGNAL_API_URL, body, {
        headers: buildHeaders(),
        timeout: 10000,
    });

    return data;
};

module.exports = {
    sendPushToExternalUser,
};
