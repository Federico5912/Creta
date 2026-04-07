"""
scheduling.py
Lógica de disponibilidad de turnos para CRETA.

Reglas de negocio:
  - Horario: lunes a viernes, 09:00–18:00
  - 1 cabina: no pueden solaparse turnos
  - Días bloqueados por admin = sin turnos
  - Duración del slot = duration_minutes del servicio
"""
from datetime import date, time, datetime, timedelta
from models import Appointment, BlockedDay, AppointmentStatus, db

# ── Constantes de horario ───────────────────────────────────
OPEN_TIME  = time(9, 0)   # 09:00
CLOSE_TIME = time(18, 0)  # 18:00
WORK_DAYS  = {0, 1, 2, 3, 4}  # lunes=0 … viernes=4


def is_work_day(d: date) -> bool:
    return d.weekday() in WORK_DAYS


def is_blocked(d: date) -> bool:
    return db.session.query(
        BlockedDay.query.filter_by(blocked_date=d).exists()
    ).scalar()


def generate_slots(duration_minutes: int) -> list[time]:
    """
    Genera todas las horas de inicio posibles dentro del horario laboral
    para un servicio de `duration_minutes` de duración.

    Ejemplo con 60 min: [09:00, 10:00, 11:00, …, 17:00]
    Ejemplo con 45 min: [09:00, 09:45, 10:30, …, 17:15]
    """
    slots = []
    current = datetime.combine(date.today(), OPEN_TIME)
    end     = datetime.combine(date.today(), CLOSE_TIME)
    delta   = timedelta(minutes=duration_minutes)

    while current + delta <= end:
        slots.append(current.time())
        current += delta

    return slots


def get_booked_slots(d: date) -> list[tuple[time, time]]:
    """
    Retorna lista de (start_time, end_time) de turnos activos
    (pending o confirmed) en la fecha dada.
    """
    appointments = Appointment.query.filter(
        Appointment.appt_date == d,
        Appointment.status.in_([
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
        ])
    ).all()
    return [(a.start_time, a.end_time) for a in appointments]


def slot_is_available(
    slot_start: time,
    slot_end: time,
    booked: list[tuple[time, time]],
) -> bool:
    """
    Un slot está disponible si no se solapa con ningún turno existente.
    Solapamiento: existing_start < slot_end  AND  existing_end > slot_start
    """
    for (b_start, b_end) in booked:
        if b_start < slot_end and b_end > slot_start:
            return False
    return True


def get_available_slots(d: date, duration_minutes: int) -> list[str]:
    """
    Devuelve lista de horarios disponibles ("HH:MM") para una fecha y
    duración de servicio dadas. Retorna [] si el día no es hábil.
    """
    if not is_work_day(d):
        return []
    if is_blocked(d):
        return []
    if d < date.today():
        return []

    booked   = get_booked_slots(d)
    all_slots = generate_slots(duration_minutes)
    delta     = timedelta(minutes=duration_minutes)

    available = []
    for slot_start in all_slots:
        slot_end = (
            datetime.combine(date.today(), slot_start) + delta
        ).time()
        if slot_is_available(slot_start, slot_end, booked):
            available.append(slot_start.strftime("%H:%M"))

    return available


def check_slot_available(
    d: date,
    start_str: str,
    duration_minutes: int,
) -> tuple[bool, str]:
    """
    Verifica si un slot específico (fecha + hora inicio) sigue disponible.
    Retorna (True, "") o (False, motivo).
    """
    if not is_work_day(d):
        return False, "El día seleccionado no es día hábil."
    if is_blocked(d):
        return False, "El día seleccionado no está disponible."
    if d < date.today():
        return False, "No se pueden reservar turnos en fechas pasadas."

    try:
        h, m = map(int, start_str.split(":"))
        slot_start = time(h, m)
    except (ValueError, AttributeError):
        return False, "Formato de hora inválido."

    slot_end = (
        datetime.combine(date.today(), slot_start)
        + timedelta(minutes=duration_minutes)
    ).time()

    if slot_start < OPEN_TIME or slot_end > CLOSE_TIME:
        return False, "El horario está fuera del rango de atención."

    booked = get_booked_slots(d)
    if not slot_is_available(slot_start, slot_end, booked):
        return False, "El horario seleccionado ya no está disponible."

    return True, ""
