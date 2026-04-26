const ONE_SIGNAL_API_URL = 'https://api.onesignal.com/notifications?c=push';
const getOneSignalApiKey = () =>
    process.env.ONESIGNAL_APP_API_KEY || process.env.ONESIGNAL_REST_API_KEY;

const isLikelyExternalIdKey = (value = '') => value.startsWith('os_v2_app_');

const buildHeaders = () => ({
    Authorization: `Key ${getOneSignalApiKey()}`,
    'Content-Type': 'application/json',
});

const sendPushToExternalUser = async (externalId, payload) => {
    const apiKey = getOneSignalApiKey();

    if (!process.env.ONESIGNAL_APP_ID || !apiKey) {
        console.warn('OneSignal is not configured. Missing ONESIGNAL_APP_ID or ONESIGNAL_APP_API_KEY.');
        return null;
    }

    if (!externalId) return null;

    if (isLikelyExternalIdKey(apiKey)) {
        console.error(
            'OneSignal API key looks incorrect. ONESIGNAL_APP_API_KEY/ONESIGNAL_REST_API_KEY is using an external-id key, not an App API key.'
        );
        return null;
    }

    const body = {
        app_id: process.env.ONESIGNAL_APP_ID,
        include_aliases: {
            external_id: [externalId.toString()],
        },
        target_channel: 'push',
        headings: {
            en: payload.title || 'Notification',
            ar: payload.titleAr || payload.title || 'إشعار',
        },
        contents: {
            en: payload.body || '',
            ar: payload.bodyAr || payload.body || '',
        },
        data: payload.data || {},
    };

    try {
        const response = await fetch(ONE_SIGNAL_API_URL, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(body),
        });

        const rawBody = await response.text();
        const data = rawBody ? JSON.parse(rawBody) : {};

        if (!response.ok) {
            console.error('OneSignal send failed:', {
                status: response.status,
                externalId,
                response: data,
            });
            throw new Error(JSON.stringify(data));
        }

        return data;
    } catch (error) {
        console.error('OneSignal send failed:', {
            externalId,
            response: error?.message || error,
        });

        throw error;
    }
};

module.exports = {
    sendPushToExternalUser,
};
