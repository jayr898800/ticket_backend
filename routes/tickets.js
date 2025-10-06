const express = require("express");
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const Customer = require("../models/Customer");
const QRCode = require("qrcode");
const cloudinary = require("../cloudinary");

const router = express.Router();

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

/* ------------------ CREATE TICKET ------------------ */
router.post("/", async (req, res) => {
  try {
    // ✅ destructure with safe defaults
    const {
      ticketType,
      contactNumber,
      unit,
      problem,
      images = [],
      firstName,
      middleName,
      lastName,
      suffix,
    } = req.body;

    const allowedTypes = ["Free Checkup", "Repair"];
    if (!allowedTypes.includes(ticketType))
      return res.status(400).json({ error: "Invalid ticketType" });

    let customer = await Customer.findOne({ contactNumber }).lean();
    if (!customer) {
      customer = await new Customer({
        firstName,
        middleName,
        lastName,
        suffix,
        contactNumber,
      }).save();
      customer = customer.toObject();
    }

    const ticketNumber = await generateTicket();

    // Build public check link for QR code
    const checkUrl = `https://ronaldshop.netlify.app/checking_ticket_status.html?ticket=${ticketNumber}`;

    // Generate QR as buffer
    const qrBuffer = await QRCode.toBuffer(checkUrl, { type: "png", width: 300 });

    // Upload QR to Cloudinary
    const uploadRes = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: "ronaldshop/qrcodes",
          public_id: ticketNumber,
          overwrite: true,
          resource_type: "image",
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      ).end(qrBuffer);
    });

    // ✅ Normalize defaults
    const safeUnit = unit && unit.trim() !== "" ? unit : "Unknown Unit";
    const safeProblem = problem && problem.trim() !== "" ? problem : "Not specified";

    // Save ticket with qrCodeUrl + Cloudinary image URLs (already provided by frontend)
    const ticket = await new Ticket({
      ticketNumber,
      customer: customer._id,
      ticketType,
      unit: safeUnit,
      problem: safeProblem,
      images: Array.isArray(images) ? images : [],
      qrCodeUrl: uploadRes.secure_url,
    }).save();

    res.json({
      ticket,
      checkUrl,
      qrCodeUrl: uploadRes.secure_url,
    });
  } catch (err) {
    console.error("❌ Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

/* ------------------ GET ALL TICKETS ------------------ */
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

/* ------------------ GET SINGLE TICKET ------------------ */
router.get("/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber })
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

/* ------------------ UPDATE STATUS ------------------ */
router.put("/:ticketNumber/status", async (req, res) => {
  try {
    const { status, unit, problem } = req.body;
    const allowedStatuses = ["Pending", "Ongoing", "Completed", "Return"];
    if (!allowedStatuses.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const safeUnit = unit && unit.trim() !== "" ? unit : "Unknown Unit";
    const safeProblem = problem && problem.trim() !== "" ? problem : "Not specified";

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      {
        $set: { status, unit: safeUnit, problem: safeProblem },
        $push: {
          logs: {
            text: `[SYSTEM] Ticket marked as ${status.toUpperCase()} | Unit: ${safeUnit} | Problem: ${safeProblem}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate("customer", "firstName contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/* ------------------ ADD LOG ------------------ */
router.put("/:ticketNumber/log", async (req, res) => {
  try {
    const { log } = req.body;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { $push: { logs: { text: log, createdAt: new Date() } } },
      { new: true }
    )
      .populate("customer", "firstName contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error adding log:", err);
    res.status(500).json({ error: "Failed to add log" });
  }
});

/* ------------------ DELETE LOG ------------------ */
router.delete("/:ticketNumber/logs/:logId", async (req, res) => {
  try {
    const { ticketNumber, logId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(logId))
      return res.status(400).json({ error: "Invalid logId" });

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber },
      { $pull: { logs: { _id: logId } } },
      { new: true }
    )
      .populate("customer", "firstName contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error deleting log:", err);
    res.status(500).json({ error: "Failed to delete log" });
  }
});

/* ------------------ PUBLIC ENDPOINT ------------------ */
router.get("/public/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber })
      .populate("customer", "firstName middleName lastName suffix contactNumber email address")
      .lean();

    if (!ticket) {
      console.warn("⚠️ Public lookup failed, not found:", req.params.ticketNumber);
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.json({
      ticketNumber: ticket.ticketNumber,
      customer: ticket.customer || {},
      unit: ticket.unit || "",
      problem: ticket.problem || "",
      status: ticket.status || "Pending",
      images: ticket.images || [],
      logs: (ticket.logs || []).slice(-10),
      createdAt: ticket.createdAt || null,
      qrCodeUrl: ticket.qrCodeUrl || null,
    });
  } catch (err) {
    console.error("❌ Public ticket fetch error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ UPDATE TICKET DETAILS ------------------ */
router.post("/update/:ticketNumber", async (req, res) => {
  try {
    const { firstName, middleName, lastName, suffix, contactNumber, unit, problem } = req.body;

    const safeUnit = unit && unit.trim() !== "" ? unit : "Unknown Unit";
    const safeProblem = problem && problem.trim() !== "" ? problem : "Not specified";

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      {
        $push: {
          logs: {
            text: `Update - Customer: ${[firstName, middleName, lastName, suffix].filter(Boolean).join(" ")} | Contact: ${contactNumber || "N/A"} | Unit: ${safeUnit} | Problem: ${safeProblem}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = (ticket.logs || []).slice(-10);
    res.json(ticket);
  } catch (err) {
    console.error("❌ Error updating ticket:", err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

module.exports = router;
