// migrate_ticketType.js
const mongoose = require("mongoose");
require("dotenv").config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Ticket schema (minimal for migration)
    const ticketSchema = new mongoose.Schema(
      { ticketType: String },
      { strict: false } // allow other fields to pass through
    );
    const Ticket = mongoose.model("Ticket", ticketSchema, "tickets");

    // Find tickets without ticketType
    const result = await Ticket.updateMany(
      { ticketType: { $exists: false } },
      { $set: { ticketType: "Repair" } }
    );

    console.log(`🔧 Updated ${result.modifiedCount} tickets with default ticketType "Repair"`);

    await mongoose.disconnect();
    console.log("✅ Migration complete, disconnected");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

run();
