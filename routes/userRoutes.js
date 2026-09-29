const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/users/suggestions — people you don't follow yet
router.get("/suggestions", (req, res) => {
  const me = req.session.userId || 0;
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio,
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count
       FROM users u
       WHERE u.id != @me
         AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = @me)
       ORDER BY follower_count DESC, u.id DESC
       LIMIT 5`
    )
    .all({ me });
  res.json(rows);
});

// GET /api/users/search?q=... — search users for messaging / discovery
router.get("/search", requireAuth, (req, res) => {
  const me = req.session.userId;
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json([]);

  const rows = db
    .prepare(
      `SELECT id, username, display_name, avatar_color, bio
       FROM users
       WHERE id != @me AND (username LIKE @pattern OR LOWER(display_name) LIKE @pattern)
       LIMIT 10`
    )
    .all({ me, pattern: `%${q}%` });
  res.json(rows);
});

// PUT /api/users/me — edit own profile
router.put("/me", requireAuth, (req, res) => {
  const displayName = String(req.body.displayName || "").trim();
  const bio = String(req.body.bio || "").trim();
  if (!displayName) return res.status(400).json({ error: "Name can't be empty." });
  if (displayName.length > 50) return res.status(400).json({ error: "Name must be 50 characters or fewer." });
  if (bio.length > 160) return res.status(400).json({ error: "Bio must be 160 characters or fewer." });

  db.prepare("UPDATE users SET display_name = ?, bio = ? WHERE id = ?").run(displayName, bio, req.session.userId);
  res.json({ display_name: displayName, bio });
});

// GET /api/users/:username — public profile
router.get("/:username", (req, res) => {
  const me = req.session.userId || 0;
  const user = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_color, u.created_at,
        (SELECT COUNT(*) FROM posts WHERE user_id = u.id)          AS post_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id)   AS follower_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id)    AS following_count,
        EXISTS(SELECT 1 FROM follows WHERE follower_id = @me AND following_id = u.id) AS is_following
       FROM users u WHERE u.username = @username`
    )
    .get({ me, username: req.params.username.toLowerCase() });

  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ ...user, is_following: !!user.is_following, is_me: user.id === me });
});

function findTarget(req, res) {
  const target = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username.toLowerCase());
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return null;
  }
  if (target.id === req.session.userId) {
    res.status(400).json({ error: "You can't follow yourself." });
    return null;
  }
  return target;
}

function followState(targetId) {
  return {
    follower_count: db.prepare("SELECT COUNT(*) AS n FROM follows WHERE following_id = ?").get(targetId).n,
  };
}

// POST /api/users/:username/follow
router.post("/:username/follow", requireAuth, (req, res) => {
  const target = findTarget(req, res);
  if (!target) return;
  db.prepare("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)").run(req.session.userId, target.id);
  res.json({ is_following: true, ...followState(target.id) });
});

// DELETE /api/users/:username/follow
router.delete("/:username/follow", requireAuth, (req, res) => {
  const target = findTarget(req, res);
  if (!target) return;
  db.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").run(req.session.userId, target.id);
  res.json({ is_following: false, ...followState(target.id) });
});

module.exports = router;
