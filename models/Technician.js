const mongoose = require("mongoose");

const technicianSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // ⚠️ plain text for now
  createdAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.Technician || mongoose.model("Technician", technicianSchema);
