const {Router} = require('express');
const { getMeDelivery, updateMeDelivery, deleteMeDelivery} = require('../controllers/auth/deliveryController');
const { getMeRestaurant, deleteMeRestaurant, updateMeRestaurant} = require('../controllers/auth/restaurantController');
const {createMeal, deleteMeal, getMeal, getRestaurantMeal, updateMeal, updateMealActive, getAllMyMeals, getRestaurantMeals, getAllRestaurant, resizeTourImages, uploadProductPhoto, getRestaurantSearch, getRandomRestaurants, normalizeMealBody} = require('../controllers/mealController');
const {protect, restrictTo} = require('../controllers/auth/authController');
const User = require('./../models/auth/userModel');
const Delivery = require('./../models/auth/deliveryModel');
const Restaurant = require('./../models/auth/restaurantModel');

const router = Router();

router.get('/', getAllRestaurant);
router.get('/search', getRestaurantSearch);
router.get('/random', getRandomRestaurants);
router.get('/:id', getRestaurantMeals);
router.get('/getMeal/:id', getMeal);

// Restaurant Controller
router.get('/restaurant/MyMeals', protect(Restaurant), restrictTo('restaurant'), getAllMyMeals);
router.get('/restaurant/getMeal/:id', protect(Restaurant), restrictTo('restaurant'), getRestaurantMeal);
router.post('/restaurant/createMeal', protect(Restaurant), restrictTo('restaurant'), uploadProductPhoto, resizeTourImages, normalizeMealBody, createMeal);
router.patch('/restaurant/updateMealActive/:id', protect(Restaurant), restrictTo('restaurant'), updateMealActive);
router.delete('/restaurant/deleteMeal/:id', protect(Restaurant), restrictTo('restaurant'), deleteMeal);
router.patch('/restaurant/updateMeal/:id', protect(Restaurant), restrictTo('restaurant'), uploadProductPhoto, resizeTourImages, normalizeMealBody, updateMeal);


module.exports = router;
