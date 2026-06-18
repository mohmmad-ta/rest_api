const mongoose = require('mongoose');

// Single global settings document holding platform-wide toggles.
const appSettingSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: 'global',
            unique: true,
        },
        // Master switch for the referral program (generate link + reward flow).
        referralsEnabled: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Fetch the single settings doc, creating it with defaults on first use.
appSettingSchema.statics.getSettings = async function () {
    let settings = await this.findOne({ key: 'global' });

    if (!settings) {
        settings = await this.create({ key: 'global' });
    }

    return settings;
};

module.exports = mongoose.model('AppSetting', appSettingSchema);
