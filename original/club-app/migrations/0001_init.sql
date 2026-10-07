-- Club del Rey: esquema inicial (SQLite / Cloudflare D1)

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  direccion TEXT,
  pin_hash TEXT,
  api_key_hash TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT UNIQUE,
  tel_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  nacimiento TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  es_personal INTEGER NOT NULL DEFAULT 0,
  publico_salon INTEGER NOT NULL DEFAULT 0,
  terminos_version TEXT NOT NULL,
  consentimiento_en INTEGER NOT NULL,
  creado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_usuarios_tel_hash ON usuarios(tel_hash);

CREATE TABLE IF NOT EXISTS personal (
  tel_hash TEXT PRIMARY KEY,
  etiqueta TEXT,
  creado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_en INTEGER NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  usado INTEGER NOT NULL DEFAULT 0,
  registro_hash TEXT,
  registro_expira INTEGER,
  registro_usado INTEGER NOT NULL DEFAULT 0,
  creado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_otps_tel ON otps(telefono, creado_en);
CREATE INDEX IF NOT EXISTS ix_otps_registro ON otps(registro_hash);

CREATE TABLE IF NOT EXISTS sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  usuario_id INTEGER,
  local_id INTEGER,
  expira_en INTEGER NOT NULL,
  creado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boletas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_id INTEGER NOT NULL REFERENCES locales(id),
  folio TEXT NOT NULL,
  monto INTEGER NOT NULL,
  comensales INTEGER,
  emitida_en INTEGER NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'emitida',
  canje_ficha_id INTEGER,
  creado_en INTEGER NOT NULL,
  UNIQUE(local_id, folio)
);

CREATE TABLE IF NOT EXISTS mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boleta_id INTEGER NOT NULL UNIQUE REFERENCES boletas(id),
  token TEXT NOT NULL UNIQUE,
  pagador_id INTEGER NOT NULL REFERENCES usuarios(id),
  personas INTEGER NOT NULL,
  monto INTEGER NOT NULL,
  parte INTEGER NOT NULL,
  dia TEXT NOT NULL,
  creada_en INTEGER NOT NULL,
  expira_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mesas_pagador ON mesas(pagador_id, creada_en);

CREATE TABLE IF NOT EXISTS partes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  idx INTEGER NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  estado TEXT NOT NULL,
  tel_hash TEXT,
  etiqueta TEXT,
  coronas INTEGER NOT NULL DEFAULT 0,
  gasto INTEGER NOT NULL DEFAULT 0,
  reclamada_en INTEGER,
  UNIQUE(mesa_id, idx)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_partes_usuario ON partes(mesa_id, usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_partes_tel ON partes(tel_hash) WHERE tel_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_partes_usuario ON partes(usuario_id, reclamada_en);

CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  coronas INTEGER NOT NULL,
  gasto INTEGER NOT NULL DEFAULT 0,
  gasto_fecha INTEGER NOT NULL,
  efectivo_desde INTEGER NOT NULL,
  creado_en INTEGER NOT NULL,
  ref TEXT,
  nota TEXT,
  mesa_id INTEGER,
  ficha_id INTEGER,
  local_id INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mov_ref ON movimientos(usuario_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_mov_usuario ON movimientos(usuario_id, creado_en);

CREATE TABLE IF NOT EXISTS fichas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL,
  monto INTEGER NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL,
  dia TEXT NOT NULL,
  creada_en INTEGER NOT NULL,
  vence_en INTEGER NOT NULL,
  usada_en INTEGER,
  monto_aplicado INTEGER,
  local_id INTEGER,
  anio INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ficha_activa ON fichas(usuario_id) WHERE estado = 'reservada';
CREATE UNIQUE INDEX IF NOT EXISTS ux_regalo_anio ON fichas(usuario_id, anio) WHERE tipo = 'regalo' AND estado IN ('reservada', 'usada');
CREATE INDEX IF NOT EXISTS ix_fichas_usuario ON fichas(usuario_id, creada_en);

CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  usuario_id INTEGER,
  detalle TEXT,
  creado_en INTEGER NOT NULL,
  resuelta INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT,
  creado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  clave TEXT PRIMARY KEY,
  inicio INTEGER NOT NULL,
  cuenta INTEGER NOT NULL
);
