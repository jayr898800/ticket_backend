const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const techRoutes = require("./routes/tech");
const ticketRoutes = require("./routes/tickets");

const app = express();

/* Middleware */
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan("dev"));

/* Logging */
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

/* DB */
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* Routes */
app.use("/api/tech", techRoutes);
app.use("/api/tickets", ticketRoutes);

/* Static */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* Start */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
