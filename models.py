from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, date as date_type, time as time_type
from enum import Enum as PyEnum
import sqlalchemy as sa

db = SQLAlchemy()


class AppointmentStatus(PyEnum):
    PENDING   = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class Service(db.Model):
    """
    Servicios ofrecidos. duration_minutes define cuánto dura cada turno
    y por tanto el tamaño del slot en el calendario.
    """
    __tablename__ = "services"

    id               = sa.Column(sa.Integer,     primary_key=True)
    name             = sa.Column(sa.String(120),  nullable=False)
    description      = sa.Column(sa.Text,         nullable=False, default="")
    duration_minutes = sa.Column(sa.Integer,      nullable=False, default=60)
    icon             = sa.Column(sa.String(10),   nullable=False, default="✦")
    active           = sa.Column(sa.Boolean,      nullable=False, default=True)

    appointments = db.relationship("Appointment", back_populates="service", lazy="dynamic")

    def to_dict(self):
        return {
            "id":               self.id,
            "name":             self.name,
            "description":      self.description,
            "duration_minutes": self.duration_minutes,
            "icon":             self.icon,
        }


class Appointment(db.Model):
    """
    Turno reservado. start_time + duration del servicio definen el bloque
    ocupado. No pueden solaparse dos turnos en el mismo día/hora.
    """
    __tablename__ = "appointments"

    id           = sa.Column(sa.Integer,      primary_key=True)
    service_id   = sa.Column(sa.Integer,      sa.ForeignKey("services.id"), nullable=False)
    client_name  = sa.Column(sa.String(120),  nullable=False)
    client_phone = sa.Column(sa.String(30),   nullable=False)
    client_email = sa.Column(sa.String(120),  nullable=True)
    appt_date    = sa.Column(sa.Date,         nullable=False)
    start_time   = sa.Column(sa.Time,         nullable=False)
    end_time     = sa.Column(sa.Time,         nullable=False)   # calculado al guardar
    notes        = sa.Column(sa.Text,         nullable=True)
    status       = sa.Column(
                       sa.Enum(AppointmentStatus),
                       nullable=False,
                       default=AppointmentStatus.PENDING,
                   )
    created_at   = sa.Column(sa.DateTime(timezone=True),
                             nullable=False,
                             default=lambda: datetime.now(timezone.utc))
    updated_at   = sa.Column(sa.DateTime(timezone=True),
                             nullable=False,
                             default=lambda: datetime.now(timezone.utc),
                             onupdate=lambda: datetime.now(timezone.utc))

    service = db.relationship("Service", back_populates="appointments")

    def to_dict(self):
        return {
            "id":           self.id,
            "service":      self.service.name if self.service else None,
            "service_id":   self.service_id,
            "client_name":  self.client_name,
            "client_phone": self.client_phone,
            "client_email": self.client_email,
            "date":         self.appt_date.isoformat(),
            "start_time":   self.start_time.strftime("%H:%M"),
            "end_time":     self.end_time.strftime("%H:%M"),
            "notes":        self.notes,
            "status":       self.status.value,
            "created_at":   self.created_at.isoformat(),
        }


class BlockedDay(db.Model):
    """
    Días bloqueados por el admin (feriados, vacaciones, etc.)
    No se pueden reservar turnos en estas fechas.
    """
    __tablename__ = "blocked_days"

    id         = sa.Column(sa.Integer,     primary_key=True)
    blocked_date = sa.Column(sa.Date,      nullable=False, unique=True)
    reason     = sa.Column(sa.String(200), nullable=True)
    created_at = sa.Column(sa.DateTime(timezone=True),
                           nullable=False,
                           default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":     self.id,
            "date":   self.blocked_date.isoformat(),
            "reason": self.reason,
        }


class Message(db.Model):
    """Mensajes del formulario de contacto."""
    __tablename__ = "messages"

    id         = sa.Column(sa.Integer,     primary_key=True)
    name       = sa.Column(sa.String(120), nullable=False)
    email      = sa.Column(sa.String(120), nullable=True)
    message    = sa.Column(sa.Text,        nullable=False)
    created_at = sa.Column(sa.DateTime(timezone=True),
                           nullable=False,
                           default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":         self.id,
            "name":       self.name,
            "email":      self.email,
            "message":    self.message,
            "created_at": self.created_at.isoformat(),
        }
