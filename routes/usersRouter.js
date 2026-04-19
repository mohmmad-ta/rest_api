const {Router} = require('express');
const {deleteMe, getMe, updateMe} = require('../controllers/auth/userController');
const { getMeDelivery, updateMeDelivery, deleteMeDelivery, getAllMyDelivery} = require('../controllers/auth/deliveryController');
const { getMeRestaurant, deleteMeRestaurant, updateMeRestaurant, resizeTourImages, uploadProductPhoto} = require('../controllers/auth/restaurantController');
const { getMeAdmin, adminDeleteDelivery, adminDeleteRestaurant, adminDeleteUser, adminGetAllDelivery, adminGetAllRestaurant, adminUpdateRestaurant, adminGetAllUsers, adminGetDelivery, adminGetRestaurant, adminUpdateUser, adminUpdateDelivery, adminGetUser, adminDashboardSummary, adminGetAllOrders, adminGetOrder, adminUpdateOrder, adminDeleteOrder, adminGetAllMeals, adminGetMeal, adminCreateMeal, adminUpdateMeal, adminDeleteMeal } = require('../controllers/auth/adminController');
const {signupUser, loginAdmin, loginDelivery, loginRestaurant, loginUser, signupDelivery, signupRestaurant, logout, forgotPassword, resetPassword, updatePassword, protect, restrictTo, checkToken, verifyUserSignupOtp, verifyRestaurantSignupOtp, resendUserSignupOtp, resendRestaurantSignupOtp, verifyAdminLoginOtp, resendAdminLoginOtp, requestUserPasswordResetOtp, requestRestaurantPasswordResetOtp, resendUserPasswordResetOtp, resendRestaurantPasswordResetOtp, verifyUserPasswordResetOtp, verifyRestaurantPasswordResetOtp, resetUserPasswordWithOtp, resetRestaurantPasswordWithOtp} = require('../controllers/auth/authController');
const requireAppClient = require('../utils/requireAppClient');
const { authLoginLimiter, authSignupLimiter, otpVerifyLimiter, otpResendLimiter } = require('../utils/securityRateLimiters');
const Admin = require('./../models/auth/adminModel');
const User = require('./../models/auth/userModel');
const Delivery = require('./../models/auth/deliveryModel');
const Restaurant = require('./../models/auth/restaurantModel');

const router = Router();
//  Authentication Controller
router.post('/user/signup', requireAppClient, authSignupLimiter, signupUser);
router.post('/restaurant/signup', requireAppClient, authSignupLimiter, signupRestaurant);
router.post('/delivery/login', requireAppClient, authLoginLimiter, loginDelivery);
router.post('/restaurant/login', requireAppClient, authLoginLimiter, loginRestaurant);
router.post('/user/login', requireAppClient, authLoginLimiter, loginUser);
router.post('/restaurant/verifySignupOtp', requireAppClient, otpVerifyLimiter, verifyRestaurantSignupOtp);
router.post('/user/verifySignupOtp', requireAppClient, otpVerifyLimiter, verifyUserSignupOtp);
router.post('/restaurant/resendSignupOtp', requireAppClient, otpResendLimiter, resendRestaurantSignupOtp);
router.post('/user/resendSignupOtp', requireAppClient, otpResendLimiter, resendUserSignupOtp);
router.post('/user/requestPasswordResetOtp', requireAppClient, authLoginLimiter, requestUserPasswordResetOtp);
router.post('/restaurant/requestPasswordResetOtp', requireAppClient, authLoginLimiter, requestRestaurantPasswordResetOtp);
router.post('/user/verifyPasswordResetOtp', requireAppClient, otpVerifyLimiter, verifyUserPasswordResetOtp);
router.post('/restaurant/verifyPasswordResetOtp', requireAppClient, otpVerifyLimiter, verifyRestaurantPasswordResetOtp);
router.post('/user/resendPasswordResetOtp', requireAppClient, otpResendLimiter, resendUserPasswordResetOtp);
router.post('/restaurant/resendPasswordResetOtp', requireAppClient, otpResendLimiter, resendRestaurantPasswordResetOtp);
router.patch('/user/resetPasswordWithOtp', requireAppClient, authLoginLimiter, resetUserPasswordWithOtp);
router.patch('/restaurant/resetPasswordWithOtp', requireAppClient, authLoginLimiter, resetRestaurantPasswordWithOtp);
router.post('/admin/login', requireAppClient, authLoginLimiter, loginAdmin);
router.post('/admin/verifyLoginOtp', requireAppClient, otpVerifyLimiter, verifyAdminLoginOtp);
router.post('/admin/resendLoginOtp', requireAppClient, otpResendLimiter, resendAdminLoginOtp);
router.get('/logout', requireAppClient, logout);
router.get('/checkToken', requireAppClient, checkToken);


// Delivery Controller
router.patch('/delivery/updateMyPassword', protect(Delivery), restrictTo('delivery'), updatePassword);
router.get('/delivery/getMe', protect(Delivery), restrictTo('delivery'), getMeDelivery);
router.patch('/delivery/updateMe', protect(Delivery), restrictTo('delivery'), updateMeDelivery);
router.patch('/delivery/resetPassword/:token', resetPassword);
router.post('/delivery/forgotPassword', forgotPassword);



// User Controller
router.get('/user/me', protect(User), restrictTo('user'), getMe);
router.patch('/user/updateMe', protect(User), restrictTo('user'), updateMe);
router.delete('/user/deleteMe', protect(User), restrictTo('user'), deleteMe);
router.patch('/user/updateMyPassword', protect(User), restrictTo('user'), updatePassword);


// Restaurant Controller
router.get('/restaurant/getMe', protect(Restaurant), restrictTo('restaurant'), getMeRestaurant);
router.patch('/restaurant/updateMe', protect(Restaurant), restrictTo('restaurant'), uploadProductPhoto, resizeTourImages, updateMeRestaurant);
router.delete('/restaurant/deleteMe', protect(Restaurant), restrictTo('restaurant'), deleteMeRestaurant);
router.post('/restaurant/createDelivery', protect(Restaurant), restrictTo('restaurant'), signupDelivery);
router.get('/restaurant/getAllMyDelivery', protect(Restaurant), restrictTo('restaurant'), getAllMyDelivery);
router.delete('/restaurant/deleteMeDelivery/:id', protect(Restaurant), restrictTo('restaurant'), deleteMeDelivery);
router.patch('/restaurant/updateMyPassword', protect(Restaurant), restrictTo('restaurant'), updatePassword);



router.use(protect(Admin), restrictTo('admin'));

router.get('/admin/getMe', getMeAdmin);
router.get('/admin/dashboard', adminDashboardSummary);

router.get('/admin/user', adminGetAllUsers);
router.get('/admin/restaurant', adminGetAllRestaurant);
router.get('/admin/delivery', adminGetAllDelivery);
router.get('/admin/order', adminGetAllOrders);
router.get('/admin/meal', adminGetAllMeals);

router
    .route('/admin/user/:id')
    .get(adminGetUser)
    .patch(adminUpdateUser)
    .delete(adminDeleteUser);
router
    .route('/admin/restaurant/:id')
    .get(adminGetRestaurant)
    .patch(adminUpdateRestaurant)
    .delete(adminDeleteRestaurant);
router
    .route('/admin/delivery/:id')
    .get(adminGetDelivery)
    .patch(adminUpdateDelivery)
    .delete(adminDeleteDelivery);

router
    .route('/admin/order/:id')
    .get(adminGetOrder)
    .patch(adminUpdateOrder)
    .delete(adminDeleteOrder);

router
    .route('/admin/meal/:id')
    .get(adminGetMeal)
    .patch(adminUpdateMeal)
    .delete(adminDeleteMeal);

router
    .route('/admin/meal')
    .post(adminCreateMeal);

module.exports = router;
