const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    ticketType: { type: String, enum: ["Free Checkup", "Repair"], required: true },
    unit: { type: String, required: true },
    problem: { type: String, required: true },
    images: [{ type: String }],
    status: { type: String, enum: ["Pending", "Ongoing", "Completed", "Return"], default: "Pending" },
    logs: [
      {
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Pre-save hook to prevent enum validation errors
ticketSchema.pre("save", function (next) {
  // Ensure ticketType exists
  if (!this.ticketType) this.ticketType = "Repair";

  // Fix invalid status
  const allowedStatuses = ["Pending", "Ongoing", "Completed", "Return"];
  if (!allowedStatuses.includes(this.status)) this.status = "Pending";

  next();
});

module.exports = mongoose.model("Ticket", ticketSchema);
