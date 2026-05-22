const mongoose = require('mongoose');

const DEFAULT_RESTAURANT_CATEGORY_ID = new mongoose.Types.ObjectId('665090f1b84408df1e61c421');
const DEFAULT_RESTAURANT_CATEGORY_NAME = 'مطعم';

module.exports = {
    DEFAULT_RESTAURANT_CATEGORY_ID,
    DEFAULT_RESTAURANT_CATEGORY_NAME
};
