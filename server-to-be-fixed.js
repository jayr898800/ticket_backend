const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const compression = require("compression");
require("dotenv").config();

const app = express();

// ------------------ SECURITY ------------------
app.use(helmet());
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  app.use(helmet.hsts({ maxAge: 31536000 }));
  console.log("🔒 Production security headers enabled");
}

// ------------------ MIDDLEWARE ------------------
app.use(express.json());
app.use(cors());
app.use(compression());

// ------------------ LOGGING ------------------
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const accessLogStream = fs.createWriteStream(path.join(logDir, "access.log"), { flags: "a" });
const errorLogPath = path.join(logDir, "error.log");

if (process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "none") {
  app.use(morgan(process.env.LOG_LEVEL, { stream: accessLogStream }));
  app.use(morgan(process.env.LOG_LEVEL));
  console.log(`📜 Request logging enabled (${process.env.LOG_LEVEL})`);
} else console.log("🔇 Request logging disabled");

function logErrorToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFile(errorLogPath, `[${timestamp}] ${message}\n`, (err) => {
    if (err) console.error("Failed to write error log:", err);
  });
}

// ------------------ DATABASE ------------------
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("✅ Connected to MongoDB Atlas");

    try {
      const result = await mongoose.connection
        .collection("tickets")
        .updateMany(
          { $or: [{ ticketType: { $exists: false } }, { ticketType: null }] },
          { $set: { ticketType: "Repair" } }
        );
      if (result.modifiedCount > 0)
        console.log(`🔧 Patched ${result.modifiedCount} old tickets with default ticketType "Repair"`);
      else console.log("🟢 All tickets already have ticketType");
    } catch (err) {
      console.error("⚠️ TicketType patch check failed:", err.message);
    }
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    logErrorToFile(`MongoDB connection error: ${err.stack || err}`);
  });

// ------------------ MODELS ------------------
const customerSchema = new mongoose.Schema({
  firstName: String,
  middleName: String,
  lastName: String,
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
  status: { type: String, enum: ["Pending", "Ongoing", "Completed", "Return"], default: "Pending" },
  logs: [{ text: String, createdAt: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now },
});
ticketSchema.pre("save", function (next) {
  if (!this.ticketType) this.ticketType = "Repair";
  if (!["Pending", "Ongoing", "Completed", "Return"].includes(this.status)) this.status = "Pending";
  next();
});
const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);

const technicianSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Technician = mongoose.models.Technician || mongoose.model("Technician", technicianSchema);

// ------------------ INDEXES ------------------
Customer.collection.createIndex({ contactNumber: 1 }, { unique: true });
Ticket.collection.createIndex({ ticketNumber: 1 }, { unique: true });
Ticket.collection.createIndex({ createdAt: 1 });

// ------------------ MULTER ------------------
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ------------------ TICKET GENERATOR ------------------
async function generateTicket() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
  const countToday = await Ticket.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } });
  const counter = 300 + countToday * 10;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `TKT-${today}-${counter}-${suffix}`;
}

// ------------------ AUTH ------------------
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });
  try { req.technician = jwt.verify(token, JWT_SECRET); next(); } 
  catch { return res.status(403).json({ error: "Invalid token" }); }
}

// ------------------ TECHNICIAN ROUTES ------------------
app.post("/api/tech/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const tech = new Technician({ username, password });
    await tech.save();
    res.json({ message: "Technician account created (plain password stored)" });
  } catch (err) { console.error("❌ Signup failed:", err); res.status(500).json({ error: "Signup failed" }); }
});

app.post("/api/tech/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const tech = await Technician.findOne({ username }).lean();
    if (!tech || password !== tech.password) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: tech._id, username: tech.username }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (err) { console.error("❌ Login failed:", err); res.status(500).json({ error: "Login failed" }); }
});

// ------------------ STATIC ------------------
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.get("/", (req, res) => res.send("Ticket backend is running 🚀"));

// ------------------ CREATE TICKET ------------------
app.post("/api/tickets", upload.array("images", 5), async (req, res) => {
  try {
    const allowedTypes = ["Free Checkup", "Repair"];
    const incomingType = req.body.ticketType;
    if (!allowedTypes.includes(incomingType))
      return res.status(400).json({ error: `Invalid ticketType. Allowed: ${allowedTypes.join(", ")}` });

    let customer = await Customer.findOne({ contactNumber: req.body.contactNumber }).lean();
    if (!customer) {
      customer = await new Customer({
        firstName: req.body.firstName,
        middleName: req.body.middleName,
        lastName: req.body.lastName,
        suffix: req.body.suffix,
        contactNumber: req.body.contactNumber,
      }).save();
      customer = customer.toObject();
    }

    const ticketNumber = await generateTicket();
    const ticket = await new Ticket({
      ticketNumber,
      customer: customer._id,
      ticketType: incomingType,
      unit: req.body.unit,
      problem: req.body.problem,
      images: req.files.map((f) => f.path),
    }).save();

    res.json(ticket);
  } catch (err) { console.error("❌ Error creating ticket:", err); logErrorToFile(`Error creating ticket: ${err.stack || err}`); res.status(500).json({ error: "Failed to create ticket" }); }
});

// ------------------ GET SINGLE TICKET ------------------
app.get("/api/tickets/:ticketNumber", authMiddleware, async (req, res) => {
  try {
    const limitLogs = 10;
    const ticket = await Ticket.findOne({ ticketNumber: req.params.ticketNumber })
      .populate("customer", "firstName contactNumber")
      .lean();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    ticket.logs = ticket.logs.slice(-limitLogs);
    res.json(ticket);
  } catch (err) { console.error("❌ Error retrieving ticket:", err); logErrorToFile(`Error retrieving ticket: ${err.stack || err}`); res.status(500).json({ error: "Server error" }); }
});

// ------------------ GET ALL TICKETS ------------------
app.get("/api/tickets", authMiddleware, async (req, res) => {
  try {
    const limitLogs = 10;
    const tickets = await Ticket.find()
      .populate("customer", "firstName contactNumber")
      .sort({ createdAt: -1 })
      .lean();
    tickets.forEach(t => t.logs = t.logs.slice(-limitLogs));
    res.json(tickets);
  } catch (err) { console.error("❌ Error fetching tickets:", err); logErrorToFile(`Error fetching tickets: ${err.stack || err}`); res.status(500).json({ error: "Server error" }); }
});

// ------------------ UPDATE TICKET STATUS ------------------
app.put("/api/tickets/:ticketNumber/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ["Pending", "Ongoing", "Completed", "Return"];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    const logText = `[SYSTEM] Ticket marked as ${status.toUpperCase()} by ${req.technician.username} on ${new Date().toLocaleString()}`;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { $set: { status }, $push: { logs: { text: logText, createdAt: new Date() } } },
      { new: true }
    ).populate("customer", "firstName contactNumber").lean();
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    ticket.logs = ticket.logs.slice(-10);
    res.json(ticket);
  } catch (err) { console.error("❌ Error updating ticket status:", err); logErrorToFile(`Error updating ticket status: ${err.stack || err}`); res.status(500).json({ error: "Failed to update ticket status" }); }
});

// ------------------ ADD LOG ------------------
app.put("/api/tickets/:ticketNumber/log", authMiddleware, async (req, res) => {
  try {
    const { log } = req.body;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { $push: { logs: { text: log, createdAt: new Date() } } },
      { new: true }
    const allowedStatuses = ["Pending","Ongoing","Completed","Return"];
    if(!allowedStatuses.includes(status)) return res.status(400).json({error:`Invalid status`});
    const logText = `[SYSTEM] Ticket marked as ${status.toUpperCase()} by ${req.technician.username} on ${new Date().toLocaleString()}`;
    const ticket = await Ticket.findOneAndUpdate(
      { ticketNumber: req.params.ticketNumber },
      { $set: { status }, $push: { logs: { text: logText, createdAt: new Date() } } },
      { new: true }
    ).populate("customer","firstName contactNumber").lean();
    if(!ticket) return res.status(404).json({error:"Ticket not found"});
    ticket.logs = (ticket.logs||[]).slice(-10);
    res.json(ticket);
  }catch(err){ console.error(err); logErrorToFile(err.stack||err); res.status(500).json({error:"Failed to update status"});}
});

// ------------------ ADD LOG ------------------
app.put("/api/tickets/:ticketNumber/log",authMiddleware,async(req,res)=>{
  try{
    const {log} = req.body;
    const ticket = await Ticket.findOneAndUpdate(
      {ticketNumber:req.params.ticketNumber},
      { $push: { logs: { text: log, createdAt: new Date() } } },
      { new: true }
    ).populate("customer","firstName contactNumber").lean();
    if(!ticket) return res.status(404).json({error:"Ticket not found"});
    ticket.logs = (ticket.logs||[]).slice(-10);
    res.json(ticket);
  }catch(err){ console.error(err); logErrorToFile(err.stack||err); res.status(500).json({error:"Failed to add log"});}
});

// ------------------ DELETE LOG ------------------
app.delete("/api/tickets/:ticketNumber/logs/:logId",authMiddleware,async(req,res)=>{
  try{
    const {ticketNumber,logId} = req.params;
    const ticket = await Ticket.findOneAndUpdate(
      {ticketNumber},
      { $pull: { logs: { _id: mongoose.Types.ObjectId(logId) } } },
      { new: true }
    ).populate("customer","firstName contactNumber").lean();
    if(!ticket) return res.status(404).json({error:"Ticket not found"});
    ticket.logs = (ticket.logs||[]).slice(-10);
    res.json(ticket);
  }catch(err){ console.error(err); logErrorToFile(err.stack||err); res.status(500).json({error:"Failed to delete log"});}
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT,()=>console.log(`Backend + frontend running at http://localhost:${PORT}`));
