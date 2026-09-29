const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const router = express.Router();
const COLORS = ["#4B3FD6", "#E4572E", "#2A9D8F", "#B5179E", "#F4A300", "#1D6FA5", "#6A994E"];

router.post("/register", (req, res) => {
  const { displayName, username, email, password } = req.body;
  const uname = String(username || "").trim().toLowerCase();

  if (!displayName || !displayName.trim()) return res.status(400).json({ error: "Name is required." });
  if (!/^[a-z0-9_]{3,20}$/.test(uname))
    return res.status(400).json({ error: "Username must be 3–20 characters: letters, numbers, underscores." });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required." });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });

  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(uname))
    return res.status(409).json({ error: "That username is taken." });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.toLowerCase()))
    return res.status(409).json({ error: "An account with that email already exists." });

  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const result = db
    .prepare("INSERT INTO users (username, display_name, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)")
    .run(uname, displayName.trim().slice(0, 50), email.toLowerCase(), bcrypt.hashSync(password, 10), color);

  req.session.userId = result.lastInsertRowid;
  res.status(201).json({ id: result.lastInsertRowid, username: uname });
});

router.post("/login", (req, res) => {
  const { login, password } = req.body; // username or email
  if (!login || !password) return res.status(400).json({ error: "Enter your username/email and password." });

  const key = String(login).trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(key, key);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: "Incorrect username/email or password." });

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

router.get("/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db
    .prepare("SELECT id, username, display_name, avatar_color FROM users WHERE id = ?")
    .get(req.session.userId);
  res.json({ user: user || null });
});

module.exports = router;
