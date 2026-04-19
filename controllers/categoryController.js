const Category = require('./../models/categoryModel');
const factory = require('./handlerFactory');
// const catchAsync = require('./../utils/catchAsync');


exports.getAllCategory = factory.getAll(Category);
exports.getCategory = factory.getOne(Category);
exports.createCategory = factory.createOne(Category);
exports.updateCategory = factory.updateOne(Category);
exports.deleteCategory = factory.deleteOne(Category);