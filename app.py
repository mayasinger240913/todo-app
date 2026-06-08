"""
אפליקציית מטלות לילדים 🧹⭐
שרת Python (Flask) + מסד נתונים SQLite.

הרעיון: ילדים מבצעים מטלות בית, מצלמים הוכחה בזמן אמת,
ומקבלים נקודות. את הנקודות אפשר להמיר לפרסים שההורים מגדירים.
ההורים שולטים על הכל: מאשרים מטלות, מגדירים פרסים, ומאשרים בקשות.

איך מריצים:
    pip install -r requirements.txt
    python app.py
ואז פותחים בדפדפן: http://localhost:5000
"""

import os
import sqlite3
import secrets
import time
import smtplib
from email.message import EmailMessage
from datetime import datetime, date, timedelta
from functools import wraps

from flask import (
    Flask, request, session, jsonify,
    send_from_directory, render_template, g
)
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image

# ---------- הגדרות בסיסיות ----------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "chores.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
# מפתח להצפנת ה-session. בייצור מגיע ממשתנה סביבה SECRET_KEY (סודי),
# ובפיתוח יש ערך ברירת מחדל.
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-secret-change-in-production")

# הגדרות שליחת מייל (לשחזור סיסמה). מגיעות ממשתני סביבה.
# ברירת מחדל ל-Gmail; SMTP_USER ו-SMTP_PASS הם המייל וסיסמת-האפליקציה.
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")


def send_email(to, subject, body):
    """שולח מייל. מחזיר True אם הצליח. אם לא הוגדר SMTP — מחזיר False."""
    if not SMTP_USER or not SMTP_PASS:
        return False
    msg = EmailMessage()
    msg["From"] = SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        return True
    except Exception as e:
        print(">> שגיאת שליחת מייל:", e)
        return False


# ---------- חיבור למסד הנתונים ----------

# מקומי: SQLite. בייצור: PostgreSQL (אם הוגדר DATABASE_URL) — שהנתונים יישמרו לתמיד.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_PG = bool(DATABASE_URL)
if USE_PG:
    import psycopg2
    import psycopg2.extras


class DB:
    """עטיפה אחידה ל-SQLite (מקומי) ול-PostgreSQL (ייצור)."""

    def __init__(self):
        if USE_PG:
            # ניסיונות חוזרים — מסד Neon החינמי "נרדם" וייתכן שהחיבור הראשון
            # אחרי שינה לוקח כמה שניות / נכשל. ננסה כמה פעמים לפני שנוותר.
            last_err = None
            for attempt in range(6):
                try:
                    self.conn = psycopg2.connect(
                        DATABASE_URL, connect_timeout=10, keepalives=1
                    )
                    return
                except Exception as e:
                    last_err = e
                    time.sleep(2)
            raise last_err
        else:
            self.conn = sqlite3.connect(DB_PATH)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute("PRAGMA foreign_keys = ON")

    def _q(self, sql):
        # SQLite משתמש ב-? ל-placeholder, ו-PostgreSQL ב-%s
        return sql.replace("?", "%s") if USE_PG else sql

    def execute(self, sql, params=()):
        if USE_PG:
            cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        else:
            cur = self.conn.cursor()
        cur.execute(self._q(sql), params)
        return cur

    def executemany(self, sql, seq):
        cur = self.conn.cursor()
        cur.executemany(self._q(sql), seq)
        return cur

    def insert_returning_id(self, sql, params):
        """מחזיר את ה-id של השורה החדשה (עובד בשני סוגי מסד הנתונים)."""
        if USE_PG:
            cur = self.execute(sql + " RETURNING id", params)
            return cur.fetchone()["id"]
        return self.execute(sql, params).lastrowid

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def get_db():
    """מחזיר חיבור למסד הנתונים (אחד לכל בקשה)."""
    if "db" not in g:
        g.db = DB()
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# מטלות ופרסים לדוגמה — נזרעים לכל משפחה חדשה בעת ההקמה.
SAMPLE_CHORES = [
    ("לסדר את החדר", 20, "🛏️"),
    ("להוציא את הזבל", 10, "🗑️"),
    ("הכנסת כלים למדיח", 15, "🍽️"),
    ("הוצאת כלים מהמדיח", 15, "🥣"),
    ("לסדר את הסלון", 20, "🛋️"),
    ("לסדר את המטבח", 20, "🍴"),
    ("לשטוף רצפה בסלון", 25, "🧽"),
    ("לשטוף רצפה במטבח", 25, "🧹"),
    ("הכנת ארוחת ערב לכל המשפחה", 40, "🍝"),
    ("לתלות כביסה", 20, "🧺"),
    ("לקפל כביסה", 20, "👕"),
    ("להוציא את הכלב לטיול", 15, "🐕"),
    ("לעזור לאח/אחות הקטנים", 30, "🧸"),
    ("לעזור לאח/אחות בשיעורי הבית", 30, "📚"),
    ("להכין כריכים לבית ספר", 15, "🥪"),
]
SAMPLE_REWARDS = [
    ("שעה נוספת של מסכים", 50, "📱"),
    ("50 ₪ דמי כיס", 100, "🪙"),
    ("כרטיס לסרט בקולנוע", 120, "🎬"),
    ("ארוחה במסעדה האהובה", 250, "🍔"),
    ("צעצוע או משחק חדש", 300, "🎮"),
    ("יום כיף בחוץ (לונה פארק / בריכה)", 400, "🎢"),
]


def seed_family(db, family_id):
    """זורע מטלות ופרסים לדוגמה למשפחה חדשה."""
    db.executemany(
        "INSERT INTO chores (title, points, emoji, family_id) VALUES (?,?,?,?)",
        [(t, p, e, family_id) for (t, p, e) in SAMPLE_CHORES],
    )
    db.executemany(
        "INSERT INTO rewards (title, cost_points, emoji, family_id) VALUES (?,?,?,?)",
        [(t, c, e, family_id) for (t, c, e) in SAMPLE_REWARDS],
    )


def init_db():
    """יוצר את הטבלאות. עובד גם ב-SQLite (מקומי) וגם ב-PostgreSQL (ייצור)."""
    pk = "SERIAL PRIMARY KEY" if USE_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
    statements = [
        f"""CREATE TABLE IF NOT EXISTS users (
            id {pk},
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            pin TEXT,
            points INTEGER NOT NULL DEFAULT 0,
            total_earned INTEGER NOT NULL DEFAULT 0,
            emoji TEXT NOT NULL DEFAULT '🙂',
            email TEXT,
            reset_code TEXT,
            reset_expires TEXT,
            family_id INTEGER,
            family_code TEXT
        )""",
        f"""CREATE TABLE IF NOT EXISTS chores (
            id {pk},
            title TEXT NOT NULL,
            points INTEGER NOT NULL,
            emoji TEXT NOT NULL DEFAULT '🧹',
            family_id INTEGER NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS rewards (
            id {pk},
            title TEXT NOT NULL,
            cost_points INTEGER NOT NULL,
            emoji TEXT NOT NULL DEFAULT '🎁',
            family_id INTEGER NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS submissions (
            id {pk},
            chore_id INTEGER,
            child_id INTEGER NOT NULL,
            chore_title TEXT NOT NULL,
            photo TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            points INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            phash TEXT,
            suspicious INTEGER NOT NULL DEFAULT 0,
            suspect_match INTEGER,
            suspect_reason TEXT,
            family_id INTEGER NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS reward_requests (
            id {pk},
            reward_id INTEGER,
            child_id INTEGER NOT NULL,
            reward_title TEXT NOT NULL,
            cost_points INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            family_id INTEGER NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS chore_requests (
            id {pk},
            child_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            suggested_points INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            reviewed_at TEXT,
            family_id INTEGER NOT NULL
        )""",
    ]
    db = DB()
    for stmt in statements:
        db.execute(stmt)
    db.commit()
    db.close()


# ---------- עזרי הרשאות ----------

def current_user():
    """מחזיר את המשתמש המחובר כרגע, או None."""
    uid = session.get("user_id")
    if uid is None:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({"error": "צריך להתחבר קודם"}), 401
        return fn(*args, **kwargs)
    return wrapper


def parent_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "צריך להתחבר קודם"}), 401
        if user["role"] != "parent":
            return jsonify({"error": "רק הורה יכול לעשות את זה"}), 403
        return fn(*args, **kwargs)
    return wrapper


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def password_ok(pw):
    """סיסמה תקינה: לפחות 6 תווים, וכוללת גם אותיות וגם מספרים."""
    return (len(pw) >= 6
            and any(c.isalpha() for c in pw)
            and any(c.isdigit() for c in pw))


# ---------- זיהוי רמאות: "טביעת אצבע" לתמונה ----------
# מחשבים dHash – חתימה של 64 ביט שמתארת את מבנה התמונה.
# שתי תמונות כמעט-זהות יקבלו חתימה כמעט-זהה (מרחק קטן),
# גם אם יש הבדל קטן בגודל/בהירות. ככה מזהים שימוש חוזר באותה תמונה.

PHASH_THRESHOLD = 12  # מרחק קטן או שווה לזה (מתוך 128) => חשד לתמונה כפולה


def compute_phash(path):
    """מחזיר חתימת dHash של 128 ביט (אופקי + אנכי), או None אם נכשל."""
    try:
        img = Image.open(path).convert("L").resize((9, 9), Image.LANCZOS)
        px = list(img.getdata())  # 9x9

        def at(r, c):
            return px[r * 9 + c]

        bits = []
        # הפרשים אופקיים (8x8)
        for r in range(8):
            for c in range(8):
                bits.append("1" if at(r, c) > at(r, c + 1) else "0")
        # הפרשים אנכיים (8x8) – תופס שינויים גם בכיוון השני
        for r in range(8):
            for c in range(8):
                bits.append("1" if at(r, c) > at(r + 1, c) else "0")
        return "".join(bits)
    except Exception:
        return None


def hamming(a, b):
    """כמה ביטים שונים בין שתי חתימות (מרחק)."""
    if not a or not b or len(a) != len(b):
        return 999
    return sum(1 for x, y in zip(a, b) if x != y)


def image_metadata_reasons(path):
    """
    סוכן הזיהוי: בודק מטא-דאטה (EXIF) של התמונה.
    צילום חי דרך האפליקציה נוצר נקי לגמרי (canvas) – בלי EXIF.
    תמונה שהועלתה מהמחשב/גלריה כמעט תמיד מכילה חותמת זמן ו/או פרטי מצלמה,
    ולכן נוכחות מטא-דאטה כזה = חשד שהתמונה לא צולמה עכשיו.
    """
    reasons = []
    try:
        img = Image.open(path)
        exif = img.getexif()
    except Exception:
        return reasons
    if not exif:
        return reasons  # אין מטא-דאטה => כנראה צילום חי תקין

    # זמן הצילום (DateTime / DateTimeOriginal)
    stamp = exif.get(306)
    try:
        sub = exif.get_ifd(0x8769)  # Exif sub-IFD
        stamp = sub.get(36867) or stamp  # DateTimeOriginal
    except Exception:
        pass
    if stamp:
        try:
            taken = datetime.strptime(str(stamp).strip(), "%Y:%m:%d %H:%M:%S")
            age_sec = (datetime.now() - taken).total_seconds()
            if age_sec > 600:  # יותר מ-10 דקות => לא "עכשיו"
                reasons.append(
                    "התמונה צולמה ב-" + taken.strftime("%d/%m בשעה %H:%M") + " — לא עכשיו"
                )
            else:
                reasons.append("לתמונה יש חותמת זמן צילום (לא צילום חי דרך האפליקציה)")
        except Exception:
            reasons.append("לתמונה יש חותמת זמן צילום (כנראה קובץ שהועלה)")

    # פרטי מצלמה/תוכנה => מעיד על קובץ אמיתי שהועלה, לא על canvas
    if exif.get(271) or exif.get(272) or exif.get(305):
        reasons.append("לתמונה יש פרטי מצלמה/תוכנה (כנראה קובץ מהמחשב או מהגלריה)")

    return reasons


# ---------- רמות, דמויות ורצף ----------

# סולם הרמות: (נקודות-חיים נדרשות, אימוג'י, שם). לפי total_earned.
LEVELS = [
    (0,    "🥚", "ביצונת"),
    (50,   "🐣", "אפרוח"),
    (150,  "🐤", "גוזל"),
    (300,  "🐰", "ארנבון"),
    (500,  "🦊", "שועל ערמומי"),
    (800,  "🦁", "אריה אמיץ"),
    (1200, "🦅", "נשר מרקיע"),
    (1800, "🐲", "דרקון"),
    (2500, "🦄", "חד-קרן אגדי"),
]


def level_info(total):
    """מחזיר את פרטי הרמה הנוכחית וההתקדמות לרמה הבאה לפי נקודות-החיים."""
    idx = 0
    for i, (thr, _emoji, _name) in enumerate(LEVELS):
        if total >= thr:
            idx = i
    thr, emoji, name = LEVELS[idx]
    if idx + 1 < len(LEVELS):
        next_thr, _ne, next_name = LEVELS[idx + 1]
        span = next_thr - thr
        progress = int(round((total - thr) / span * 100)) if span else 100
        to_next = next_thr - total
    else:
        next_name = None
        progress = 100
        to_next = 0
    return {
        "level": idx + 1,
        "emoji": emoji,
        "name": name,
        "progress_pct": max(0, min(100, progress)),
        "to_next": to_next,
        "next_name": next_name,
    }


def compute_streak(db, child_id):
    """כמה ימים ברצף (עד היום/אתמול) הילד ביצע מטלה שאושרה."""
    rows = db.execute(
        """SELECT DISTINCT substr(created_at, 1, 10) AS d
           FROM submissions WHERE child_id = ? AND status = 'approved'""",
        (child_id,),
    ).fetchall()
    days = {r["d"] for r in rows}
    if not days:
        return 0
    today = date.today()
    start = today
    if today.isoformat() not in days:
        if (today - timedelta(days=1)).isoformat() in days:
            start = today - timedelta(days=1)
        else:
            return 0
    streak = 0
    cur = start
    while cur.isoformat() in days:
        streak += 1
        cur -= timedelta(days=1)
    return streak


# ---------- דפים ----------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/dbcheck")
def dbcheck():
    # נקודת אבחון זמנית — מחזירה את שגיאת מסד הנתונים אם יש
    try:
        row = get_db().execute("SELECT COUNT(*) AS c FROM users").fetchone()
        return jsonify({"ok": True, "users": row["c"], "backend": "postgres" if USE_PG else "sqlite"})
    except Exception as e:
        return jsonify({"ok": False, "error": repr(e)})


@app.route("/sw.js")
def service_worker():
    # מגישים את ה-service worker מהשורש כדי שה-scope שלו יהיה כל האתר
    return send_from_directory(BASE_DIR, "sw.js", mimetype="application/javascript")


@app.route("/privacy")
def privacy():
    return render_template("privacy.html")


@app.route("/terms")
def terms():
    return render_template("terms.html")


@app.route("/uploads/<path:filename>")
@parent_required  # רק הורה רואה את תמונות ההוכחה
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/f/<code>")
def family_link(code):
    # קישור ייחודי למשפחה — מגיש את אותה אפליקציה; הצד-לקוח קורא את הקוד מה-URL
    return render_template("index.html")


# ---------- API: התחברות ----------

@app.route("/api/users", methods=["GET"])
def list_users():
    """רשימת הילדים של משפחה מסוימת (לפי family_code מהקישור)."""
    code = (request.args.get("family_code") or "").strip()
    if not code:
        return jsonify([])  # בלי קוד משפחה — אין רשימת ילדים
    db = get_db()
    parent = db.execute(
        "SELECT family_id FROM users WHERE family_code = ?", (code,)
    ).fetchone()
    if parent is None:
        return jsonify([])
    rows = db.execute(
        "SELECT id, name, role, emoji FROM users WHERE role='child' AND family_id = ? ORDER BY name",
        (parent["family_id"],),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    db = get_db()

    # כניסת הורה: אימייל + סיסמה
    email = (data.get("email") or "").strip().lower()
    if email:
        row = db.execute(
            "SELECT * FROM users WHERE email = ? AND role = 'parent'", (email,)
        ).fetchone()
        password = str(data.get("password") or "")
        if row is None or not check_password_hash(row["pin"], password):
            return jsonify({"error": "אימייל או סיסמה שגויים 🙈"}), 401
        session["user_id"] = row["id"]
        return jsonify(_user_public(row))

    # כניסת ילד: רק בחירת פרופיל, בלי קוד
    user_id = data.get("user_id")
    row = db.execute(
        "SELECT * FROM users WHERE id = ? AND role = 'child'", (user_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "פרופיל לא נמצא"}), 404
    session["user_id"] = row["id"]
    return jsonify(_user_public(row))


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/change-pin", methods=["POST"])
@login_required
def change_pin():
    """החלפת קוד: מאמתים את הקוד הנוכחי, ואז שומרים קוד חדש."""
    user = current_user()
    data = request.get_json(force=True)
    current = str(data.get("current_pin", ""))
    new = str(data.get("new_pin", "")).strip()
    if not user["pin"] or not check_password_hash(user["pin"], current):
        return jsonify({"error": "הסיסמה הנוכחית שגויה 🙈"}), 400
    if not password_ok(new):
        return jsonify({"error": "הסיסמה החדשה חייבת לכלול אותיות ומספרים, לפחות 6 תווים"}), 400
    db = get_db()
    db.execute("UPDATE users SET pin = ? WHERE id = ?", (generate_password_hash(new), user["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/setup-status", methods=["GET"])
def setup_status():
    """האם צריך הקמה ראשונית? (כלומר עדיין אין חשבון הורה)"""
    n = get_db().execute(
        "SELECT COUNT(*) AS c FROM users WHERE role='parent'"
    ).fetchone()["c"]
    return jsonify({"needs_setup": n == 0})


@app.route("/api/setup", methods=["POST"])
def setup():
    """יצירת חשבון הורה + משפחה חדשה (כל אחד יכול להירשם)."""
    db = get_db()
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    emoji = (data.get("emoji") or "👑").strip()
    email = (data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if not name:
        return jsonify({"error": "צריך לבחור שם"}), 400
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "כתובת אימייל לא תקינה"}), 400
    if not password_ok(password):
        return jsonify({"error": "הסיסמה חייבת לכלול אותיות ומספרים, לפחות 6 תווים"}), 400
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return jsonify({"error": "האימייל כבר בשימוש"}), 400
    pid = db.insert_returning_id(
        "INSERT INTO users (name, role, pin, emoji, email) VALUES (?,?,?,?,?)",
        (name, "parent", generate_password_hash(password), emoji, email),
    )
    code = secrets.token_hex(4)  # קוד משפחה ייחודי (8 תווים)
    db.execute(
        "UPDATE users SET family_id = ?, family_code = ? WHERE id = ?",
        (pid, code, pid),
    )
    seed_family(db, pid)  # מטלות ופרסים לדוגמה למשפחה החדשה
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (pid,)).fetchone()
    session["user_id"] = row["id"]  # מתחברים אוטומטית
    return jsonify(_user_public(row))


@app.route("/api/forgot/send", methods=["POST"])
def forgot_send():
    """שולח קוד איפוס בן 6 ספרות לאימייל של ההורה."""
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE email = ? AND role='parent'", (email,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "לא נמצא חשבון הורה עם האימייל הזה"}), 404
    code = str(secrets.randbelow(900000) + 100000)  # קוד בן 6 ספרות
    expires = (datetime.now() + timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "UPDATE users SET reset_code = ?, reset_expires = ? WHERE id = ?",
        (generate_password_hash(code), expires, row["id"]),
    )
    db.commit()
    sent = send_email(
        email,
        "קוד איפוס סיסמה - טודו",
        f"שלום!\n\nקוד איפוס הסיסמה שלך לאפליקציית טודו הוא: {code}\n"
        f"הקוד תקף ל-30 דקות.\n\nאם לא ביקשת לאפס סיסמה, אפשר להתעלם מהמייל.",
    )
    if not sent:
        return jsonify({"error": "שליחת המייל נכשלה — צריך להגדיר את שליחת המיילים בשרת"}), 500
    return jsonify({"ok": True})


@app.route("/api/forgot/verify", methods=["POST"])
def forgot_verify():
    """מאמת את הקוד מהמייל ומאפס סיסמה."""
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    code = str(data.get("code") or "").strip()
    new = str(data.get("new_password") or "")
    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE email = ? AND role='parent'", (email,)
    ).fetchone()
    if row is None or not row["reset_code"]:
        return jsonify({"error": "לא התבקש איפוס לחשבון הזה"}), 400
    try:
        exp = datetime.strptime(row["reset_expires"], "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        exp = None
    if exp is None or datetime.now() > exp:
        return jsonify({"error": "הקוד פג תוקף — בקשו קוד חדש"}), 400
    if not check_password_hash(row["reset_code"], code):
        return jsonify({"error": "הקוד שגוי 🙈"}), 400
    if not password_ok(new):
        return jsonify({"error": "הסיסמה החדשה חייבת לכלול אותיות ומספרים, לפחות 6 תווים"}), 400
    db.execute(
        "UPDATE users SET pin = ?, reset_code = NULL, reset_expires = NULL WHERE id = ?",
        (generate_password_hash(new), row["id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
def me():
    user = current_user()
    if user is None:
        return jsonify({"user": None})
    return jsonify({"user": _user_public(user)})


def _user_public(row):
    data = {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "points": row["points"],
        "emoji": row["emoji"],
        "family_id": row["family_id"],
    }
    if row["role"] == "child":
        data["total_earned"] = row["total_earned"]
        data["level"] = level_info(row["total_earned"])
    if row["role"] == "parent":
        data["family_code"] = row["family_code"]
    return data


# ---------- API: ניהול ילדים (הורה) ----------

@app.route("/api/children", methods=["POST"])
@parent_required
def add_child():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    emoji = (data.get("emoji") or "🙂").strip()
    if not name:
        return jsonify({"error": "צריך שם"}), 400
    user = current_user()
    db = get_db()
    db.execute(
        "INSERT INTO users (name, role, emoji, family_id) VALUES (?,?,?,?)",
        (name, "child", emoji, user["family_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/children", methods=["GET"])
@parent_required
def list_children():
    user = current_user()
    rows = get_db().execute(
        """SELECT id, name, points, total_earned, emoji FROM users
           WHERE role='child' AND family_id = ? ORDER BY name""",
        (user["family_id"],),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["level"] = level_info(r["total_earned"])
        out.append(d)
    return jsonify(out)


# ---------- API: מטלות ----------

@app.route("/api/chores", methods=["GET"])
@login_required
def get_chores():
    user = current_user()
    rows = get_db().execute(
        "SELECT * FROM chores WHERE family_id = ? ORDER BY id", (user["family_id"],)
    ).fetchall()
    return jsonify([dict(r) for r in rows])



@app.route("/api/chores", methods=["POST"])
@parent_required
def add_chore():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    emoji = (data.get("emoji") or "🧹").strip()
    try:
        points = int(data.get("points"))
    except (TypeError, ValueError):
        return jsonify({"error": "מספר נקודות לא תקין"}), 400
    if not title or points <= 0:
        return jsonify({"error": "צריך שם מטלה ומספר נקודות חיובי"}), 400
    user = current_user()
    db = get_db()
    db.execute(
        "INSERT INTO chores (title, points, emoji, family_id) VALUES (?,?,?,?)",
        (title, points, emoji, user["family_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/chores/<int:chore_id>", methods=["DELETE"])
@parent_required
def delete_chore(chore_id):
    user = current_user()
    db = get_db()
    db.execute("DELETE FROM chores WHERE id = ? AND family_id = ?",
               (chore_id, user["family_id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------- API: פרסים ----------

@app.route("/api/rewards", methods=["GET"])
@login_required
def get_rewards():
    user = current_user()
    rows = get_db().execute(
        "SELECT * FROM rewards WHERE family_id = ? ORDER BY cost_points",
        (user["family_id"],),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/rewards", methods=["POST"])
@parent_required
def add_reward():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    emoji = (data.get("emoji") or "🎁").strip()
    try:
        cost = int(data.get("cost_points"))
    except (TypeError, ValueError):
        return jsonify({"error": "מספר נקודות לא תקין"}), 400
    if not title or cost <= 0:
        return jsonify({"error": "צריך שם פרס ומחיר נקודות חיובי"}), 400
    user = current_user()
    db = get_db()
    db.execute(
        "INSERT INTO rewards (title, cost_points, emoji, family_id) VALUES (?,?,?,?)",
        (title, cost, emoji, user["family_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/rewards/<int:reward_id>", methods=["DELETE"])
@parent_required
def delete_reward(reward_id):
    user = current_user()
    db = get_db()
    db.execute("DELETE FROM rewards WHERE id = ? AND family_id = ?",
               (reward_id, user["family_id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------- API: ביצוע מטלה + צילום ----------

@app.route("/api/submissions", methods=["POST"])
@login_required
def create_submission():
    """ילד מגיש מטלה עם תמונה. התמונה מגיעה כקובץ (multipart)."""
    user = current_user()
    if user["role"] != "child":
        return jsonify({"error": "רק ילד יכול להגיש מטלה"}), 403

    chore_id = request.form.get("chore_id")
    photo = request.files.get("photo")
    if not chore_id or photo is None:
        return jsonify({"error": "חסר מטלה או תמונה"}), 400

    db = get_db()
    chore = db.execute(
        "SELECT * FROM chores WHERE id = ? AND family_id = ?",
        (chore_id, user["family_id"]),
    ).fetchone()
    if chore is None:
        return jsonify({"error": "המטלה לא נמצאה"}), 404

    # שומרים את התמונה עם שם אקראי כדי שלא יידרסו תמונות
    filename = f"{secrets.token_hex(8)}.jpg"
    filepath = os.path.join(UPLOAD_DIR, filename)
    photo.save(filepath)

    # ===== סוכן הזיהוי: בודק שני סימנים לרמאות =====
    reasons = []
    suspect_match = None

    # סימן 1: תמונה כמעט-זהה לתמונה קודמת של אותו ילד
    phash = compute_phash(filepath)
    if phash:
        prev = db.execute(
            """SELECT id, phash FROM submissions
               WHERE child_id = ? AND phash IS NOT NULL""",
            (user["id"],),
        ).fetchall()
        best_dist = 999
        best_id = None
        for p in prev:
            d = hamming(phash, p["phash"])
            if d < best_dist:
                best_dist = d
                best_id = p["id"]
        if best_dist <= PHASH_THRESHOLD:
            suspect_match = best_id
            reasons.append("התמונה כמעט זהה לתמונה קודמת שכבר נשלחה")

    # סימן 2: מטא-דאטה שמעיד על קובץ שהועלה / צולם בעבר
    reasons += image_metadata_reasons(filepath)

    suspicious = 1 if reasons else 0
    suspect_reason = " · ".join(reasons) if reasons else None

    db.execute(
        """INSERT INTO submissions
           (chore_id, child_id, chore_title, photo, points, created_at,
            phash, suspicious, suspect_match, suspect_reason, family_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (chore["id"], user["id"], chore["title"], filename,
         chore["points"], now_str(), phash, suspicious, suspect_match,
         suspect_reason, user["family_id"]),
    )
    db.commit()
    # שימי לב: לילד תמיד מוחזר "נשלח בהצלחה" – הוא לא יודע על החשד.
    return jsonify({"ok": True})


@app.route("/api/submissions", methods=["GET"])
@login_required
def list_submissions():
    """הורה רואה את כל ההגשות הממתינות; ילד רואה את שלו."""
    user = current_user()
    db = get_db()
    if user["role"] == "parent":
        status = request.args.get("status", "pending")
        rows = db.execute(
            """SELECT s.*, u.name AS child_name, u.emoji AS child_emoji
               FROM submissions s JOIN users u ON u.id = s.child_id
               WHERE s.status = ? AND s.family_id = ?
               ORDER BY s.created_at DESC""",
            (status, user["family_id"]),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # אם יש חשד – מצרפים את התמונה הקודמת הדומה לצורך השוואה
            if d.get("suspicious") and d.get("suspect_match"):
                m = db.execute(
                    "SELECT photo, created_at FROM submissions WHERE id = ?",
                    (d["suspect_match"],),
                ).fetchone()
                if m:
                    d["suspect_photo"] = m["photo"]
                    d["suspect_date"] = m["created_at"]
            result.append(d)
        return jsonify(result)
    else:
        # הילד לא מקבל בכלל מידע על חשד – רק את ההגשות שלו במצב רגיל
        rows = db.execute(
            """SELECT id, chore_title, photo, status, points, created_at
               FROM submissions WHERE child_id = ?
               ORDER BY created_at DESC""",
            (user["id"],),
        ).fetchall()
        return jsonify([dict(r) for r in rows])


@app.route("/api/submissions/<int:sub_id>/review", methods=["POST"])
@parent_required
def review_submission(sub_id):
    data = request.get_json(force=True)
    decision = data.get("decision")  # 'approve' או 'reject'
    db = get_db()
    user = current_user()
    sub = db.execute(
        "SELECT * FROM submissions WHERE id = ? AND family_id = ?",
        (sub_id, user["family_id"]),
    ).fetchone()
    if sub is None:
        return jsonify({"error": "ההגשה לא נמצאה"}), 404
    if sub["status"] != "pending":
        return jsonify({"error": "ההגשה כבר טופלה"}), 400

    if decision == "approve":
        # מוסיפים גם לנקודות לשימוש וגם לנקודות לכל החיים (הרמה)
        db.execute(
            "UPDATE users SET points = points + ?, total_earned = total_earned + ? WHERE id = ?",
            (sub["points"], sub["points"], sub["child_id"]),
        )
        db.execute(
            "UPDATE submissions SET status='approved', reviewed_at=? WHERE id=?",
            (now_str(), sub_id),
        )
    elif decision == "reject":
        # אפשר להוסיף קנס נקודות (למשל במקרה של חשד לרמאות)
        penalty = 0
        if data.get("penalty") not in (None, ""):
            try:
                penalty = int(data.get("penalty"))
            except (TypeError, ValueError):
                penalty = 0
        if penalty > 0:
            child = db.execute(
                "SELECT points FROM users WHERE id = ?", (sub["child_id"],)
            ).fetchone()
            new_points = max(0, child["points"] - penalty)
            db.execute(
                "UPDATE users SET points = ? WHERE id = ?",
                (new_points, sub["child_id"]),
            )
        db.execute(
            "UPDATE submissions SET status='rejected', reviewed_at=? WHERE id=?",
            (now_str(), sub_id),
        )
    else:
        return jsonify({"error": "החלטה לא תקינה"}), 400

    db.commit()
    return jsonify({"ok": True})


# ---------- API: בקשות לפרס ----------

@app.route("/api/reward-requests", methods=["POST"])
@login_required
def create_reward_request():
    user = current_user()
    if user["role"] != "child":
        return jsonify({"error": "רק ילד יכול לבקש פרס"}), 403
    data = request.get_json(force=True)
    reward_id = data.get("reward_id")
    db = get_db()
    reward = db.execute(
        "SELECT * FROM rewards WHERE id = ? AND family_id = ?",
        (reward_id, user["family_id"]),
    ).fetchone()
    if reward is None:
        return jsonify({"error": "הפרס לא נמצא"}), 404
    if user["points"] < reward["cost_points"]:
        return jsonify({"error": "אין לך מספיק נקודות עדיין 😉"}), 400

    db.execute(
        """INSERT INTO reward_requests
           (reward_id, child_id, reward_title, cost_points, created_at, family_id)
           VALUES (?,?,?,?,?,?)""",
        (reward["id"], user["id"], reward["title"],
         reward["cost_points"], now_str(), user["family_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/reward-requests", methods=["GET"])
@login_required
def list_reward_requests():
    user = current_user()
    db = get_db()
    if user["role"] == "parent":
        status = request.args.get("status", "pending")
        rows = db.execute(
            """SELECT r.*, u.name AS child_name, u.emoji AS child_emoji, u.points AS child_points
               FROM reward_requests r JOIN users u ON u.id = r.child_id
               WHERE r.status = ? AND r.family_id = ?
               ORDER BY r.created_at DESC""",
            (status, user["family_id"]),
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT r.*, u.name AS child_name, u.emoji AS child_emoji, u.points AS child_points
               FROM reward_requests r JOIN users u ON u.id = r.child_id
               WHERE r.child_id = ?
               ORDER BY r.created_at DESC""",
            (user["id"],),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/reward-requests/<int:req_id>/review", methods=["POST"])
@parent_required
def review_reward_request(req_id):
    data = request.get_json(force=True)
    decision = data.get("decision")
    db = get_db()
    user = current_user()
    req = db.execute(
        "SELECT * FROM reward_requests WHERE id = ? AND family_id = ?",
        (req_id, user["family_id"]),
    ).fetchone()
    if req is None:
        return jsonify({"error": "הבקשה לא נמצאה"}), 404
    if req["status"] != "pending":
        return jsonify({"error": "הבקשה כבר טופלה"}), 400

    if decision == "approve":
        child = db.execute("SELECT * FROM users WHERE id = ?", (req["child_id"],)).fetchone()
        if child["points"] < req["cost_points"]:
            return jsonify({"error": "לילד אין מספיק נקודות כרגע"}), 400
        # מורידים את הנקודות כדי שלא ישתמשו בהן שוב
        db.execute(
            "UPDATE users SET points = points - ? WHERE id = ?",
            (req["cost_points"], req["child_id"]),
        )
        db.execute(
            "UPDATE reward_requests SET status='approved', reviewed_at=? WHERE id=?",
            (now_str(), req_id),
        )
    elif decision == "reject":
        db.execute(
            "UPDATE reward_requests SET status='rejected', reviewed_at=? WHERE id=?",
            (now_str(), req_id),
        )
    else:
        return jsonify({"error": "החלטה לא תקינה"}), 400

    db.commit()
    return jsonify({"ok": True})


# ---------- API: בקשות מטלה (הילד מציע מטלה חדשה) ----------

@app.route("/api/chore-requests", methods=["POST"])
@login_required
def create_chore_request():
    user = current_user()
    if user["role"] != "child":
        return jsonify({"error": "רק ילד יכול לבקש מטלה"}), 403
    data = request.get_json(force=True)
    # הילד רק מבקש מטלה חדשה. אפשר להוסיף הערה (מה בא לו לעשות) – לא חובה.
    title = (data.get("title") or "").strip() or "מטלה חדשה"
    pts = 0
    raw = data.get("suggested_points")
    if raw not in (None, ""):
        try:
            pts = int(raw)
        except (TypeError, ValueError):
            return jsonify({"error": "מספר נקודות לא תקין"}), 400
    db = get_db()
    db.execute(
        """INSERT INTO chore_requests (child_id, title, suggested_points, created_at, family_id)
           VALUES (?,?,?,?,?)""",
        (user["id"], title, pts, now_str(), user["family_id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/chore-requests", methods=["GET"])
@login_required
def list_chore_requests():
    user = current_user()
    db = get_db()
    if user["role"] == "parent":
        status = request.args.get("status", "pending")
        rows = db.execute(
            """SELECT c.*, u.name AS child_name, u.emoji AS child_emoji
               FROM chore_requests c JOIN users u ON u.id = c.child_id
               WHERE c.status = ? AND c.family_id = ? ORDER BY c.created_at DESC""",
            (status, user["family_id"]),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM chore_requests WHERE child_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/chore-requests/<int:req_id>/review", methods=["POST"])
@parent_required
def review_chore_request(req_id):
    data = request.get_json(force=True)
    decision = data.get("decision")
    db = get_db()
    user = current_user()
    req = db.execute(
        "SELECT * FROM chore_requests WHERE id = ? AND family_id = ?",
        (req_id, user["family_id"]),
    ).fetchone()
    if req is None:
        return jsonify({"error": "הבקשה לא נמצאה"}), 404
    if req["status"] != "pending":
        return jsonify({"error": "הבקשה כבר טופלה"}), 400

    if decision == "approve":
        # ההורה מוסיף מטלה חדשה בתגובה לבקשה: קובע שם וכמות נקודות
        title = (data.get("title") or req["title"] or "מטלה חדשה").strip()
        points = None
        if data.get("points") not in (None, ""):
            try:
                points = int(data.get("points"))
            except (TypeError, ValueError):
                return jsonify({"error": "מספר נקודות לא תקין"}), 400
        elif req["suggested_points"] and req["suggested_points"] > 0:
            points = req["suggested_points"]
        if not points or points <= 0:
            return jsonify({"error": "צריך לקבוע כמה נקודות שווה המטלה"}), 400
        # המטלה החדשה נכנסת לרשימת המטלות של המשפחה
        db.execute(
            "INSERT INTO chores (title, points, emoji, family_id) VALUES (?,?,?,?)",
            (title, points, "🌟", user["family_id"]),
        )
        db.execute(
            "UPDATE chore_requests SET status='approved', reviewed_at=? WHERE id=?",
            (now_str(), req_id),
        )
    elif decision == "reject":
        db.execute(
            "UPDATE chore_requests SET status='rejected', reviewed_at=? WHERE id=?",
            (now_str(), req_id),
        )
    else:
        return jsonify({"error": "החלטה לא תקינה"}), 400

    db.commit()
    return jsonify({"ok": True})


# ---------- API: סטטיסטיקה, רמות והישגים (לילד) ----------

@app.route("/api/stats", methods=["GET"])
@login_required
def stats():
    user = current_user()
    if user["role"] != "child":
        return jsonify({"error": "רק לילדים יש רמות 🙂"}), 403
    db = get_db()
    chores_done = db.execute(
        "SELECT COUNT(*) c FROM submissions WHERE child_id=? AND status='approved'",
        (user["id"],),
    ).fetchone()["c"]
    rewards_got = db.execute(
        "SELECT COUNT(*) c FROM reward_requests WHERE child_id=? AND status='approved'",
        (user["id"],),
    ).fetchone()["c"]
    streak = compute_streak(db, user["id"])
    total = user["total_earned"]

    achievements = [
        {"emoji": "👣", "name": "צעד ראשון",      "done": chores_done >= 1},
        {"emoji": "💪", "name": "5 מטלות",        "done": chores_done >= 5},
        {"emoji": "🌟", "name": "20 מטלות",       "done": chores_done >= 20},
        {"emoji": "🔥", "name": "3 ימים ברצף",    "done": streak >= 3},
        {"emoji": "🏆", "name": "500 נק' בחיים",  "done": total >= 500},
        {"emoji": "🛍️", "name": "קנייה ראשונה",   "done": rewards_got >= 1},
    ]
    return jsonify({
        "points": user["points"],
        "total_earned": total,
        "level": level_info(total),
        "streak": streak,
        "chores_done": chores_done,
        "rewards_got": rewards_got,
        "achievements": achievements,
    })


@app.route("/api/leaderboard", methods=["GET"])
@login_required
def leaderboard():
    user = current_user()
    rows = get_db().execute(
        """SELECT name, emoji, points, total_earned FROM users
           WHERE role='child' AND family_id = ?
           ORDER BY total_earned DESC, points DESC""",
        (user["family_id"],),
    ).fetchall()
    out = []
    for r in rows:
        li = level_info(r["total_earned"])
        out.append({
            "name": r["name"], "emoji": r["emoji"],
            "points": r["points"], "total_earned": r["total_earned"],
            "level": li["level"], "level_emoji": li["emoji"],
        })
    return jsonify(out)


# ---------- API: כלים להורה לניהול ילדים ----------

@app.route("/api/children/<int:kid_id>/bonus", methods=["POST"])
@parent_required
def kid_bonus(kid_id):
    """הורה מוסיף (או מוריד) נקודות בונוס לילד."""
    data = request.get_json(force=True)
    try:
        pts = int(data.get("points"))
    except (TypeError, ValueError):
        return jsonify({"error": "מספר נקודות לא תקין"}), 400
    if pts == 0:
        return jsonify({"error": "צריך מספר שונה מאפס"}), 400
    user = current_user()
    db = get_db()
    kid = db.execute(
        "SELECT * FROM users WHERE id=? AND role='child' AND family_id=?",
        (kid_id, user["family_id"]),
    ).fetchone()
    if kid is None:
        return jsonify({"error": "הילד לא נמצא"}), 404
    new_points = max(0, kid["points"] + pts)
    if pts > 0:
        # בונוס חיובי נחשב גם לנקודות-החיים (רמה)
        db.execute(
            "UPDATE users SET points=?, total_earned = total_earned + ? WHERE id=?",
            (new_points, pts, kid_id),
        )
    else:
        db.execute("UPDATE users SET points=? WHERE id=?", (new_points, kid_id))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/children/<int:kid_id>", methods=["DELETE"])
@parent_required
def delete_kid(kid_id):
    user = current_user()
    db = get_db()
    # מאמתים שהילד שייך למשפחה של ההורה
    kid = db.execute(
        "SELECT id FROM users WHERE id=? AND role='child' AND family_id=?",
        (kid_id, user["family_id"]),
    ).fetchone()
    if kid is None:
        return jsonify({"error": "הילד לא נמצא"}), 404
    db.execute("DELETE FROM submissions WHERE child_id=?", (kid_id,))
    db.execute("DELETE FROM reward_requests WHERE child_id=?", (kid_id,))
    db.execute("DELETE FROM chore_requests WHERE child_id=?", (kid_id,))
    db.execute("DELETE FROM users WHERE id=?", (kid_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- הפעלה ----------

# יוצרים את מסד הנתונים בעת טעינת המודול — כך זה עובד גם עם שרת ייצור
# (gunicorn) שלא מריץ את הבלוק __main__ למטה.
# עוטפים ב-try כדי שהאפליקציה תמיד תעלה, גם אם המסד זמנית לא זמין.
try:
    init_db()
except Exception as _e:
    print(">> init_db נכשל (האפליקציה תעלה בכל זאת):", _e)

if __name__ == "__main__":
    # הרצה מקומית לפיתוח בלבד
    print("\n  האפליקציה רצה! פתחו בדפדפן:  http://localhost:5000\n")
    port = int(os.environ.get("PORT", 5000))
    # host='0.0.0.0' מאפשר להיכנס גם מהטלפון ברשת הביתית
    app.run(host="0.0.0.0", port=port, debug=True)
