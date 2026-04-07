# CRETA — Estética Consciente · Sitio Web

Sitio web full-stack para **CRETA Estética Consciente**, clínica de estética en Uruguay.

## Stack

| Capa       | Tecnología                    |
|------------|-------------------------------|
| Backend    | Python · Flask                |
| Frontend   | HTML5 · CSS3 · Vanilla JS     |
| Estilos    | CSS custom properties, sin frameworks |
| Fuentes    | Cormorant Garamond + Jost (Google Fonts) |

---

## Estructura del proyecto

```
creta/
├── app.py              # Servidor Flask + API REST
├── requirements.txt    # Dependencias Python
├── README.md
├── templates/
│   └── index.html      # Página principal (SPA)
└── static/
    ├── css/
    │   └── style.css   # Estilos completos
    └── js/
        └── main.js     # Lógica frontend
```

---

## Instalación y uso

### 1. Crear entorno virtual

```bash
python -m venv venv
source venv/bin/activate        # Linux / macOS
venv\Scripts\activate           # Windows
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 3. Ejecutar en desarrollo

```bash
python app.py
# → http://localhost:5000
```

### 4. Producción (con Gunicorn)

```bash
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

---

## API Endpoints

### `GET /api/services`
Devuelve la lista de servicios disponibles.

**Respuesta:**
```json
{
  "services": [
    {
      "id": 1,
      "name": "Cosmetología Lifting Facial",
      "desc": "...",
      "duration": "60 min",
      "icon": "✦"
    }
  ]
}
```

---

### `POST /api/appointment`
Registra una solicitud de turno.

**Body (JSON):**
```json
{
  "name":    "María García",
  "phone":   "092 123 456",
  "email":   "maria@email.com",    
  "service": "Depilación Láser",
  "date":    "2026-04-15",
  "notes":   "Primera consulta"    
}
```
Campos marcados con * son requeridos: `name`, `phone`, `service`, `date`.

**Respuesta 201:**
```json
{
  "success": true,
  "message": "¡Turno solicitado! Te contactaremos a la brevedad para confirmar.",
  "appointment_id": 1
}
```

---

### `POST /api/contact`
Recibe un mensaje de contacto.

**Body (JSON):**
```json
{
  "name":    "Juan Pérez",
  "email":   "juan@email.com",
  "message": "Quiero más información sobre depilación láser."
}
```

**Respuesta 201:**
```json
{
  "success": true,
  "message": "Mensaje recibido. Te responderemos pronto."
}
```

---

### `GET /api/appointments` *(admin)*
Lista todos los turnos registrados. En producción, proteger con autenticación.

---

## Próximos pasos recomendados

- [ ] Conectar base de datos (SQLite / PostgreSQL con SQLAlchemy)
- [ ] Implementar envío de emails (Flask-Mail / SendGrid)
- [ ] Agregar autenticación para el panel admin
- [ ] Agregar panel admin para gestionar turnos
- [ ] Configurar HTTPS en producción
- [ ] Integrar WhatsApp Business API para confirmaciones automáticas

---

## Contacto del negocio

- **Teléfono:** 092 201 978
- **Instagram:** [@creta.uy](https://instagram.com/creta.uy)
- **Facebook:** [creta.uy](https://facebook.com/creta.uy)
