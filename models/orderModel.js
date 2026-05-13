const mongoose = require('mongoose');
const AppError = require('../utils/appError');

const SERVICE_FEES = 250;

const roundPriceToNearestStep = (value, step = 250) => {
    const amount = Number(value || 0);
    const safeStep = Number(step || 0);

    if (!Number.isFinite(amount) || !Number.isFinite(safeStep) || safeStep <= 0) {
        return amount;
    }

    return Math.round(amount / safeStep) * safeStep;
};

const normalizeChoiceTitle = (value) => String(value || '').trim();

const getMealTagPrice = (meal, selectedTag) => {
    const selectedTitle = normalizeChoiceTitle(selectedTag?.title);

    if (!selectedTitle) {
        return null;
    }

    const matchedTag = (meal?.tags || []).find((tag) => normalizeChoiceTitle(tag?.title) === selectedTitle);

    if (!matchedTag) {
        return null;
    }

    return Number(matchedTag.price || 0);
};

const getMealOptionPrice = (meal, selectedOption) => {
    const selectedTitle = normalizeChoiceTitle(selectedOption?.title);

    if (!selectedTitle) {
        return null;
    }

    const matchedOption = (meal?.options || []).find((option) => normalizeChoiceTitle(option?.title) === selectedTitle);

    if (!matchedOption) {
        return null;
    }

    return Number(matchedOption.price || 0);
};

const orderSchema = new mongoose.Schema(
    {
        item: [
            {
                Id: {
                    type: mongoose.Schema.ObjectId,
                    ref: 'Meal',
                    required: [true, 'يرجى إدخال رقم الوجبة'],
                },
                notes: [
                    {
                        title: {
                            type: String,
                        },
                    }
                ],
                tags: [
                    {
                        title: {
                            type: String,
                        },
                        price: {
                            type: Number,
                            default: 0,
                        },
                    }
                ],
                option: {
                    title: {
                        type: String,
                    },
                    price: {
                        type: Number,
                        default: 0,
                    },
                },
                count: {
                    type: Number,
                    required: [true, 'يرجى إدخال عدد الوجبات'],
                }
            }
        ],
        userId: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: [true, 'يرجى إدخال رقم المستخدم'],
        },
        deliveryId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Delivery'
        },
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: [true, 'يرجى إدخال رقم المطعم'],
        },
        location: {
            type: Object,
            required: [true, 'يرجى إدخال الموقع'],
        },
        createdAt: {
            type: Date,
            default: Date.now(),
        },
        restaurantOrderDay: {
            type: String,
            trim: true,
        },
        restaurantOrderNumber: {
            type: Number,
            min: 1,
        },
        antherPhone: {
            type: String,
            trim: true,
            required: [true, 'يرجى إدخال رقم الهاتف'],
        },
        couponCode: {
            type: String,
            trim: true,
            uppercase: true,
        },
        couponPercentage: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['0', '1', '2', '3', '4'], // 0=deleted, 1=pending, 2=preparing, 3=on the way, 4=delivered
            default: '1'
        },
        totalPrice: {
            type: Number,
            default: 0
        },
        serviceFees: {
            type: Number,
            default: SERVICE_FEES
        },
        totalPriceBeforeDiscount: {
            type: Number,
            default: 0
        }
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

orderSchema.index({ restaurantId: 1, restaurantOrderDay: 1, restaurantOrderNumber: -1 });

// Auto populate relations when finding
orderSchema.pre(/^find/, function(next) {
    if (!this.getOptions().includeDeleted) {
        this.find({ status: { $ne: '0' } });
    }

    this.populate({
        path: 'restaurantId',
        select: '-__v -slug'
    }).populate({
        path: 'userId',
        select: '-__v -location -role'
    }).populate({
        path: 'item.Id',
        select: '-__v -role'
    }).populate({
        path: 'deliveryId',
        select: '-__v -role'
    });

    next();
});

// Calculate total price before saving
orderSchema.pre('save', async function (next) {
    if (!this.isModified('item') && !this.isModified('couponPercentage')) return next();

    // Populate meals and restaurant to get price and discount
    await this.populate('item.Id');
    await this.populate('restaurantId'); // For discount

    let total = 0;

    for (const el of this.item) {
        if (el?.Id?.price) {
            // Base meal price × count
            let basePrice = el.Id.price * el.count;

            // Tags price × count
            let tagsPrice = 0;
            if (el.tags && el.tags.length > 0) {
                for (const tag of el.tags) {
                    const backendTagPrice = getMealTagPrice(el.Id, tag);

                    if (backendTagPrice === null) {
                        return next(new AppError('خيار الإضافة غير صالح لهذه الوجبة.', 400));
                    }

                    tag.price = backendTagPrice;
                    tagsPrice += backendTagPrice;
                }

                tagsPrice *= el.count;
            }

            let optionPrice = 0;
            if (el.option?.title) {
                const backendOptionPrice = getMealOptionPrice(el.Id, el.option);

                if (backendOptionPrice === null) {
                    return next(new AppError('خيار الوجبة غير صالح.', 400));
                }

                el.option.price = backendOptionPrice;
                optionPrice = backendOptionPrice * el.count;
            }

            total += basePrice + tagsPrice + optionPrice;
        }
    }

    this.totalPriceBeforeDiscount = total;

    let restaurantDiscount = Number(this.restaurantId?.discount || 0) / 100;
    const restaurantDiscountAmount = total * restaurantDiscount;
    const totalAfterRestaurantDiscount = total - restaurantDiscountAmount;

    let couponDiscount = Number(this.couponPercentage || 0) / 100;
    const couponDiscountAmount = totalAfterRestaurantDiscount * couponDiscount;

    this.serviceFees = SERVICE_FEES;
    this.totalPrice = roundPriceToNearestStep(totalAfterRestaurantDiscount - couponDiscountAmount, 250) + this.serviceFees;

    next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
