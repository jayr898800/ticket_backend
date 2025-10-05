const express = require("express");
const router = express.Router();
const Ticket = require("../models/Ticket");
const Customer = require("../models/Customer");
const upload = require("../middleware/upload");
const verifyToken = require("../middleware/verifyToken"); // ✅ middleware for auth

/* ------------------ TICKET NUMBER GENERATOR ------------------ */
function generateTicket() {
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const counter = Math.floor(100 + Math.random() * 900);
  const suffix = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `TKT-${today}-${counter}-${suffix}`;
}

/* ------------------ CREATE TICKET ------------------ */
router.post("/create", upload.array("images", 5), async (req, res) => {
  try {
    const { firstName, middleName, lastName, suffix, contactNumber, unit, problem } = req.body;

    // Create or find customer
    let customer = await Customer.findOne({ contactNumber });
    if (!customer) {
      customer = await Customer.create({
        firstName,
        middleName,
        lastName,
        suffix,
        contactNumber,
      });
    }

    // Generate ticket number
    const ticketNumber = generateTicket();

    const images = req.files ? req.files.map((f) => f.path.replace(/\\/g, "/")) : [];

    const ticket = await Ticket.create({
      ticketNumber,
      customer: customer._id,
      unit,
      problem,
      status: "Pending",
      images,
      logs: [
        {
          text: `Ticket created for ${firstName} ${lastName}`,
          createdAt: new Date(),
        },
      ],
    });

    res.json({ success: true, ticketNumber });
  } catch (err) {
    console.error("❌ Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

/* ------------------ GET ALL TICKETS ------------------ */
router.get("/", async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    res.json(tickets);
  } catch (err) {
    console.error("❌ Error fetching tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

/* ------------------ GET SINGLE TICKET ------------------ */
router.get("/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber })
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json(ticket); // ✅ full logs
  } catch (err) {
    console.error("❌ Error fetching ticket:", err);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

/* ------------------ UPDATE STATUS ------------------ */
router.post("/status/:ticketNumber", async (req, res) => {
  try {
    const { status } = req.body;

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      {
        $set: { status },
        $push: {
          logs: {
            text: `Status updated to ${status}`,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json(ticket);
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/* ------------------ ADD LOG ------------------ */
router.post("/log/:ticketNumber", async (req, res) => {
  try {
    const { text } = req.body;

    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      {
        $push: {
          logs: {
            text,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json(ticket);
  } catch (err) {
    console.error("❌ Error adding log:", err);
    res.status(500).json({ error: "Failed to add log" });
  }
});

/* ------------------ UPDATE TICKET DETAILS (WITH VERSION HISTORY) ------------------ */
router.post("/update/:ticketNumber", async (req, res) => {
  try {
    const { firstName, middleName, lastName, suffix, contactNumber, unit, problem } = req.body;

    // Find ticket and populate customer
    let ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber }).populate("customer");
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const oldCustomer = ticket.customer
      ? {
          firstName: ticket.customer.firstName,
          middleName: ticket.customer.middleName,
          lastName: ticket.customer.lastName,
          suffix: ticket.customer.suffix,
          contactNumber: ticket.customer.contactNumber,
        }
      : {};

    const oldUnit = ticket.unit;
    const oldProblem = ticket.problem;

    // Update customer if exists
    if (ticket.customer) {
      await Customer.findByIdAndUpdate(ticket.customer._id, {
        firstName,
        middleName,
        lastName,
        suffix,
        contactNumber,
      });
    }

    // Update ticket fields
    ticket.unit = unit || ticket.unit;
    ticket.problem = problem || ticket.problem;

    // Add log entry showing before → after
    ticket.logs = ticket.logs || [];
    ticket.logs.push({
      text: `Updated ticket → 
        Customer: ${[oldCustomer.firstName, oldCustomer.middleName, oldCustomer.lastName, oldCustomer.suffix].filter(Boolean).join(" ")} (${oldCustomer.contactNumber || "-"}) 
        ➝ ${[firstName, middleName, lastName, suffix].filter(Boolean).join(" ")} (${contactNumber || "-"}) | 
        Unit: ${oldUnit} ➝ ${unit} | 
        Problem: ${oldProblem} ➝ ${problem}`,
      createdAt: new Date(),
    });

    await ticket.save();

    // Return updated ticket with full logs
    const updated = await Ticket.findOne({ ticketNumber: req.params.ticketNumber })
      .populate("customer", "firstName middleName lastName suffix contactNumber")
      .lean();

    res.json(updated);
  } catch (err) {
    console.error("❌ Error updating ticket:", err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

/* ------------------ DELETE TICKET (ADMIN/TECH ONLY) ------------------ */
router.delete("/:ticketNumber", verifyToken, async (req, res) => {
  try {
    // Ensure user has proper role
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "tech")) {
      return res.status(403).json({ error: "Forbidden: Not authorized to delete tickets" });
    }

    const { ticketNumber } = req.params;

    const ticket = await Ticket.findOneAndDelete({ ticketNumber });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json({ success: true, message: `Ticket ${ticketNumber} deleted` });
  } catch (err) {
    console.error("❌ Error deleting ticket:", err);
    res.status(500).json({ error: "Failed to delete ticket" });
  }
});

module.exports = router;
