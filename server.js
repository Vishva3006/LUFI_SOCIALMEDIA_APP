require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || __dirname;
const isProduction = process.env.NODE_ENV === "production";

fs.mkdirSync(dataDir, { recursive: true });
if (isProduction) app.set("trust proxy", 1);

app.use(express.json());
app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: dataDir }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
  })
);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`Lufi running at http://localhost:${PORT}`));
