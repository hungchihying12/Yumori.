import express from "express";
import session from "express-session";
import SqliteStoreFactory from "connect-sqlite3";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import "dotenv/config";
import db from "./db.js";

const SqliteStore = SqliteStoreFactory(session);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SqliteStore({ db: "sessions.db" }),
    secret: process.env.SESSION_SECRET || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);
app.use(express.static("public"));

// ---- image uploads ----
const uploadDir = "public/uploads";
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) =>
      cb(null, `${req.session.userId || "anon"}-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, /image\/(png|jpeg|webp|gif)/.test(file.mimetype)),
});

// ---- auth guard ----
const auth = (req, res, next) =>
  req.session.userId ? next() : res.status(401).json({ error: "Not logged in" });

// ===================== AUTH =====================
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  if (!username || username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username))
    return res.status(400).json({ error: "Username must be 3+ letters/numbers/_." });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "Password must be 6+ characters." });
  try {
    const hash = await bcrypt.hash(password, 10);
    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
    req.session.userId = info.lastInsertRowid;
    req.session.username = username;
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "That username is already taken." });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return res.status(401).json({ error: "No account with that name." });
  if (!(await bcrypt.compare(password, row.password_hash)))
    return res.status(401).json({ error: "Password doesn't match." });
  req.session.userId = row.id;
  req.session.username = row.username;
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/me", auth, (req, res) => {
  const u = db
    .prepare("SELECT id, username, avatar, country FROM users WHERE id = ?")
    .get(req.session.userId);
  res.json(u);
});

app.post("/api/me/avatar", auth, upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image." });
  const p = `/uploads/${req.file.filename}`;
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(p, req.session.userId);
  res.json({ ok: true, avatar: p });
});

app.patch("/api/me", auth, (req, res) => {
  const { country, username } = req.body;
  try {
    if (username && username !== req.session.username) {
      if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username))
        return res.status(400).json({ error: "Username must be 3+ letters/numbers/_." });
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(
        username,
        req.session.userId
      );
      req.session.username = username;
    }
    if (country !== undefined)
      db.prepare("UPDATE users SET country = ? WHERE id = ?").run(
        country,
        req.session.userId
      );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Couldn't update (username taken?)." });
  }
});

app.patch("/api/me/password", auth, async (req, res) => {
  const { current, next } = req.body;
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
  if (!(await bcrypt.compare(current, u.password_hash)))
    return res.status(400).json({ error: "Current password is wrong." });
  if (!next || next.length < 6) return res.status(400).json({ error: "New password too short." });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    await bcrypt.hash(next, 10),
    req.session.userId
  );
  res.json({ ok: true });
});

app.delete("/api/me", auth, (req, res) => {
  const rows = db.prepare("SELECT image_path FROM wardrobe_items WHERE user_id=?").all(req.session.userId);
  for (const r of rows) { try { fs.unlinkSync("public" + r.image_path); } catch {} }
  const u = db.prepare("SELECT avatar FROM users WHERE id=?").get(req.session.userId);
  if (u?.avatar) { try { fs.unlinkSync("public" + u.avatar); } catch {} }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.session.userId);
  req.session.destroy(() => res.json({ ok: true }));
});

// ===================== ANALYSES =====================
app.get("/api/analyses/:kind", auth, (req, res) => {
  const row = db
    .prepare(
      "SELECT * FROM analyses WHERE user_id=? AND kind=? ORDER BY id DESC LIMIT 1"
    )
    .get(req.session.userId, req.params.kind);
  res.json(row ? { ...row, data: JSON.parse(row.data) } : null);
});

app.post("/api/analyses/:kind", auth, (req, res) => {
  db.prepare("INSERT INTO analyses (user_id, kind, data) VALUES (?,?,?)").run(
    req.session.userId,
    req.params.kind,
    JSON.stringify(req.body)
  );
  res.json({ ok: true });
});

// ===================== WARDROBE =====================
app.get("/api/wardrobe", auth, (req, res) => {
  const cat = req.query.category;
  const rows = cat
    ? db.prepare("SELECT * FROM wardrobe_items WHERE user_id=? AND category=? ORDER BY id DESC").all(req.session.userId, cat)
    : db.prepare("SELECT * FROM wardrobe_items WHERE user_id=? ORDER BY id DESC").all(req.session.userId);
  res.json(rows);
});

app.post("/api/wardrobe", auth, upload.single("photo"), (req, res) => {
  const { category, subcategory, name } = req.body;
  if (!req.file) return res.status(400).json({ error: "Photo required." });
  if (!category) return res.status(400).json({ error: "Category required." });
  const info = db
    .prepare(
      "INSERT INTO wardrobe_items (user_id, category, subcategory, name, image_path) VALUES (?,?,?,?,?)"
    )
    .run(req.session.userId, category, subcategory || null, name || null, `/uploads/${req.file.filename}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch("/api/wardrobe/:id", auth, (req, res) => {
  const { name, category, subcategory } = req.body;
  const row = db.prepare("SELECT * FROM wardrobe_items WHERE id=? AND user_id=?").get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: "Not found." });
  db.prepare("UPDATE wardrobe_items SET name=?, category=?, subcategory=? WHERE id=?").run(
    name ?? row.name,
    category ?? row.category,
    subcategory ?? row.subcategory,
    row.id
  );
  res.json({ ok: true });
});

app.delete("/api/wardrobe/:id", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM wardrobe_items WHERE id=? AND user_id=?").get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: "Not found." });
  try { fs.unlinkSync("public" + row.image_path); } catch {}
  db.prepare("DELETE FROM wardrobe_items WHERE id=?").run(row.id);
  res.json({ ok: true });
});

// ===================== CHECKLIST =====================
app.get("/api/checklist", auth, (req, res) => {
  res.json(
    db.prepare("SELECT * FROM checklist WHERE user_id=? ORDER BY done ASC, id DESC").all(req.session.userId)
  );
});

app.post("/api/checklist", auth, (req, res) => {
  const { label } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: "Empty item." });
  try {
    db.prepare("INSERT INTO checklist (user_id, label) VALUES (?,?)").run(req.session.userId, label.trim());
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Already on your list." });
  }
});

app.patch("/api/checklist/:id", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM checklist WHERE id=? AND user_id=?").get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: "Not found." });
  db.prepare("UPDATE checklist SET done=? WHERE id=?").run(req.body.done ? 1 : 0, row.id);
  res.json({ ok: true });
});

app.delete("/api/checklist/:id", auth, (req, res) => {
  db.prepare("DELETE FROM checklist WHERE id=? AND user_id=?").run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ===================== OUTFITS HISTORY =====================
app.get("/api/outfits", auth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM outfits WHERE user_id=? ORDER BY id DESC LIMIT 30")
    .all(req.session.userId);
  res.json(rows.map(r => ({ ...r, suggestion: JSON.parse(r.suggestion) })));
});

// ===================== AI OUTFIT CHAT =====================
app.post("/api/outfits/chat", auth, async (req, res) => {
  if (!process.env.OPENAI_API_KEY)
    return res.status(503).json({
      needsConfig: "OPENAI_API_KEY",
      message: "Add OPENAI_API_KEY to .env and restart the server.",
    });

  const { message } = req.body;
  const wardrobe = db
    .prepare("SELECT id, name, category, subcategory, image_path FROM wardrobe_items WHERE user_id=?")
    .all(req.session.userId);
  const colour = db
    .prepare("SELECT data FROM analyses WHERE user_id=? AND kind='colour' ORDER BY id DESC LIMIT 1")
    .get(req.session.userId);
  const bodyR = db
    .prepare("SELECT data FROM analyses WHERE user_id=? AND kind='body' ORDER BY id DESC LIMIT 1")
    .get(req.session.userId);
  const face = db
    .prepare("SELECT data FROM analyses WHERE user_id=? AND kind='face' ORDER BY id DESC LIMIT 1")
    .get(req.session.userId);

  const systemPrompt = `You are Jumino, a gentle, sleepy, dry-humoured donkey personal styling assistant for Yumori.
Speak in short, cosy sentences. NEVER insult appearance. Suggest outfits ONLY from the wardrobe JSON provided (use their id values).
If the wardrobe is empty, say so gently and suggest adding items rather than inventing them.
Return STRICT JSON: { "reply": "speech bubble text", "outfit": { "itemIds": [..], "why": ".." } | null, "essentials": ["umbrella", ...] }`;

  const userPayload = {
    wardrobe,
    colourPalette: colour ? JSON.parse(colour.data) : null,
    bodyResult: bodyR ? JSON.parse(bodyR.data) : null,
    faceResult: face ? JSON.parse(face.data) : null,
    message,
  };

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    const data = await r.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    db.prepare("INSERT INTO outfits (user_id, occasion, suggestion) VALUES (?,?,?)").run(
      req.session.userId,
      message.slice(0, 120),
      JSON.stringify(parsed)
    );
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: "The donkey's brain hiccuped. Try again." });
  }
});

// ===================== WEATHER =====================
app.get("/api/weather", auth, async (req, res) => {
  if (!process.env.OPENWEATHER_API_KEY)
    return res.status(503).json({ needsConfig: "OPENWEATHER_API_KEY" });
  const { city } = req.query;
  if (!city) return res.status(400).json({ error: "city required" });
  try {
    const r = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
    );
    if (!r.ok) return res.status(404).json({ error: "City not found." });
    const j = await r.json();
    res.json({
      temp: j.main.temp,
      feels: j.main.feels_like,
      description: j.weather[0].description,
      wind: j.wind.speed,
    });
  } catch {
    res.status(500).json({ error: "Weather unavailable." });
  }
});

app.listen(PORT, () => console.log(`🌸 Yumori running at http://localhost:${PORT}`));
