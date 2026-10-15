# Clara · Finanzas personales

Base funcional con Next.js App Router, TypeScript, Tailwind CSS y Supabase (Auth, PostgreSQL y Storage privado). Interfaz en español, adaptable a celular y escritorio, sin datos financieros de demostración.

## Novedades de octubre de 2026

**Requiere una migración nueva:** ejecutá una sola vez `supabase/migrations/202610090004_family_management.sql` en el SQL Editor de Supabase (después de las anteriores). Conserva los datos. Sin ella la app funciona igual, salvo transferir la administración, eliminar el grupo, eliminar la cuenta y los avisos en tiempo real, que muestran un mensaje pidiendo la migración.

- **Medios de pago, cargados a mano** (requiere además `202610090005_payment_methods.sql`, después de la anterior): en la pestaña Medios de pago creás etiquetas como Efectivo, Mercado Pago o cada tarjeta. La app **no se conecta con bancos ni billeteras** y no pide números de tarjeta, claves ni accesos. Al cargar un movimiento elegís con qué pagaste (opcional; recuerda el último usado en ese dispositivo). Por cada medio se ve lo gastado en el mes, lo que cae en los tres meses siguientes y el total ya comprometido en cuotas y gastos con fecha futura. Movimientos se puede filtrar por medio y el CSV lo incluye. Borrar un medio no borra sus movimientos: quedan sin medio asignado. No calcula cierres ni vencimientos de tarjeta: cada cuota cuenta en el mes de su fecha.
- **Saldos, transferencias y cierre de tarjeta** (requiere además `202610090006_accounts.sql`, después de la anterior):
  - *Saldo por cuenta:* al editar un medio que no sea tarjeta de crédito elegís su moneda y, si querés, “Llevar el saldo” con un saldo inicial a una fecha. Desde ese día el saldo se mueve con los gastos, ingresos y transferencias cargados con esa cuenta y en su moneda. Arriba se ve el total que tenés hoy por moneda. Los movimientos con fecha futura no cuentan hasta que llega el día.
  - *Transferencias:* “Transferir o pagar tarjeta” mueve plata entre dos cuentas de la misma moneda, o de una cuenta a una tarjeta de crédito (el pago del resumen). No cuentan como gasto ni ingreso. No se editan: se eliminan y se cargan de nuevo.
  - *Tarjetas:* con día de cierre (y opcionalmente de vencimiento), cada compra y cada cuota se suma al resumen que le corresponde: lo comprado después del cierre pasa al mes siguiente. Se ve el resumen del mes elegido, el siguiente y lo que queda para después, con sus fechas. El día de cierre es fijo por tarjeta; si el banco lo corre unos días, la app no se entera. No registra si un resumen ya fue pagado.
  - Las compras con tarjeta siguen contando como gasto en la fecha de la compra para el Resumen y los presupuestos; el resumen de tarjeta es solo una vista de cuánto vas a tener que pagar.
- **Presupuestos que se repiten:** en Presupuestos, “Copiar los de {mes anterior}” trae al mes elegido los que falten. Cada presupuesto avisa al llegar al 80 % y el Resumen muestra primero los más comprometidos.
- **Cuotas y gastos fijos:** al cargar un movimiento, “Repetir” permite repartir el total en cuotas (la última absorbe el redondeo) o repetir el mismo importe todos los meses, hasta 60. Se crea un movimiento por mes, y cada uno se edita o elimina por separado.
- **Carga rápida de gastos:** el formulario pide primero el importe y después la categoría, que se elige con un toque o buscando por nombre. Si escribís una que no existe, “Crear …” la da de alta ahí mismo (con conexión; el color se puede cambiar después en Categorías). El ítem es opcional: si lo dejás vacío, el movimiento lleva el nombre de la categoría. Fecha con accesos “Hoy” y “Ayer”; cuotas, nota y referencia quedan en “Más opciones”. En celular el formulario sube desde abajo con el botón de guardar siempre a la vista.
- **Importes en formato argentino:** se acepta `1.250,50`, `1250,50`, `1250.50` y `1,250.50`. El campo se acomoda al salir (`1.250,50`). Un punto seguido de exactamente tres dígitos se interpreta como separador de miles (`1.250` es mil doscientos cincuenta).
- **CSV:** Movimientos → “Exportar {año} (CSV)” descarga todos los movimientos del año, en todas las monedas, listos para Excel. “Importar CSV” acepta ese mismo formato o cualquier planilla con columnas Fecha, Concepto e Importe (opcionales: Tipo, Moneda, Categoría, Nota, Referencia); muestra una vista previa con las filas inválidas, crea las categorías que falten y manda los gastos sin categoría a “Otros”.
- **Comparación mensual:** las tarjetas del Resumen muestran la variación frente al mes anterior.
- **Deshacer:** eliminar un movimiento, presupuesto o categoría lo oculta al instante y ofrece “Deshacer” durante seis segundos; recién entonces se borra del servidor.
- **Sin conexión:** la app abre sin red y permite anotar movimientos, que quedan en el dispositivo y se sincronizan solos al reconectar. Ver [PWA](#pwa).
- **Grupo familiar:** el administrador puede pasarle la administración a otro integrante o eliminar el grupo (borra los datos compartidos de todos; los espacios personales no se tocan). Cada persona puede eliminar su cuenta desde Grupo Familiar → Tu cuenta.
- **Tiempo real:** en el espacio familiar, las altas y ediciones de otros integrantes aparecen solas. Las bajas se ven al volver a la app o con “Actualizar datos”.
- **Navegación:** la pestaña queda en la URL (`?tab=movimientos`), así recargar conserva la vista, y el botón atrás cierra el diálogo abierto o vuelve a la pestaña anterior.
- **Modo oscuro** según la preferencia del sistema, y animaciones reducidas si el sistema lo pide.
- **Rendimiento:** se carga el año visible (más diciembre anterior, para comparar enero) en lugar de todo el historial; guardar actualiza la pantalla sin volver a descargar todo.

## Dictado con IA y recordatorio diario

Las dos funciones corren en el servidor de la app (rutas `/api/...`), así que necesitan un hosting que ejecute Next.js (por ejemplo Vercel) y variables de entorno **del servidor**. Están listadas en `.env.example`. Ninguna lleva el prefijo `NEXT_PUBLIC_`, salvo la clave pública de notificaciones. Sin configurar, el resto de la app funciona igual y cada función avisa qué le falta.

### Dictado con IA

Al cargar un movimiento hay un campo “Decilo con tus palabras”, con micrófono donde el navegador lo permite. Decís o escribís “gasté 2500 en el súper con Mercado Pago en 3 cuotas” y la IA completa importe, categoría, ítem, fecha, medio de pago y cuotas. **No guarda nada:** revisás el formulario y tocás Guardar.

- Configuración: `ANTHROPIC_API_KEY` (se crea en console.anthropic.com; cada frase interpretada tiene un costo que se factura en esa cuenta). `ANTHROPIC_MODEL` es opcional: por defecto `claude-opus-5-5`; `claude-haiku-5-5` es bastante más barato y suele alcanzar para esta tarea.
- Qué sale del dispositivo: la frase y los **nombres** de tus categorías y medios de pago van al servidor de la app y de ahí a Anthropic. No se envían movimientos, importes anteriores ni saldos. La ruta exige sesión iniciada. El audio lo transcribe el servicio de voz del navegador o del teléfono (Google en Chrome/Android, Apple en iPhone) antes de llegar a la app; si preferís evitarlo, escribí la frase.
- Si la frase trae más de un movimiento, carga el primero y lo avisa.

### Recordatorio diario

En Grupo Familiar → “Recordatorio de las 21” se activa por dispositivo. Todos los días a las 21 (hora de Argentina) llega una notificación: si no cargaste nada ese día, te lo recuerda; si cargaste, te dice cuántos movimientos anotaste por si falta alguno. Tocarla abre el formulario de gasto. Cerrar sesión lo desactiva en ese dispositivo.

1. Ejecutá `supabase/migrations/202610090007_push_reminders.sql` en Supabase.
2. Generá las claves con `npx web-push generate-vapid-keys` y cargá `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (un `mailto:` tuyo).
3. Cargá `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). Es una clave con acceso total: solo en las variables del servidor, nunca en el repositorio ni con prefijo `NEXT_PUBLIC_`. La usa únicamente `/api/cron/recordatorio` para leer a qué dispositivos avisar y contar los movimientos del día.
4. Cargá `CRON_SECRET` con un texto largo al azar. `vercel.json` agenda la ruta a las 00:00 UTC (21:00 de Argentina) y Vercel manda ese secreto solo. En otro hosting, programá un GET diario a `/api/cron/recordatorio` con el encabezado `Authorization: Bearer <CRON_SECRET>`.
5. Volvé a desplegar: la clave pública se incluye al compilar.

Límites: en iPhone las notificaciones solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o posterior). La hora es fija, 21:00 de Argentina, para todas las cuentas. En el plan gratuito de Vercel la tarea diaria puede salir con hasta una hora de demora.

## Actualización: grupo familiar y acceso rápido

Si ya ejecutaste la primera migración, **ejecutá solamente `supabase/migrations/202609280002_families.sql`**: abrí ese archivo, copiá todo su contenido en una consulta nueva del SQL Editor de Supabase y presioná Run. Se aplica una vez y conserva los datos existentes. No vuelvas a ejecutar la migración inicial.

Después, recargá la app y abrí **Grupo Familiar**. Podés crear un grupo, elegir si compartís tus datos actuales y generar una invitación. Usá **Copiar enlace** o **Compartir** para enviarla. El familiar abre el enlace, inicia sesión o se registra y confirma “Unirme al grupo” con su nombre. La invitación se conserva en ese navegador durante el acceso o la confirmación por correo. Si confirma desde otro navegador, puede abrir nuevamente el enlace original. No se agrega a nadie automáticamente por visitar el enlace.

Todos los integrantes pueden ver, crear, editar y eliminar los datos familiares. Solo el administrador genera invitaciones o quita a otros integrantes. Los enlaces sirven una vez, vencen a los siete días y generar otro revoca el anterior. El token viaja en el fragmento de `/unirse#...`, no en las solicitudes al servidor. Este cambio no requiere una migración adicional. Para invitar desde otro dispositivo usá la dirección HTTPS publicada de Clara; un enlace localhost solo funciona en la misma computadora. Al salir o ser quitado se pierde el acceso; los movimientos quedan en el grupo. El administrador no puede salir: antes tiene que pasarle la administración a otro integrante o eliminar el grupo.

El selector **Espacio de finanzas** separa los datos personales de los familiares. Unirse a un grupo no comparte automáticamente el historial personal. Los reportes y presupuestos se calculan para el espacio seleccionado y una moneda a la vez. Los cambios de otros integrantes llegan en tiempo real (con la migración de octubre aplicada); también se actualizan al volver a enfocar la app o con “Actualizar datos”.

**Se reemplazó la subida de tickets por Referencia**, un texto opcional de hasta 200 caracteres (comercio, número de comprobante, transferencia, etc.), disponible al aplicar la nueva migración. Los tickets antiguos se conservan y siguen sujetos a permisos; no se suben archivos nuevos desde la interfaz.

### Acceso desde el celular

- `/gasto`: abre directamente el formulario de gasto después de autenticar y cargar las categorías. Al guardar o cerrar, muestra el panel.
- `/panel`: abre directamente el resumen.
- `/`: en celular abre primero el formulario por defecto; la preferencia se puede cambiar en Grupo Familiar y se guarda por cuenta en ese dispositivo.

Desde Grupo Familiar, tocá **Abrir acceso «Agregar gasto»**, y en Safari usá Compartir → Agregar a pantalla de inicio; en Android, el menú del navegador → Instalar/Agregar a pantalla de inicio. `/gasto` tiene su propio manifest e identidad, con nombre “Agregar gasto”. El soporte para un segundo ícono depende del navegador y sistema. Como alternativa, la PWA principal de Clara también inicia en `/gasto`; el manifest ofrece accesos a formulario y resumen donde el sistema admite shortcuts. Una instalación previa puede requerir actualizar o volver a agregar su ícono. En un celular, `localhost` apunta al propio teléfono: usá la URL HTTPS desplegada de la app para instalarla.

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

1. Para un proyecto nuevo, ejecutá en orden `202609280001_initial.sql`, `202609280002_families.sql` y `202610090004_family_management.sql`, `202610090005_payment_methods.sql` y `202610090006_accounts.sql` (carpeta `supabase/migrations`) en SQL Editor. Si ya tenés alguna aplicada, ejecutá solo las que falten. `202609280003_reference_repair.sql` es únicamente para instalaciones que aplicaron familias antes de que existiera el campo Referencia. También podés usar Supabase CLI (`supabase link --project-ref ...` y `supabase db push`). Cada migración se ejecuta una vez.
2. En Authentication habilitá Email/Password, mantené la confirmación de correo y configurá una contraseña mínima de 8 caracteres. Las siete categorías de gastos iniciales se crean al registrar cada usuario mediante un trigger; creá las cuentas después de aplicar la migración. Las categorías de ingresos se pueden crear desde la app y su uso en un ingreso es opcional.
3. En Authentication → URL Configuration configurá Site URL, y agregá `http://localhost:3000`, `http://localhost:3000/reset-password`, la URL HTTPS de producción y su ruta `/reset-password` a las redirecciones permitidas. El cliente usa el flujo de sesión por fragmento del SDK de Supabase. No se almacenan sesiones ni datos de usuarios en componentes de servidor.
4. La migración crea `receipts`, un bucket **privado** de hasta 5 MB por imagen, con MIME JPG, PNG y WebP. Cada ruta comienza con el UUID del usuario. No hacerlo público. El cliente descarga el ticket autenticado y crea un URL de blob temporal que revoca al cerrar el detalle.
5. Configurá SMTP propio para confirmaciones y recuperación en producción. Probá registro, confirmación, inicio/cierre de sesión y recuperación con un correo real.

```sh
npm run dev
# http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Flujos disponibles

- Registro, confirmación por correo, ingreso, cierre de sesión y recuperación de contraseña.
- Movimientos: alta (única, en cuotas o repetida cada mes), lista mensual por moneda, búsqueda por concepto/nota/referencia, filtro de tipo, detalle, edición, eliminación con “Deshacer”, y exportación/importación CSV. Gastos con categoría obligatoria, notas y referencia opcionales; ingresos con categoría opcional.
- Categorías: alta, listado, edición de nombre/color/tipo, desactivación y eliminación cuando no tienen movimientos ni presupuestos. Las claves foráneas impiden borrar categorías utilizadas; un trigger impide cambiar su tipo. Las categorías desactivadas conservan su historial y no se ofrecen para nuevos movimientos.
- Presupuestos mensuales por categoría de gasto y moneda: crear/actualizar, copiar los del mes anterior, editar, eliminar, avance, aviso al 80 % y exceso. Una combinación de mes/categoría/moneda tiene un único presupuesto.
- Panel: selector de mes/año y moneda, ingresos, gastos, saldo, evolución anual, distribución por categoría, últimos movimientos y presupuestos.
- Vista anual: doce meses, categorías, ingresos/gastos/saldo y totales anuales; tabla con primera columna fija y desplazamiento horizontal.
- Estados vacíos, carga, errores, validación de formulario, diálogos con foco contenido y diseño responsive.

## Dinero y modelo

`currencies` centraliza código ISO, símbolo y decimales. Se inicializa con ARS y USD. Se pueden agregar monedas (hasta cuatro decimales) por migración; los usuarios no modifican ese catálogo. No hay conversión de monedas.

`movements` y `budgets` guardan `amount` como PostgreSQL `numeric` exacto, con límite de 14 dígitos enteros y validación de escala según moneda. `amount_text`, columna generada, se consulta como texto para evitar que JSON/JavaScript conviertan el dinero a punto flotante. El cliente valida cadenas y calcula con Decimal.js (40 dígitos de precisión); nunca usa `parseFloat` para dinero. Solo las proporciones visuales de los gráficos se convierten a Number. La presentación mantiene símbolo y código contextual, con formato argentino.

Las tablas financieras tienen `user_id` (autor) y `family_id` nullable (espacio compartido). RLS permite usar datos personales al propietario y familiares a los integrantes actuales. Las columnas de autor/espacio no pueden modificarse por API; los triggers impiden vincular categorías de otro espacio. Membresías e invitaciones se gestionan mediante funciones con validación del usuario autenticado, `search_path` fijo y permisos restringidos. Las invitaciones y permisos de tickets históricos están en el esquema privado. Las sumas filtran espacio, moneda y período. Se carga el año visible más diciembre anterior, en páginas de 500 filas para evitar truncamientos; al cambiar de año se consulta ese período.

## PWA

Manifest generado en `/manifest.webmanifest`, íconos PNG de 192 y 512 px, configuración Apple y service worker. En iPhone: Safari → Compartir → Agregar a pantalla de inicio. En Android: menú del navegador → Instalar / Agregar a pantalla de inicio. Requiere HTTPS en producción (localhost funciona en desarrollo).

**Sin conexión.** El service worker guarda la carcasa de la app (el HTML de `/`, `/gasto` y `/panel`, que no contiene datos, y los archivos estáticos) para que abra sin red. Nunca guarda respuestas de Supabase ni tickets. Sin red, la app muestra un formulario para anotar movimientos con las categorías de la última carga; quedan en `localStorage` de ese dispositivo y se envían solos al reconectar, sin duplicarse si se reintenta. Arriba del panel se ve cuántos hay pendientes, con “Sincronizar ahora” y “Descartar”. Límites: hace falta haber abierto la app con conexión al menos una vez en ese dispositivo; sin red no se consultan, editan ni eliminan movimientos ya guardados; y cerrar sesión borra del dispositivo las categorías guardadas (los pendientes se conservan para esa cuenta). En `localhost` los archivos estáticos se piden siempre a la red primero.

**Seguridad del navegador.** `next.config.ts` envía una Content-Security-Policy que solo permite conexiones al propio dominio y al proyecto de Supabase configurado en `NEXT_PUBLIC_SUPABASE_URL` (HTTPS y WebSocket). Si cambiás de proyecto, hay que volver a compilar. Los íconos propios se regeneran con `node scripts/generate-icons.mjs` (usa sharp, incluido por Next.js).

## Organización

```text
src/app/                    App Router, layout, estilos, manifest y recuperación
src/features/finance/       app.tsx (pantalla y navegación), use-finance-data.ts (carga,
                            guardado, deshacer, cola sin conexión, tiempo real) y model.ts (dinero)
src/features/auth/          Formularios de acceso
src/features/movements/     Formulario, lista, detalle, cuotas/repetición y CSV
src/features/budgets/       Presupuestos: pestaña, formulario y avance
src/features/categories/    Pestaña y formulario de categorías
src/features/reports/       Resumen mensual, vista anual, tabla y gráficos
src/features/family/        Grupo familiar, invitaciones y cuenta
src/features/offline/       Pantalla sin conexión y datos guardados en el dispositivo
src/components/             Diálogo y estados vacíos compartidos
src/lib/supabase.ts         Cliente autenticado de Supabase
supabase/migrations/       Tablas, validaciones, datos iniciales, RLS y Storage
tests/                      Pruebas de dinero, CSV y PostgreSQL/RLS embebido; prueba de navegador
public/                     Íconos y service worker
.github/workflows/ci.yml    Lint, tipos, pruebas y build en cada push
```

## Verificación y puesta en producción

### Google y sesiones persistentes

La pantalla de acceso incluye **Continuar con Google**. Para activarlo:

1. En Google Cloud / Google Auth Platform, configurá la pantalla de consentimiento y creá un cliente OAuth de tipo **Aplicación web**. Mientras esté en pruebas, agregá los correos familiares como usuarios de prueba.
2. En **URIs de redireccionamiento autorizados** del cliente Google, agregá el callback que muestra Supabase en Authentication → Sign In / Providers → Google: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Activá Google en ese panel de Supabase y guardá allí el Client ID y Client Secret. El secreto no va en `.env.local` ni en variables `NEXT_PUBLIC_*`.
4. En Supabase → Authentication → URL Configuration, configurá Site URL con tu dominio y permití las URLs exactas `/`, `/gasto` y `/panel` de tu dominio. Para desarrollo agregá `http://localhost:3000/`, `http://localhost:3000/gasto` y `http://localhost:3000/panel`.
5. Probá entrar con Google en navegador y desde la PWA instalada. Las invitaciones se conservan localmente durante el acceso y se retoman al volver.

El cliente guarda la sesión y renueva los tokens automáticamente. Cerrar sesión afecta solamente al dispositivo actual. Para permitir sesiones duraderas y varios dispositivos, no actives límites de inactividad/duración ni la opción de sesión única en Supabase. No es necesario alargar la expiración del JWT. Borrar datos del navegador, usar incógnito o revocar la sesión puede requerir volver a entrar; el navegador y la PWA pueden tener almacenamiento separado según el sistema.

Referencias: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [sesiones](https://supabase.com/docs/guides/auth/sessions). La configuración externa y la prueba con una cuenta Google real deben hacerse en el proyecto del usuario; no requieren migraciones SQL.

Los gráficos de barras y distribución usan Recharts con contenedores responsive. Los totales y etiquetas conservan precisión con decimal.js; únicamente las proporciones visuales se convierten a números para dibujar. El selector de día/mes permite consultar los importes también con teclado.

Cada movimiento muestra quién lo cargó originalmente. En Movimientos, el espacio familiar permite filtrar por integrante junto con moneda, tipo y búsqueda. Editar un movimiento no cambia su autor. Si una persona sale del grupo, su historial conserva el identificador y aparece como exintegrante con una referencia a ese identificador.

`npm test` prueba aritmética exacta, separación por moneda/período y la migración en PostgreSQL embebido (PGlite). La prueba SQL crea implementaciones mínimas de `auth` y `storage`, cambia de rol/usuario y comprueba RLS, vínculos entre propietarios, conservación de categorías, precisión y rutas privadas. No reemplaza una prueba real del servicio Auth/Storage de Supabase.

La prueba de navegador `npm run test:ui` usa Playwright con Edge instalado y un backend interceptado exclusivamente en el proceso de pruebas. Necesita la app en el puerto 3001 con `NEXT_PUBLIC_SUPABASE_URL=https://clara-test.supabase.co` y `NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key-not-a-real-secret` (definí también `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con ese valor si la usás en `.env.local`), sin modificar las variables reales de tu proyecto. Next no permite dos `next dev` a la vez en la misma carpeta: si ya tenés uno abierto, compilá con esas variables (`next build`) y serví con `next start -p 3001`; después volvé a compilar con las reales. Recorre movimientos, monedas, presupuestos, categorías y vista anual; verifica la interfaz a 390 px. Los archivos de prueba y capturas están separados de la aplicación y no se suben a Supabase.

Antes de publicar: aplicar las migraciones, completar variables en el hosting, configurar HTTPS, redirecciones y SMTP, y verificar los flujos con usuarios reales del mismo grupo y de otro grupo. `tests/family.test.ts` verifica migración de datos existentes, colaboración entre integrantes, conservación de historial, referencias, aislamiento de terceros, invitaciones de un uso y revocación al salir. La prueba de navegador también recorre creación del grupo, referencia, selección de espacio y accesos `/gasto` y `/panel`, con red interceptada y sin escribir datos reales. No se aplicaron migraciones ni se desplegó un proyecto remoto automáticamente.

Los tickets históricos se conservan privados. Al eliminar su movimiento se intenta limpiar el archivo; si falla, se avisa. El registro privado de permisos de tickets permite limpiar archivos aun después de borrar el movimiento y no se expone a los clientes. Al eliminar una cuenta se borran sus datos personales y se intenta quitar sus tickets del almacenamiento; lo que cargó en un grupo queda en el grupo, a nombre del administrador. Al eliminar un grupo, los archivos de tickets compartidos quedan en Storage, privados y accesibles solo para quien los subió.

Documentación técnica consultada: [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).
