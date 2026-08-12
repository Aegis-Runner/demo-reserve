// ATLAS RESERVATIONS — room bookings with a TIME-SLOT CONFLICT invariant.
//   INVARIANT   no two confirmed bookings share the same room AND slot. Booking a
//               taken slot must be rejected.
//   PERSISTENCE a new booking (free-text party name) must survive an independent
//               re-read and carries a visible app-issued reference (BKG-###).
//   FILTER      "Today" is a SUBSET (bookings on the selected day); a leak is unsound.
// Faults (healthy when DEMO_BUGS empty):
//   doublebook    a conflicting booking is accepted (two on one room+slot)
//   ghostbooking  the booking confirms but never persists
//   leakytoday    the Today filter also shows other days
import express from "express";
import cookieParser from "cookie-parser";
import { DatabaseSync } from "node:sqlite";
const app = express();
app.use(express.urlencoded({ extended: true })); app.use(express.json()); app.use(cookieParser());
const BUGS = new Set(String(process.env.DEMO_BUGS || "").split(",").map(s => s.trim()).filter(Boolean));
const RESET_TOKEN = process.env.DEMO_RESET_TOKEN || "rsv-reset";
const SESSION = "reserve_session_v1";
const USERS = { "front@atlasreserve.test": { password: "front12345", name: "Front Desk" } };
const ROOMS = ["Cedar Room", "Harbor Room", "Summit Room"];
const SLOTS = ["Mon 09:00", "Mon 13:00", "Tue 09:00", "Tue 13:00"];
const b64 = s => Buffer.from(String(s)).toString("base64url");
const unb64 = s => { try { return Buffer.from(String(s || ""), "base64url").toString(); } catch { return ""; } };
const currentUser = req => USERS[unb64(req.cookies?.[SESSION])] ? { email: unb64(req.cookies[SESSION]) } : null;
let seq = 600; const id = () => String(++seq);
const seed = () => ({
  bookings: [
    { id: "601", ref: "BKG-601", room: "Cedar Room", slot: "Mon 09:00", party: "Ops standup" },
    { id: "602", ref: "BKG-602", room: "Harbor Room", slot: "Tue 13:00", party: "Vendor review" },
  ],
});
let { bookings } = seed();
const DB_PATH = process.env.DEMO_DB || "/data/app.db";
let db = null; try { db = new DatabaseSync(DB_PATH); db.exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`); } catch { db = null; }
const persist = () => { if (db) try { db.prepare(`INSERT INTO kv(k,v) VALUES('s',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(JSON.stringify({ seq, bookings })); } catch {} };
(() => { if (db) try { const r = db.prepare(`SELECT v FROM kv WHERE k='s'`).get(); if (r?.v) { const s = JSON.parse(r.v); seq = s.seq; bookings = s.bookings; } } catch {} })();
const taken = (room, slot) => bookings.some(b => b.room === room && b.slot === slot);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STYLE = `body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f4f7f8;color:#182428}header{background:#164e57;color:#fff;padding:12px 20px;display:flex;gap:18px;align-items:center}header a{color:#c6e4e8;text-decoration:none;font-weight:500}header a.on{color:#fff;text-decoration:underline}main{max-width:900px;margin:22px auto;padding:0 16px}.card{background:#fff;border:1px solid #dbe6e8;border-radius:8px;padding:18px;margin-bottom:18px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e9f0f1}th{font-size:12px;text-transform:uppercase;color:#5b767c}label{display:block;margin:10px 0 4px;font-size:13px;color:#41585d}input,select{padding:8px 10px;border:1px solid #c9dadd;border-radius:6px;min-width:230px;font-size:14px}button,.btn{background:#164e57;color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}.pill{display:inline-block;padding:2px 9px;border-radius:12px;font-size:12px;background:#e6eff0}.muted{color:#6b7a89;font-size:13px}.err{background:#fdecea;border:1px solid #f5b3ab;color:#8a1c10;padding:9px 12px;border-radius:6px;margin-bottom:12px}`;
const layout = (a, t, b) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t)} · Atlas Reservations</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style></head><body><header><strong>Atlas Reservations</strong>${[["/", "Dashboard"], ["/bookings", "Bookings"], ["/bookings/new", "New booking"]].map(([h, l]) => `<a href="${h}" class="${a === h ? "on" : ""}">${l}</a>`).join("")}<span style="margin-left:auto"><a href="/logout">Sign out</a></span></header><main><h1>${esc(t)}</h1>${b}</main></body></html>`;
app.get("/healthz", (_q, r) => r.type("text").send("ok"));
app.use((req, res, next) => { if (["/login", "/healthz", "/api/reset"].includes(req.path)) return next(); if (!currentUser(req)) return res.redirect("/login"); next(); });
app.get("/login", (_q, res) => res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Sign in · Atlas Reservations</title><style>${STYLE}</style></head><body><main><div class="card" style="max-width:380px;margin:60px auto"><h1>Sign in</h1><form method="post" action="/login"><label for="email">Email</label><input id="email" name="email" type="email" value="front@atlasreserve.test"><label for="password">Password</label><input id="password" name="password" type="password" value="front12345"><p><button>Sign in</button></p></form></div></main></body></html>`));
app.post("/login", (req, res) => { const u = USERS[String(req.body.email || "").toLowerCase()]; if (!u || u.password !== req.body.password) return res.status(401).send(`<p class="err">Wrong email or password.</p><a href="/login">Back</a>`); res.cookie(SESSION, b64(String(req.body.email).toLowerCase()), { httpOnly: true }); res.redirect("/"); });
app.get("/logout", (_q, res) => { res.clearCookie(SESSION); res.redirect("/login"); });
app.get("/", (_q, res) => res.send(layout("/", "Dashboard", `<div class="card"><table><tr><th>Rooms</th><td>${ROOMS.length}</td></tr><tr><th>Bookings</th><td>${bookings.length}</td></tr><tr><th>Free slots</th><td>${ROOMS.length * SLOTS.length - bookings.length}</td></tr></table></div><div class="card"><a class="btn" href="/bookings/new">New booking</a></div>`)));
app.get("/bookings", (req, res) => {
  const day = String(req.query.day || "");
  const rows = day ? (BUGS.has("leakytoday") ? bookings : bookings.filter(b => b.slot.startsWith(day))) : bookings;
  res.send(layout("/bookings", day ? `${day} bookings` : "Bookings",
    `<div class="card">${["", "Mon", "Tue"].map(d => `<a class="pill" href="/bookings${d ? "?day=" + d : ""}">${d || "All"}</a>`).join(" ")}</div>
<div class="card"><table><tr><th>Ref</th><th>Room</th><th>Slot</th><th>Party</th></tr>${rows.map(b => `<tr><td><a href="/bookings/${b.id}">${esc(b.ref)}</a></td><td>${esc(b.room)}</td><td>${esc(b.slot)}</td><td>${esc(b.party)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">None.</td></tr>`}</table></div>`));
});
app.get("/bookings/new", (_q, res) => res.send(layout("/bookings/new", "New booking", `<div class="card"><form method="post" action="/bookings/new"><label for="party">Party / meeting name</label><input id="party" name="party" value="New meeting"><label for="room">Room</label><select id="room" name="room">${ROOMS.map(r => `<option>${r}</option>`).join("")}</select><label for="slot">Slot</label><select id="slot" name="slot">${SLOTS.map(s => `<option>${s}</option>`).join("")}</select><p><button>Book room</button></p></form></div>`)));
app.post("/bookings/new", (req, res) => {
  const room = ROOMS.includes(req.body.room) ? req.body.room : ROOMS[0];
  const slot = SLOTS.includes(req.body.slot) ? req.body.slot : SLOTS[0];
  const party = String(req.body.party || "").trim() || "Meeting";
  // DOUBLEBOOK: accept a conflicting slot. Healthy: reject if the room+slot is taken.
  if (taken(room, slot) && !BUGS.has("doublebook")) return res.status(400).send(layout("/bookings", "Conflict", `<div class="err">${esc(room)} is already booked for ${esc(slot)}.</div><a class="btn" href="/bookings/new">Back</a>`));
  const bid = id(); const rec = { id: bid, ref: "BKG-" + bid, room, slot, party };
  if (!BUGS.has("ghostbooking")) { bookings.push(rec); persist(); }
  res.redirect(`/bookings/${bid}`);
});
app.get("/bookings/:id", (req, res) => {
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).send(layout("/bookings", "Not found", `<div class="card">No such booking.</div>`));
  res.send(layout("/bookings", b.ref, `<div class="card"><table><tr><th>Reference</th><td><strong>${esc(b.ref)}</strong></td></tr><tr><th>Room</th><td>${esc(b.room)}</td></tr><tr><th>Slot</th><td>${esc(b.slot)}</td></tr><tr><th>Party</th><td>${esc(b.party)}</td></tr></table></div>`));
});
app.post("/api/reset", (req, res) => { if (req.get("X-Reset-Token") !== RESET_TOKEN) return res.status(403).json({ error: "bad token" }); seq = 600; ({ bookings } = seed()); persist(); res.json({ ok: true, counts: { bookings: bookings.length } }); });
app.listen(Number(process.env.PORT || 3000), () => console.log(`atlas-reservations on ${process.env.PORT || 3000}; bugs=${[...BUGS].join(",") || "none"}`));
