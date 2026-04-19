const express = require('express');
const {createCategory, deleteCategory, getAllCategory, getCategory, updateCategory} = require('./../controllers/categoryController');
const {restrictTo, protect} = require('./../controllers/auth/authController');
const Admin = require("../models/auth/adminModel");

const router = express.Router({ mergeParams: true });


router
    .route('/')
    .get(getAllCategory)
    .post(
        protect(Admin),
        restrictTo('admin'),
        createCategory
    );

router
    .route('/:id')
    .get(getCategory)
    .patch(
        protect(Admin),
        restrictTo('admin'),
        updateCategory
    )
    .delete(
        protect(Admin),
        restrictTo('admin'),
        deleteCategory
    );

module.exports = router;