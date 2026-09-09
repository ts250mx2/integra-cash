# Integra Cash

Sistema de casa de empeños basado en la arquitectura de Tapioki POS: **Next.js 16.2.4, React 19, TypeScript, App Router y mysql2**, con SQL directo y tablas `tbl...` / campos `Id...`.

## Ejecutar

```powershell
npm install
npm run db:setup
npm run dev
```

Desarrollo: **http://localhost:3051**. Producción: `npm run build` y `npm start`, puerto **3052**. Los puertos se configuran en `package.json`.

La conexión está en `.env.local`, excluido de Git. Se copiaron únicamente las variables MySQL de Tapioki y se fijó `DB_NAME=BDIntegraCash`. La aplicación rechaza otros nombres de base de datos. No se modifica la base de Tapioki.

Cuando no hay usuarios, el primer acceso muestra el registro del administrador. La contraseña requiere al menos 10 caracteres, letras y números. Los siguientes accesos muestran el inicio de sesión. No hay contraseñas predeterminadas.

## Operación

- **Vista general:** cartera vigente, disponibilidad de efectivo, vencimientos, composición por categoría y flujo de los últimos siete días.
- **Clientes:** alta, edición, contacto, identificación y consulta de sus empeños.
- **Nuevo empeño:** cliente → garantía y avalúo → condiciones y confirmación del préstamo. Requiere caja abierta con fondos suficientes.
- **Boleta:** expediente de la garantía, desglose de deuda, pagos, refrendo, abono, desempeño e impresión.
- **Vencimientos:** filtros para priorizar próximos vencimientos y atrasos.
- **Bóveda:** ubicación, características, estado y venta de piezas adjudicadas.
- **Caja:** apertura, movimientos, registro automático de operaciones en efectivo, cierre, diferencias y comprobante de corte.
- **Reportes:** acumulados de capital colocado y recuperado, intereses, ventas, cartera y exportación CSV. Las gráficas muestran los últimos siete días; “cobrado” incluye capital e intereses.
- **Configuración:** nombre del negocio, tasa mensual, plazo, porcentaje sugerido y días de gracia. Solo el administrador modifica estas condiciones.

Las búsquedas consultan toda la base de datos. Los listados cargan bloques de 500 registros y muestran «Cargar más registros» cuando hay más resultados; los CSV exportan los registros cargados de la vista. Caja incluye todos los movimientos del turno actual y los últimos 30 cortes.

Los datos operativos provienen de MySQL. Los datos ficticios en `tests/ui.spec.ts` se interceptan únicamente en el navegador de pruebas y no se insertan en la base real.

## Convenciones de cálculo

Importes en MXN, guardados como `DECIMAL`; cálculo redondeado a centavos. Fechas de negocio en `America/Mexico_City`, con sesión MySQL `-06:00`.

- Interés simple: `capital del periodo × tasa mensual / 100 × (plazo + días vencidos) / 30`. Se cobra como mínimo el plazo contratado. No capitaliza intereses.
- **Abono:** reduce el capital pendiente, conserva el interés del periodo y su vencimiento. Para liquidar todo el capital se utiliza desempeño.
- **Refrendo:** cobra el interés pendiente y agrega un plazo completo a la mayor entre la fecha de vencimiento y la fecha actual; actualiza la base de interés al capital pendiente.
- **Desempeño:** cobra capital pendiente más interés y marca la garantía como entregada.
- **Adjudicación:** solo administrador, después de superar vencimiento más días de gracia. Conserva el saldo histórico y retira la operación de la cartera activa; la pieza queda disponible para venta.
- Solo los pagos y ventas en **efectivo** afectan el efectivo de caja. Tarjeta y transferencia quedan registrados como pagos sin aumentar efectivo.

Las tasas iniciales son configurables. Las boletas son comprobantes de operación: no sustituyen condiciones contractuales, registro contractual, facturación ni otros documentos del negocio.

## Estructura

```text
app/api/           Endpoints autenticados por módulo
app/print/         Boletas, recibos y cortes imprimibles
components/        Interfaz, formularios y navegación
lib/business.ts    Reglas, transacciones, validaciones y consultas
lib/db.ts          Pool MySQL y helper transaccional
lib/auth.ts        Contraseñas, usuarios y sesiones
lib/types.ts       Contratos TypeScript
database/schema.sql Esquema y catálogos iniciales
scripts/setup-db.ts Inicialización idempotente
tests/             Cálculos y flujos de interfaz
```

Todas las tablas persistentes residen en `BDIntegraCash`: `tblSucursales`, `tblUsuarios`, `tblSesiones`, `tblClientes`, `tblCategorias`, `tblArticulos`, `tblEmpenos`, `tblCajas`, `tblPagos`, `tblMovimientosCaja`, `tblVentas`, `tblConfiguracion` y `tblAuditoria`.

Las operaciones financieras usan transacciones InnoDB, consultas parametrizadas, bloqueo de caja y de préstamo/artículo, índices únicos y bitácora. Los cobros verifican saldo y vencimiento de la cotización; cierres y movimientos verifican el turno esperado. Las contraseñas usan scrypt; las sesiones usan tokens aleatorios hasheados en MySQL y cookies HttpOnly, SameSite Strict, Secure en producción.

## Verificar

```powershell
npm run lint
npm test
npm run build
# Requiere el servidor de desarrollo ejecutándose y Microsoft Edge instalado:
npx playwright test
# Prueba MySQL en tablas temporales por conexión; nunca escribe tablas operativas:
npx tsx --env-file=.env.local scripts/verify-transactions.ts
```

La verificación MySQL ejercita apertura, fondos insuficientes, préstamo, abono por transferencia, refrendo, cotizaciones obsoletas, desempeño, adjudicación, venta duplicada, movimientos y corte. Usa tablas temporales sin claves foráneas —MySQL no permite FKs temporales— y conserva índices y tipos. Hace ROLLBACK al terminar. Las tablas persistentes sí tienen sus relaciones.

Alcance inicial: una sucursal con una caja compartida abierta por turno. No incluye timbrado CFDI, expedientes de imágenes, integraciones bancarias ni administración visual de usuarios/roles. El esquema conserva usuarios, sucursal y auditoría para extender esos módulos.
