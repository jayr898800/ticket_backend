// cleanup_empty_tickets.js (CommonJS)
require("dotenv").config();
const mongoose = require("mongoose");
const Ticket = require("./models/Ticket");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const badFilter = {
    $or: [
      { customerName: { $in: [null, ""] } },
      { contactNumber: { $in: [null, ""] } },
    ],
  };

  const result = await Ticket.deleteMany(badFilter);
  console.log(`🧹 Deleted ${result.deletedCount} incomplete ticket(s)`);

  await mongoose.disconnect();
})();
