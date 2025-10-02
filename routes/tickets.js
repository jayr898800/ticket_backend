const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const Customer = require("../models/Customer");

const router = express.Router();

/* ---- Multer ---- */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ---- Ticket generator ---- */
async function generateTicket() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const countToday = await Ticket.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  const counter = 300 + countToday * 10;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++)
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `TKT-${today}-${counter}-${suffix}`;
}

/* ---- Routes ---- */

// Create ticket
router.post("/", upload.array("images", 5), async (req, res) => {
  try {
    const allowedTypes = ["Free Checkup", "Repair"];
    if (!allowedTypes.includes(req.body.ticketType))
      return res.status(400).json({ error: "Invalid ticketType" });

    let customer = await Customer.findOne({
      contactNumber: req.body.contactNumber,
    }).lean();

    if (!customer) {
      customer = await new Customer(req.body).save();
      customer = customer.toObject();
    }

    const ticketNumber = await generateTicket();
    const ticket = await new Ticket({
      ticketNumber,
      customer: customer._id,
      ticketType: req.body.ticketType,
      unit: req.body.unit,
      problem: req.body.problem,
      images: req.files.map((f) => f.path),
    }).save();

    res.json(ticket);
  } catch (err) {
    console.error("❌ Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// Get all tickets
router.get("/", async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate("customer", "firstName contactNumber")
      .sort({ createdAt: -1 })
      .lean();
    tickets.forEach((t) => (t.logs = (t.logs || []).slice(-10)));
    res.json(tickets);
  } catch (err) {
    console.error("❌ Error fetching tickets:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get single ticket
router.get("/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      ticketNumber: req.params.ticketNumber,
    })
      .populate("customer", "firstName contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error retrieving ticket:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update status
router.put("/:ticketNumber/status", async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["Pending", "Ongoing", "Completed", "Return"];
    if (!allowedStatuses.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      {
        $set: { status },
        $push: {
          logs: {
            text: `[SYSTEM] Ticket marked as ${status.toUpperCase()}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).populate("customer", "firstName contactNumber").lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Add log
router.put("/:ticketNumber/log", async (req, res) => {
  try {
    const { log } = req.body;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { $push: { logs: { text: log, createdAt: new Date() } } },
      { new: true }
    ).populate("customer", "firstName contactNumber").lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error adding log:", err);
    res.status(500).json({ error: "Failed to add log" });
  }
});

// Delete log
router.delete("/:ticketNumber/logs/:logId", async (req, res) => {
  try {
    const { ticketNumber, logId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(logId))
      return res.status(400).json({ error: "Invalid logId" });

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber },
      { $pull: { logs: { _id: logId } } },
      { new: true }
    ).populate("customer", "firstName contactNumber").lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error deleting log:", err);
    res.status(500).json({ error: "Failed to delete log" });
  }
});

module.exports = router;
