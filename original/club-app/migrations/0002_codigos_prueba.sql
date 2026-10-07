-- Códigos de prueba (solo funcionan con MODO_MVP=1): se pueden usar todas las veces que se quiera, sin vencer.
-- Cada uso crea una boleta nueva por el monto indicado, como si la caja la hubiera emitido.
CREATE TABLE IF NOT EXISTS codigos_prueba (
  codigo TEXT PRIMARY KEY,
  monto INTEGER NOT NULL,
  personas INTEGER NOT NULL,
  nota TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO codigos_prueba (codigo, monto, personas, nota) VALUES
  ('MESA5K', 150000, 5, 'Mesa de 5 amigos: cuenta de $150.000, $30.000 cada uno'),
  ('PAREJA', 60000, 2, 'Una pareja: $30.000 cada uno'),
  ('SUMA10', 10000, 1, 'Una persona sola, consumo chico'),
  ('RANGO1', 50000, 1, 'Suma $50.000: sube a Comerciante'),
  ('RANGO2', 100000, 1, 'Suma $100.000: sube a Guardia (con RANGO1)'),
  ('RANGO3', 200000, 1, 'Suma $200.000: sube a Noble (con RANGO1 y RANGO2)'),
  ('RANGO4', 350000, 1, 'Suma $350.000: sube a Rey (con los tres anteriores)');
