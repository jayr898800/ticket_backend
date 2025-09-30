const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    unit: { type: String, required: true },
    problem: { type: String, required: true },
    images: [{ type: String }],
    status: { type: String, enum: ["Open", "In Progress", "Closed"], default: "Open" },
    logs: [
      {
        message: String,
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ticket", ticketSchema);
