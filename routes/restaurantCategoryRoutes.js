const express = require('express');
const {
    createRestaurantCategory,
    deleteRestaurantCategory,
    getAllRestaurantCategories,
    getRestaurantCategory,
    updateRestaurantCategory
} = require('../controllers/restaurantCategoryController');
const { protect, restrictTo } = require('../controllers/auth/authController');
const Admin = require('../models/auth/adminModel');

const router = express.Router({ mergeParams: true });

router
    .route('/')
    .get(getAllRestaurantCategories)
    .post(
        protect(Admin),
        restrictTo('admin'),
        createRestaurantCategory
    );

router
    .route('/:id')
    .get(getRestaurantCategory)
    .patch(
        protect(Admin),
        restrictTo('admin'),
        updateRestaurantCategory
    )
    .delete(
        protect(Admin),
        restrictTo('admin'),
        deleteRestaurantCategory
    );

module.exports = router;
