const Admin = require("../models/auth/adminModel");

const isStrongBootstrapPassword = (password) =>
    password &&
    password !== "change_this_admin_password" &&
    password.length >= 12;

const parseAdditionalAdminAccounts = () => {
    const rawAccounts = process.env.ADMIN_ADDITIONAL_ACCOUNTS_JSON;

    if (!rawAccounts) {
        return [];
    }

    try {
        const accounts = JSON.parse(rawAccounts);

        if (!Array.isArray(accounts)) {
            console.warn("Additional admin bootstrap skipped: ADMIN_ADDITIONAL_ACCOUNTS_JSON must be a JSON array.");
            return [];
        }

        return accounts;
    } catch (error) {
        console.warn("Additional admin bootstrap skipped: ADMIN_ADDITIONAL_ACCOUNTS_JSON is not valid JSON.");
        return [];
    }
};

const ensureBootstrapAdmin = async ({ userID, phone, password }, source) => {
    if (!userID || !phone || !password) {
        console.warn(`Admin bootstrap skipped from ${source}: userID, phone or password is missing.`);
        return;
    }

    if (!isStrongBootstrapPassword(password)) {
        console.warn(`Admin bootstrap skipped from ${source}: password is too weak or still uses the placeholder value.`);
        return;
    }

    const existingAdmin = await Admin.findOne({ userID })
        .setOptions({
            includeInactive: true,
        })
        .select("+password");

    if (existingAdmin) {
        let shouldSave = false;
        let passwordChanged = false;

        if (existingAdmin.phone !== phone) {
            existingAdmin.phone = phone;
            shouldSave = true;
        }

        if (!(await existingAdmin.correctPassword(password, existingAdmin.password))) {
            existingAdmin.password = password;
            existingAdmin.passwordConfirm = password;
            shouldSave = true;
            passwordChanged = true;
        }

        if (shouldSave) {
            await existingAdmin.save({
                validateBeforeSave: passwordChanged,
            });
            console.log(`Admin account ${userID} synchronized from ${source}.`);
        }

        return;
    }

    await Admin.create({
        userID,
        phone,
        password,
        passwordConfirm: password,
    });

    console.log(`Admin account ${userID} created from ${source}.`);
};

module.exports = async () => {
    const primaryAdmin = {
        userID: process.env.ADMIN_USER_ID,
        phone: process.env.ADMIN_PHONE,
        password: process.env.ADMIN_PASSWORD,
        source: "ADMIN_USER_ID environment configuration",
    };
    const hasPrimaryAdminConfig = primaryAdmin.userID || primaryAdmin.phone || primaryAdmin.password;
    const adminAccounts = [
        ...(hasPrimaryAdminConfig ? [primaryAdmin] : []),
        ...parseAdditionalAdminAccounts().map((account, index) => ({
            userID: account?.userID,
            phone: account?.phone,
            password: account?.password,
            source: `ADMIN_ADDITIONAL_ACCOUNTS_JSON[${index}]`,
        })),
    ];

    for (const { source, ...account } of adminAccounts) {
        await ensureBootstrapAdmin(account, source);
    }
};
