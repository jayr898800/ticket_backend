/**
 * Migration Script: Normalize Ticket Data
 * - Ensures every ticket has qrCodeUrl field (null if missing)
 * - Ensures required fields (unit, problem) are not empty
 *
 * Run with: node migration.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

// Connect to Mongo
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });

// Current Ticket schema (loose, just for migration)
const ticketSchema = new mongoose.Schema({}, { strict: false });
const Ticket = mongoose.model("Ticket", ticketSchema, "tickets");

async function migrate() {
  try {
    const tickets = await Ticket.find({});
    console.log(`Found ${tickets.length} tickets.`);

    for (const t of tickets) {
      let update = {};

      // Add qrCodeUrl if missing
      if (typeof t.qrCodeUrl === "undefined") {
        update.qrCodeUrl = null;
      }

      // Fallbacks for required fields
      if (!t.unit || t.unit.trim() === "") {
        update.unit = "Unknown Unit";
      }
      if (!t.problem || t.problem.trim() === "") {
        update.problem = "Not specified";
      }

      if (Object.keys(update).length > 0) {
        await Ticket.updateOne({ _id: t._id }, { $set: update });
        console.log(`✔ Updated ticket ${t.ticketNumber || t._id}`);
      }
    }

    console.log("🎉 Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrate();
