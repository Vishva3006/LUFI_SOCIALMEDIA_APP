const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "data.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    bio           TEXT NOT NULL DEFAULT '',
    avatar_color  TEXT NOT NULL DEFAULT '#4B3FD6',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id DESC);

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);

  CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at     DATETIME DEFAULT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, read_at);
`);

// ---------- Demo data (only on an empty database) ----------
if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0) {
  const hash = bcrypt.hashSync("password123", 10);
  const addUser = db.prepare(
    "INSERT INTO users (username, display_name, email, password_hash, bio, avatar_color) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const ada = addUser.run("ada", "Ada Lovelace", "ada@example.com", hash, "Notes on the Analytical Engine.", "#4B3FD6").lastInsertRowid;
  const grace = addUser.run("grace", "Grace Hopper", "grace@example.com", hash, "Debugging since 1947.", "#E4572E").lastInsertRowid;
  const linus = addUser.run("linus", "Linus T.", "linus@example.com", hash, "Kernel hobbyist. Opinions are my own.", "#2A9D8F").lastInsertRowid;

  const addPost = db.prepare("INSERT INTO posts (user_id, content) VALUES (?, ?)");
  const p1 = addPost.run(ada, "Just realised a loop is only interesting once you know when it stops.").lastInsertRowid;
  addPost.run(grace, "The first bug report came with the bug taped into the logbook. Still the gold standard.");
  const p3 = addPost.run(linus, "Shipping small commits. Reviewing them is the real work.").lastInsertRowid;

  db.prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)").run(p1, grace, "Halting conditions: the unsung heroes.");
  db.prepare("INSERT INTO likes (user_id, post_id) VALUES (?, ?)").run(grace, p1);
  db.prepare("INSERT INTO likes (user_id, post_id) VALUES (?, ?)").run(ada, p3);
  db.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").run(grace, ada);
  console.log("Seeded demo users (ada, grace, linus — password: password123).");
}

if (db.prepare("SELECT COUNT(*) AS n FROM messages").get().n === 0) {
  const ada = db.prepare("SELECT id FROM users WHERE username = 'ada'").get();
  const grace = db.prepare("SELECT id FROM users WHERE username = 'grace'").get();
  const linus = db.prepare("SELECT id FROM users WHERE username = 'linus'").get();

  if (ada && grace) {
    const addMsg = db.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at, read_at) VALUES (?, ?, ?, ?, ?)");
    addMsg.run(grace.id, ada.id, "Hey Ada! How's the Analytical Engine project coming along?", "2026-09-29 09:00:00", "2026-09-29 09:01:00");
    addMsg.run(ada.id, grace.id, "Hi Grace! It weaves algebraic patterns just as the Jacquard loom weaves flowers.", "2026-09-29 09:02:00", "2026-09-29 09:03:00");
    addMsg.run(grace.id, ada.id, "That's brilliant! We should sync up on debugging compiler routines next.", "2026-09-29 09:05:00", null);
  }
  if (linus && ada) {
    const addMsg = db.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at, read_at) VALUES (?, ?, ?, ?, ?)");
    addMsg.run(linus.id, ada.id, "Hey Ada, loved your recent post on loops!", "2026-09-29 09:10:00", null);
  }
}

module.exports = db;
