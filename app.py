from flask import Flask, request, jsonify, send_from_directory, session
from flask_mail import Mail, Message as MailMessage
from flask_migrate import Migrate
from dotenv import load_dotenv
import os
import re
from datetime import date, time, datetime, timezone, timedelta

load_dotenv()

from models import db, Service, Appointment, BlockedDay, Message, AppointmentStatus
from scheduling import get_available_slots, check_slot_available

# ── App setup ──────────────────────────────────────────────
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-in-production")

# ── Database ───────────────────────────────────────────────
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"postgresql://{os.getenv('DB_USER','creta_user')}"
    f":{os.getenv('DB_PASSWORD','creta_pass')}"
    f"@{os.getenv('DB_HOST','127.0.0.1')}"
    f":{os.getenv('DB_PORT','5433')}"
    f"/{os.getenv('DB_NAME','creta')}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)

# ── Email ──────────────────────────────────────────────────
app.config.update(
    MAIL_SERVER         = os.getenv("MAIL_SERVER",  "smtp.gmail.com"),
    MAIL_PORT           = int(os.getenv("MAIL_PORT", 587)),
    MAIL_USE_TLS        = os.getenv("MAIL_USE_TLS", "true").lower() == "true",
    MAIL_USERNAME       = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD       = os.getenv("MAIL_PASSWORD"),
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_USERNAME"),
)
mail = Mail(app)
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", app.config["MAIL_USERNAME"])

# ── Admin PIN ──────────────────────────────────────────────
ADMIN_PIN       = os.getenv("ADMIN_PIN", "0000")
ADMIN_ROUTE_KEY = os.getenv("ADMIN_ROUTE_KEY", "gestion")


# ── Validators ─────────────────────────────────────────────
def validate_phone(phone):
    return bool(re.match(r"^\+?[\d\s\-]{7,15}$", phone.strip()))

def validate_email_fmt(email):
    return bool(re.match(r"^[^@]+@[^@]+\.[^@]+$", email.strip()))


# ── Email helpers ──────────────────────────────────────────
def send_appointment_emails(appt, action="new"):
    subjects = {
        "new":       (f"[CRETA] Nuevo turno #{appt.id} — {appt.service.name}",
                      "Tu turno en CRETA — Solicitud recibida"),
        "confirmed": (f"[CRETA] Turno #{appt.id} CONFIRMADO",
                      "Tu turno en CRETA fue confirmado"),
        "cancelled": (f"[CRETA] Turno #{appt.id} cancelado",
                      "Tu turno en CRETA fue cancelado"),
    }
    admin_subj, client_subj = subjects.get(action, subjects["new"])
    status_label = {"new": "Pendiente", "confirmed": "Confirmado", "cancelled": "Cancelado"}

    admin_body = (
        f"Turno #{appt.id} — {status_label.get(action,'')}\n\n"
        f"Servicio:  {appt.service.name} ({appt.service.duration_minutes} min)\n"
        f"Fecha:     {appt.appt_date.strftime('%d/%m/%Y')}\n"
        f"Horario:   {appt.start_time.strftime('%H:%M')} – {appt.end_time.strftime('%H:%M')}\n"
        f"Cliente:   {appt.client_name}\n"
        f"Teléfono:  {appt.client_phone}\n"
        f"Email:     {appt.client_email or '—'}\n"
        f"Notas:     {appt.notes or '—'}\n"
    )
    try:
        mail.send(MailMessage(subject=admin_subj, recipients=[ADMIN_EMAIL], body=admin_body))
    except Exception as e:
        app.logger.error(f"Email admin error: {e}")

    if appt.client_email:
        action_text = {
            "new":       "Recibimos tu solicitud. Te contactaremos para confirmar.",
            "confirmed": "Tu turno fue confirmado. ¡Te esperamos!",
            "cancelled": "Tu turno fue cancelado. Podés reservar otro cuando quieras.",
        }.get(action, "")
        client_body = (
            f"Hola {appt.client_name},\n\n{action_text}\n\n"
            f"Servicio:  {appt.service.name}\n"
            f"Fecha:     {appt.appt_date.strftime('%d/%m/%Y')}\n"
            f"Horario:   {appt.start_time.strftime('%H:%M')} – {appt.end_time.strftime('%H:%M')}\n\n"
            f"Consultas: 092 201 978 | @creta.uy\nEquipo CRETA\n"
        )
        try:
            mail.send(MailMessage(subject=client_subj, recipients=[appt.client_email], body=client_body))
        except Exception as e:
            app.logger.error(f"Email client error: {e}")


# ── Seed services ──────────────────────────────────────────
def seed_services():
    if Service.query.count() > 0:
        return
    services = [
        Service(name="Cosmetología Lifting Facial",         description="Estimula el colágeno y reafirma la piel.",          duration_minutes=60, icon="✦"),
        Service(name="Electrofitness Pasivo",                description="Tonifica y modela mediante estimulación muscular.", duration_minutes=45, icon="⚡"),
        Service(name="Depilación Láser",                     description="Eliminación definitiva del vello con láser.",       duration_minutes=30, icon="◈"),
        Service(name="Eliminación de Adiposidad Localizada", description="Ultrasonido focalizado no invasivo.",               duration_minutes=50, icon="◉"),
        Service(name="Eliminación de Flacidez",              description="Radiofrecuencia que restaura la firmeza.",          duration_minutes=60, icon="◇"),
    ]
    db.session.add_all(services)
    db.session.commit()
    app.logger.info("Servicios iniciales insertados.")


# ── Public routes ──────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("templates", "index.html")

@app.route("/api/services")
def get_services():
    services = Service.query.filter_by(active=True).all()
    return jsonify({"services": [s.to_dict() for s in services]})

@app.route("/api/availability")
def availability():
    service_id = request.args.get("service_id", type=int)
    date_str   = request.args.get("date", "")
    if not service_id or not date_str:
        return jsonify({"error": "Parámetros requeridos: service_id, date"}), 400
    service = db.session.get(Service, service_id)
    if not service:
        return jsonify({"error": "Servicio no encontrado."}), 404
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        return jsonify({"error": "Fecha inválida. Usá YYYY-MM-DD."}), 400
    slots = get_available_slots(d, service.duration_minutes)
    return jsonify({
        "date":             d.isoformat(),
        "service":          service.name,
        "duration_minutes": service.duration_minutes,
        "available_slots":  slots,
    })

@app.route("/api/appointment", methods=["POST"])
def book_appointment():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400

    required = ["name", "phone", "service_id", "date", "time"]
    missing  = [f for f in required if not str(data.get(f, "")).strip()]
    if missing:
        return jsonify({"error": f"Campos requeridos: {', '.join(missing)}"}), 422

    if not validate_phone(str(data["phone"])):
        return jsonify({"error": "Teléfono inválido."}), 422
    if data.get("email") and not validate_email_fmt(data["email"]):
        return jsonify({"error": "Email inválido."}), 422

    service = db.session.get(Service, int(data["service_id"]))
    if not service or not service.active:
        return jsonify({"error": "Servicio no encontrado."}), 404

    try:
        appt_date = date.fromisoformat(str(data["date"]))
    except ValueError:
        return jsonify({"error": "Fecha inválida."}), 422

    ok, reason = check_slot_available(appt_date, str(data["time"]), service.duration_minutes)
    if not ok:
        return jsonify({"error": reason}), 409

    h, m   = map(int, str(data["time"]).split(":"))
    start  = time(h, m)
    end_dt = datetime.combine(appt_date, start) + timedelta(minutes=service.duration_minutes)
    end    = end_dt.time()

    appt = Appointment(
        service_id   = service.id,
        client_name  = data["name"].strip(),
        client_phone = str(data["phone"]).strip(),
        client_email = data.get("email", "").strip() or None,
        appt_date    = appt_date,
        start_time   = start,
        end_time     = end,
        notes        = data.get("notes", "").strip() or None,
        status       = AppointmentStatus.PENDING,
    )
    db.session.add(appt)
    db.session.commit()
    send_appointment_emails(appt, action="new")

    return jsonify({
        "success":        True,
        "message":        "¡Turno solicitado! Te contactaremos a la brevedad para confirmar.",
        "appointment_id": appt.id,
        "date":           appt.appt_date.isoformat(),
        "time":           appt.start_time.strftime("%H:%M"),
    }), 201

@app.route("/api/contact", methods=["POST"])
def contact():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Datos inválidos."}), 400
    required = ["name", "message"]
    missing  = [f for f in required if not str(data.get(f, "")).strip()]
    if missing:
        return jsonify({"error": f"Campos requeridos: {', '.join(missing)}"}), 422
    if data.get("email") and not validate_email_fmt(data["email"]):
        return jsonify({"error": "Email inválido."}), 422

    msg = Message(
        name    = data["name"].strip(),
        email   = data.get("email", "").strip() or None,
        message = data["message"].strip(),
    )
    db.session.add(msg)
    db.session.commit()
    try:
        mail.send(MailMessage(
            subject    = f"[CRETA] Mensaje de {msg.name}",
            recipients = [ADMIN_EMAIL],
            body       = f"Nombre: {msg.name}\nEmail: {msg.email or '—'}\n\n{msg.message}",
        ))
    except Exception as e:
        app.logger.error(f"Email contacto error: {e}")

    return jsonify({"success": True, "message": "Mensaje recibido. Te responderemos pronto."}), 201


# ── Admin auth ─────────────────────────────────────────────

@app.route(f"/{ADMIN_ROUTE_KEY}")
def admin_gate():
    return send_from_directory("templates", "admin.html")

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    if data.get("pin") == ADMIN_PIN:
        session["admin"] = True
        return jsonify({"success": True})
    return jsonify({"error": "PIN incorrecto."}), 401

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin", None)
    return jsonify({"success": True})

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"error": "No autorizado."}), 401
        return f(*args, **kwargs)
    return decorated


# ── Admin API ──────────────────────────────────────────────

@app.route("/api/admin/check-session")
@admin_required
def check_session():
    """Verifica si la sesión admin sigue activa. Usado al cargar el panel."""
    return jsonify({"authenticated": True})


@app.route("/api/admin/stats")
@admin_required
def admin_stats():
    """Estadísticas rápidas para el header del panel."""
    today           = date.today()
    pending_today   = Appointment.query.filter(Appointment.appt_date == today,   Appointment.status == AppointmentStatus.PENDING).count()
    confirmed_today = Appointment.query.filter(Appointment.appt_date == today,   Appointment.status == AppointmentStatus.CONFIRMED).count()
    pending_all     = Appointment.query.filter(Appointment.status == AppointmentStatus.PENDING).count()
    total_today     = Appointment.query.filter(Appointment.appt_date == today).count()
    return jsonify({
        "today":           total_today,
        "pending_today":   pending_today,
        "confirmed_today": confirmed_today,
        "pending_all":     pending_all,
    })


@app.route("/api/admin/appointments")
@admin_required
def admin_appointments():
    view      = request.args.get("view", "all")
    date_str  = request.args.get("date", "")
    status_f  = request.args.get("status", "")
    query     = Appointment.query.order_by(Appointment.appt_date, Appointment.start_time)

    if view == "day" and date_str:
        try:
            d = date.fromisoformat(date_str)
            query = query.filter(Appointment.appt_date == d)
        except ValueError:
            return jsonify({"error": "Fecha inválida."}), 400
    elif view == "week" and date_str:
        try:
            d          = date.fromisoformat(date_str)
            week_start = d - timedelta(days=d.weekday())
            week_end   = week_start + timedelta(days=6)
            query = query.filter(
                Appointment.appt_date >= week_start,
                Appointment.appt_date <= week_end,
            )
        except ValueError:
            return jsonify({"error": "Fecha inválida."}), 400

    if status_f:
        try:
            query = query.filter(Appointment.status == AppointmentStatus(status_f))
        except ValueError:
            pass

    appts = query.all()
    return jsonify({"appointments": [a.to_dict() for a in appts], "total": len(appts)})

@app.route("/api/admin/appointments/<int:appt_id>/confirm", methods=["POST"])
@admin_required
def confirm_appointment(appt_id):
    appt = db.session.get(Appointment, appt_id)
    if not appt:
        return jsonify({"error": "Turno no encontrado."}), 404
    if appt.status == AppointmentStatus.CANCELLED:
        return jsonify({"error": "No se puede confirmar un turno cancelado."}), 409
    appt.status = AppointmentStatus.CONFIRMED
    db.session.commit()
    send_appointment_emails(appt, action="confirmed")
    return jsonify({"success": True, "appointment": appt.to_dict()})

@app.route("/api/admin/appointments/<int:appt_id>/cancel", methods=["POST"])
@admin_required
def cancel_appointment(appt_id):
    appt = db.session.get(Appointment, appt_id)
    if not appt:
        return jsonify({"error": "Turno no encontrado."}), 404
    appt.status = AppointmentStatus.CANCELLED
    db.session.commit()
    send_appointment_emails(appt, action="cancelled")
    return jsonify({"success": True, "appointment": appt.to_dict()})

@app.route("/api/admin/blocked-days")
@admin_required
def get_blocked_days():
    days = BlockedDay.query.order_by(BlockedDay.blocked_date).all()
    return jsonify({"blocked_days": [d.to_dict() for d in days]})

@app.route("/api/admin/blocked-days", methods=["POST"])
@admin_required
def block_day():
    data = request.get_json(silent=True) or {}
    try:
        d = date.fromisoformat(data.get("date", ""))
    except ValueError:
        return jsonify({"error": "Fecha inválida."}), 400
    if BlockedDay.query.filter_by(blocked_date=d).first():
        return jsonify({"error": "Ese día ya está bloqueado."}), 409
    blocked = BlockedDay(blocked_date=d, reason=data.get("reason", "").strip() or None)
    db.session.add(blocked)
    db.session.commit()
    return jsonify({"success": True, "blocked_day": blocked.to_dict()}), 201

@app.route("/api/admin/blocked-days/<int:day_id>", methods=["DELETE"])
@admin_required
def unblock_day(day_id):
    blocked = db.session.get(BlockedDay, day_id)
    if not blocked:
        return jsonify({"error": "No encontrado."}), 404
    db.session.delete(blocked)
    db.session.commit()
    return jsonify({"success": True})


# ── Error handlers ─────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Recurso no encontrado."}), 404

@app.errorhandler(500)
def server_error(e):
    app.logger.error(f"500: {e}")
    return jsonify({"error": "Error interno del servidor."}), 500


# ── Entry point ────────────────────────────────────────────

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed_services()
    app.run(debug=True, port=5000)
