# MaissyPOS

Sistema de gestión para negocios de distribución y producción (rutas de venta,
despacho, liquidación, inventario, cartera, nómina, facturación) construido
sobre Next.js 16 (App Router) y Supabase (Postgres + Auth + Storage).

Nació para Distri Maissy SAS (distribución de arepas/lácteos por rutas) y
Arepas Maissy (producción). Ambas empresas viven en la misma base de datos,
aisladas por Row Level Security — el objetivo de largo plazo es que cualquier
negocio nuevo pueda configurarse a su medida sin tocar código.

## Arquitectura multiempresa

- Cada fila de negocio tiene `empresa_id`. El aislamiento entre empresas se
  hace con RLS en Postgres, no en la aplicación: cada política compara
  `empresa_id` contra los `empresa_ids` del JWT de la sesión (ver
  `supabase/migrations/0001_auth_empresa_claims.sql` y `0004_rls_jwt_rollout.sql`).
  Un usuario puede pertenecer a varias empresas (`usuarios.empresas`) y las
  cambia desde el selector del sidebar (`lib/empresa.js` guarda la empresa
  activa en `localStorage`).
- Cada empresa tiene uno o más **modelos de negocio** (`empresas.modelos`):
  `distribucion` (rutas, despacho, liquidación) y/o `produccion` (fórmulas,
  costeo). Un módulo del sidebar sin `modelos` es "core" y se ve siempre; uno
  con `modelos` solo aparece si la empresa activa tiene alguno de esos
  modelos activos. Ver `MODULOS` y `MODELOS_NEGOCIO` en
  [`components/Sidebar.js`](components/Sidebar.js).
- El acceso por módulo se resuelve con [`lib/permisos.js`](lib/permisos.js)
  (`puedeVerModulo`): si el usuario tiene `usuario.modulos` (override
  granular por persona) se usa eso; si no, se cae al rol (`admin`,
  `auxiliar`, `vendedor`). Un tercer eje, `requierePermiso`, gatea módulos
  puntuales por un booleano propio del usuario (ej. `puede_aprobar_inventario`
  para Ajustes de Inventario), independiente del rol.

## Módulos

**Operación diaria** — Conteo Diario, Despacho, Liquidación, Devoluciones,
Cambios, Ventas, Producción.

**Control y ajustes** — Compras, Gastos Admin, Fórmulas, Costeo, Inventario,
Ajustes de Inventario (aprobación de divergencias de conteo con segregación
de funciones y auditoría), Cartera, Imprimir Despacho, Transferencias,
Historial de Liquidaciones.

**Administración** — Maestros (productos, categorías, clientes, cuentas),
Vehículos, Vista Grupo (consolidado entre empresas), Reportes, Financiero,
Nómina, Configuración.

El **Resumen Ejecutivo** (`/ejecutivo`) es el tablero de entrada para admin:
centraliza en un "Centro de alertas" todo lo que requiere acción hoy —
ajustes de inventario pendientes, cartera vencida, rutas sin despachar,
conteo del día pendiente, descuadres de caja, transferencias sin confirmar,
documentos de vehículo por vencer — cada alerta real (`alertas_admin`) se
puede descartar una vez atendida.

## Seguridad

- Autenticación real con Supabase Auth. El hook `custom_access_token_hook`
  (`0001_auth_empresa_claims.sql`) inyecta `empresa_ids` y `rol` como claims
  del JWT en cada sesión.
- Toda tabla con `empresa_id` tiene RLS con el patrón
  `empresa_id = any (jwt_empresa_ids())` para select/insert/update (y delete
  donde aplica). No hay una capa de autorización de datos en el código de la
  app — si falta una política RLS, ese hueco es real independientemente de lo
  que filtre el frontend.
- `usuarios` y `sesiones_activas` tienen su propio patrón de RLS (cruzan
  `usuarios.empresas` contra el JWT via el helper `jsonb_a_uuids`).

## Stack técnico

- Next.js 16 (App Router) + React 19 + Tailwind CSS 4.
- Supabase: Postgres, Auth, Storage (bucket `facturas` para evidencia de
  facturación electrónica).
- `recharts` para gráficos, `jspdf`/`html2canvas` para PDFs imprimibles.

## Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # solo usado server-side en app/api/* (admin-usuarios, sesion)
WHATSAPP_ACCESS_TOKEN=           # alertas por WhatsApp (app/api/whatsapp-alerta)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ALERTA_DESTINO=
SIIGO_USERNAME=                  # integracion de solo lectura con Siigo (app/api/siigo)
SIIGO_ACCESS_KEY=
SIIGO_PARTNER_ID=
```

## Migraciones

Viven en `supabase/migrations/`, numeradas y en español, y se corren a mano
en el SQL Editor de Supabase (no hay CLI/CI de migraciones conectado). Cada
archivo explica en un comentario por qué existe. Antes de escribir una
migración nueva, revisar si la tabla que se necesita ya existe con un
esquema distinto al esperado — ha pasado más de una vez en este proyecto.

## Empezar en local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Necesitas un
`.env.local` con al menos `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` apuntando a un proyecto de Supabase con las
migraciones de `supabase/migrations/` aplicadas en orden.

```bash
npm run build   # build de produccion + chequeo de tipos/lint
npm run lint
```
