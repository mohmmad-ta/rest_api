const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const APIFeatures = require('./../utils/apiFeatures');
const fs = require("fs");
const path = require("path");

exports.deleteOne = Model =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
      if (doc?.image && doc.image.includes('/public/')) {
          const imageRelativePath = doc.image.split("/public/")[1];
          const imagePath = path.join(__dirname, "..", "public", imageRelativePath);

          if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              console.log("Image deleted:", imagePath);
          }
      }

    if (!doc) {
      return next(new AppError('No document found with that ID', 404));
    }
    res.status(204).json({status: 'success', data: null});
  });

exports.updateOne = Model =>
    catchAsync(async (req, res, next) => {
        let updateData = { ...req.body };

        // If a single file was uploaded
        if (req.file) {
            updateData.file = req.file.filename; // or req.file.path depending on your schema
        }

        // If multiple files were uploaded
        if (req.files) {
            Object.keys(req.files).forEach(field => {
                updateData[field] = req.files[field][0].filename;
            });
        }

        console.log(req.body);
        console.log(req.files);

        const doc = await Model.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        if (!doc) {
            return next(new AppError('No document found with that ID', 404));
        }

        res.status(200).json({
            status: 'success',
            data: doc
        });
    });

exports.createOne = Model =>
  catchAsync(async (req, res, next) => {
    req.body.user = req.user.id;
    if (!req.body.restaurantId){req.body.restaurantId = req.user.id}
    const doc = await Model.create(req.body);

    res.status(201).json({status: 'success', data: doc});
  });

exports.getOne = Model =>
  catchAsync(async (req, res, next) => {
    const query = await Model.findById(req.params.id)
    res.status(200).json({status: 'success', data: query});
  });

exports.getAll = Model =>
  catchAsync(async (req, res, next) => {

      let filter = {};
    if (req.params.productId) filter = { product: req.params.productId };

    const features = new APIFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();
    const doc = await features.query;

    res.status(200).json({status: 'success', results: doc.length, data: doc});
  });
