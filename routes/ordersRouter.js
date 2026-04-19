const {Router} = require('express');
const {createOrder, getAllMyOrder, getOrderStatus, changStatus, getOrder} = require('../controllers/orderController');
const {protect, restrictTo} = require('../controllers/auth/authController');
const { getMyNotifications, markNotificationAsRead } = require('../controllers/notificationController');
const Order = require('./../models/orderModel');
const User = require('./../models/auth/userModel');
const Delivery = require('./../models/auth/deliveryModel');
const Restaurant = require('./../models/auth/restaurantModel');

const router = Router();



router.get('/getOneOrder/:id', getOrder);
// user Controller
router.get('/user/myAllOrders', protect(User), restrictTo('user'), getAllMyOrder('userId'));
router.get('/user/myNotifications', protect(User), restrictTo('user'), getMyNotifications('user'));
router.patch('/user/myNotifications/:id/read', protect(User), restrictTo('user'), markNotificationAsRead('user'));
router.post('/user/createOrder', protect(User), restrictTo('user'), createOrder);

// Restaurant Controller
router.get('/restaurant/myAllOrders', protect(Restaurant), restrictTo('restaurant'), getAllMyOrder('restaurantId'));
router.get('/restaurant/myNotifications', protect(Restaurant), restrictTo('restaurant'), getMyNotifications('restaurant'));
router.patch('/restaurant/myNotifications/:id/read', protect(Restaurant), restrictTo('restaurant'), markNotificationAsRead('restaurant'));
router.get('/restaurant/getOrderStatus/:id', protect(Restaurant), restrictTo('restaurant'), getOrderStatus('restaurantId'));
router.patch('/restaurant/changStatus', protect(Restaurant), restrictTo('restaurant'), changStatus('restaurantId'));

// Delivery Controller
router.get('/delivery/getOrderStatus/:id', protect(Delivery), restrictTo('delivery'), getOrderStatus('deliveryId'));
router.patch('/delivery/changStatus', protect(Delivery), restrictTo('delivery'), changStatus('deliveryId'));


module.exports = router;
