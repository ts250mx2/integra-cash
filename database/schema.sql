-- Integra Cash: esquema compatible con las convenciones de Tapioki POS.
-- Ejecutar exclusivamente sobre BDIntegraCash. No elimina tablas ni registros.
CREATE TABLE IF NOT EXISTS tblSucursales (
  IdSucursal INT UNSIGNED NOT NULL AUTO_INCREMENT,
  Nombre VARCHAR(120) NOT NULL,
  PRIMARY KEY (IdSucursal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblUsuarios (
  IdUsuario INT UNSIGNED NOT NULL AUTO_INCREMENT,
  Usuario VARCHAR(120) NOT NULL,
  Login VARCHAR(80) NOT NULL,
  PasswordHash VARCHAR(255) NOT NULL,
  Rol VARCHAR(30) NOT NULL DEFAULT 'operador',
  Status TINYINT(1) NOT NULL DEFAULT 1,
  IdSucursal INT UNSIGNED NOT NULL DEFAULT 1,
  FechaAlta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdUsuario),
  UNIQUE KEY uq_usuarios_login (Login),
  CONSTRAINT fk_usuarios_sucursal FOREIGN KEY (IdSucursal) REFERENCES tblSucursales (IdSucursal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblSesiones (
  IdSesion BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdUsuario INT UNSIGNED NOT NULL,
  TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  FechaAlta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FechaExpiracion DATETIME NOT NULL,
  PRIMARY KEY (IdSesion),
  UNIQUE KEY uq_sesiones_token (TokenHash),
  KEY idx_sesiones_expiracion (FechaExpiracion),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblClientes (
  IdCliente INT UNSIGNED NOT NULL AUTO_INCREMENT,
  Nombre VARCHAR(160) NOT NULL,
  Telefono VARCHAR(30) NOT NULL DEFAULT '',
  Email VARCHAR(160) NOT NULL DEFAULT '',
  Identificacion VARCHAR(80) NOT NULL DEFAULT '',
  Direccion VARCHAR(400) NOT NULL DEFAULT '',
  Notas TEXT NULL,
  FechaAlta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdCliente),
  KEY idx_clientes_nombre (Nombre),
  KEY idx_clientes_telefono (Telefono),
  KEY idx_clientes_identificacion (Identificacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblCategorias (
  IdCategoria INT UNSIGNED NOT NULL AUTO_INCREMENT,
  Categoria VARCHAR(100) NOT NULL,
  Icono VARCHAR(40) NOT NULL DEFAULT 'package',
  PorcentajePrestamo DECIMAL(5,2) NOT NULL DEFAULT 65.00,
  PRIMARY KEY (IdCategoria),
  UNIQUE KEY uq_categorias_nombre (Categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblArticulos (
  IdArticulo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdCategoria INT UNSIGNED NOT NULL,
  Descripcion VARCHAR(250) NOT NULL,
  Marca VARCHAR(100) NOT NULL DEFAULT '',
  Modelo VARCHAR(100) NOT NULL DEFAULT '',
  Serie VARCHAR(120) NOT NULL DEFAULT '',
  Condicion VARCHAR(80) NOT NULL DEFAULT 'bueno',
  Peso DECIMAL(10,3) NULL,
  Quilataje VARCHAR(20) NULL,
  Avaluo DECIMAL(12,2) NOT NULL,
  Ubicacion VARCHAR(100) NOT NULL DEFAULT '',
  Status VARCHAR(30) NOT NULL DEFAULT 'resguardo',
  FechaAlta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdArticulo),
  KEY idx_articulos_status (Status),
  KEY idx_articulos_serie (Serie),
  CONSTRAINT fk_articulos_categoria FOREIGN KEY (IdCategoria) REFERENCES tblCategorias (IdCategoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblEmpenos (
  IdEmpeno INT UNSIGNED NOT NULL AUTO_INCREMENT,
  Folio VARCHAR(40) NOT NULL,
  IdCliente INT UNSIGNED NOT NULL,
  IdArticulo INT UNSIGNED NOT NULL,
  IdUsuario INT UNSIGNED NOT NULL,
  IdSucursal INT UNSIGNED NOT NULL DEFAULT 1,
  Capital DECIMAL(12,2) NOT NULL,
  SaldoCapital DECIMAL(12,2) NOT NULL,
  CapitalPeriodo DECIMAL(12,2) NOT NULL,
  TasaInteres DECIMAL(6,3) NOT NULL,
  PlazoDias SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  FechaAlta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FechaVencimiento DATE NOT NULL,
  Status VARCHAR(30) NOT NULL DEFAULT 'vigente',
  Notas TEXT NULL,
  Refrendos INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (IdEmpeno),
  UNIQUE KEY uq_empenos_folio (Folio),
  UNIQUE KEY uq_empenos_articulo (IdArticulo),
  KEY idx_empenos_status_vencimiento (Status, FechaVencimiento),
  KEY idx_empenos_fecha (FechaAlta),
  CONSTRAINT fk_empenos_cliente FOREIGN KEY (IdCliente) REFERENCES tblClientes (IdCliente),
  CONSTRAINT fk_empenos_articulo FOREIGN KEY (IdArticulo) REFERENCES tblArticulos (IdArticulo),
  CONSTRAINT fk_empenos_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario),
  CONSTRAINT fk_empenos_sucursal FOREIGN KEY (IdSucursal) REFERENCES tblSucursales (IdSucursal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblCajas (
  IdCaja INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdUsuario INT UNSIGNED NOT NULL,
  IdSucursal INT UNSIGNED NOT NULL DEFAULT 1,
  FechaApertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FechaCierre DATETIME NULL,
  FondoInicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  SaldoEsperado DECIMAL(12,2) NOT NULL DEFAULT 0,
  EfectivoContado DECIMAL(12,2) NULL,
  Diferencia DECIMAL(12,2) NULL,
  Status VARCHAR(20) NOT NULL DEFAULT 'abierta',
  SucursalAbierta INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN Status = 'abierta' THEN IdSucursal ELSE NULL END) STORED,
  PRIMARY KEY (IdCaja),
  UNIQUE KEY uq_cajas_sucursal_abierta (SucursalAbierta),
  KEY idx_cajas_status_fecha (Status, FechaApertura),
  CONSTRAINT fk_cajas_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario),
  CONSTRAINT fk_cajas_sucursal FOREIGN KEY (IdSucursal) REFERENCES tblSucursales (IdSucursal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblPagos (
  IdPago INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdEmpeno INT UNSIGNED NOT NULL,
  IdUsuario INT UNSIGNED NOT NULL,
  IdCaja INT UNSIGNED NOT NULL,
  Tipo VARCHAR(30) NOT NULL,
  Capital DECIMAL(12,2) NOT NULL DEFAULT 0,
  Interes DECIMAL(12,2) NOT NULL DEFAULT 0,
  Importe DECIMAL(12,2) NOT NULL,
  Metodo VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Referencia VARCHAR(160) NOT NULL DEFAULT '',
  PRIMARY KEY (IdPago),
  KEY idx_pagos_fecha (Fecha),
  CONSTRAINT fk_pagos_empeno FOREIGN KEY (IdEmpeno) REFERENCES tblEmpenos (IdEmpeno),
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario),
  CONSTRAINT fk_pagos_caja FOREIGN KEY (IdCaja) REFERENCES tblCajas (IdCaja)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblMovimientosCaja (
  IdMovimiento INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdCaja INT UNSIGNED NOT NULL,
  IdUsuario INT UNSIGNED NOT NULL,
  Tipo VARCHAR(20) NOT NULL,
  Concepto VARCHAR(250) NOT NULL,
  Importe DECIMAL(12,2) NOT NULL,
  Referencia VARCHAR(160) NOT NULL DEFAULT '',
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdMovimiento),
  KEY idx_movimientos_fecha (Fecha),
  CONSTRAINT fk_movimientos_caja FOREIGN KEY (IdCaja) REFERENCES tblCajas (IdCaja),
  CONSTRAINT fk_movimientos_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblVentas (
  IdVenta INT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdArticulo INT UNSIGNED NOT NULL,
  IdUsuario INT UNSIGNED NOT NULL,
  IdCaja INT UNSIGNED NOT NULL,
  Importe DECIMAL(12,2) NOT NULL,
  Metodo VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdVenta),
  UNIQUE KEY uq_ventas_articulo (IdArticulo),
  KEY idx_ventas_fecha (Fecha),
  CONSTRAINT fk_ventas_articulo FOREIGN KEY (IdArticulo) REFERENCES tblArticulos (IdArticulo),
  CONSTRAINT fk_ventas_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario),
  CONSTRAINT fk_ventas_caja FOREIGN KEY (IdCaja) REFERENCES tblCajas (IdCaja)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblConfiguracion (
  Clave VARCHAR(100) NOT NULL,
  Valor TEXT NOT NULL,
  PRIMARY KEY (Clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblAuditoria (
  IdAuditoria BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  IdUsuario INT UNSIGNED NULL,
  Accion VARCHAR(80) NOT NULL,
  Entidad VARCHAR(80) NOT NULL,
  IdEntidad VARCHAR(80) NULL,
  Detalle TEXT NULL,
  Fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (IdAuditoria),
  KEY idx_auditoria_fecha (Fecha),
  KEY idx_auditoria_entidad (Entidad, IdEntidad),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (IdUsuario) REFERENCES tblUsuarios (IdUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tblSucursales (IdSucursal, Nombre) VALUES (1, 'Matriz');
INSERT IGNORE INTO tblCategorias (Categoria, Icono, PorcentajePrestamo) VALUES
  ('Oro y joyería', 'gem', 75),
  ('Celulares', 'smartphone', 60),
  ('Electrónica', 'monitor', 60),
  ('Herramientas', 'wrench', 65),
  ('Relojes', 'watch', 65),
  ('Vehículos', 'car', 65),
  ('Otros artículos', 'package', 60);
INSERT IGNORE INTO tblConfiguracion (Clave, Valor) VALUES
  ('nombreNegocio', 'Integra Cash'),
  ('tasaMensual', '10'),
  ('plazoDias', '30'),
  ('porcentajePrestamo', '65'),
  ('diasGracia', '7');
