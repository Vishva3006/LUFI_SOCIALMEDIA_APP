# Lufi — Modern Social Media App

Short posts, comments, likes, follows, direct messaging, and dark/light themes. Express.js + SQLite backend, plain
HTML/CSS/JavaScript frontend (no framework, no build step).

## Features
- **Accounts** — register / log in with a username or email; passwords hashed with `bcryptjs`; cookie sessions stored in SQLite.
- **Profiles** — avatar, name, bio, post / follower / following counts; edit your own name and bio.
- **Posts** — 280-character posts with a live counter; delete your own.
- **Comments** — reply on a post's page; delete your own comments (post owners can also remove replies on their posts).
- **Likes** — toggle a like on any post (one per user per post).
- **Follows** — follow / unfollow from profiles or the "Who to follow" sidebar; the **Following** feed shows you plus everyone you follow, **Everyone** shows all posts.
- **Direct Messages & Chat** — Instagram-style 1-on-1 private messaging with live auto-refresh, unread message badges in header, user search modal to start new chats, read receipts ("Seen"), unsend capability, and direct "Message" buttons on profiles.

## Run it
Requires Node.js 18+.

```bash
npm install
Copy-Item .env.example .env  # Windows PowerShell: set SESSION_SECRET in .env
npm start
```
Open http://localhost:3000. The database (`data.db`) and demo users are created on first run.
Demo logins: `ada`, `grace`, `linus` — password `password123`.

## Deploy to Railway

Railway is a good fit for this app because it can keep SQLite data on a persistent
volume. Do not deploy it to a static-only host: posts, accounts, and sessions need
the server and database to remain available.

1. Push this `social-app` folder to GitHub (the included Dockerfile is detected automatically).
2. In Railway, create a project from that GitHub repository. If the repository root
   contains this folder, set the service's **Root Directory** to `social-app`.
3. In the service's **Variables** tab, add a long, random `SESSION_SECRET` and set
   `DATA_DIR` to `/app/data`.
4. In **Settings → Volumes**, add a volume mounted at `/app/data`. This is required
   to keep `data.db` and `sessions.db` across deploys.
5. Generate a public domain from **Settings → Networking** and open `/health` to
   confirm the service responds with `{ "status": "ok" }`.

The app already reads Railway's `PORT` variable. Railway handles HTTPS; production
sessions are marked secure and the server trusts Railway's proxy.

## Structure
```
server.js                 Express app
config/db.js              SQLite schema + demo seed
middleware/auth.js        requireAuth guard
routes/authRoutes.js      /api/auth      register, login, logout, me
routes/userRoutes.js      /api/users     profile, edit, follow/unfollow, suggestions, search
routes/postRoutes.js      /api/posts     feed, create, delete, like, comments
routes/messageRoutes.js   /api/messages  conversations, thread, send, unread-count, unsend
public/                   index (feed), profile, post (thread), messages (chat), login, register
```

## Database
| Table | Purpose | Key constraints |
|---|---|---|
| `users` | accounts + profile fields | unique `username`, unique `email` |
| `posts` | a user's posts | FK → users, cascade delete |
| `comments` | replies on posts | FK → posts, users, cascade delete |
| `likes` | who liked what | PK (`user_id`, `post_id`) — no double likes |
| `follows` | follower → following | PK pair, `CHECK` prevents self-follow |
| `messages` | private 1-on-1 chats | FK → users (sender & receiver), cascade delete |

## API summary
```
POST /api/auth/register | /login | /logout      GET /api/auth/me
GET  /api/users/suggestions                      GET /api/users/:username
GET  /api/users/search?q=                        PUT /api/users/me
POST|DELETE /api/users/:username/follow
GET  /api/posts?feed=following|all&username=     POST /api/posts
GET  /api/posts/:id                              DELETE /api/posts/:id
POST|DELETE /api/posts/:id/like
POST /api/posts/:id/comments                     DELETE /api/posts/:id/comments/:commentId
GET  /api/messages/conversations                 GET /api/messages/unread-count
GET  /api/messages/:username                     POST /api/messages/:username
DELETE /api/messages/:messageId
```

## Notes
Demo project: no email verification, password reset, CSRF protection, rate limiting,
or pagination beyond the latest 50 posts. Add these before any real deployment.
