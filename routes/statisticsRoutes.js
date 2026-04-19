const { Router } = require('express');
const {
    getAdminOverviewStatistics,
    getAdminRestaurantsStatistics,
    getAdminRestaurantStatistics,
    getRestaurantStatistics
} = require('../controllers/statisticsController');
const { protect, restrictTo } = require('../controllers/auth/authController');
const Admin = require('../models/auth/adminModel');
const Restaurant = require('../models/auth/restaurantModel');

const router = Router();

router.get(
    '/admin/overview',
    protect(Admin),
    restrictTo('admin'),
    getAdminOverviewStatistics
);

router.get(
    '/admin/restaurants',
    protect(Admin),
    restrictTo('admin'),
    getAdminRestaurantsStatistics
);

router.get(
    '/admin/restaurants/:id',
    protect(Admin),
    restrictTo('admin'),
    getAdminRestaurantStatistics
);

router.get(
    '/restaurant/overview',
    protect(Restaurant),
    restrictTo('restaurant'),
    getRestaurantStatistics
);

module.exports = router;
