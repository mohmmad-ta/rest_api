const Admin = require("../models/auth/adminModel");

module.exports = async () => {
    const adminUserID = process.env.ADMIN_USER_ID;
    const adminPhone = process.env.ADMIN_PHONE;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUserID || !adminPhone || !adminPassword) {
        console.warn("Admin bootstrap skipped: ADMIN_USER_ID, ADMIN_PHONE or ADMIN_PASSWORD is missing.");
        return;
    }

    if (adminPassword === "change_this_admin_password" || adminPassword.length < 12) {
        console.warn("Admin bootstrap skipped: ADMIN_PASSWORD is too weak or still uses the placeholder value.");
        return;
    }

    const existingAdmin = await Admin.findOne({ userID: adminUserID }).setOptions({
        includeInactive: true,
    });

    if (existingAdmin) {
        if (existingAdmin.phone !== adminPhone) {
            existingAdmin.phone = adminPhone;
            await existingAdmin.save({ validateBeforeSave: false });
            console.log("Admin phone updated from environment configuration.");
        }
        return;
    }

    await Admin.create({
        userID: adminUserID,
        phone: adminPhone,
        password: adminPassword,
        passwordConfirm: adminPassword,
    });

    console.log("Admin account created from environment configuration.");
};
