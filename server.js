require("dotenv").config();
const http = require("http");
const express = require("express");
const compression = require("compression");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-this-admin-token";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || "";
const EMAIL_TO = (process.env.EMAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, "assign_tutors.db");
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

async function supabaseUpsert(table, row) {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
  if (error) throw error;
}

async function syncAllToSupabase() {
  if (!supabase) return { synced: false, reason: "supabase_not_configured" };
  const tableMap = [
    { local: "enquiries", remote: "enquiries" },
    { local: "students", remote: "students" },
    { local: "sessions", remote: "sessions" },
    { local: "orders", remote: "orders" },
    { local: "order_messages", remote: "order_messages" },
    { local: "order_files", remote: "order_files" },
    { local: "notifications", remote: "notifications" },
    { local: "referrals", remote: "referrals" },
    { local: "discount_codes", remote: "discount_codes" },
    { local: "announcements", remote: "announcements" },
    { local: "enquiry_files", remote: "enquiry_files" }
  ];
  const summary = {};
  for (const item of tableMap) {
    const rows = await all(`SELECT * FROM ${item.local}`);
    summary[item.local] = rows.length;
    if (rows.length > 0) {
      const { error } = await supabase.from(item.remote).upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Supabase sync failed for ${item.local}: ${error.message}`);
    }
  }
  return { synced: true, summary };
}

async function addColumnIfMissing(table, column, ddl) {
  const cols = await all(`PRAGMA table_info(${table})`);
  const exists = cols.some((c) => c.name === column);
  if (!exists) await run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      course_subject TEXT NOT NULL,
      assignment_type TEXT NOT NULL,
      deadline TEXT NOT NULL,
      word_count INTEGER,
      budget TEXT,
      requirements TEXT NOT NULL,
      preferred_contact TEXT,
      file_path TEXT,
      file_original_name TEXT,
      status TEXT DEFAULT 'new'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      referral_code TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      student_id INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      assignment_type TEXT NOT NULL,
      deadline TEXT NOT NULL,
      budget_total REAL,
      paid_amount REAL NOT NULL DEFAULT 0,
      due_payment REAL,
      status TEXT NOT NULL DEFAULT 'Confirmed',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      file_path TEXT,
      file_original_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS order_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      uploader_role TEXT NOT NULL,
      uploader_name TEXT NOT NULL,
      file_kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_original_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      order_id INTEGER,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_student_id INTEGER NOT NULL,
      referred_enquiry_id INTEGER,
      referred_student_id INTEGER,
      referred_order_id INTEGER,
      referred_email TEXT,
      referred_phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reward_applied INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      FOREIGN KEY(referrer_student_id) REFERENCES students(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      show_on_website INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS enquiry_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enquiry_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_original_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id)
    )
  `);
});

(async () => {
  try {
    await addColumnIfMissing("students", "referral_code", "referral_code TEXT");
    await addColumnIfMissing("enquiries", "referral_code_input", "referral_code_input TEXT");
    await addColumnIfMissing("enquiries", "referral_status", "referral_status TEXT DEFAULT 'none'");
    await addColumnIfMissing("enquiries", "referral_referrer_student_id", "referral_referrer_student_id INTEGER");
    await addColumnIfMissing("discount_codes", "show_on_website", "show_on_website INTEGER NOT NULL DEFAULT 1");
  } catch (e) {
    console.error("Migration warning:", e.message);
  }
})();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip", ".rar", ".txt", ".xlsx", ".csv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  }
});
const panelUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip", ".rar", ".txt", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "7d",
  setHeaders: (res, filePath) => {
    if (/sw\.js$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache");
      return;
    }
    if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    }
  }
}));

const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const createToken = () => crypto.randomBytes(24).toString("hex");
const nowIso = () => new Date().toISOString();
const plusDaysIso = (days) => new Date(Date.now() + days * 86400000).toISOString();
const makeReferralCode = () => `AT-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

async function sendEmailNotifications(enquiry) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM || EMAIL_TO.length === 0) {
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const text =
    `New enquiry #${enquiry.id}\n` +
    `Name: ${enquiry.full_name}\nEmail: ${enquiry.email}\nPhone: ${enquiry.phone}\n` +
    `Subject: ${enquiry.course_subject}\nType: ${enquiry.assignment_type}\n` +
    `Deadline: ${enquiry.deadline}\nWord Count: ${enquiry.word_count || "-"}\n` +
    `Budget: ${enquiry.budget || "-"}\nFile: ${enquiry.file_original_name || "No file"}\n\n` +
    `Requirements:\n${enquiry.requirements}`;
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_TO.join(","),
    subject: `New Assign Tutors Enquiry #${enquiry.id}`,
    text
  });
}


async function authSessionByToken(token) {
  if (!token) return null;
  const session = await get("SELECT * FROM sessions WHERE token=?", [token]);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await run("DELETE FROM sessions WHERE token=?", [token]);
    return null;
  }
  return session;
}

async function authSession(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return authSessionByToken(header.slice(7));
}

function requireAdminApi(req, res, next) {
  authSession(req)
    .then((s) => {
      if (!s || s.role !== "admin") return res.status(401).json({ error: "Unauthorized" });
      req.session = s;
      return next();
    })
    .catch(() => res.status(500).json({ error: "Auth failed" }));
}
function requireStudentApi(req, res, next) {
  authSession(req)
    .then((s) => {
      if (!s || s.role !== "student") return res.status(401).json({ error: "Unauthorized" });
      req.session = s;
      return next();
    })
    .catch(() => res.status(500).json({ error: "Auth failed" }));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "assign-tutors-api" }));
app.get("/api/public/site-config", (_req, res) => res.json({ ga4_measurement_id: GA4_MEASUREMENT_ID }));
app.get("/api/student/announcements/latest", requireStudentApi, async (_req, res) => {
  const row = await get("SELECT id,title,message,created_at FROM announcements WHERE is_active=1 ORDER BY id DESC LIMIT 1");
  return res.json({ announcement: row || null });
});
app.get("/api/admin/integrations/status", requireAdminApi, async (_req, res) => {
  let dbOk = true;
  try {
    await get("SELECT 1 as ok");
  } catch {
    dbOk = false;
  }
  const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && EMAIL_FROM && EMAIL_TO.length > 0);
  const gaConfigured = Boolean(GA4_MEASUREMENT_ID);
  const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
  return res.json({
    integrations: {
      database: { connected: dbOk, engine: "sqlite", path: dbPath },
      email: { configured: smtpConfigured, host: SMTP_HOST || null, recipients: EMAIL_TO },
      ga4: { configured: gaConfigured, measurement_id: GA4_MEASUREMENT_ID || null },
      supabase: { configured: supabaseConfigured, url: SUPABASE_URL || null }
    }
  });
});

app.post("/api/admin/supabase/sync-all", requireAdminApi, async (_req, res) => {
  try {
    const out = await syncAllToSupabase();
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Supabase sync failed" });
  }
});

app.post("/api/enquiries", upload.fields([{ name: "brief_files", maxCount: 10 }, { name: "brief_file", maxCount: 1 }]), async (req, res) => {
  try {
    const { full_name, email, phone, course_subject, assignment_type, deadline, word_count, budget, requirements, preferred_contact, referral_code_input } = req.body;
    if (!full_name || !email || !phone || !course_subject || !assignment_type || !deadline || !requirements) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    let referralStatus = "none";
    let referrerId = null;
    const codeInput = (referral_code_input || "").trim().toUpperCase();
    if (codeInput) {
      const referrer = await get("SELECT id FROM students WHERE referral_code=? AND is_active=1", [codeInput]);
      if (referrer) {
        referralStatus = "pending_verification";
        referrerId = referrer.id;
      } else {
        referralStatus = "invalid";
      }
    }
    const filesObj = req.files && typeof req.files === "object" ? req.files : {};
    const files = [...(filesObj.brief_files || []), ...(filesObj.brief_file || [])];
    const firstFile = files[0] || null;
    const inserted = await run(
      `INSERT INTO enquiries(created_at,full_name,email,phone,course_subject,assignment_type,deadline,word_count,budget,requirements,preferred_contact,file_path,file_original_name,referral_code_input,referral_status,referral_referrer_student_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nowIso(),
        full_name.trim(),
        email.trim(),
        phone.trim(),
        course_subject.trim(),
        assignment_type.trim(),
        deadline,
        word_count ? Number(word_count) : null,
        budget ? budget.trim() : null,
        requirements.trim(),
        preferred_contact ? preferred_contact.trim() : null,
        firstFile ? `/uploads/${firstFile.filename}` : null,
        firstFile ? firstFile.originalname : null,
        codeInput || null,
        referralStatus,
        referrerId
      ]
    );
    if (files.length > 0) {
      for (const f of files) {
        await run(
          "INSERT INTO enquiry_files(enquiry_id,file_path,file_original_name,created_at) VALUES(?,?,?,?)",
          [inserted.lastID, `/uploads/${f.filename}`, f.originalname, nowIso()]
        );
      }
    }
    try {
      const saved = await get("SELECT * FROM enquiries WHERE id=?", [inserted.lastID]);
      await supabaseUpsert("enquiries", saved);
    } catch (e) {
      console.error("Supabase sync warning (enquiries):", e.message);
    }
    try {
      await sendEmailNotifications({
        id: inserted.lastID,
        full_name,
        email,
        phone,
        course_subject,
        assignment_type,
        deadline,
        word_count,
        budget,
        requirements,
        file_original_name: firstFile ? firstFile.originalname : null
      });
    } catch (e) {
      console.error("Email notify failed:", e.message);
    }
    return res.status(201).json({ message: "Enquiry submitted", id: inserted.lastID });
  } catch (e) {
    return res.status(500).json({ error: "Failed to save enquiry" });
  }
});

app.get("/api/enquiries", async (req, res) => {
  if (req.query.token !== ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  const rows = await all("SELECT * FROM enquiries ORDER BY id DESC LIMIT 500");
  return res.json({ enquiries: rows });
});

app.get("/api/public/discount-codes", async (_req, res) => {
  const now = nowIso();
  const rows = await all(
    `SELECT id,code,title,description,discount_type,discount_value,starts_at,ends_at
     FROM discount_codes
     WHERE is_active=1
       AND show_on_website=1
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY id DESC`,
    [now, now]
  );
  return res.json({ discount_codes: rows });
});

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid credentials" });
  const token = createToken();
  await run("INSERT INTO sessions(token,role,student_id,created_at,expires_at) VALUES(?,?,?,?,?)", [token, "admin", null, nowIso(), plusDaysIso(7)]);
  return res.json({ token, role: "admin" });
});

app.post("/api/student/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  const student = await get("SELECT * FROM students WHERE email=? AND is_active=1", [email.trim().toLowerCase()]);
  if (!student || student.password_hash !== sha(password)) return res.status(401).json({ error: "Invalid credentials" });
  const token = createToken();
  await run("INSERT INTO sessions(token,role,student_id,created_at,expires_at) VALUES(?,?,?,?,?)", [token, "student", student.id, nowIso(), plusDaysIso(14)]);
  return res.json({ token, role: "student", student: { id: student.id, full_name: student.full_name, email: student.email } });
});

app.post("/api/admin/students", requireAdminApi, async (req, res) => {
  const { full_name, email, phone, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: "Missing required fields" });
  try {
    let code = makeReferralCode();
    let tries = 0;
    while (tries < 5) {
      const exists = await get("SELECT id FROM students WHERE referral_code=?", [code]);
      if (!exists) break;
      code = makeReferralCode();
      tries += 1;
    }
    const out = await run(
      "INSERT INTO students(full_name,email,phone,referral_code,password_hash,created_at,created_by,is_active) VALUES(?,?,?,?,?,?,?,1)",
      [full_name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null, code, sha(password), nowIso(), ADMIN_USERNAME]
    );
    try {
      const saved = await get("SELECT * FROM students WHERE id=?", [out.lastID]);
      await supabaseUpsert("students", saved);
    } catch (e) {
      console.error("Supabase sync warning (students):", e.message);
    }
    return res.status(201).json({ id: out.lastID, referral_code: code, message: "Student account created" });
  } catch {
    return res.status(400).json({ error: "Student email already exists" });
  }
});

async function nextOrderCode() {
  const row = await get("SELECT id FROM orders ORDER BY id DESC LIMIT 1");
  const n = (row?.id || 0) + 1;
  return `ORD-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
}

async function createNotification(studentId, orderId, message) {
  const out = await run("INSERT INTO notifications(student_id,order_id,message,is_read,created_at) VALUES(?,?,?,?,?)", [studentId, orderId || null, message, 0, nowIso()]);
  const notification = await get("SELECT * FROM notifications WHERE id=?", [out.lastID]);
  try {
    await supabaseUpsert("notifications", notification);
  } catch (e) {
    console.error("Supabase sync warning (notifications):", e.message);
  }
  io.to(`student:${studentId}`).emit("notification:new", notification);
  return notification;
}

async function emitOrderMessage(orderId) {
  const order = await get("SELECT * FROM orders WHERE id=?", [orderId]);
  if (!order) return;
  const message = await get("SELECT * FROM order_messages WHERE order_id=? ORDER BY id DESC LIMIT 1", [orderId]);
  if (!message) return;
  io.to(`student:${order.student_id}`).emit("message:new", { order_id: orderId, message });
  io.to("admin").emit("message:new", { order_id: orderId, message });
}

async function emitOrderUpdated(orderId) {
  const order = await get("SELECT * FROM orders WHERE id=?", [orderId]);
  if (!order) return;
  io.to(`student:${order.student_id}`).emit("order:updated", { order });
  io.to("admin").emit("order:updated", { order });
}

app.post("/api/admin/orders", requireAdminApi, async (req, res) => {
  const { student_id, title, subject, assignment_type, deadline, budget_total, paid_amount, due_payment, status, progress_percent, description } = req.body;
  if (!student_id || !title || !subject || !assignment_type || !deadline) return res.status(400).json({ error: "Missing required fields" });
  const student = await get("SELECT id,full_name FROM students WHERE id=? AND is_active=1", [student_id]);
  if (!student) return res.status(404).json({ error: "Student not found" });
  const code = await nextOrderCode();
  const now = nowIso();
  const inserted = await run(
    `INSERT INTO orders(order_code,student_id,title,subject,assignment_type,deadline,budget_total,paid_amount,due_payment,status,progress_percent,description,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      code,
      Number(student_id),
      title.trim(),
      subject.trim(),
      assignment_type.trim(),
      deadline,
      budget_total ? Number(budget_total) : null,
      paid_amount ? Number(paid_amount) : 0,
      due_payment ? Number(due_payment) : null,
      status || "Confirmed",
      Number(progress_percent || 0),
      description ? description.trim() : null,
      now,
      now
    ]
  );
  try {
    const saved = await get("SELECT * FROM orders WHERE id=?", [inserted.lastID]);
    await supabaseUpsert("orders", saved);
  } catch (e) {
    console.error("Supabase sync warning (orders insert):", e.message);
  }
  await createNotification(student.id, inserted.lastID, `Order ${code} created. Status: ${status || "Confirmed"}`);
  await emitOrderUpdated(inserted.lastID);
  return res.status(201).json({ id: inserted.lastID, order_code: code });
});

app.patch("/api/admin/orders/:id", requireAdminApi, async (req, res) => {
  const id = Number(req.params.id);
  const order = await get("SELECT * FROM orders WHERE id=?", [id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const payload = {
    status: req.body.status ?? order.status,
    progress_percent: req.body.progress_percent ?? order.progress_percent,
    budget_total: req.body.budget_total ?? order.budget_total,
    paid_amount: req.body.paid_amount ?? order.paid_amount,
    due_payment: req.body.due_payment ?? order.due_payment,
    description: req.body.description ?? order.description
  };
  await run(
    "UPDATE orders SET status=?,progress_percent=?,budget_total=?,paid_amount=?,due_payment=?,description=?,updated_at=? WHERE id=?",
    [payload.status, Number(payload.progress_percent || 0), payload.budget_total, payload.paid_amount, payload.due_payment, payload.description, nowIso(), id]
  );
  try {
    const saved = await get("SELECT * FROM orders WHERE id=?", [id]);
    await supabaseUpsert("orders", saved);
  } catch (e) {
    console.error("Supabase sync warning (orders update):", e.message);
  }
  await createNotification(order.student_id, id, `Order ${order.order_code} updated: status ${payload.status}, progress ${payload.progress_percent}%`);
  await emitOrderUpdated(id);
  return res.json({ message: "Order updated" });
});

app.get("/api/admin/orders", requireAdminApi, async (_req, res) => {
  const rows = await all(
    `SELECT o.*, s.full_name as student_name, s.email as student_email
     FROM orders o JOIN students s ON s.id=o.student_id
     ORDER BY o.id DESC`
  );
  return res.json({ orders: rows });
});

app.get("/api/admin/students", requireAdminApi, async (_req, res) => {
  const rows = await all("SELECT id,full_name,email,phone,referral_code,created_at,is_active FROM students ORDER BY id DESC");
  return res.json({ students: rows });
});

app.get("/api/admin/enquiries", requireAdminApi, async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const search = String(req.query.search || "").trim().toLowerCase();
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push("LOWER(COALESCE(status,'new'))=?");
    params.push(status);
  }
  if (from) {
    conditions.push("created_at >= ?");
    params.push(new Date(from).toISOString());
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    conditions.push("created_at <= ?");
    params.push(end.toISOString());
  }
  if (search) {
    conditions.push("(LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(course_subject) LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await all(`SELECT * FROM enquiries ${where} ORDER BY id DESC LIMIT 2000`, params);
  return res.json({ enquiries: rows });
});

app.get("/api/admin/enquiries/export.csv", requireAdminApi, async (req, res) => {
  const rows = await all("SELECT * FROM enquiries ORDER BY id DESC LIMIT 5000");
  const cols = [
    "id", "created_at", "full_name", "email", "phone", "course_subject", "assignment_type", "deadline",
    "word_count", "budget", "preferred_contact", "status", "referral_code_input", "referral_status"
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(`${head}\n${body}\n`);
});

app.get("/api/admin/referrals/pending", requireAdminApi, async (_req, res) => {
  const rows = await all(
    `SELECT e.id as enquiry_id, e.full_name, e.email, e.phone, e.referral_code_input, e.created_at,
            s.id as referrer_student_id, s.full_name as referrer_name, s.email as referrer_email
     FROM enquiries e
     LEFT JOIN students s ON s.id=e.referral_referrer_student_id
     WHERE e.referral_status='pending_verification'
     ORDER BY e.id DESC`
  );
  return res.json({ pending: rows });
});

app.get("/api/admin/discount-codes", requireAdminApi, async (_req, res) => {
  const rows = await all("SELECT * FROM discount_codes ORDER BY id DESC");
  return res.json({ discount_codes: rows });
});

app.get("/api/admin/announcements", requireAdminApi, async (_req, res) => {
  const rows = await all("SELECT * FROM announcements ORDER BY id DESC LIMIT 50");
  return res.json({ announcements: rows });
});

app.post("/api/admin/announcements", requireAdminApi, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const message = String(req.body?.message || "").trim();
  const isActive = req.body?.is_active !== undefined ? Number(req.body.is_active ? 1 : 0) : 1;
  if (!title || !message) return res.status(400).json({ error: "Title and message are required" });
  const out = await run("INSERT INTO announcements(title,message,is_active,created_at) VALUES(?,?,?,?)", [title, message, isActive, nowIso()]);
  return res.status(201).json({ id: out.lastID, message: "Announcement posted" });
});

app.patch("/api/admin/announcements/:id", requireAdminApi, async (req, res) => {
  const id = Number(req.params.id);
  const row = await get("SELECT * FROM announcements WHERE id=?", [id]);
  if (!row) return res.status(404).json({ error: "Announcement not found" });
  const nextTitle = req.body?.title !== undefined ? String(req.body.title || "").trim() : row.title;
  const nextMessage = req.body?.message !== undefined ? String(req.body.message || "").trim() : row.message;
  const nextActive = req.body?.is_active !== undefined ? Number(req.body.is_active ? 1 : 0) : row.is_active;
  if (!nextTitle || !nextMessage) return res.status(400).json({ error: "Title and message are required" });
  await run("UPDATE announcements SET title=?,message=?,is_active=? WHERE id=?", [nextTitle, nextMessage, nextActive, id]);
  return res.json({ message: "Announcement updated" });
});

app.post("/api/admin/discount-codes", requireAdminApi, async (req, res) => {
  const {
    code,
    title,
    description,
    discount_type,
    discount_value,
    starts_at,
    ends_at,
    is_active,
    show_on_website
  } = req.body || {};
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedTitle = String(title || "").trim();
  const normalizedType = discount_type === "fixed" ? "fixed" : "percent";
  const normalizedValue = Number(discount_value);
  if (!normalizedCode || !normalizedTitle || !Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return res.status(400).json({ error: "Code, title, and valid discount value are required" });
  }
  if (normalizedType === "percent" && normalizedValue > 100) {
    return res.status(400).json({ error: "Percent discount cannot exceed 100" });
  }
  try {
    const now = nowIso();
    const out = await run(
      `INSERT INTO discount_codes(code,title,description,discount_type,discount_value,starts_at,ends_at,is_active,show_on_website,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        normalizedCode,
        normalizedTitle,
        description ? String(description).trim() : null,
        normalizedType,
        normalizedValue,
        starts_at || null,
        ends_at || null,
        Number(is_active ? 1 : 0),
        Number(show_on_website ? 1 : 0),
        now,
        now
      ]
    );
    try {
      const saved = await get("SELECT * FROM discount_codes WHERE id=?", [out.lastID]);
      await supabaseUpsert("discount_codes", saved);
    } catch (e) {
      console.error("Supabase sync warning (discount create):", e.message);
    }
    return res.status(201).json({ id: out.lastID, message: "Discount code created" });
  } catch (e) {
    if (String(e.message || "").toLowerCase().includes("unique")) {
      return res.status(400).json({ error: "Discount code already exists" });
    }
    return res.status(500).json({ error: "Failed to create discount code" });
  }
});

app.patch("/api/admin/discount-codes/:id", requireAdminApi, async (req, res) => {
  const id = Number(req.params.id);
  const row = await get("SELECT * FROM discount_codes WHERE id=?", [id]);
  if (!row) return res.status(404).json({ error: "Discount code not found" });
  const nextType = req.body.discount_type === "fixed" ? "fixed" : (req.body.discount_type === "percent" ? "percent" : row.discount_type);
  const nextValue = req.body.discount_value !== undefined ? Number(req.body.discount_value) : row.discount_value;
  if (!Number.isFinite(nextValue) || Number(nextValue) <= 0) {
    return res.status(400).json({ error: "Invalid discount value" });
  }
  if (nextType === "percent" && Number(nextValue) > 100) {
    return res.status(400).json({ error: "Percent discount cannot exceed 100" });
  }
  const updated = {
    code: req.body.code !== undefined ? String(req.body.code).trim().toUpperCase() : row.code,
    title: req.body.title !== undefined ? String(req.body.title).trim() : row.title,
    description: req.body.description !== undefined ? (req.body.description ? String(req.body.description).trim() : null) : row.description,
    discount_type: nextType,
    discount_value: Number(nextValue),
    starts_at: req.body.starts_at !== undefined ? (req.body.starts_at || null) : row.starts_at,
    ends_at: req.body.ends_at !== undefined ? (req.body.ends_at || null) : row.ends_at,
    is_active: req.body.is_active !== undefined ? Number(req.body.is_active ? 1 : 0) : row.is_active,
    show_on_website: req.body.show_on_website !== undefined ? Number(req.body.show_on_website ? 1 : 0) : row.show_on_website
  };
  if (!updated.code || !updated.title) return res.status(400).json({ error: "Code and title are required" });
  try {
    await run(
      `UPDATE discount_codes
       SET code=?,title=?,description=?,discount_type=?,discount_value=?,starts_at=?,ends_at=?,is_active=?,show_on_website=?,updated_at=?
       WHERE id=?`,
      [
        updated.code,
        updated.title,
        updated.description,
        updated.discount_type,
        updated.discount_value,
        updated.starts_at,
        updated.ends_at,
        updated.is_active,
        updated.show_on_website,
        nowIso(),
        id
      ]
    );
    try {
      const saved = await get("SELECT * FROM discount_codes WHERE id=?", [id]);
      await supabaseUpsert("discount_codes", saved);
    } catch (e) {
      console.error("Supabase sync warning (discount update):", e.message);
    }
    return res.json({ message: "Discount code updated" });
  } catch (e) {
    if (String(e.message || "").toLowerCase().includes("unique")) {
      return res.status(400).json({ error: "Discount code already exists" });
    }
    return res.status(500).json({ error: "Failed to update discount code" });
  }
});

app.post("/api/admin/referrals/:enquiryId/approve", requireAdminApi, async (req, res) => {
  const enquiryId = Number(req.params.enquiryId);
  const { referred_student_id, referred_order_id, notes } = req.body || {};
  const enquiry = await get("SELECT * FROM enquiries WHERE id=?", [enquiryId]);
  if (!enquiry || enquiry.referral_status !== "pending_verification" || !enquiry.referral_referrer_student_id) {
    return res.status(400).json({ error: "Referral is not pending verification" });
  }
  const duplicate = await get(
    "SELECT id FROM referrals WHERE (referred_email=? OR referred_phone=?) AND status='approved'",
    [enquiry.email, enquiry.phone]
  );
  if (duplicate) return res.status(400).json({ error: "This referred candidate already used referral benefit" });
  await run(
    `INSERT INTO referrals(referrer_student_id,referred_enquiry_id,referred_student_id,referred_order_id,referred_email,referred_phone,status,reward_applied,notes,created_at,verified_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      enquiry.referral_referrer_student_id,
      enquiryId,
      referred_student_id ? Number(referred_student_id) : null,
      referred_order_id ? Number(referred_order_id) : null,
      enquiry.email,
      enquiry.phone,
      "approved",
      1,
      notes ? String(notes).trim() : null,
      nowIso(),
      nowIso()
    ]
  );
  await run("UPDATE enquiries SET referral_status='approved' WHERE id=?", [enquiryId]);
  try {
    const savedReferral = await get("SELECT * FROM referrals ORDER BY id DESC LIMIT 1");
    if (savedReferral) await supabaseUpsert("referrals", savedReferral);
    const savedEnquiry = await get("SELECT * FROM enquiries WHERE id=?", [enquiryId]);
    if (savedEnquiry) await supabaseUpsert("enquiries", savedEnquiry);
  } catch (e) {
    console.error("Supabase sync warning (referral approve):", e.message);
  }
  await createNotification(enquiry.referral_referrer_student_id, referred_order_id ? Number(referred_order_id) : null, "Referral verified and reward approved.");
  return res.json({ message: "Referral approved" });
});

app.post("/api/admin/referrals/:enquiryId/reject", requireAdminApi, async (req, res) => {
  const enquiryId = Number(req.params.enquiryId);
  const { notes } = req.body || {};
  const enquiry = await get("SELECT * FROM enquiries WHERE id=?", [enquiryId]);
  if (!enquiry || enquiry.referral_status !== "pending_verification") return res.status(400).json({ error: "Referral is not pending" });
  await run(
    `INSERT INTO referrals(referrer_student_id,referred_enquiry_id,referred_email,referred_phone,status,reward_applied,notes,created_at,verified_at)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      enquiry.referral_referrer_student_id || 0,
      enquiryId,
      enquiry.email,
      enquiry.phone,
      "rejected",
      0,
      notes ? String(notes).trim() : null,
      nowIso(),
      nowIso()
    ]
  );
  await run("UPDATE enquiries SET referral_status='rejected' WHERE id=?", [enquiryId]);
  try {
    const savedReferral = await get("SELECT * FROM referrals ORDER BY id DESC LIMIT 1");
    if (savedReferral) await supabaseUpsert("referrals", savedReferral);
    const savedEnquiry = await get("SELECT * FROM enquiries WHERE id=?", [enquiryId]);
    if (savedEnquiry) await supabaseUpsert("enquiries", savedEnquiry);
  } catch (e) {
    console.error("Supabase sync warning (referral reject):", e.message);
  }
  return res.json({ message: "Referral rejected" });
});

app.post("/api/admin/orders/:id/messages", requireAdminApi, panelUpload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  const { message } = req.body;
  if (!message && !req.file) return res.status(400).json({ error: "Message or file required" });
  const order = await get("SELECT * FROM orders WHERE id=?", [id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  await run(
    "INSERT INTO order_messages(order_id,sender_role,sender_name,message,file_path,file_original_name,created_at) VALUES(?,?,?,?,?,?,?)",
    [id, "admin", "Admin", message ? message.trim() : "[File uploaded]", req.file ? `/uploads/${req.file.filename}` : null, req.file ? req.file.originalname : null, nowIso()]
  );
  try {
    const saved = await get("SELECT * FROM order_messages ORDER BY id DESC LIMIT 1");
    if (saved) await supabaseUpsert("order_messages", saved);
  } catch (e) {
    console.error("Supabase sync warning (admin message):", e.message);
  }
  await createNotification(order.student_id, id, req.file ? `Admin uploaded file on ${order.order_code}` : `New admin message on ${order.order_code}`);
  await emitOrderMessage(id);
  return res.status(201).json({ message: "Sent" });
});

app.get("/api/admin/orders/:id/messages", requireAdminApi, async (req, res) => {
  const id = Number(req.params.id);
  const order = await get("SELECT id FROM orders WHERE id=?", [id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const rows = await all("SELECT * FROM order_messages WHERE order_id=? ORDER BY id ASC", [id]);
  return res.json({ messages: rows });
});

app.get("/api/student/me/orders", requireStudentApi, async (req, res) => {
  const rows = await all("SELECT * FROM orders WHERE student_id=? ORDER BY id DESC", [req.session.student_id]);
  return res.json({ orders: rows });
});

app.get("/api/student/orders/:id/messages", requireStudentApi, async (req, res) => {
  const id = Number(req.params.id);
  const order = await get("SELECT * FROM orders WHERE id=? AND student_id=?", [id, req.session.student_id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const rows = await all("SELECT * FROM order_messages WHERE order_id=? ORDER BY id ASC", [id]);
  return res.json({ messages: rows });
});

app.post("/api/student/orders/:id/messages", requireStudentApi, panelUpload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  const { message } = req.body;
  if (!message && !req.file) return res.status(400).json({ error: "Message or file required" });
  const order = await get("SELECT * FROM orders WHERE id=? AND student_id=?", [id, req.session.student_id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const student = await get("SELECT full_name FROM students WHERE id=?", [req.session.student_id]);
  await run(
    "INSERT INTO order_messages(order_id,sender_role,sender_name,message,file_path,file_original_name,created_at) VALUES(?,?,?,?,?,?,?)",
    [id, "student", student?.full_name || "Student", message ? message.trim() : "[File uploaded]", req.file ? `/uploads/${req.file.filename}` : null, req.file ? req.file.originalname : null, nowIso()]
  );
  try {
    const saved = await get("SELECT * FROM order_messages ORDER BY id DESC LIMIT 1");
    if (saved) await supabaseUpsert("order_messages", saved);
  } catch (e) {
    console.error("Supabase sync warning (student message):", e.message);
  }
  await emitOrderMessage(id);
  return res.status(201).json({ message: "Sent" });
});

app.post("/api/admin/orders/:id/files", requireAdminApi, panelUpload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: "File required" });
  const order = await get("SELECT * FROM orders WHERE id=?", [id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  await run(
    "INSERT INTO order_files(order_id,uploader_role,uploader_name,file_kind,file_path,file_original_name,created_at) VALUES(?,?,?,?,?,?,?)",
    [id, "admin", "Admin", "solution", `/uploads/${req.file.filename}`, req.file.originalname, nowIso()]
  );
  try {
    const saved = await get("SELECT * FROM order_files ORDER BY id DESC LIMIT 1");
    if (saved) await supabaseUpsert("order_files", saved);
  } catch (e) {
    console.error("Supabase sync warning (admin file):", e.message);
  }
  await createNotification(order.student_id, id, `Solution file uploaded for ${order.order_code}`);
  await emitOrderUpdated(id);
  return res.status(201).json({ message: "File uploaded" });
});

app.get("/api/admin/orders/:id/files", requireAdminApi, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await all("SELECT * FROM order_files WHERE order_id=? ORDER BY id DESC", [id]);
  return res.json({ files: rows });
});

app.post("/api/student/orders/:id/files", requireStudentApi, panelUpload.single("file"), async (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: "File required" });
  const order = await get("SELECT * FROM orders WHERE id=? AND student_id=?", [id, req.session.student_id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const student = await get("SELECT full_name FROM students WHERE id=?", [req.session.student_id]);
  await run(
    "INSERT INTO order_files(order_id,uploader_role,uploader_name,file_kind,file_path,file_original_name,created_at) VALUES(?,?,?,?,?,?,?)",
    [id, "student", student?.full_name || "Student", "student_attachment", `/uploads/${req.file.filename}`, req.file.originalname, nowIso()]
  );
  try {
    const saved = await get("SELECT * FROM order_files ORDER BY id DESC LIMIT 1");
    if (saved) await supabaseUpsert("order_files", saved);
  } catch (e) {
    console.error("Supabase sync warning (student file):", e.message);
  }
  return res.status(201).json({ message: "File uploaded" });
});

app.get("/api/student/orders/:id/files", requireStudentApi, async (req, res) => {
  const id = Number(req.params.id);
  const order = await get("SELECT * FROM orders WHERE id=? AND student_id=?", [id, req.session.student_id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const rows = await all("SELECT * FROM order_files WHERE order_id=? ORDER BY id DESC", [id]);
  return res.json({ files: rows });
});

app.get("/api/student/notifications", requireStudentApi, async (req, res) => {
  const since = Number(req.query.since_id || 0);
  const rows = await all(
    "SELECT * FROM notifications WHERE student_id=? AND id>? ORDER BY id ASC LIMIT 200",
    [req.session.student_id, since]
  );
  return res.json({ notifications: rows });
});

app.post("/api/student/notifications/read", requireStudentApi, async (req, res) => {
  const { ids, order_id } = req.body || {};
  if (Array.isArray(ids) && ids.length > 0) {
    const clean = ids.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (clean.length === 0) return res.status(400).json({ error: "No valid ids" });
    const placeholders = clean.map(() => "?").join(",");
    await run(
      `UPDATE notifications SET is_read=1 WHERE student_id=? AND id IN (${placeholders})`,
      [req.session.student_id, ...clean]
    );
    return res.json({ message: "Marked read" });
  }
  if (order_id) {
    await run("UPDATE notifications SET is_read=1 WHERE student_id=? AND order_id=?", [req.session.student_id, Number(order_id)]);
    return res.json({ message: "Order notifications marked read" });
  }
  await run("UPDATE notifications SET is_read=1 WHERE student_id=?", [req.session.student_id]);
  return res.json({ message: "All notifications marked read" });
});

app.get("/api/student/notifications/unread-counts", requireStudentApi, async (req, res) => {
  const rows = await all(
    "SELECT order_id, COUNT(*) as unread_count FROM notifications WHERE student_id=? AND is_read=0 GROUP BY order_id",
    [req.session.student_id]
  );
  const totalRow = await get("SELECT COUNT(*) as total_unread FROM notifications WHERE student_id=? AND is_read=0", [req.session.student_id]);
  return res.json({ per_order: rows, total_unread: totalRow?.total_unread || 0 });
});

app.get("/api/student/profile", requireStudentApi, async (req, res) => {
  const s = await get("SELECT id,full_name,email,phone,referral_code FROM students WHERE id=?", [req.session.student_id]);
  return res.json({ student: s });
});

app.get("/api/student/referrals", requireStudentApi, async (req, res) => {
  const rows = await all(
    `SELECT id,referred_email,referred_phone,status,reward_applied,notes,created_at,verified_at
     FROM referrals WHERE referrer_student_id=? ORDER BY id DESC`,
    [req.session.student_id]
  );
  const summary = await get(
    `SELECT
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected_count
     FROM referrals WHERE referrer_student_id=?`,
    [req.session.student_id]
  );
  return res.json({ referrals: rows, summary: summary || { approved_count: 0, pending_count: 0, rejected_count: 0 } });
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use("/api", (req, res) => {
  return res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large. Max 20MB." });
  if (err) return res.status(400).json({ error: err.message || "Request failed" });
  return res.status(500).json({ error: "Unexpected error" });
});


io.on("connection", async (socket) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const session = await authSessionByToken(token);
    if (!session) {
      socket.emit("auth:error", { message: "Unauthorized" });
      socket.disconnect();
      return;
    }
    if (session.role === "admin") socket.join("admin");
    if (session.role === "student" && session.student_id) socket.join(`student:${session.student_id}`);
  } catch {
    socket.disconnect();
  }
});

server.listen(PORT, () => {
  console.log(`Assign Tutors running on http://localhost:${PORT}`);
  if (!GA4_MEASUREMENT_ID) console.log("GA4 not configured: set GA4_MEASUREMENT_ID in .env");
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM || EMAIL_TO.length === 0) {
    console.log("Email not configured: set SMTP_* + EMAIL_FROM + EMAIL_TO in .env");
  }
});

