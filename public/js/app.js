// ---------- Theme Manager ----------
function getStoredTheme() {
  const saved = localStorage.getItem("loop_theme");
  if (saved) return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getThemeIcon(theme) {
  return theme === "dark"
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("loop_theme", theme);
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.setAttribute("title", theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
    btn.innerHTML = getThemeIcon(theme);
  }
}

// Immediately apply saved theme on parse
applyTheme(getStoredTheme());

// ---------- Helpers ----------
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) throw new Error((data && data.error) || "Something went wrong.");
  return data;
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

// SQLite CURRENT_TIMESTAMP is UTC: "YYYY-MM-DD HH:MM:SS"
function timeAgo(ts) {
  const then = new Date(ts.replace(" ", "T") + "Z");
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return then.toLocaleDateString();
}

function avatar(u, size = "") {
  const initial = esc((u.display_name || u.username || "?").trim().charAt(0).toUpperCase());
  return `<span class="avatar ${size}" style="background:${esc(u.avatar_color)}" aria-hidden="true">${initial}</span>`;
}

function safeNext(fallback = "/") {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

function goLogin() {
  location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
}

// ---------- Header ----------
async function initHeader() {
  const bar = document.getElementById("topbar");
  let me = null;
  let unreadCount = 0;
  try {
    const authData = await api("/auth/me");
    me = authData.user;
    if (me) {
      try {
        const unreadData = await api("/messages/unread-count");
        unreadCount = unreadData.unread_count || 0;
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* offline */ }

  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const badgeHtml = unreadCount > 0 
    ? `<span class="badge-count" id="nav-unread-badge">${unreadCount > 99 ? "99+" : unreadCount}</span>` 
    : `<span class="badge-count" id="nav-unread-badge" style="display:none"></span>`;

  bar.innerHTML = `
    <div class="topbar-inner">
      <a href="/" class="logo"><span class="logo-mark"></span>Lufi</a>
      <nav class="nav">
        ${me
          ? `<a href="/" class="${location.pathname === '/' || location.pathname === '/index.html' ? 'active-link' : ''}">Home</a>
             <a href="/messages.html" class="nav-msg-link ${location.pathname === '/messages.html' ? 'active-link' : ''}">
               Messages ${badgeHtml}
             </a>
             <a href="/profile.html?u=${encodeURIComponent(me.username)}" class="${location.pathname === '/profile.html' && new URLSearchParams(location.search).get('u') === me.username ? 'active-link' : ''}">Profile</a>
             <button id="logout-btn" class="nav-link-btn" type="button">Log out</button>`
          : `<a href="/login.html">Log in</a>
             <a class="btn btn-primary btn-sm" href="/register.html">Sign up</a>`}
        <button id="theme-toggle-btn" class="theme-toggle-btn" type="button" title="${currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}" aria-label="Toggle theme">
          ${getThemeIcon(currentTheme)}
        </button>
      </nav>
    </div>`;

  // Theme toggle listener
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }

  const out = document.getElementById("logout-btn");
  if (out) out.addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST" });
    location.href = "/";
  });
  return me;
}

// ---------- Post rendering ----------
function postHtml(p, me, { detail = false } = {}) {
  const mine = me && me.id === p.user_id;
  const heartSvg = p.liked_by_me 
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

  const replySvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

  return `
  <article class="post" data-id="${p.id}">
    <a href="/profile.html?u=${encodeURIComponent(p.username)}">${avatar(p)}</a>
    <div class="post-main">
      <div class="post-head">
        <a class="name" href="/profile.html?u=${encodeURIComponent(p.username)}">${esc(p.display_name)}</a>
        <span class="handle">@${esc(p.username)}</span>
        <span class="sep">·</span>
        <a class="time" href="/post.html?id=${p.id}">${timeAgo(p.created_at)}</a>
        ${mine ? `<button class="link-btn danger" data-act="delete" type="button">Delete</button>` : ""}
      </div>
      <p class="post-body ${detail ? "big" : ""}">${esc(p.content)}</p>
      <div class="post-actions">
        <button class="act like ${p.liked_by_me ? "on" : ""}" data-act="like" type="button" aria-pressed="${p.liked_by_me}">
          <span class="like-icon">${heartSvg}</span>
          <span class="like-count">${p.like_count}</span>
        </button>
        <a class="act" href="/post.html?id=${p.id}">
          ${replySvg}
          <span>${p.comment_count}</span>
        </a>
      </div>
    </div>
  </article>`;
}

// Attach once per container; uses event delegation so re-rendered posts keep working.
function bindPosts(container, me, { onDelete } = {}) {
  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".post");
    const id = card.dataset.id;

    try {
      if (btn.dataset.act === "like") {
        if (!me) return goLogin();
        const on = btn.classList.contains("on");
        const r = await api(`/posts/${id}/like`, { method: on ? "DELETE" : "POST" });
        btn.classList.toggle("on", r.liked);
        btn.setAttribute("aria-pressed", r.liked);
        const iconSpan = btn.querySelector(".like-icon");
        if (iconSpan) {
          iconSpan.innerHTML = r.liked 
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
        }
        btn.querySelector(".like-count").textContent = r.like_count;
      } else if (btn.dataset.act === "delete") {
        if (!confirm("Delete this post? This can't be undone.")) return;
        await api(`/posts/${id}`, { method: "DELETE" });
        card.remove();
        if (onDelete) onDelete(id);
      }
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindCounter(textarea, counterEl, button, max = 280) {
  const update = () => {
    const n = textarea.value.length;
    counterEl.textContent = `${max - n}`;
    counterEl.classList.toggle("over", n > max);
    button.disabled = n === 0 || n > max || !textarea.value.trim();
  };
  textarea.addEventListener("input", update);
  update();
}
