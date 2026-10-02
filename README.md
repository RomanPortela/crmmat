# Altech CRM

Sistema de gestión integral para compra, venta y canje de iPhones.

## Stack
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL
- **Frontend:** HTML + CSS + JS vanilla (sin frameworks)
- **Gráficos:** Chart.js

## Instalación rápida

```bash
npm install
cp .env.example .env    # completar valores
npm start               # crea el schema y usuarios automáticamente
```

Acceso: **http://localhost:3000**

Usuarios por defecto:
- `mati@altech.com.ar` → contraseña del `.env`
- `portelaroman21@gmail.com` → `admin123`

## Deploy en EasyPanel / Docker

```bash
docker-compose up -d
```

El `docker-compose.yml` levanta PostgreSQL + la app. Variables de entorno:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `SESSION_SECRET` | Secreto de sesiones |
| `WEBHOOK_API_KEY` | API key para webhooks de n8n |
| `ADMIN_EMAIL` | Email del admin inicial |
| `ADMIN_PASSWORD` | Contraseña del admin inicial |
| `PORT` | Puerto (default 3000) |

## Módulos

| Módulo | Descripción |
|---|---|
| **Dashboard** | 14 KPIs en tiempo real, pipeline, caja, cumpleaños |
| **Pipeline** | Kanban de leads con 7 etapas |
| **Contactos** | Leads con historial de conversaciones |
| **Turnos** | Agenda con confirmación y señas |
| **Ventas** | Registro con canje, cuotas y cotización |
| **Productos** | Stock con IMEI, batería, Face ID, historial completo |
| **Clientes** | Ficha completa con compras, cobros y eventos |
| **Cobros** | Múltiples medios de pago + recibo PDF |
| **Caja** | Capital pendiente / ganancia pendiente con checks |
| **Calendario** | Vista mensual de eventos |
| **Tareas** | Kanban + generación automática de recordatorios |
| **Proveedores** | Pedidos con fechas estimadas y pagos |
| **Cotizaciones** | Tabla de canje configurable desde la interfaz |
| **Automatizaciones** | Recordatorios con estados activa/desactivada/revisión |
| **Reportes** | Gráficos + exportación CSV |
| **Configuración** | Empresa, usuarios, permisos por sección |

## Lógica de Caja

Al registrar un cobro total de un producto:
1. El **costo** pasa a *Capital Pendiente*
2. La **ganancia** (precio − costo) pasa a *Ganancia Pendiente*
3. Al marcar **Capital reintegrado** → vuelve al capital disponible
4. Al marcar **Ganancia retirada** → pasa a retiradas
5. Con ambos marcados, la operación deja de afectar los contadores

## Permisos

13 secciones × 5 permisos (ver, crear, editar, eliminar, exportar).
Se administran desde Configuración → Usuarios → Permisos.
Por defecto los admins tienen todo; los agentes todo excepto eliminar.

## Cotizaciones

Todo en base de datos, sin valores hardcodeados:
- 20 modelos (iPhone 11 → 17, base/Pro/Pro Max)
- 65 rangos de precio por capacidad y batería
- Descuentos configurables (pantalla rota, sin Face ID, tapa, inCell)

Botón **"Cargar tabla inicial"** carga todos los valores de referencia.
La calculadora aplica: modelo + GB + batería + daños seleccionados.

## Integración con n8n

### Registrar lead
```
POST /webhook/lead
Headers: x-api-key: TU_API_KEY

{
  "name": "Roman García",
  "phone": "+5492914123456",
  "product_interest": "iPhone 15 Pro",
  "is_first_iphone": false,
  "current_device": "iPhone 12 Pro"
}
```

### Actualizar etapa
```
POST /webhook/stage
Headers: x-api-key: TU_API_KEY

{
  "phone": "+5492914123456",
  "stage": "turno_agendado",
  "agent_notes": "Interesado en 15 Pro"
}
```

## Estructura

```
altech-crm/
├── server.js              Servidor + auto-init de DB
├── db/
│   ├── schema.sql         26 tablas
│   ├── connection.js      Pool PostgreSQL
│   └── setup.js           Setup manual (opcional)
├── routes/                16 módulos de API
└── public/
    ├── index.html         SPA con 16 vistas
    ├── css/style.css      Estilos + responsive
    └── js/app.js          Lógica del frontend
```
