const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/messages/unread-count — total unread messages count for current user
router.get("/unread-count", requireAuth, (req, res) => {
  const me = req.session.userId;
  const row = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND read_at IS NULL").get(me);
  res.json({ unread_count: row ? row.count : 0 });
});

// GET /api/messages/conversations — list all conversation threads with preview
router.get("/conversations", requireAuth, (req, res) => {
  const me = req.session.userId;
  const rows = db.prepare(`
    WITH partner_messages AS (
      SELECT 
        CASE WHEN sender_id = @me THEN receiver_id ELSE sender_id END AS partner_id,
        id AS message_id,
        sender_id,
        receiver_id,
        content,
        created_at,
        read_at,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN sender_id = @me THEN receiver_id ELSE sender_id END 
          ORDER BY id DESC
        ) AS rn
      FROM messages
      WHERE sender_id = @me OR receiver_id = @me
    )
    SELECT 
      u.id AS user_id,
      u.username,
      u.display_name,
      u.avatar_color,
      pm.message_id AS last_message_id,
      pm.content AS last_message,
      pm.created_at AS last_message_time,
      pm.sender_id AS last_sender_id,
      (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = @me AND read_at IS NULL) AS unread_count
    FROM partner_messages pm
    JOIN users u ON u.id = pm.partner_id
    WHERE pm.rn = 1
    ORDER BY pm.message_id DESC
  `).all({ me });

  res.json(rows);
});

// GET /api/messages/:username — chat thread with a user
router.get("/:username", requireAuth, (req, res) => {
  const me = req.session.userId;
  const username = String(req.params.username || "").toLowerCase();
  const target = db.prepare("SELECT id, username, display_name, avatar_color, bio FROM users WHERE username = ?").get(username);
  
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.id === me) return res.status(400).json({ error: "You cannot chat with yourself." });

  // Mark all unread incoming messages from this user as read
  db.prepare("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL")
    .run(target.id, me);

  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.read_at,
           u.username AS sender_username, u.display_name AS sender_name, u.avatar_color AS sender_color
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = @me AND m.receiver_id = @targetId)
       OR (m.sender_id = @targetId AND m.receiver_id = @me)
    ORDER BY m.id ASC
    LIMIT 200
  `).all({ me, targetId: target.id });

  res.json({
    partner: target,
    messages: messages.map(m => ({
      ...m,
      is_mine: m.sender_id === me
    }))
  });
});

// POST /api/messages/:username — send direct message
router.post("/:username", requireAuth, (req, res) => {
  const me = req.session.userId;
  const username = String(req.params.username || "").toLowerCase();
  const target = db.prepare("SELECT id, username, display_name, avatar_color FROM users WHERE username = ?").get(username);
  
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.id === me) return res.status(400).json({ error: "You cannot message yourself." });

  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Write a message first." });
  if (content.length > 2000) return res.status(400).json({ error: "Message is too long (max 2000 characters)." });

  const result = db.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)").run(me, target.id, content);
  
  const msg = db.prepare(`
    SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.read_at,
           u.username AS sender_username, u.display_name AS sender_name, u.avatar_color AS sender_color
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ ...msg, is_mine: true });
});

// DELETE /api/messages/:messageId — unsend / delete message
router.delete("/:messageId", requireAuth, (req, res) => {
  const me = req.session.userId;
  const msg = db.prepare("SELECT sender_id FROM messages WHERE id = ?").get(req.params.messageId);
  
  if (!msg) return res.status(404).json({ error: "Message not found." });
  if (msg.sender_id !== me) return res.status(403).json({ error: "You can only unsend your own messages." });

  db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.messageId);
  res.json({ success: true });
});

module.exports = router;
