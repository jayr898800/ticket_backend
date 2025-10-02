const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
  ticketType: { type: String, enum: ["Free Checkup", "Repair"], required: true },
  unit: String,
  problem: String,
  images: [String],
  status: {
    type: String,
    enum: ["Pending", "Ongoing", "Completed", "Return"],
    default: "Pending",
  },
  logs: [{ text: String, createdAt: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now },
});

ticketSchema.pre("save", function (next) {
  if (!this.ticketType) this.ticketType = "Repair";
  if (!["Pending", "Ongoing", "Completed", "Return"].includes(this.status)) {
    this.status = "Pending";
  }
  next();
});

ticketSchema.index({ ticketNumber: 1 }, { unique: true });
ticketSchema.index({ createdAt: 1 });

module.exports = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);
