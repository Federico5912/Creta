# Este sitio no es oficial y fue inspirado en una empresa real

# CRETA

Sitio web full-stack para **CRETA Estética Consciente**, con landing pública, solicitud de turnos, formulario de contacto y panel de administración para gestionar agenda, confirmaciones y días bloqueados.

## Qué incluye

- Landing page responsive
- Listado dinámico de servicios
- Solicitud de turnos con disponibilidad por fecha y servicio
- Prevención de solapamientos
- Formulario de contacto
- Panel admin con acceso por PIN
- Confirmación y cancelación de turnos
- Gestión de días bloqueados
- Envío de emails automáticos
- PostgreSQL con Docker para desarrollo
- Migraciones con Flask-Migrate
- Rate limiting básico para endpoints sensibles
- Logging a archivo en entornos no debug

---

## Stack

### Backend
- Python 3.11+
- Flask
- Flask-SQLAlchemy
- Flask-Migrate
- Flask-Mail
- Flask-Limiter
- PostgreSQL

### Frontend
- HTML
- CSS
- JavaScript vanilla

### Infraestructura local
- Docker
- Docker Compose

---

## Estructura del proyecto

```text
Creta/
├── app.py
├── models.py
├── scheduling.py
├── docker-compose.yml
├── requirements.txt
├── README.md
├── static/
│   ├── css/
│   └── js/
└── templates/
    ├── index.html
    └── admin.html
