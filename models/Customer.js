const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  firstName: String,
  middleName: String,
  lastName: String,
  suffix: String,
  contactNumber: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});

customerSchema.index({ contactNumber: 1 }, { unique: true });

module.exports = mongoose.models.Customer || mongoose.model("Customer", customerSchema);
