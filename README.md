# Altech CRM

CRM para gestión de ventas de iPhones — Altech Store, Bahía Blanca.

## Stack
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL
- **Frontend:** HTML + CSS + JS vanilla (sin dependencias)

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu configuración

# 3. Crear base de datos PostgreSQL
createdb altech_crm

# 4. Inicializar schema y usuario admin
npm run db:setup

# 5. Iniciar servidor
npm start
# o en desarrollo:
npm run dev
```

Accedé a: **http://localhost:3000**

## Estructura del proyecto

```
altech-crm/
├── server.js              # Servidor principal Express
├── db/
│   ├── connection.js      # Pool de conexión PostgreSQL
│   ├── schema.sql         # Schema de la base de datos
│   └── setup.js           # Script de inicialización
├── routes/
│   ├── dashboard.js       # KPIs y estadísticas
│   ├── contacts.js        # CRUD de contactos/leads
│   ├── conversations.js   # Pipeline y conversaciones
│   ├── appointments.js    # Turnos y citas
│   └── sales.js           # Ventas y canjes
└── public/
    ├── index.html         # SPA principal
    ├── css/style.css      # Estilos
    └── js/app.js          # Lógica frontend
```

## Variables de entorno (.env)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `SESSION_SECRET` | Secreto para sesiones (cambialo!) |
| `WEBHOOK_API_KEY` | API key para webhooks de n8n |
| `ADMIN_EMAIL` | Email del usuario admin inicial |
| `ADMIN_PASSWORD` | Password del usuario admin inicial |
| `PORT` | Puerto del servidor (default: 3000) |

## Integración con n8n

El CRM expone dos endpoints públicos para que n8n los llame:

### Registrar lead nuevo
```
POST /webhook/lead
Headers: x-api-key: TU_API_KEY

Body:
{
  "name": "Roman García",
  "phone": "+5492914123456",
  "whatsapp_id": "5492914123456@s.whatsapp.net",
  "product_interest": "iPhone 15 Pro",
  "is_first_iphone": false,
  "current_device": "iPhone 12 Pro",
  "source": "whatsapp"
}
```

### Actualizar etapa del pipeline
```
POST /webhook/stage
Headers: x-api-key: TU_API_KEY

Body:
{
  "phone": "+5492914123456",
  "stage": "turno_agendado",
  "agent_notes": "Interesado en 15 Pro, tiene 14 para canjear"
}
```

## Etapas del pipeline

| Etapa | Descripción |
|---|---|
| `nuevo` | Lead recién ingresado |
| `contactado` | Se hizo contacto inicial |
| `interesado` | Mostró interés concreto |
| `propuesta` | Se envió propuesta/precio |
| `turno_agendado` | Tiene turno en el local |
| `ganado` | Venta cerrada |
| `perdido` | No compró |

## Funcionalidades

- **Dashboard** con KPIs en tiempo real (leads del día, turnos, ventas, conversión)
- **Pipeline Kanban** para ver y gestionar el estado de cada lead
- **Contactos** con historial completo (conversaciones, turnos, ventas)
- **Turnos** con confirmación de estado y registro de seña
- **Ventas** con estadísticas y registro de canjes
- **Webhooks** para integración con n8n (el agente registra leads automáticamente)
