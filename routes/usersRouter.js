const {Router} = require('express');
const {deleteMe, getMe, updateMe} = require('../controllers/auth/userController');
const { getMeDelivery, updateMeDelivery, deleteMeDelivery, getAllMyDelivery} = require('../controllers/auth/deliveryController');
const { getMeRestaurant, deleteMeRestaurant, updateMeRestaurant, resizeTourImages, uploadProductPhoto} = require('../controllers/auth/restaurantController');
const { getMeAdmin, adminDeleteDelivery, adminDeleteRestaurant, adminDeleteUser, adminGetAllDelivery, adminGetAllRestaurant, adminUpdateRestaurant, adminGetAllUsers, adminGetDelivery, adminGetRestaurant, adminUpdateUser, adminUpdateDelivery, adminGetUser, adminDashboardSummary, adminGetAllOrders, adminGetOrder, adminUpdateOrder, adminDeleteOrder, adminGetAllMeals, adminGetMeal, adminCreateMeal, adminUpdateMeal, adminDeleteMeal, adminCreateCoupon, adminGetAllCoupons, adminGetCoupon, adminDeleteCoupon } = require('../controllers/auth/adminController');
const {signupUser, loginAdmin, loginDelivery, loginRestaurant, loginUser, signupDelivery, signupRestaurant, logout, forgotPassword, resetPassword, updatePassword, protect, restrictTo, checkToken, verifyUserSignupOtp, verifyRestaurantSignupOtp, resendUserSignupOtp, resendRestaurantSignupOtp, verifyAdminLoginOtp, resendAdminLoginOtp, requestUserPasswordResetOtp, requestRestaurantPasswordResetOtp, resendUserPasswordResetOtp, resendRestaurantPasswordResetOtp, verifyUserPasswordResetOtp, verifyRestaurantPasswordResetOtp, resetUserPasswordWithOtp, resetRestaurantPasswordWithOtp} = require('../controllers/auth/authController');
const { generateReferralLink, getMyReferrals } = require('../controllers/referralController');
const { authLoginLimiter, authSignupLimiter, otpVerifyLimiter, otpResendLimiter } = require('../utils/securityRateLimiters');
const Admin = require('./../models/auth/adminModel');
const User = require('./../models/auth/userModel');
const Delivery = require('./../models/auth/deliveryModel');
const Restaurant = require('./../models/auth/restaurantModel');

const router = Router();
//  Authentication Controller
router.post('/user/signup', authSignupLimiter, signupUser);
router.post('/restaurant/signup', authSignupLimiter, signupRestaurant);
router.post('/delivery/login', authLoginLimiter, loginDelivery);
router.post('/restaurant/login', authLoginLimiter, loginRestaurant);
router.post('/user/login', authLoginLimiter, loginUser);
router.post('/restaurant/verifySignupOtp', otpVerifyLimiter, verifyRestaurantSignupOtp);
router.post('/user/verifySignupOtp', otpVerifyLimiter, verifyUserSignupOtp);
router.post('/restaurant/resendSignupOtp', otpResendLimiter, resendRestaurantSignupOtp);
router.post('/user/resendSignupOtp', otpResendLimiter, resendUserSignupOtp);
router.post('/user/requestPasswordResetOtp', authLoginLimiter, requestUserPasswordResetOtp);
router.post('/restaurant/requestPasswordResetOtp', authLoginLimiter, requestRestaurantPasswordResetOtp);
router.post('/user/verifyPasswordResetOtp', otpVerifyLimiter, verifyUserPasswordResetOtp);
router.post('/restaurant/verifyPasswordResetOtp', otpVerifyLimiter, verifyRestaurantPasswordResetOtp);
router.post('/user/resendPasswordResetOtp', otpResendLimiter, resendUserPasswordResetOtp);
router.post('/restaurant/resendPasswordResetOtp', otpResendLimiter, resendRestaurantPasswordResetOtp);
router.patch('/user/resetPasswordWithOtp', authLoginLimiter, resetUserPasswordWithOtp);
router.patch('/restaurant/resetPasswordWithOtp', authLoginLimiter, resetRestaurantPasswordWithOtp);
router.post('/admin/login', authLoginLimiter, loginAdmin);
router.post('/admin/verifyLoginOtp', otpVerifyLimiter, verifyAdminLoginOtp);
router.post('/admin/resendLoginOtp', otpResendLimiter, resendAdminLoginOtp);
router.get('/logout', logout);
router.get('/checkToken', checkToken);


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
router.route('/user/referral')
    .get(protect(User), restrictTo('user'), getMyReferrals)
    .post(protect(User), restrictTo('user'), generateReferralLink);


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

router
    .route('/admin/coupon')
    .get(adminGetAllCoupons)
    .post(adminCreateCoupon);

router
    .route('/admin/coupon/:id')
    .get(adminGetCoupon)
    .delete(adminDeleteCoupon);

module.exports = router;
