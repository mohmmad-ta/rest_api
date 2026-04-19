const express = require('express');
const {setRestAndUserIds, createReview, deleteReview, getAllReviews, getReview, updateReview} = require('./../controllers/reviewController');
const {restrictTo, protect} = require('./../controllers/auth/authController');
const User = require("../models/auth/userModel");
const Admin = require("../models/auth/adminModel");

const router = express.Router({ mergeParams: true });


router
    .route('/')
    .get(getAllReviews)
    .post(
        protect(User),
        restrictTo('user'),
        setRestAndUserIds,
        createReview
    );

router
    .route('/:id')
    .get(getReview)
    .patch(
        protect(User),
        restrictTo('user'),
        updateReview
    )
    .delete(
        protect(User),
        restrictTo('user'),
        deleteReview
    );

router
    .route('/admin/:id')
    .get(getReview)
    .patch(
        protect(Admin),
        restrictTo('admin'),
        updateReview
    )
    .delete(
        protect(Admin),
        restrictTo('admin'),
        deleteReview
    );

module.exports = router;