const express = require("express");
const jwt = require("jsonwebtoken");
const Technician = require("../models/Technician");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* Signup */
router.post("/signup", async (req, res) => {
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

/* Login */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const tech = await Technician.findOne({ username }).lean();
    if (!tech || password !== tech.password)
      return res.status(401).json({ error: "Invalid credentials" });

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

module.exports = router;
