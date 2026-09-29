const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const POST_SELECT = `
  SELECT p.id, p.content, p.created_at,
         u.id AS user_id, u.username, u.display_name, u.avatar_color,
         (SELECT COUNT(*) FROM likes    WHERE post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
         EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = @me) AS liked_by_me
  FROM posts p
  JOIN users u ON u.id = p.user_id`;

const shape = (row) => ({ ...row, liked_by_me: !!row.liked_by_me });

function validText(value, max) {
  const text = String(value || "").trim();
  if (!text) return { error: "Write something first." };
  if (text.length > max) return { error: `Keep it under ${max} characters.` };
  return { text };
}

// GET /api/posts?feed=following|all&username=
router.get("/", (req, res) => {
  const me = req.session.userId || 0;
  const { feed, username } = req.query;

  let where = "";
  const params = { me };
  if (username) {
    where = "WHERE u.username = @username";
    params.username = String(username).toLowerCase();
  } else if (feed === "following") {
    if (!me) return res.status(401).json({ error: "Log in to see your following feed." });
    where = "WHERE p.user_id = @me OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = @me)";
  }

  const rows = db.prepare(`${POST_SELECT} ${where} ORDER BY p.id DESC LIMIT 50`).all(params);
  res.json(rows.map(shape));
});

// POST /api/posts
router.post("/", requireAuth, (req, res) => {
  const { text, error } = validText(req.body.content, 280);
  if (error) return res.status(400).json({ error });
  const result = db.prepare("INSERT INTO posts (user_id, content) VALUES (?, ?)").run(req.session.userId, text);
  const row = db.prepare(`${POST_SELECT} WHERE p.id = @id`).get({ me: req.session.userId, id: result.lastInsertRowid });
  res.status(201).json(shape(row));
});

// GET /api/posts/:id — post with its comments
router.get("/:id", (req, res) => {
  const me = req.session.userId || 0;
  const row = db.prepare(`${POST_SELECT} WHERE p.id = @id`).get({ me, id: req.params.id });
  if (!row) return res.status(404).json({ error: "Post not found." });

  const comments = db
    .prepare(
      `SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_color
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.id ASC`
    )
    .all(req.params.id);
  res.json({ post: shape(row), comments });
});

// DELETE /api/posts/:id — own posts only
router.delete("/:id", requireAuth, (req, res) => {
  const post = db.prepare("SELECT user_id FROM posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (post.user_id !== req.session.userId) return res.status(403).json({ error: "You can only delete your own posts." });
  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ---- Likes ----
function likeState(postId, userId) {
  return {
    like_count: db.prepare("SELECT COUNT(*) AS n FROM likes WHERE post_id = ?").get(postId).n,
    liked: !!db.prepare("SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?").get(postId, userId),
  };
}

router.post("/:id/like", requireAuth, (req, res) => {
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(req.params.id))
    return res.status(404).json({ error: "Post not found." });
  db.prepare("INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)").run(req.session.userId, req.params.id);
  res.json(likeState(req.params.id, req.session.userId));
});

router.delete("/:id/like", requireAuth, (req, res) => {
  db.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").run(req.session.userId, req.params.id);
  res.json(likeState(req.params.id, req.session.userId));
});

// ---- Comments ----
router.post("/:id/comments", requireAuth, (req, res) => {
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(req.params.id))
    return res.status(404).json({ error: "Post not found." });
  const { text, error } = validText(req.body.content, 280);
  if (error) return res.status(400).json({ error });

  const result = db
    .prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)")
    .run(req.params.id, req.session.userId, text);
  const comment = db
    .prepare(
      `SELECT c.id, c.content, c.created_at, u.id AS user_id, u.username, u.display_name, u.avatar_color
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// Comment author or post author can delete a comment
router.delete("/:id/comments/:commentId", requireAuth, (req, res) => {
  const row = db
    .prepare(
      `SELECT c.user_id AS commenter, p.user_id AS post_owner
       FROM comments c JOIN posts p ON p.id = c.post_id
       WHERE c.id = ? AND c.post_id = ?`
    )
    .get(req.params.commentId, req.params.id);
  if (!row) return res.status(404).json({ error: "Comment not found." });
  if (![row.commenter, row.post_owner].includes(req.session.userId))
    return res.status(403).json({ error: "You can't delete this comment." });
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.commentId);
  res.json({ success: true });
});

module.exports = router;
