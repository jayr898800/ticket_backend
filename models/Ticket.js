const mongoose = require("mongoose");

/* ---- Log Subdocument Schema ---- */
const logSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

/* ---- Ticket Schema ---- */
const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    ticketType: { type: String, enum: ["Free Checkup", "Repair"], required: true },
    unit: { type: String, required: true },
    problem: { type: String, required: true },
    images: [{ type: String }],
    status: {
      type: String,
      enum: ["Pending", "Ongoing", "Completed", "Return"],
      default: "Pending",
    },
    logs: [logSchema],
    qrCodeUrl: { type: String }, // ✅ Cloudinary QR code link
  },
  { timestamps: true } // ✅ adds createdAt and updatedAt automatically
);

/* ---- Indexes ---- */
ticketSchema.index({ ticketNumber: 1 }, { unique: true });
ticketSchema.index({ createdAt: 1 });

module.exports = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);
