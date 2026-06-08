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

// ===== עוזר חכם מובנה (בלי AI, בלי עלות) =====
// עונה על השאלות הנפוצות לפי מילות מפתח. רץ אצל המשתמש בדפדפן — בחינם.

// מאגר תשובות. כל ערך: מילות מפתח (חלקי מילה מספיק) + תשובה.
const CHAT_FAQ = [
  {
    k: ["ילד", "נכנס", "כניס", "התחבר", "פרופיל"],
    a: "כניסת ילדים — בלי שום קוד! 👧\n" +
       "1. בטאב 👧 ילדים, ההורה לוחץ \"העתקת קישור משפחה\".\n" +
       "2. שולחים את הקישור לילד (וואטסאפ/כל דרך).\n" +
       "3. הילד פותח אותו ולוחץ על הפרופיל (האימוג'י) שלו — וזהו, הוא בפנים.",
  },
  {
    k: ["קישור", "לשתף", "שיתוף", "להזמין", "משפחה"],
    a: "שיתוף עם המשפחה 🔗\n" +
       "בטאב 👧 ילדים יש כפתור \"העתקת קישור משפחה\". הקישור ייחודי למשפחה שלך — " +
       "כל מי שפותח אותו רואה רק את הילדים שלך. שלחי אותו לילדים והם ייכנסו בלחיצה על הפרופיל.",
  },
  {
    k: ["הוסף מטל", "להוסיף מטל", "מטלה חדש", "ליצור מטל", "מטל"],
    a: "הוספת מטלה 🧹\n" +
       "1. כהורה, היכנסי לטאב 🧹 מטלות.\n" +
       "2. כתבי שם מטלה, בחרי אימוג'י וכמה נקודות היא שווה.\n" +
       "3. לחצי \"הוספה\". המטלה תופיע לילדים מיד.\n" +
       "אפשר גם לערוך (✏️) או למחוק מטלה בכל רגע.",
  },
  {
    k: ["פרס"],
    a: "פרסים 🎁\n" +
       "בטאב 🎁 פרסים את מגדירה פרס (שם + כמה נקודות הוא עולה). " +
       "הילד \"קונה\" אותו בנקודות שצבר, ואת מאשרת את הבקשה. אפשר לערוך/למחוק פרסים מתי שרוצים.",
  },
  {
    k: ["נקוד", "צובר", "צוברים"],
    a: "נקודות ⭐\n" +
       "הילד מקבל נקודות על כל מטלה שאישרת. את הנקודות אפשר להמיר לפרסים. " +
       "אפשר גם לתת \"בונוס\" נקודות ידני (+/-) בטאב 👧 ילדים, ליד כל ילד.",
  },
  {
    k: ["לאשר", "אישור", "מאשר", "דחות", "דחיי"],
    a: "אישור מטלות ובקשות ✅\n" +
       "בטאב ✅ לאישור תראי כל מטלה שילד שלח (עם התמונה), וכל בקשת פרס. " +
       "לחצי \"אישור\" כדי לתת נקודות, או \"דחייה\" אם משהו לא בסדר.",
  },
  {
    k: ["שכח", "איפוס סיסמ", "לאפס"],
    a: "שכחת סיסמה? 🔑\n" +
       "1. במסך הכניסה (הורה) לחצי \"שכחתי סיסמה\".\n" +
       "2. יישלח קוד בן 6 ספרות לאימייל שלך.\n" +
       "3. הקלידי את הקוד ובחרי סיסמה חדשה.\n" +
       "(שליחת המייל דורשת הגדרה בשרת — אם הקוד לא מגיע, פני לתמיכה.)",
  },
  {
    k: ["סיסמ", "לשנות סיסמ", "להחליף סיסמ"],
    a: "החלפת סיסמה 🔑\n" +
       "כהורה, למעלה יש כפתור \"🔑 סיסמה\": מקלידים סיסמה נוכחית, ואז חדשה (לפחות 6 תווים, " +
       "עם אותיות וגם מספרים) ואימות. זהו!",
  },
  {
    k: ["הוסף ילד", "להוסיף ילד", "ילד חדש", "ליצור ילד"],
    a: "הוספת ילד 👶\n" +
       "בטאב 👧 ילדים כתבי שם הילד, בחרי אימוג'י, ולחצי \"הוספה\". " +
       "אחר כך שתפי איתו את קישור המשפחה והוא ייכנס בלחיצה על הפרופיל שלו.",
  },
  {
    k: ["מצלמ", "לצלם", "צילום", "גישה למצלמ"],
    a: "מצלמה 📷\n" +
       "כדי להוכיח מטלה צריך לצלם בזמן אמת (אי אפשר להעלות מהגלריה — זה בכוונה!). " +
       "בפעם הראשונה צריך לאשר גישה למצלמה. שימי לב: המצלמה עובדת רק בכתובת מאובטחת (https) — " +
       "מהטלפון זה דרך כתובת האתר באוויר.",
  },
  {
    k: ["רמא", "חשד", "תמונה חוזר", "מרמ", "צ'יט", "צ׳יט"],
    a: "בדיקת הוגנות (אנטי-רמאות) 🤖\n" +
       "כל תמונה נבדקת אוטומטית כדי לזהות תמונה ישנה/מועלית/צילום-מסך. " +
       "אם יש חשד — מופיעה התראה אצלך (ההורה) בלבד, והילד לא יודע על זה. " +
       "את מחליטה לבד אם להפחית נקודות.",
  },
  {
    k: ["בונוס"],
    a: "בונוס נקודות ➕\n" +
       "בטאב 👧 ילדים, ליד כל ילד, אפשר להוסיף או להוריד נקודות ידנית — נוח לתגמולים או תיקונים.",
  },
  {
    k: ["מחיר", "תשלום", "כסף", "מנוי", "עלות", "חינם", "לשלם"],
    a: "מחיר 💰\n" +
       "5 מטלות בכל חודש הן חינם. אחר כך יש מנוי של 19.90 ₪ לחודש למספר מטלות בלתי מוגבל. " +
       "(נכון לעכשיו זה כתוב בתנאים אבל עוד לא נגבה בפועל.)",
  },
  {
    k: ["להתקין", "טלפון", "מסך הבית", "אפליקצי", "להוריד"],
    a: "התקנה בטלפון 📲\n" +
       "פותחים את כתובת האתר בדפדפן בטלפון, נכנסים לתפריט הדפדפן ובוחרים " +
       "\"הוסף למסך הבית\". זהו — מקבלים אייקון כמו אפליקציה אמיתית.",
  },
  {
    k: ["למחוק", "מחיק", "להסיר"],
    a: "מחיקה 🗑️\n" +
       "אפשר למחוק ילד (וכל הנתונים שלו) בטאב 👧 ילדים, ולמחוק מטלה/פרס בטאבים שלהם. " +
       "שימי לב — מחיקת ילד מוחקת גם את ההיסטוריה שלו ואי אפשר לבטל.",
  },
  {
    k: ["לערוך", "עריכ", "לשנות שם", "לשנות אימוג"],
    a: "עריכה ✏️\n" +
       "ליד ילד/מטלה/פרס יש כפתור ✏️ — אפשר לשנות שם, אימוג'י או כמות נקודות בלי למחוק.",
  },
];

function chatAnswer(text) {
  const t = (text || "").toLowerCase();
  let best = null, bestScore = 0;
  for (const item of CHAT_FAQ) {
    let score = 0;
    for (const kw of item.k) if (t.includes(kw)) score++;
    if (score > bestScore) { bestScore = score; best = item; }
  }
  if (best) return best.a;
  return "לא בטוח/ה שהבנתי 🤔 אפשר לנסות לנסח אחרת, או לבחור אחת מהשאלות הנפוצות למעלה. " +
         "ואם צריך עזרה אישית — כותבים לנו ל-todo.family.app1@gmail.com 💜";
}

const CHAT_CHIPS = [
  "איך הילדים נכנסים?",
  "איך מוסיפים מטלה?",
  "מה זה הפרסים?",
  "שכחתי סיסמה",
  "איך מתקינים בטלפון?",
];

function chatAddBubble(role, text) {
  const body = $("#chat-body");
  const b = document.createElement("div");
  b.className = "chat-bubble " + (role === "user" ? "me" : "bot");
  b.textContent = text;
  body.appendChild(b);
  body.scrollTop = body.scrollHeight;
  return b;
}

function chatAddChips() {
  const body = $("#chat-body");
  const wrap = document.createElement("div");
  wrap.className = "chat-chips";
  CHAT_CHIPS.forEach((q) => {
    const c = document.createElement("button");
    c.className = "chat-chip";
    c.textContent = q;
    c.onclick = () => chatSend(q);
    wrap.appendChild(c);
  });
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

function chatToggle(open) {
  const panel = $("#chat-panel");
  const fab = $("#chat-fab");
  const show = open == null ? panel.classList.contains("hidden") : open;
  panel.classList.toggle("hidden", !show);
  panel.setAttribute("aria-hidden", show ? "false" : "true");
  fab.classList.toggle("hidden", show);
  const label = $("#chat-fab-label");
  if (label) label.classList.toggle("hidden", show);
  if (show) {
    if (!$("#chat-body").childElementCount) {
      chatAddBubble("assistant",
        "היי! 👋 אני העוזר של טודו. אפשר לשאול אותי על האפליקציה — " +
        "או פשוט ללחוץ על אחת מהשאלות הנפוצות:");
      chatAddChips();
    }
    setTimeout(() => $("#chat-text").focus(), 50);
  }
}

function chatSend(text) {
  text = (text || "").trim();
  if (!text) return;
  const input = $("#chat-text");
  input.value = "";
  chatAddBubble("user", text);
  const typing = chatAddBubble("assistant", "כותב…");
  typing.classList.add("typing");
  // השהיה קטנה כדי שזה ירגיש כמו שיחה אמיתית
  setTimeout(() => {
    typing.remove();
    chatAddBubble("assistant", chatAnswer(text));
    input.focus();
  }, 350);
}

function initChat() {
  $("#chat-fab").addEventListener("click", () => chatToggle(true));
  const lbl = $("#chat-fab-label");
  if (lbl) lbl.addEventListener("click", () => chatToggle(true));
  $("#chat-close").addEventListener("click", () => chatToggle(false));
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    chatSend($("#chat-text").value);
  });
}
initChat();

// ===== נקודת התחלה =====
init();
async function init() {
  const { user } = await api("/api/me");
  if (user) {
    ME = user;
    renderHome();
    return;
  }
  renderLogin();
}

// קוד המשפחה מהכתובת /f/CODE (אם קיים)
function familyCodeFromUrl() {
  const m = location.pathname.match(/^\/f\/([^\/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

// סיסמה תקינה: לפחות 6 תווים, וכוללת גם אותיות וגם מספרים
function passwordOk(pw) {
  return pw.length >= 6 && /\p{L}/u.test(pw) && /[0-9]/.test(pw);
}

// חלון עריכה גנרי. fields: [{placeholder, value, type}]. onSave מקבל מערך ערכים.
function openEditModal(heading, fields, onSave) {
  const back = document.createElement("div");
  back.className = "modal-back";
  const inputsHtml = fields.map((f, i) => {
    const v = (f.value == null ? "" : String(f.value)).replace(/"/g, "&quot;");
    return `<input class="ask-input ef-${i}" type="${f.type || "text"}" placeholder="${f.placeholder}" value="${v}">`;
  }).join("");
  back.innerHTML = `<div class="modal">
    <button class="close" data-act="close">✕</button>
    <div class="pin-emoji">✏️</div>
    <h2>${heading}</h2>
    ${inputsHtml}
    <div class="pin-error ef-err"></div>
    <button class="btn big" data-act="save">שמירה</button>
  </div>`;
  document.body.appendChild(back);
  $('[data-act="close"]', back).onclick = () => back.remove();
  $('[data-act="save"]', back).onclick = async () => {
    const vals = fields.map((f, i) => $(".ef-" + i, back).value.trim());
    try {
      await onSave(vals);
      back.remove();
    } catch (e) { $(".ef-err", back).textContent = e.message; }
  };
}

// מסך הקמה ראשוני: ההורה בוחר שם + קוד + אימות
// ===== כניסה דרך Google =====
// מקבל את האסימון מ-Google ושולח לשרת לאימות + כניסה/הרשמה
function onGoogleCredential(resp) {
  api("/api/auth/google", "POST", { credential: resp.credential })
    .then((user) => { ME = user; celebrate(); renderHome(); })
    .catch((e) => toast(e.message || "כניסת Google נכשלה"));
}

// מציב את כפתור Google בתוך container (אם הוגדר GOOGLE_CLIENT_ID בשרת)
function mountGoogle(container, tries = 0) {
  if (!window.GOOGLE_CLIENT_ID || !container) return;   // לא הוגדר → לא מציגים כלום
  // הספרייה של Google נטענת באופן אסינכרוני — מחכים שתהיה מוכנה
  if (!(window.google && google.accounts && google.accounts.id)) {
    if (tries < 40) setTimeout(() => mountGoogle(container, tries + 1), 120);
    return;
  }
  container.innerHTML = "";
  google.accounts.id.initialize({
    client_id: window.GOOGLE_CLIENT_ID,
    callback: onGoogleCredential,
  });
  google.accounts.id.renderButton(container, {
    theme: "filled_blue", size: "large", shape: "pill",
    text: "continue_with", width: 280, locale: "he",
  });
  const sep = document.createElement("div");
  sep.className = "g-sep";
  sep.innerHTML = "<span>או</span>";
  container.appendChild(sep);
}

function renderSetup() {
  app.innerHTML = "";
  document.body.classList.add("no-chat");   // בלי כפתור צ'אט במסך הרשמה
  app.appendChild(tpl("tpl-setup"));
  $("#su-back").onclick = renderLogin;       // חץ חזרה למסך הכניסה
  mountGoogle($("#google-setup"));           // כניסה/הרשמה מהירה דרך Google
  const err = $("#su-err");
  $("#su-go").onclick = async () => {
    const name = $("#su-name").value.trim();
    const emoji = $("#su-emoji").value.trim() || "👑";
    const email = $("#su-email").value.trim();
    const pass = $("#su-pass").value;
    const pass2 = $("#su-pass2").value;
    if (!name) { err.textContent = "צריך לבחור שם"; return; }
    if (!email.includes("@")) { err.textContent = "צריך אימייל תקין"; return; }
    if (!passwordOk(pass)) { err.textContent = "הסיסמה חייבת לכלול אותיות ומספרים, לפחות 6 תווים"; return; }
    if (pass !== pass2) { err.textContent = "הסיסמה והאימות לא תואמים 🙈"; return; }
    try {
      ME = await api("/api/setup", "POST", { name, emoji, email, password: pass });
      localStorage.setItem("parentEmail", email);  // לזכור למכשיר הזה
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
  document.body.classList.add("no-chat");   // בלי כפתור צ'אט במסך הכניסה
  app.appendChild(tpl("tpl-login"));
  const list = $("#user-list");
  list.innerHTML = "";

  const code = familyCodeFromUrl();

  // כניסה דרך Google (אם הוגדר) — רק במסך הראשי, לא בקישור הילד
  if (!code) mountGoogle($("#google-login"));

  // כניסת הורה — אימייל + סיסמה
  const parentBtn = document.createElement("div");
  parentBtn.className = "user-pick";
  parentBtn.innerHTML = `
    <span class="ava">👑</span>
    <div><div class="nm">כניסת הורה</div><div class="rl">אימייל וסיסמה</div></div>
    <span class="badge-parent">הורה</span>`;
  parentBtn.onclick = openParentLogin;
  list.appendChild(parentBtn);

  // יצירת משפחה חדשה (הרשמה) — לא מוצג בקישור של הילד
  if (!code) {
    const signupBtn = document.createElement("div");
    signupBtn.className = "user-pick";
    signupBtn.innerHTML = `
      <span class="ava">✨</span>
      <div><div class="nm">יצירת משפחה חדשה</div><div class="rl">הרשמה כהורה</div></div>`;
    signupBtn.onclick = renderSetup;
    list.appendChild(signupBtn);
  }

  // פרופילי ילדים — רק אם נכנסים דרך קישור המשפחה (/f/CODE)
  if (code) {
    const kids = await api("/api/users?family_code=" + encodeURIComponent(code));
    kids.forEach((u) => {
      const el = document.createElement("div");
      el.className = "user-pick";
      el.innerHTML = `
        <span class="ava">${u.emoji}</span>
        <div><div class="nm">${u.name}</div><div class="rl">ילד/ה — לחצו להיכנס</div></div>`;
      el.onclick = async () => {
        try {
          ME = await api("/api/login", "POST", { user_id: u.id });
          renderHome();
        } catch (e) { toast(e.message); }
      };
      list.appendChild(el);
    });
    if (kids.length === 0) {
      const note = document.createElement("p");
      note.className = "legal-consent";
      note.textContent = "עדיין אין ילדים במשפחה הזו. ההורה יכול להוסיף מהאפליקציה.";
      list.appendChild(note);
    }
  } else {
    const note = document.createElement("div");
    note.className = "kids-note";
    note.innerHTML = `<span class="kids-emoji">👶</span>
      <div><b>ילדים</b> — היכנסו דרך <b>הקישור</b> שההורה שלכם שלח לכם 🙂</div>`;
    list.appendChild(note);
  }
}

// חלון כניסת הורה. בפעם הראשונה — אימייל + סיסמה.
// מהפעם השנייה (אותו מכשיר) — רק סיסמה, כי האימייל נזכר.
function openParentLogin() {
  const back = document.createElement("div");
  back.className = "modal-back";
  const saved = localStorage.getItem("parentEmail") || "";
  back.innerHTML = `<div class="modal">
    <button class="close" data-act="close">✕</button>
    <div class="pin-emoji">👑</div>
    <h2>כניסת הורה</h2>
    ${saved
      ? `<p class="welcome-back">ברוך שובך! 👋<br><b>${saved}</b></p>
         <input class="pl-email" type="hidden" value="${saved}">`
      : `<input class="ask-input pl-email" type="email" placeholder="אימייל">`}
    <input class="ask-input pl-pass" type="password" placeholder="סיסמה">
    <div class="pin-error pl-err"></div>
    <button class="btn big" data-act="go">כניסה</button>
    <a class="forgot-link" data-act="forgot">שכחתי סיסמה</a>
    ${saved ? `<a class="forgot-link" data-act="other">כניסה עם אימייל אחר</a>` : ""}
  </div>`;
  document.body.appendChild(back);
  const err = $(".pl-err", back);
  const submit = async () => {
    const email = $(".pl-email", back).value.trim();
    const password = $(".pl-pass", back).value;
    try {
      ME = await api("/api/login", "POST", { email, password });
      localStorage.setItem("parentEmail", email);  // לזכור למכשיר הזה
      back.remove();
      renderHome();
    } catch (e) { err.textContent = e.message; }
  };
  $('[data-act="close"]', back).onclick = () => back.remove();
  $('[data-act="go"]', back).onclick = submit;
  $('[data-act="forgot"]', back).onclick = () => { back.remove(); openForgot(); };
  const other = $('[data-act="other"]', back);
  if (other) other.onclick = () => {
    localStorage.removeItem("parentEmail");
    back.remove();
    openParentLogin();
  };
  $(".pl-pass", back).onkeydown = (e) => { if (e.key === "Enter") submit(); };
  setTimeout(() => { (saved ? $(".pl-pass", back) : $(".pl-email", back)).focus(); }, 50);
}

// תהליך "שכחתי סיסמה" — קוד נשלח לאימייל → סיסמה חדשה
function openForgot() {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal">
    <button class="close" data-act="close">✕</button>
    <div class="pin-emoji">🔑</div>
    <h2>שחזור סיסמה</h2>
    <div class="fg-step1">
      <p style="font-size:14px;color:var(--muted)">נשלח קוד איפוס לאימייל שלך</p>
      <input class="ask-input fg-email" type="email" placeholder="האימייל שלך">
      <div class="pin-error fg-err"></div>
      <button class="btn big" data-act="send">שליחת קוד למייל 📧</button>
    </div>
    <div class="fg-step2 hidden">
      <p style="font-weight:700">📧 שלחנו קוד בן 6 ספרות למייל שלך</p>
      <input class="ask-input fg-code" inputmode="numeric" placeholder="הקוד מהמייל">
      <input class="ask-input fg-new" type="password" placeholder="סיסמה חדשה (אותיות ומספרים, לפחות 6)">
      <input class="ask-input fg-new2" type="password" placeholder="אימות סיסמה">
      <div class="pin-error fg-err2"></div>
      <button class="btn big" data-act="verify">איפוס הסיסמה</button>
    </div>
  </div>`;
  document.body.appendChild(back);
  $('[data-act="close"]', back).onclick = () => back.remove();

  let email = "";
  $('[data-act="send"]', back).onclick = async () => {
    email = $(".fg-email", back).value.trim();
    const err = $(".fg-err", back);
    if (!email.includes("@")) { err.textContent = "צריך אימייל תקין"; return; }
    err.textContent = "שולח...";
    try {
      await api("/api/forgot/send", "POST", { email });
      $(".fg-step1", back).classList.add("hidden");
      $(".fg-step2", back).classList.remove("hidden");
    } catch (e) { err.textContent = e.message; }
  };

  $('[data-act="verify"]', back).onclick = async () => {
    const code = $(".fg-code", back).value.trim();
    const nw = $(".fg-new", back).value;
    const nw2 = $(".fg-new2", back).value;
    const err = $(".fg-err2", back);
    if (!code) { err.textContent = "צריך להקליד את הקוד מהמייל"; return; }
    if (!passwordOk(nw)) { err.textContent = "סיסמה חייבת אותיות ומספרים, לפחות 6 תווים"; return; }
    if (nw !== nw2) { err.textContent = "הסיסמאות לא תואמות 🙈"; return; }
    try {
      await api("/api/forgot/verify", "POST", { email, code, new_password: nw });
      back.remove();
      toast("הסיסמה אופסה! אפשר להיכנס עם הסיסמה החדשה 🔐");
      openParentLogin();
    } catch (e) { err.textContent = e.message; }
  };
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
  document.body.classList.remove("no-chat");  // אחרי כניסה — מציגים את הצ'אט
  const header = tpl("tpl-header");
  $(".who", header).innerHTML = `<span class="ava">${ME.emoji}</span> ${ME.name}`;
  $('[data-act="logout"]', header).onclick = async () => {
    await api("/api/logout", "POST");
    ME = null;
    renderLogin();
  };
  const cpBtn = $('[data-act="change-pin"]', header);
  if (ME.role === "parent") {
    cpBtn.onclick = openChangePin;   // הורה: החלפת סיסמה
  } else {
    cpBtn.remove();                  // לילד אין קוד/סיסמה
  }
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
    <h2>החלפת סיסמה</h2>
    <input class="ask-input cp-cur" type="password" placeholder="הסיסמה הנוכחית">
    <input class="ask-input cp-new" type="password" placeholder="סיסמה חדשה (אותיות ומספרים, לפחות 6)">
    <input class="ask-input cp-conf" type="password" placeholder="אימות הסיסמה החדשה">
    <div class="pin-error cp-err"></div>
    <button class="btn big" data-act="save">שמירה</button>
  </div>`;
  document.body.appendChild(back);
  const err = $(".cp-err", back);

  $('[data-act="close"]', back).onclick = () => back.remove();
  $('[data-act="save"]', back).onclick = async () => {
    const cur = $(".cp-cur", back).value;
    const nw = $(".cp-new", back).value;
    const conf = $(".cp-conf", back).value;
    if (!cur || !nw || !conf) { err.textContent = "צריך למלא את כל השדות"; return; }
    if (!passwordOk(nw)) { err.textContent = "הסיסמה החדשה חייבת לכלול אותיות ומספרים, לפחות 6 תווים"; return; }
    if (nw !== conf) { err.textContent = "הסיסמה והאימות לא תואמים 🙈"; return; }
    try {
      await api("/api/change-pin", "POST", { current_pin: cur, new_pin: nw });
      back.remove();
      celebrate();
      toast("הסיסמה הוחלפה בהצלחה! 🔐");
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
  const famLink = `${location.origin}/f/${ME.family_code}`;
  let html = `<div class="card">
    <h2>📨 הקישור של המשפחה שלך</h2>
    <p class="s" style="margin:0 0 8px">שלחי את הקישור הזה לילדים — הם ייכנסו דרכו (בלי קוד):</p>
    <div class="form-row"><input id="fam-link" value="${famLink}" readonly></div>
    <button class="btn big" id="copy-link">העתקת הקישור 📋</button>
  </div>
  <div class="card">
    <h2>הוספת ילד/ה</h2>
    <div class="form-row">
      <input class="w-emoji" id="kid-emoji" value="🙂" maxlength="2">
      <input id="kid-name" placeholder="שם הילד/ה">
    </div>
    <button class="btn big" id="add-kid">הוספה ➕</button>
  </div>`;

  html += "<h2>הילדים שלי</h2>";
  if (kids.length === 0) html += `<div class="empty">עדיין אין ילדים</div>`;
  kids.forEach((k) => {
    html += `<div class="item review-card" data-kid="${k.id}" data-name="${k.name}" data-emoji="${k.emoji}">
      <div class="info" style="display:flex;align-items:center;gap:10px">
        <span class="emoji">${k.emoji}</span>
        <div><div class="t">${k.name}</div>
        <div class="s">${k.level.emoji} רמה ${k.level.level} · ${k.total_earned} 💎 בסך הכל</div></div>
        <span class="pts" style="margin-inline-start:auto">${k.points} ⭐</span>
      </div>
      <div class="review-actions">
        <button class="btn small green" data-bonus="10">בונוס +10</button>
        <button class="btn small ghost" data-bonus="-10">הורדה -10</button>
        <button class="btn small" data-edit-kid>✏️ שם</button>
        <button class="btn small red" data-del-kid>מחיקה</button>
      </div>
    </div>`;
  });
  box.innerHTML = html;

  $("#copy-link", box).onclick = async () => {
    const inp = $("#fam-link", box);
    inp.select();
    try { await navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand("copy"); }
    toast("הקישור הועתק! שלחי אותו לילדים 📨");
  };

  $("#add-kid", box).onclick = async () => {
    const name = $("#kid-name", box).value.trim();
    const emoji = $("#kid-emoji", box).value.trim() || "🙂";
    if (!name) { toast("צריך שם"); return; }
    try {
      await api("/api/children", "POST", { name, emoji });
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
    const edit = $("[data-edit-kid]", card);
    if (edit) edit.onclick = () => {
      openEditModal("עריכת ילד/ה", [
        { placeholder: "אימוג'י", value: card.dataset.emoji },
        { placeholder: "שם", value: name },
      ], async ([emoji, newName]) => {
        if (!newName) throw new Error("צריך שם");
        await api(`/api/children/${id}/edit`, "POST", { name: newName, emoji: emoji || "🙂" });
        toast("עודכן ✅");
        loadKids(root);
      });
    };
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
// ספריית מטלות מוכנה — לחיצה מוסיפה מטלה בלי להקליד
const CHORE_LIBRARY = [
  { cat: "🛏️ חדר", items: [
    { emoji: "🛏️", title: "לסדר את המיטה", points: 5 },
    { emoji: "🧸", title: "לסדר את החדר", points: 10 },
    { emoji: "👕", title: "לקפל ולסדר בגדים", points: 10 },
    { emoji: "🎒", title: "להכין תיק לבית ספר", points: 5 },
  ]},
  { cat: "🍽️ מטבח", items: [
    { emoji: "🍽️", title: "להכניס כלים למדיח", points: 10 },
    { emoji: "🍴", title: "להוציא כלים מהמדיח", points: 10 },
    { emoji: "🧽", title: "לנקות את השיש והשולחן", points: 8 },
    { emoji: "🗑️", title: "להוציא את הזבל", points: 5 },
  ]},
  { cat: "🛋️ סלון ובית", items: [
    { emoji: "🛋️", title: "לסדר את הסלון", points: 10 },
    { emoji: "🧹", title: "לטאטא את הבית", points: 8 },
    { emoji: "🧼", title: "לשטוף רצפות", points: 15 },
    { emoji: "🪟", title: "לנקות חלון או מראה", points: 8 },
  ]},
  { cat: "⭐ כללי", items: [
    { emoji: "📚", title: "לעשות שיעורי בית", points: 15 },
    { emoji: "🤝", title: "לעזור לאח/אחות בשיעורים", points: 15 },
    { emoji: "🍳", title: "לעזור בהכנת ארוחה", points: 12 },
    { emoji: "🐕", title: "להאכיל / להוציא את החיה", points: 8 },
    { emoji: "🌱", title: "להשקות צמחים", points: 5 },
    { emoji: "🦷", title: "לצחצח שיניים", points: 3 },
  ]},
];

function openChoreLibrary(root) {
  const back = document.createElement("div");
  back.className = "modal-back";
  let html = `<div class="modal lib-modal">
    <button class="close" data-act="lib-close">✕</button>
    <h2>📋 ספריית מטלות</h2>
    <p class="lib-hint">לחצו על מטלה כדי להוסיף אותה — אפשר לערוך נקודות אחר כך.</p>
    <div class="lib-list">`;
  CHORE_LIBRARY.forEach((group) => {
    html += `<div class="lib-cat">${group.cat}</div>`;
    group.items.forEach((it) => {
      const t = it.title.replace(/"/g, "&quot;");
      html += `<button class="lib-item" data-title="${t}" data-emoji="${it.emoji}" data-points="${it.points}">
        <span class="emoji">${it.emoji}</span>
        <span class="lib-t">${it.title}</span>
        <span class="pts">+${it.points}</span>
        <span class="lib-add">הוספה ➕</span></button>`;
    });
  });
  html += `</div></div>`;
  back.innerHTML = html;
  document.body.appendChild(back);

  const close = () => { back.remove(); loadManageChores(root); };
  back.querySelector('[data-act="lib-close"]').onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };

  $$(".lib-item", back).forEach((btn) => {
    btn.onclick = async () => {
      if (btn.classList.contains("added")) return;
      try {
        await api("/api/chores", "POST", {
          title: btn.dataset.title,
          emoji: btn.dataset.emoji,
          points: btn.dataset.points,
        });
        btn.classList.add("added");
        btn.querySelector(".lib-add").textContent = "נוסף ✓";
        playSound("success");
      } catch (e) { toast(e.message); }
    };
  });
}

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
    <button class="btn ghost" id="open-lib" style="width:100%;margin-top:8px">📋 בחירה מספריית מטלות מוכנה</button>
  </div>`;
  html += "<h2>המטלות הקיימות</h2>";
  if (chores.length === 0) html += `<div class="empty">אין מטלות</div>`;
  chores.forEach((c) => {
    const t = c.title.replace(/"/g, "&quot;");
    html += `<div class="item">
      <span class="emoji">${c.emoji}</span>
      <div class="info"><div class="t">${c.title}</div></div>
      <span class="pts">+${c.points}</span>
      <button class="btn small" data-edit="${c.id}" data-title="${t}" data-points="${c.points}" data-emoji="${c.emoji}">✏️</button>
      <button class="btn small red" data-del="${c.id}">מחק</button></div>`;
  });
  box.innerHTML = html;

  $$("[data-edit]", box).forEach((btn) => {
    btn.onclick = () => openEditModal("עריכת מטלה", [
      { placeholder: "אימוג'י", value: btn.dataset.emoji },
      { placeholder: "שם המטלה", value: btn.dataset.title },
      { placeholder: "נקודות", value: btn.dataset.points, type: "number" },
    ], async ([emoji, title, points]) => {
      if (!title || !points) throw new Error("צריך שם ונקודות");
      await api(`/api/chores/${btn.dataset.edit}/edit`, "POST", { title, points, emoji: emoji || "🧹" });
      toast("עודכן ✅");
      loadManageChores(root);
    });
  });

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
  $("#open-lib", box).onclick = () => openChoreLibrary(root);
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
    const t = r.title.replace(/"/g, "&quot;");
    html += `<div class="item">
      <span class="emoji">${r.emoji}</span>
      <div class="info"><div class="t">${r.title}</div></div>
      <span class="cost">${r.cost_points}</span>
      <button class="btn small" data-edit="${r.id}" data-title="${t}" data-cost="${r.cost_points}" data-emoji="${r.emoji}">✏️</button>
      <button class="btn small red" data-del="${r.id}">מחק</button></div>`;
  });
  box.innerHTML = html;

  $$("[data-edit]", box).forEach((btn) => {
    btn.onclick = () => openEditModal("עריכת פרס", [
      { placeholder: "אימוג'י", value: btn.dataset.emoji },
      { placeholder: "שם הפרס", value: btn.dataset.title },
      { placeholder: "מחיר בנקודות", value: btn.dataset.cost, type: "number" },
    ], async ([emoji, title, cost_points]) => {
      if (!title || !cost_points) throw new Error("צריך שם ומחיר");
      await api(`/api/rewards/${btn.dataset.edit}/edit`, "POST", { title, cost_points, emoji: emoji || "🎁" });
      toast("עודכן ✅");
      loadManageRewards(root);
    });
  });

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
