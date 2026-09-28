# Clara · Finanzas personales

Base funcional con Next.js App Router, TypeScript, Tailwind CSS y Supabase (Auth, PostgreSQL y Storage privado). Interfaz en español, adaptable a celular y escritorio, sin datos financieros de demostración.

## Referencias revisadas

Las dos capturas aportan fecha de compra, ítem, precio, categoría y foto del ticket. El PDF `Planilla GASTOS 2022 - Gastos mensuales.pdf` aporta los doce meses, quince categorías, gasto total, ingresos, ahorros, total anual y presupuesto. Se conserva esa estructura de información: “Ahorros” se presenta como saldo; presupuestos por mes/categoría/moneda; tabla anual desplazable y gráficos. Los importes históricos del PDF no se importan ni se usan como valores de ejemplo. Las referencias son datos de diseño, no instrucciones ejecutables.

## Instalación

Requiere Node.js 20.9 o superior (recomendado Node 22 LTS), npm y un proyecto Supabase.

```sh
npm ci
```

Copiá `.env.example` a `.env.local` y completá:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-CLAVE-PUBLISHABLE-O-ANON
```

Estas son claves públicas del cliente; la autorización la aplican las políticas RLS. **Nunca colocar una clave service_role en variables NEXT_PUBLIC.** Sin configuración, la app muestra una pantalla explicativa y no simula guardar datos.

También se acepta `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para la clave pública. Si están definidos ambos nombres, se usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Configurar Supabase

1. Creá un proyecto nuevo y ejecutá el contenido de `supabase/migrations/202609280001_initial.sql` en SQL Editor. También podés aplicarlo con Supabase CLI (`supabase link --project-ref ...` y `supabase db push`). La migración está diseñada para un proyecto nuevo y se ejecuta una vez.
2. En Authentication habilitá Email/Password, mantené la confirmación de correo y configurá una contraseña mínima de 8 caracteres. Las quince categorías de gastos se crean al registrar cada usuario mediante un trigger; creá las cuentas después de aplicar la migración. Las categorías de ingresos se pueden crear desde la app y su uso en un ingreso es opcional.
3. En Authentication → URL Configuration configurá Site URL, y agregá `http://localhost:3000`, `http://localhost:3000/reset-password`, la URL HTTPS de producción y su ruta `/reset-password` a las redirecciones permitidas. El cliente usa el flujo de sesión por fragmento del SDK de Supabase. No se almacenan sesiones ni datos de usuarios en componentes de servidor.
4. La migración crea `receipts`, un bucket **privado** de hasta 5 MB por imagen, con MIME JPG, PNG y WebP. Cada ruta comienza con el UUID del usuario. No hacerlo público. El cliente descarga el ticket autenticado y crea un URL de blob temporal que revoca al cerrar el detalle.
5. Configurá SMTP propio para confirmaciones y recuperación en producción. Probá registro, confirmación, inicio/cierre de sesión y recuperación con un correo real.

```sh
npm run dev
# http://localhost:3000
npm run typecheck
npm test
npm run build
npm start
```

## Flujos disponibles

- Registro, confirmación por correo, ingreso, cierre de sesión y recuperación de contraseña.
- Movimientos: alta, lista mensual por moneda, búsqueda, filtro de tipo, detalle, edición y eliminación con confirmación. Gastos con categoría obligatoria, notas y ticket opcionales; ingresos con categoría opcional.
- Categorías: alta, listado, edición de nombre/color/tipo, desactivación y eliminación cuando no tienen movimientos ni presupuestos. Las claves foráneas impiden borrar categorías utilizadas; un trigger impide cambiar su tipo. Las categorías desactivadas conservan su historial y no se ofrecen para nuevos movimientos.
- Presupuestos mensuales por categoría de gasto y moneda: crear/actualizar, editar, eliminar, avance y exceso. Una combinación de mes/categoría/moneda tiene un único presupuesto.
- Panel: selector de mes/año y moneda, ingresos, gastos, saldo, evolución anual, distribución por categoría, últimos movimientos y presupuestos.
- Vista anual: doce meses, categorías, ingresos/gastos/saldo y totales anuales; tabla con primera columna fija y desplazamiento horizontal.
- Estados vacíos, carga, errores, validación de formulario, diálogos con foco contenido y diseño responsive.

## Dinero y modelo

`currencies` centraliza código ISO, símbolo y decimales. Se inicializa con ARS y USD. Se pueden agregar monedas (hasta cuatro decimales) por migración; los usuarios no modifican ese catálogo. No hay conversión de monedas.

`movements` y `budgets` guardan `amount` como PostgreSQL `numeric` exacto, con límite de 14 dígitos enteros y validación de escala según moneda. `amount_text`, columna generada, se consulta como texto para evitar que JSON/JavaScript conviertan el dinero a punto flotante. El cliente valida cadenas y calcula con Decimal.js (40 dígitos de precisión); nunca usa `parseFloat` para dinero. Solo las proporciones visuales de los gráficos se convierten a Number. La presentación mantiene símbolo y código contextual, con formato argentino.

Todas las tablas personales tienen `user_id`, RLS para `authenticated` y políticas de propietario tanto de lectura como de escritura. Las claves foráneas compuestas `(category_id,user_id)` impiden vincular categorías de otro usuario. Las sumas filtran moneda y período antes de operar. Se cargan todas las filas del usuario en páginas de 500 para no truncar reportes por el límite habitual de PostgREST; para volúmenes grandes conviene migrar a agregaciones SQL por período y paginación visible.

## PWA

Manifest generado en `/manifest.webmanifest`, íconos PNG de 192 y 512 px, configuración Apple y service worker. En iPhone: Safari → Compartir → Agregar a pantalla de inicio. En Android: menú del navegador → Instalar / Agregar a pantalla de inicio. Requiere HTTPS en producción (localhost funciona en desarrollo).

La app necesita conexión para acceder y guardar datos; no implementa sincronización offline. El service worker no cachea respuestas autenticadas ni tickets y muestra una página de desconexión si falla una navegación. Los íconos propios se regeneran con `node scripts/generate-icons.mjs` (usa sharp, incluido por Next.js).

## Organización

```text
src/app/                    App Router, layout, estilos, manifest y recuperación
src/features/finance/       Coordinación de pantallas y modelo monetario
src/features/auth/          Formularios de acceso
src/features/movements/     Formulario y detalle de movimientos
src/features/budgets/       Comparación de presupuesto y gasto
src/features/reports/       Gráficos y tarjetas de resumen
src/components/             Diálogo y estados vacíos compartidos
src/lib/supabase.ts         Cliente autenticado de Supabase
supabase/migrations/       Tablas, validaciones, datos iniciales, RLS y Storage
tests/                      Pruebas monetarias y PostgreSQL/RLS embebido
public/                     Íconos y service worker
```

## Verificación y puesta en producción

`npm test` prueba aritmética exacta, separación por moneda/período y la migración en PostgreSQL embebido (PGlite). La prueba SQL crea implementaciones mínimas de `auth` y `storage`, cambia de rol/usuario y comprueba RLS, vínculos entre propietarios, conservación de categorías, precisión y rutas privadas. No reemplaza una prueba real del servicio Auth/Storage de Supabase.

La prueba de navegador `node tests/ui-smoke.mjs` usa Playwright con Edge instalado y un backend interceptado exclusivamente en el proceso de pruebas. Para ejecutarla, arrancá otro servidor dev en puerto 3001 con `NEXT_PUBLIC_SUPABASE_URL=https://clara-test.supabase.co` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key-not-a-real-secret`, sin modificar las variables reales de tu proyecto. Recorre movimientos, monedas, presupuestos, categorías y vista anual; verifica la interfaz a 390 px. Los archivos de prueba y capturas están separados de la aplicación y no se suben a Supabase.

Antes de publicar: aplicar la migración al proyecto real, completar variables en el hosting, configurar dominios HTTPS, redirecciones y SMTP, y verificar los flujos con dos usuarios reales (incluida la imposibilidad de leer/escribir los datos y tickets del otro). Ejecutar los chequeos anteriores, revisar backups y monitoreo en Supabase. No se creó ni desplegó un proyecto remoto automáticamente.

Los cambios de archivo y movimiento no son una transacción distribuida: se limpia una subida si falla el guardado, y el ticket anterior se borra después de guardar. Si falla esa limpieza, la app avisa; el archivo permanece privado. Para producción conviene un trabajo periódico que elimine archivos huérfanos y una política de retención. La eliminación de una cuenta y sus objetos no está incluida en la interfaz de esta versión.

Documentación técnica consultada: [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).
