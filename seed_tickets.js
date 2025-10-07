// seed_tickets.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Ticket from "./models/Ticket.js"; // adjust if path differs

dotenv.config();

const mongoURI = process.env.MONGO_URI || "your-mongodb-uri";
await mongoose.connect(mongoURI);
console.log("✅ Connected to MongoDB");

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const firstNames = ["Jayr", "Ronald", "Anna", "Mark", "Jessa", "Kevin", "Maria", "John", "Paolo", "Ella"];
const middleNames = ["P.", "L.", "D.", "M.", "R.", "S.", "C.", "B.", "A.", "E."];
const lastNames = ["Pelobello", "Cruz", "Garcia", "Reyes", "Santos", "Fernandez", "Mendoza", "Lopez", "Dela Cruz", "Lim"];

const contactNumbers = [
  "09171234567", "09987654321", "09180001111", "09095554444", "09332221111",
  "09123456789", "09778889999", "09556667777"
];

const units = [
  "iPhone 13 Pro LCD", "Samsung A50 Screen", "Oppo F9 Touch", "Vivo V21 LCD",
  "Realme C25 Screen", "Xiaomi Redmi Note 9 Display", "LG LCD Monitor",
  "Asus Laptop Screen", "Dell Inspiron LCD", "Lenovo Yoga Touchscreen"
];

const problems = [
  "No display", "Touch not working", "Screen flickering", "Lines on screen",
  "Blackout issue", "Ghost touch", "Cracked LCD", "No backlight", "Color distortion",
  "Random shutdown"
];

const statuses = ["Pending", "Ongoing", "Completed"];

const tickets = [];

for (let i = 0; i < 20; i++) {
  const fullName = `${randomItem(firstNames)} ${randomItem(middleNames)} ${randomItem(lastNames)}`;
  tickets.push({
    customerName: fullName,
    contactNumber: randomItem(contactNumbers),
    unit: randomItem(units),
    problem: randomItem(problems),
    status: randomItem(statuses),
    createdAt: new Date(Date.now() - Math.random() * 1000000000)
  });
}

const result = await Ticket.insertMany(tickets);
console.log(`🎟️ Inserted ${result.length} random tickets`);
await mongoose.disconnect();
console.log("✅ Done and disconnected");
