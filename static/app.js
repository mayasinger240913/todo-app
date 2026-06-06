// ===== כלי עזר קטנים =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

function tpl(id) {
  // משכפל תבנית מה-HTML ומחזיר אלמנט אמיתי
  return document.getElementById(id).content.cloneNode(true);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}

// צליל קצר ועליז דרך Web Audio (בלי קבצי שמע)
let _audioCtx = null;
function playSound(type = "success") {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const notes = type === "levelup" ? [523, 659, 784, 1047, 1319] : [659, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.start(t); o.stop(t + 0.22);
    });
  } catch (e) { /* דפדפן ישן — פשוט בלי צליל */ }
}

// אפקט קונפטי 🎉 (בלי ספריות חיצוניות)
function celebrate(sound = "success") {
  if (sound) playSound(sound);
  let canvas = document.getElementById("confetti");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "confetti";
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#ff5ea3", "#ffc83d", "#2bd47d", "#34c3ff", "#7b5cff", "#ff8a3d"];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.3,
    r: 5 + Math.random() * 7,
    c: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * 6,
    vr: -0.2 + Math.random() * 0.4,
  }));
  let frames = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.y += p.vy; p.x += p.vx; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
      ctx.restore();
    });
    frames++;
    if (frames < 140) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

// קריאות לשרת (JSON)
async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "משהו השתבש");
  return data;
}

let ME = null; // המשתמש המחובר

// רישום ה-Service Worker — מאפשר "להתקין" את האפליקציה בטלפון
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// ===== נקודת התחלה =====
init();
async function init() {
  const { user } = await api("/api/me");
  if (user) {
    ME = user;
    renderHome();
    return;
  }
  // אין משתמש מחובר — בודקים אם זו כניסה ראשונה (צריך הקמה)
  const status = await api("/api/setup-status");
  if (status.needs_setup) {
    renderSetup();
  } else {
    renderLogin();
  }
}

// מסך הקמה ראשוני: ההורה בוחר שם + קוד + אימות
function renderSetup() {
  app.innerHTML = "";
  app.appendChild(tpl("tpl-setup"));
  const err = $("#su-err");
  $("#su-go").onclick = async () => {
    const name = $("#su-name").value.trim();
    const emoji = $("#su-emoji").value.trim() || "👑";
    const pin = $("#su-pin").value.trim();
    const pin2 = $("#su-pin2").value.trim();
    if (!name) { err.textContent = "צריך לבחור שם"; return; }
    if (pin.length < 4) { err.textContent = "הקוד חייב להיות לפחות 4 ספרות"; return; }
    if (pin !== pin2) { err.textContent = "הקוד והאימות לא תואמים 🙈"; return; }
    try {
      ME = await api("/api/setup", "POST", { name, emoji, pin });
      celebrate();
      renderHome();
    } catch (e) { err.textContent = e.message; }
  };
}

// ===================================================
// מסך כניסה
// ===================================================
async function renderLogin() {
  app.innerHTML = "";
  app.appendChild(tpl("tpl-login"));
  const users = await api("/api/users");
  const list = $("#user-list");
  list.innerHTML = "";
  users.forEach((u) => {
    const el = document.createElement("div");
    el.className = "user-pick";
    el.innerHTML = `
      <span class="ava">${u.emoji}</span>
      <div>
        <div class="nm">${u.name}</div>
        <div class="rl">${u.role === "parent" ? "הורה" : "ילד/ה"}</div>
      </div>
      ${u.role === "parent" ? '<span class="badge-parent">הורה 👑</span>' : ""}`;
    el.onclick = () => openPin(u);
    list.appendChild(el);
  });
}

function openPin(u) {
  const node = tpl("tpl-pin");
  document.body.appendChild(node);
  const back = $(".modal-back");
  $(".pin-emoji", back).textContent = u.emoji;
  $(".pin-name", back).textContent = `שלום ${u.name}!`;
  const input = $(".pin-input", back);
  input.focus();

  const doLogin = async () => {
    try {
      ME = await api("/api/login", "POST", { user_id: u.id, pin: input.value });
      back.remove();
      renderHome();
    } catch (e) {
      $(".pin-error", back).textContent = e.message;
      input.value = "";
      input.focus();
    }
  };

  $('[data-act="do-login"]', back).onclick = doLogin;
  $('[data-act="close-pin"]', back).onclick = () => back.remove();
  input.onkeydown = (e) => { if (e.key === "Enter") doLogin(); };
}

// ===================================================
// בית (אחרי כניסה)
// ===================================================
function renderHome() {
  app.innerHTML = "";
  const header = tpl("tpl-header");
  $(".who", header).innerHTML = `<span class="ava">${ME.emoji}</span> ${ME.name}`;
  $('[data-act="logout"]', header).onclick = async () => {
    await api("/api/logout", "POST");
    ME = null;
    renderLogin();
  };
  $('[data-act="change-pin"]', header).onclick = openChangePin;
  app.appendChild(header);

  if (ME.role === "child") renderChild();
  else renderParent();
}

// חלון החלפת קוד: קוד נוכחי → קוד חדש → אימות
function openChangePin() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal">
    <button class="close" data-act="close">✕</button>
    <div class="pin-emoji">🔑</div>
    <h2>החלפת קוד</h2>
    <input class="ask-input cp-cur" type="password" inputmode="numeric" placeholder="הקוד הנוכחי">
    <input class="ask-input cp-new" type="password" inputmode="numeric" placeholder="קוד חדש (לפחות 4 ספרות)">
    <input class="ask-input cp-conf" type="password" inputmode="numeric" placeholder="אימות הקוד החדש">
    <div class="pin-error cp-err"></div>
    <button class="btn big" data-act="save">שמירה</button>
  </div>`;
  document.body.appendChild(back);
  const err = $(".cp-err", back);

  $('[data-act="close"]', back).onclick = () => back.remove();
  $('[data-act="save"]', back).onclick = async () => {
    const cur = $(".cp-cur", back).value;
    const nw = $(".cp-new", back).value.trim();
    const conf = $(".cp-conf", back).value.trim();
    if (!cur || !nw || !conf) { err.textContent = "צריך למלא את כל השדות"; return; }
    if (nw.length < 4) { err.textContent = "הקוד החדש חייב להיות לפחות 4 ספרות"; return; }
    if (nw !== conf) { err.textContent = "הקוד החדש והאימות לא תואמים 🙈"; return; }
    try {
      await api("/api/change-pin", "POST", { current_pin: cur, new_pin: nw });
      back.remove();
      celebrate();
      toast("הקוד הוחלף בהצלחה! 🔐");
    } catch (e) { err.textContent = e.message; }
  };
}

// פעולת מעבר בין טאבים (משותף)
function wireTabs(root) {
  $$(".tab", root).forEach((tab) => {
    tab.onclick = () => {
      $$(".tab", root).forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const name = tab.dataset.tab;
      $$(".tab-content", root).forEach((c) =>
        c.classList.toggle("hidden", c.dataset.content !== name)
      );
    };
  });
}

// ===================================================
// מסך ילד
// ===================================================
async function renderChild() {
  const node = tpl("tpl-child");
  app.appendChild(node);
  const root = $(".screen", app);
  $(".points-num", root).textContent = ME.points;
  wireTabs(root);

  loadChildChores(root);
  loadChildRewards(root);
  loadChildHistory(root);
  loadChildStats(root);
}

// טוען רמה, רצף, הישגים וטבלת אלופים
async function loadChildStats(root) {
  const stats = await api("/api/stats");
  ME.points = stats.points;
  ME.total_earned = stats.total_earned;
  const lvl = stats.level;

  const lc = $(".level-chip", root);
  const sc = $(".streak-chip", root);
  if (lc) lc.textContent = `${lvl.emoji} רמה ${lvl.level}`;
  if (sc) sc.textContent = `🔥 ${stats.streak}`;
  $(".points-num", root).textContent = stats.points;

  const fill = $(".progress-fill", root);
  const text = $(".progress-text", root);
  if (fill) {
    fill.style.width = lvl.progress_pct + "%";
    text.textContent = lvl.next_name
      ? `עוד ${lvl.to_next} נקודות לרמה: ${lvl.next_name}`
      : "הגעת לרמה הכי גבוהה! 🤩";
  }

  // זיהוי עליית רמה מאז הביקור הקודם → חגיגה גדולה
  const key = "lastLevel_" + ME.id;
  const prev = parseInt(localStorage.getItem(key) || "0", 10);
  if (prev && lvl.level > prev) {
    celebrate("levelup");
    toast(`🎉 עלית לרמה ${lvl.level}: ${lvl.emoji} ${lvl.name}!`);
  }
  localStorage.setItem(key, String(lvl.level));

  renderAchievements(root, stats);
}

async function renderAchievements(root, stats) {
  const box = $('[data-content="achv"]', root);
  if (!box) return;
  const lvl = stats.level;
  let html = `<div class="level-card">
    <div class="level-big">${lvl.emoji}</div>
    <div class="level-title">רמה ${lvl.level} · ${lvl.name}</div>
    <div class="level-sub">סך הכל נצברו ${stats.total_earned} נקודות 💎</div>
  </div>`;

  html += `<div class="stat-row">
    <div class="stat-box"><div class="n">${stats.chores_done}</div><div class="l">מטלות 🧹</div></div>
    <div class="stat-box"><div class="n">${stats.streak}</div><div class="l">ימים ברצף 🔥</div></div>
    <div class="stat-box"><div class="n">${stats.rewards_got}</div><div class="l">פרסים 🎁</div></div>
  </div>`;

  html += "<h2>המדליות שלי 🏅</h2><div class='achv-grid'>";
  stats.achievements.forEach((a) => {
    html += `<div class="achv ${a.done ? "got" : "locked"}">
      <div class="achv-emoji">${a.done ? a.emoji : "🔒"}</div>
      <div class="achv-name">${a.name}</div></div>`;
  });
  html += "</div>";

  const board = await api("/api/leaderboard");
  if (board.length > 1) {
    html += "<h2>טבלת האלופים 🥇</h2>";
    const medals = ["🥇", "🥈", "🥉"];
    board.forEach((b, i) => {
      const mine = b.name === ME.name ? " (אני)" : "";
      html += `<div class="item">
        <span class="emoji">${medals[i] || (i + 1) + "."}</span>
        <span class="emoji">${b.emoji}</span>
        <div class="info"><div class="t">${b.name}${mine}</div>
        <div class="s">${b.level_emoji} רמה ${b.level}</div></div>
        <span class="pts">${b.total_earned} 💎</span></div>`;
    });
  }
  box.innerHTML = html;
}

async function refreshMe() {
  const { user } = await api("/api/me");
  ME = user;
  const num = $(".points-num");
  if (num) num.textContent = ME.points;
}

async function loadChildChores(root) {
  const box = $('[data-content="chores"]', root);
  const chores = await api("/api/chores");
  box.innerHTML = "";

  if (chores.length === 0) {
    box.innerHTML = `<div class="empty"><span class="big-emoji">🎉</span>סיימת את כל המטלות!<br>אפשר לבקש מטלה חדשה 👇</div>`;
  } else {
    chores.forEach((c) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <span class="emoji">${c.emoji}</span>
        <div class="info"><div class="t">${c.title}</div></div>
        <span class="pts">+${c.points} ⭐</span>
        <button class="btn small">עשיתי 📸</button>`;
      $("button", el).onclick = () => openCamera(c);
      box.appendChild(el);
    });
  }

  // כפתור "בקשת מטלה חדשה" — תמיד זמין, ובולט במיוחד כשאין מטלות
  const ask = document.createElement("button");
  ask.className = "btn big ghost";
  ask.style.marginTop = "10px";
  ask.textContent = "🙋 אין לי מה לעשות — בקשת מטלה חדשה";
  ask.onclick = () => openAskChore(root);
  box.appendChild(ask);
}

// חלון בקשת מטלה חדשה מההורה
function openAskChore(root) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal">
    <button class="close" data-act="close">✕</button>
    <div class="pin-emoji">🙋</div>
    <h2>בקשת מטלה חדשה</h2>
    <p>רוצה להגיד מה בא לך לעשות? (לא חובה)</p>
    <input class="ask-input" placeholder="למשל: לשטוף את האוטו">
    <button class="btn big" data-act="send">שליחה להורה 📨</button>
  </div>`;
  document.body.appendChild(back);
  $('[data-act="close"]', back).onclick = () => back.remove();
  $('[data-act="send"]', back).onclick = async () => {
    const title = $(".ask-input", back).value.trim();
    try {
      await api("/api/chore-requests", "POST", { title });
      back.remove();
      celebrate();
      toast("הבקשה נשלחה להורה! 🤞");
      loadChildHistory(root);
    } catch (e) { toast(e.message); }
  };
}

async function loadChildRewards(root) {
  const box = $('[data-content="rewards"]', root);
  const rewards = await api("/api/rewards");
  if (rewards.length === 0) {
    box.innerHTML = `<div class="empty"><span class="big-emoji">🎁</span>אין פרסים עדיין.</div>`;
    return;
  }
  box.innerHTML = "";
  rewards.forEach((r) => {
    const canAfford = ME.points >= r.cost_points;
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <span class="emoji">${r.emoji}</span>
      <div class="info">
        <div class="t">${r.title}</div>
        <div class="s">${canAfford ? "אפשר לבקש! 🎉" : `חסרות ${r.cost_points - ME.points} נקודות`}</div>
      </div>
      <span class="cost">${r.cost_points} ⭐</span>
      <button class="btn small ${canAfford ? "" : ""}" ${canAfford ? "" : "disabled"}>בקש</button>`;
    $("button", el).onclick = async () => {
      try {
        await api("/api/reward-requests", "POST", { reward_id: r.id });
        celebrate();
        toast("הבקשה נשלחה להורה! 🤞");
        loadChildHistory(root);
      } catch (e) { toast(e.message); }
    };
    box.appendChild(el);
  });
}

async function loadChildHistory(root) {
  const box = $('[data-content="history"]', root);
  const subs = await api("/api/submissions");
  const reqs = await api("/api/reward-requests");
  const sugg = await api("/api/chore-requests");
  let html = "<h2>המטלות ששלחתי</h2>";
  if (subs.length === 0) html += `<div class="empty">עדיין לא שלחת מטלות</div>`;
  subs.forEach((s) => {
    html += `<div class="item">
      <div class="info"><div class="t">${s.chore_title}</div>
      <div class="s">${s.created_at}</div></div>
      <span class="pts">+${s.points}</span>
      ${statusPill(s.status)}</div>`;
  });

  html += "<h2 style='margin-top:18px'>בקשות למטלה חדשה 🙋</h2>";
  if (sugg.length === 0) html += `<div class="empty">עוד לא ביקשת מטלות</div>`;
  sugg.forEach((s) => {
    const note = s.title && s.title !== "מטלה חדשה" ? s.title : "ביקשתי מטלה חדשה";
    html += `<div class="item">
      <div class="info"><div class="t">${note}</div>
      <div class="s">${s.created_at}</div></div>
      ${statusPill(s.status)}</div>`;
  });

  html += "<h2 style='margin-top:18px'>בקשות לפרסים</h2>";
  if (reqs.length === 0) html += `<div class="empty">עדיין לא ביקשת פרסים</div>`;
  reqs.forEach((r) => {
    html += `<div class="item">
      <div class="info"><div class="t">${r.reward_title}</div>
      <div class="s">${r.created_at}</div></div>
      <span class="cost">${r.cost_points}</span>
      ${statusPill(r.status)}</div>`;
  });
  box.innerHTML = html;
}

function statusPill(status) {
  const map = {
    pending: ["status-pending", "ממתין ⏳"],
    approved: ["status-approved", "אושר ✅"],
    rejected: ["status-rejected", "נדחה ❌"],
  };
  const [cls, txt] = map[status] || ["", status];
  return `<span class="status-pill ${cls}">${txt}</span>`;
}

// ===================================================
// מצלמה (צילום חי בלבד - לא מהגלריה!)
// ===================================================
let camStream = null;

async function openCamera(chore) {
  const node = tpl("tpl-camera");
  document.body.appendChild(node);
  const back = $(".camera-back");
  $(".cam-title", back).textContent = `${chore.emoji} ${chore.title}`;
  const intro = $(".cam-intro", back);
  const introText = $(".cam-intro-text", back);
  const stage = $(".cam-stage", back);
  const video = $(".cam-video", back);
  const canvas = $(".cam-canvas", back);
  const preview = $(".cam-preview", back);
  const msg = $(".cam-msg", back);

  let photoBlob = null;

  const closeCam = () => {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    back.remove();
  };

  // בקשת אישור גישה למצלמה (מופעל בלחיצה על "אישור גישה")
  async function requestCameraAccess() {
    // המצלמה דורשת הקשר מאובטח (https/localhost) ודפדפן אמיתי
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const proto = location.protocol;       // http: או https:
      const host = location.hostname;        // הכתובת
      const isLocal = host === "localhost" || host === "127.0.0.1";
      if (proto === "http:" && !isLocal) {
        // נכנסו דרך כתובת לא מאובטחת (למשל IP מקומי 192.168...)
        introText.innerHTML =
          `הכתובת הזו (<b>${proto}//${host}</b>) לא מאובטחת,<br>ולכן הדפדפן חוסם את המצלמה 🔒<br><br>` +
          `פתחי במקום זאת את כתובת ה-<b>https</b> שיצרנו<br>(הכתובת שמסתיימת ב-<b>trycloudflare.com</b>).`;
      } else {
        // כנראה דפדפן מובנה בתוך אפליקציה (וואטסאפ/אינסטגרם)
        introText.innerHTML =
          `נראה שפתחת את הקישור <b>בתוך אפליקציה</b> (וואטסאפ/אינסטגרם) 😕<br><br>` +
          `פתחי אותו ב-<b>Safari</b> (אייפון) או <b>Chrome</b> (אנדרואיד):<br>` +
          `לחצי על ⋯ בפינה → "פתח בדפדפן".`;
      }
      return;
    }
    introText.textContent = "מבקש גישה... אשרו בחלון שיופיע למעלה 👆";
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      // התקבל אישור — עוברים למסך המצלמה
      video.srcObject = camStream;
      intro.classList.add("hidden");
      stage.classList.remove("hidden");
    } catch (e) {
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        introText.innerHTML =
          "הגישה למצלמה נדחתה 🙈<br>כדי לאפשר: לחצו על 🔒/📷 שליד כתובת האתר → " +
          "\"אפשר מצלמה\", ואז נסו שוב.";
      } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
        introText.textContent = "לא נמצאה מצלמה במכשיר הזה 😕";
      } else {
        introText.textContent = "שגיאה בפתיחת המצלמה: " + e.message;
      }
    }
  }

  $('[data-act="cam-allow"]', back).onclick = requestCameraAccess;
  $('[data-act="cam-cancel-intro"]', back).onclick = closeCam;

  // צילום: מציירים את הפריים הנוכחי על קנבס
  $('[data-act="cam-shoot"]', back).onclick = () => {
    if (!camStream) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      photoBlob = blob;
      preview.src = URL.createObjectURL(blob);
    }, "image/jpeg", 0.85);

    video.classList.add("hidden");
    preview.classList.remove("hidden");
    $('[data-act="cam-shoot"]', back).classList.add("hidden");
    $('[data-act="cam-cancel"]', back).classList.add("hidden");
    $('[data-act="cam-retake"]', back).classList.remove("hidden");
    $('[data-act="cam-send"]', back).classList.remove("hidden");
  };

  // צילום מחדש
  $('[data-act="cam-retake"]', back).onclick = () => {
    photoBlob = null;
    video.classList.remove("hidden");
    preview.classList.add("hidden");
    $('[data-act="cam-shoot"]', back).classList.remove("hidden");
    $('[data-act="cam-cancel"]', back).classList.remove("hidden");
    $('[data-act="cam-retake"]', back).classList.add("hidden");
    $('[data-act="cam-send"]', back).classList.add("hidden");
  };

  // שליחה לשרת
  $('[data-act="cam-send"]', back).onclick = async () => {
    if (!photoBlob) return;
    msg.textContent = "שולח... ⏳";
    const fd = new FormData();
    fd.append("chore_id", chore.id);
    fd.append("photo", photoBlob, "proof.jpg");
    try {
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שגיאה");
      closeCam();
      celebrate();
      toast("נשלח להורה לאישור! 🎉");
      const root = $(".screen", app);
      if (root) loadChildHistory(root);
    } catch (e) {
      msg.textContent = e.message;
    }
  };

  $('[data-act="cam-cancel"]', back).onclick = closeCam;
}

// ===================================================
// מסך הורה
// ===================================================
async function renderParent() {
  const node = tpl("tpl-parent");
  app.appendChild(node);
  const root = $(".screen", app);
  wireTabs(root);

  loadApprovals(root);
  loadKids(root);
  loadManageChores(root);
  loadManageRewards(root);
}

// --- אישורים: מטלות + בקשות פרס ---
async function loadApprovals(root) {
  const box = $('[data-content="approve"]', root);
  const subs = await api("/api/submissions?status=pending");
  const reqs = await api("/api/reward-requests?status=pending");
  const sugg = await api("/api/chore-requests?status=pending");

  // מונה ממתינים על הטאב
  const pendTotal = subs.length + reqs.length + sugg.length;
  const aTab = $('[data-tab="approve"]', root);
  if (aTab) aTab.innerHTML = `✅ לאישור${pendTotal ? ` <span class="badge">${pendTotal}</span>` : ""}`;

  let html = "";

  html += `<h2>מטלות לאישור (${subs.length})</h2>`;
  if (subs.length === 0) html += `<div class="empty"><span class="big-emoji">🎉</span>אין מטלות שמחכות</div>`;
  box.innerHTML = html;

  subs.forEach((s) => {
    const el = document.createElement("div");
    el.className = "item review-card" + (s.suspicious ? " suspect" : "");
    let media;
    if (s.suspicious) {
      const compare = s.suspect_photo
        ? `<div class="compare">
             <figure><img class="proof" src="/uploads/${s.photo}"><figcaption>עכשיו</figcaption></figure>
             <figure><img class="proof" src="/uploads/${s.suspect_photo}"><figcaption>קודמת${s.suspect_date ? " · " + s.suspect_date : ""}</figcaption></figure>
           </div>`
        : `<img class="proof" src="/uploads/${s.photo}" alt="הוכחה">`;
      media = `<div class="suspect-banner">🤖 יש חשד להעלאת תמונה חוזרת</div>
        ${s.suspect_reason ? `<div class="suspect-reason">🔍 ${s.suspect_reason}</div>` : ""}
        ${compare}`;
    } else {
      media = `<img class="proof" src="/uploads/${s.photo}" alt="הוכחה">`;
    }
    el.innerHTML = `
      <div class="info">
        <div class="t">${s.child_emoji} ${s.child_name} — ${s.chore_title}</div>
        <div class="s">${s.created_at} · שווה ${s.points} נקודות</div>
      </div>
      ${media}
      <div class="review-actions">
        <button class="btn green" data-d="approve">אישור +${s.points} ⭐</button>
        <button class="btn red" data-d="reject">דחייה</button>
      </div>
      ${s.suspicious ? `<div class="penalty-row">
        <span>כמה נקודות להוריד?</span>
        <input class="pen-input" type="number" min="0" value="${s.points}">
        <button class="btn red" data-d="penalty">דחייה + הורדה 🚫</button>
      </div>` : ""}`;
    $('[data-d="approve"]', el).onclick = () => reviewSub(s.id, "approve", root);
    $('[data-d="reject"]', el).onclick = () => reviewSub(s.id, "reject", root);
    const pen = $('[data-d="penalty"]', el);
    if (pen) {
      const penInput = $(".pen-input", el);
      pen.onclick = () => reviewSub(s.id, "reject", root, parseInt(penInput.value, 10) || 0);
    }
    box.appendChild(el);
  });

  // בקשות לפרסים
  const reqTitle = document.createElement("h2");
  reqTitle.style.marginTop = "18px";
  reqTitle.textContent = `בקשות לפרסים (${reqs.length})`;
  box.appendChild(reqTitle);
  if (reqs.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "אין בקשות שמחכות";
    box.appendChild(e);
  }
  reqs.forEach((r) => {
    const el = document.createElement("div");
    el.className = "item review-card";
    const enough = r.child_points >= r.cost_points;
    el.innerHTML = `
      <div class="info">
        <div class="t">${r.child_emoji} ${r.child_name} — ${r.reward_title}</div>
        <div class="s">${r.created_at} · עולה ${r.cost_points} · יש לו ${r.child_points} ⭐</div>
      </div>
      <div class="review-actions">
        <button class="btn green" data-d="approve" ${enough ? "" : "disabled"}>אישור (יורד ${r.cost_points})</button>
        <button class="btn red" data-d="reject">דחייה</button>
      </div>`;
    $('[data-d="approve"]', el).onclick = () => reviewReq(r.id, "approve", root);
    $('[data-d="reject"]', el).onclick = () => reviewReq(r.id, "reject", root);
    box.appendChild(el);
  });

  // בקשות מהילדים למטלה חדשה
  const sugTitle = document.createElement("h2");
  sugTitle.style.marginTop = "18px";
  sugTitle.textContent = `בקשות למטלה חדשה (${sugg.length}) 🙋`;
  box.appendChild(sugTitle);
  if (sugg.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "אין בקשות חדשות";
    box.appendChild(e);
  }
  sugg.forEach((s) => {
    const wish = s.title && s.title !== "מטלה חדשה" ? s.title : "";
    const el = document.createElement("div");
    el.className = "item review-card";
    el.innerHTML = `
      <div class="info">
        <div class="t">🙋 ${s.child_emoji} ${s.child_name} מבקש/ת מטלה חדשה</div>
        <div class="s">${s.created_at}${wish ? " · רוצה: " + wish : ""}</div>
      </div>
      <div class="form-row" style="margin-top:10px">
        <input class="sg-title" placeholder="שם המטלה החדשה" value="${wish}">
        <input class="w-pts sg-pts" type="number" min="1" placeholder="נק'">
      </div>
      <div class="review-actions">
        <button class="btn green" data-d="approve">הוספת מטלה ✅</button>
        <button class="btn red" data-d="reject">דחייה</button>
      </div>`;
    const tEl = $(".sg-title", el), pEl = $(".sg-pts", el);
    $('[data-d="approve"]', el).onclick = () =>
      reviewSugg(s.id, "approve", root, { title: tEl.value, points: pEl.value });
    $('[data-d="reject"]', el).onclick = () => reviewSugg(s.id, "reject", root);
    box.appendChild(el);
  });
}

async function reviewSugg(id, decision, root, opts = {}) {
  try {
    await api(`/api/chore-requests/${id}/review`, "POST",
      { decision, title: opts.title, points: opts.points });
    if (decision === "approve") { celebrate(); toast("מטלה חדשה נוספה! ✅"); }
    else toast("נדחה");
    loadApprovals(root);
    loadManageChores(root);
  } catch (e) { toast(e.message); }
}

async function reviewSub(id, decision, root, penalty) {
  try {
    await api(`/api/submissions/${id}/review`, "POST", { decision, penalty });
    if (decision === "approve") { celebrate(); toast("אושר! הנקודות נוספו ⭐"); }
    else toast(penalty ? `נדחה + קנס ${penalty} נק' 🚫` : "נדחה");
    loadApprovals(root);
    loadKids(root);
  } catch (e) { toast(e.message); }
}

async function reviewReq(id, decision, root) {
  try {
    await api(`/api/reward-requests/${id}/review`, "POST", { decision });
    if (decision === "approve") { celebrate(); toast("אושר! הנקודות ירדו ✅"); }
    else toast("נדחה");
    loadApprovals(root);
    loadKids(root);
  } catch (e) { toast(e.message); }
}

// --- ילדים ---
async function loadKids(root) {
  const box = $('[data-content="kids"]', root);
  const kids = await api("/api/children");
  let html = `<div class="card">
    <h2>הוספת ילד/ה</h2>
    <div class="form-row">
      <input class="w-emoji" id="kid-emoji" value="🙂" maxlength="2">
      <input id="kid-name" placeholder="שם">
      <input class="w-pts" id="kid-pin" placeholder="קוד" inputmode="numeric">
    </div>
    <button class="btn big" id="add-kid">הוספה ➕</button>
  </div>`;

  html += "<h2>הילדים שלי</h2>";
  if (kids.length === 0) html += `<div class="empty">עדיין אין ילדים</div>`;
  kids.forEach((k) => {
    html += `<div class="item review-card" data-kid="${k.id}" data-name="${k.name}">
      <div class="info" style="display:flex;align-items:center;gap:10px">
        <span class="emoji">${k.emoji}</span>
        <div><div class="t">${k.name}</div>
        <div class="s">${k.level.emoji} רמה ${k.level.level} · ${k.total_earned} 💎 בסך הכל</div></div>
        <span class="pts" style="margin-inline-start:auto">${k.points} ⭐</span>
      </div>
      <div class="review-actions">
        <button class="btn small green" data-bonus="10">בונוס +10</button>
        <button class="btn small ghost" data-bonus="-10">הורדה -10</button>
        <button class="btn small red" data-del-kid>מחיקה</button>
      </div>
    </div>`;
  });
  box.innerHTML = html;

  $("#add-kid", box).onclick = async () => {
    const name = $("#kid-name", box).value.trim();
    const pin = $("#kid-pin", box).value.trim();
    const emoji = $("#kid-emoji", box).value.trim() || "🙂";
    if (!name || !pin) { toast("צריך שם וקוד"); return; }
    try {
      await api("/api/children", "POST", { name, pin, emoji });
      toast("נוסף בהצלחה! 🎉");
      loadKids(root);
    } catch (e) { toast(e.message); }
  };

  // כלי ניהול לכל ילד
  $$("[data-kid]", box).forEach((card) => {
    const id = card.dataset.kid;
    const name = card.dataset.name;
    $$("[data-bonus]", card).forEach((b) => {
      b.onclick = async () => {
        const pts = parseInt(b.dataset.bonus, 10);
        try {
          await api(`/api/children/${id}/bonus`, "POST", { points: pts });
          if (pts > 0) celebrate(); else playSound("success");
          toast(pts > 0 ? `נוספו ${pts} נקודות 🎉` : `הורדו ${-pts} נקודות`);
          loadKids(root);
        } catch (e) { toast(e.message); }
      };
    });
    const del = $("[data-del-kid]", card);
    if (del) del.onclick = async () => {
      if (!confirm(`למחוק את ${name}? כל הנתונים שלו יימחקו.`)) return;
      try {
        await api(`/api/children/${id}`, "DELETE");
        toast("נמחק");
        loadKids(root);
      } catch (e) { toast(e.message); }
    };
  });
}

// --- ניהול מטלות ---
async function loadManageChores(root) {
  const box = $('[data-content="manage-chores"]', root);
  const chores = await api("/api/chores");
  let html = `<div class="card">
    <h2>הוספת מטלה</h2>
    <div class="form-row">
      <input class="w-emoji" id="ch-emoji" value="🧹" maxlength="2">
      <input id="ch-title" placeholder="שם המטלה">
      <input class="w-pts" id="ch-pts" placeholder="נק'" inputmode="numeric">
    </div>
    <button class="btn big" id="add-chore">הוספה ➕</button>
  </div>`;
  html += "<h2>המטלות הקיימות</h2>";
  if (chores.length === 0) html += `<div class="empty">אין מטלות</div>`;
  chores.forEach((c) => {
    html += `<div class="item">
      <span class="emoji">${c.emoji}</span>
      <div class="info"><div class="t">${c.title}</div></div>
      <span class="pts">+${c.points}</span>
      <button class="btn small red" data-del="${c.id}">מחק</button></div>`;
  });
  box.innerHTML = html;

  $("#add-chore", box).onclick = async () => {
    const title = $("#ch-title", box).value.trim();
    const points = $("#ch-pts", box).value.trim();
    const emoji = $("#ch-emoji", box).value.trim() || "🧹";
    if (!title || !points) { toast("צריך שם ונקודות"); return; }
    try {
      await api("/api/chores", "POST", { title, points, emoji });
      toast("מטלה נוספה! ✅");
      loadManageChores(root);
    } catch (e) { toast(e.message); }
  };
  $$("[data-del]", box).forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/chores/${btn.dataset.del}`, "DELETE");
      toast("נמחק");
      loadManageChores(root);
    };
  });
}

// --- ניהול פרסים ---
async function loadManageRewards(root) {
  const box = $('[data-content="manage-rewards"]', root);
  const rewards = await api("/api/rewards");
  let html = `<div class="card">
    <h2>הוספת פרס</h2>
    <div class="form-row">
      <input class="w-emoji" id="rw-emoji" value="🎁" maxlength="2">
      <input id="rw-title" placeholder="שם הפרס (למשל: 100 ₪ ליציאה)">
    </div>
    <div class="form-row">
      <input class="w-pts" id="rw-cost" placeholder="מחיר בנקודות" inputmode="numeric">
      <button class="btn" id="add-reward" style="flex:1">הוספה ➕</button>
    </div>
  </div>`;
  html += "<h2>הפרסים הקיימים</h2>";
  if (rewards.length === 0) html += `<div class="empty">אין פרסים</div>`;
  rewards.forEach((r) => {
    html += `<div class="item">
      <span class="emoji">${r.emoji}</span>
      <div class="info"><div class="t">${r.title}</div></div>
      <span class="cost">${r.cost_points}</span>
      <button class="btn small red" data-del="${r.id}">מחק</button></div>`;
  });
  box.innerHTML = html;

  $("#add-reward", box).onclick = async () => {
    const title = $("#rw-title", box).value.trim();
    const cost_points = $("#rw-cost", box).value.trim();
    const emoji = $("#rw-emoji", box).value.trim() || "🎁";
    if (!title || !cost_points) { toast("צריך שם ומחיר"); return; }
    try {
      await api("/api/rewards", "POST", { title, cost_points, emoji });
      toast("פרס נוסף! ✅");
      loadManageRewards(root);
    } catch (e) { toast(e.message); }
  };
  $$("[data-del]", box).forEach((btn) => {
    btn.onclick = async () => {
      await api(`/api/rewards/${btn.dataset.del}`, "DELETE");
      toast("נמחק");
      loadManageRewards(root);
    };
  });
}
