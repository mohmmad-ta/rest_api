const User = require('../models/auth/userModel');
const Restaurant = require('../models/auth/restaurantModel');
const Delivery = require('../models/auth/deliveryModel');

const accountModels = [User, Restaurant, Delivery];

const ensureAccountTimestamps = async () => {
    const results = await Promise.all(
        accountModels.map(async (Model) => {
            const result = await Model.collection.updateMany(
                {
                    $or: [
                        { createdAt: { $exists: false } },
                        { updatedAt: { $exists: false } },
                    ],
                },
                [
                    {
                        $set: {
                            createdAt: {
                                $ifNull: ['$createdAt', { $toDate: '$_id' }],
                            },
                            updatedAt: {
                                $ifNull: [
                                    '$updatedAt',
                                    { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
                                ],
                            },
                        },
                    },
                ]
            );

            return {
                model: Model.modelName,
                modifiedCount: result.modifiedCount,
            };
        })
    );

    const updatedAccounts = results.reduce((total, result) => total + result.modifiedCount, 0);

    if (updatedAccounts > 0) {
        console.log('Backfilled account timestamps:', results);
    }
};

module.exports = ensureAccountTimestamps;
