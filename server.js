const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const ticketRoutes = require("./routes/tickets");
const helmet = require("helmet");




const app = express();
app.use(express.json());
app.use(cors());
app.use("/tickets", ticketRoutes);   // 👈 no /api prefix unless you want it

/* ------------------ LOGGING SETUP ------------------ */
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}
const accessLogStream = fs.createWriteStream(path.join(logDir, "access.log"), {
  flags: "a",
});
const errorLogPath = path.join(logDir, "error.log");

if (process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "none") {
  app.use(morgan(process.env.LOG_LEVEL, { stream: accessLogStream }));
  app.use(morgan(process.env.LOG_LEVEL));
  console.log(`📜 Request logging enabled (${process.env.LOG_LEVEL})`);
} else {
  console.log("🔇 Request logging disabled");
}
function logErrorToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(errorLogPath, `[${timestamp}] ${message}\n`);
}

const app = express();

// ------------------ SECURITY ------------------
// Enable Helmet for security headers
app.use(helmet());

// In production, enable some extra protections
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1); // if behind a proxy (Render uses one)
  app.use(helmet.hsts({ maxAge: 31536000 })); // enforce HTTPS
  console.log("🔒 Production security headers enabled");
}


/* ------------------ DATABASE ------------------ */
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ Connected to MongoDB Atlas");

    // 🔧 Startup safety check: patch missing ticketType
    try {
      const result = await mongoose.connection
        .collection("tickets")
        .updateMany(
          { $or: [{ ticketType: { $exists: false } }, { ticketType: null }] },
          { $set: { ticketType: "Repair" } }
        );

      if (result.modifiedCount > 0) {
        console.log(
          `🔧 Patched ${result.modifiedCount} old tickets with default ticketType "Repair"`
        );
      } else {
        console.log("🟢 All tickets already have ticketType");
      }
    } catch (err) {
      console.error("⚠️ TicketType patch check failed:", err.message);
    }
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    logErrorToFile(`MongoDB connection error: ${err.stack || err}`);
  });

/* ------------------ MODELS ------------------ */
const customerSchema = new mongoose.Schema({
  firstName: { type: String },
  middleName: String,
  lastName: { type: String },
  suffix: String,
  contactNumber: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});
const Customer = mongoose.models.Customer || mongoose.model("Customer", customerSchema);

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
  logs: [
    {
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});
const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);

const technicianSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // plain password for testing
  createdAt: { type: Date, default: Date.now },
});
const Technician = mongoose.models.Technician || mongoose.model("Technician", technicianSchema);

/* ------------------ MULTER ------------------ */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

/* ------------------ TICKET GENERATOR ------------------ */
async function generateTicket() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
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
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `TKT-${today}-${counter}-${suffix}`;
}

/* ------------------ AUTH ------------------ */
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.technician = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

// Technician signup (store plain password)
app.post("/api/tech/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const tech = new Technician({ username, password });
    await tech.save();
    res.json({ message: "Technician account created (plain password stored)" });
  } catch (err) {
    console.error("❌ Signup failed:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Technician login (plain password check)
app.post("/api/tech/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const tech = await Technician.findOne({ username });
    if (!tech) return res.status(401).json({ error: "Invalid credentials" });

    if (password !== tech.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: tech._id, username: tech.username },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ token });
  } catch (err) {
    console.error("❌ Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ------------------ ROUTES ------------------ */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("Ticket backend is running 🚀");
});

// Create ticket (public)
app.post("/api/tickets", upload.array("images", 5), async (req, res) => {
  try {
    const allowedTypes = ["Free Checkup", "Repair"];
    const incomingType = req.body.ticketType;
    if (!allowedTypes.includes(incomingType)) {
      return res.status(400).json({
        error: `Invalid ticketType. Allowed values: ${allowedTypes.join(", ")}`,
      });
    }

    let customer = await Customer.findOne({
      contactNumber: req.body.contactNumber,
    });
    if (!customer) {
      customer = new Customer({
        firstName: req.body.firstName,
        middleName: req.body.middleName,
        lastName: req.body.lastName,
        suffix: req.body.suffix,
        contactNumber: req.body.contactNumber,
      });
      await customer.save();
    }

    const ticketNumber = await generateTicket();
    const ticket = new Ticket({
      ticketNumber,
      customer: customer._id,
      ticketType: incomingType,
      unit: req.body.unit,
      problem: req.body.problem,
      images: req.files.map((f) => f.path),
    });

    await ticket.save();
    res.json({
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      customer: ticket.customer,
      unit: ticket.unit,
      problem: ticket.problem,
      images: ticket.images,
      status: ticket.status,
      logs: ticket.logs.map((log) => ({
        _id: log._id,
        text: log.text,
        createdAt: log.createdAt,
      })),
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    console.error("❌ Error creating ticket:", err);
    logErrorToFile(`Error creating ticket: ${err.stack || err}`);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// Get one ticket by number (public)
app.get("/api/tickets/:ticketNumber", async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      ticketNumber: req.params.ticketNumber,
    }).populate("customer");

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json({
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      customer: ticket.customer,
      unit: ticket.unit,
      problem: ticket.problem,
      images: ticket.images,
      status: ticket.status,
      logs: ticket.logs.map((log) => ({
        _id: log._id,
        text: log.text,
        createdAt: log.createdAt,
      })),
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    console.error("❌ Error retrieving ticket:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get all tickets (protected)
app.get("/api/tickets", authMiddleware, async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate("customer")
      .sort({ createdAt: -1 });

    res.json(
      tickets.map((t) => ({
        ticketNumber: t.ticketNumber,
        ticketType: t.ticketType,
        customer: t.customer,
        unit: t.unit,
        problem: t.problem,
        images: t.images,
        status: t.status,
        logs: t.logs.map((log) => ({
          _id: log._id,
          text: log.text,
          createdAt: log.createdAt,
        })),
        createdAt: t.createdAt,
      }))
    );
  } catch (err) {
    console.error("❌ Error fetching tickets:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Update ticket status (protected)
app.put("/api/tickets/:ticketNumber/status", authMiddleware, async (req, res) => {
  try {
    if (req.body && req.body.ticketType) {
      return res.status(400).json({ error: "ticketType cannot be modified" });
    }

    const { status } = req.body;
    const allowedStatuses = ["Pending", "Ongoing", "Completed", "Return"];
    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json({ error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` });
    }

    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber }).populate("customer");
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.status = status;

    // ✅ Auto-log for all status changes with [SYSTEM] prefix
    const logText = `[SYSTEM] Ticket marked as ${status.toUpperCase()} by ${req.technician.username} on ${new Date().toLocaleString()}`;
    ticket.logs.push({ text: logText, createdAt: new Date() });

    await ticket.save();

    res.json({
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      customer: ticket.customer,
      unit: ticket.unit,
      problem: ticket.problem,
      images: ticket.images,
      status: ticket.status,
      logs: ticket.logs.map((log) => ({
        _id: log._id,
        text: log.text,
        createdAt: log.createdAt,
      })),
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    console.error("❌ Error updating ticket status:", err);
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});

// ✅ Add log to a ticket (protected)
app.put("/api/tickets/:ticketNumber/log", authMiddleware, async (req, res) => {
  try {
    if (req.body && req.body.ticketType) {
      return res.status(400).json({ error: "ticketType cannot be modified" });
    }

    const { log } = req.body;
    const ticket = await Ticket.findOne({
      ticketNumber: req.params.ticketNumber,
    }).populate("customer");
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs.push({ text: log, createdAt: new Date() });
    await ticket.save();

    res.json({
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      customer: ticket.customer,
      unit: ticket.unit,
      problem: ticket.problem,
      images: ticket.images,
      status: ticket.status,
      logs: ticket.logs.map((log) => ({
        _id: log._id,
        text: log.text,
        createdAt: log.createdAt,
      })),
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    console.error("❌ Error adding log:", err);
    res.status(500).json({ error: "Failed to add log" });
  }
});

// ✅ Delete a log from a ticket (protected)
app.delete("/api/tickets/:ticketNumber/logs/:logId", authMiddleware, async (req, res) => {
  try {
    if (req.body && req.body.ticketType) {
      return res.status(400).json({ error: "ticketType cannot be modified" });
    }

    const { ticketNumber, logId } = req.params;
    const ticket = await Ticket.findOne({ ticketNumber }).populate("customer");
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    ticket.logs = ticket.logs.filter((log) => log._id.toString() !== logId);
    await ticket.save();

    res.json({
      ticketNumber: ticket.ticketNumber,
      ticketType: ticket.ticketType,
      customer: ticket.customer,
      unit: ticket.unit,
      problem: ticket.problem,
      images: ticket.images,
      status: ticket.status,
      logs: ticket.logs.map((log) => ({
        _id: log._id,
        text: log.text,
        createdAt: log.createdAt,
      })),
      createdAt: ticket.createdAt,
    });
  } catch (err) {
    console.error("❌ Error deleting log:", err);
    res.status(500).json({ error: "Failed to delete log" });
  }
});

/* ------------------ START ------------------ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Backend + frontend running at http://localhost:${PORT}`)
);
