const express = require("express");
const multer = require("multer");
const Ticket = require("../models/Ticket");
const Customer = require("../models/Customer");

const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// Generate ticket number
function generateTicket() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

// POST /api/tickets → create ticket
router.post("/", upload.array("images", 5), async (req, res) => {
  try {
    // Check if customer exists by contact number
    let customer = await Customer.findOne({
      contactNumber: req.body.contactNumber
    });

    if (!customer) {
      customer = new Customer({
        firstName: req.body.firstName,
        middleName: req.body.middleName,
        lastName: req.body.lastName,
        suffix: req.body.suffix,
        contactNumber: req.body.contactNumber
      });
      await customer.save();
    }

    const ticketNumber = generateTicket();
    const ticket = new Ticket({
      ticketNumber,
      customer: customer._id,
      unit: req.body.unit,
      problem: req.body.problem,
      images: req.files.map((f) => f.path)
    });

    await ticket.save();
    res.json({ ticketNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// GET /api/tickets/:ticketNumber → fetch ticket with customer populated
router.get("/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      ticketNumber: req.params.ticketNumber
    }).populate("customer");

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
