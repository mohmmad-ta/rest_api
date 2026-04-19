const mongoose = require('mongoose');
const slugify = require('slugify');

const mealSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'يجب إدخال اسم الوجبة'],
            trim: true,
            maxlength: [40, 'اسم الوجبة يجب ألا يزيد عن 40 حرفًا'],
            minlength: [3, 'اسم الوجبة يجب ألا يقل عن 3 أحرف'],
        },
        slug: String,
        price: {
            type: Number,
            required: [true, 'يجب إدخال سعر الوجبة']
        },
        description: {
            type: String,
            trim: true,
        },
        category: {
            type: mongoose.Schema.ObjectId,
            required: [true, 'يجب إدخال الصنف'],
            ref: "Category"
        },
        image: {
            type: String,
            required: [true, 'يجب إدخال صورة للوجبة']
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
        createdAt: {
            type: Date,
            default: Date.now(),
            select: false
        },
        restaurantId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Restaurant',
            required: [true, 'يجب إدخال المطعم']
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);


// tourSchema.index({ price: 1 });
mealSchema.index({ price: 1, ratingsAverage: -1 });
mealSchema.index({ slug: 1 });

// DOCUMENT MIDDLEWARE: runs before .save() and .create()
mealSchema.pre('save', function(next) {
    this.slug = slugify(this.name, { lower: true });
    next();
});

mealSchema.pre(/^find/, function(next) {
    this.populate({
        path: 'category',
        select: '-__v -createdAt -updatedAt'
    })

    next();
});

mealSchema.post(/^find/, function(docs, next) {
    console.log(`Query took ${Date.now() - this.start} milliseconds!`);
    next();
});

const Meal = mongoose.model('Meal', mealSchema);

module.exports = Meal;