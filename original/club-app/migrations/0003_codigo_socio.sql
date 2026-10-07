-- Código personal del socio: lo dice o muestra en caja ANTES de que se emita la boleta, para ver sus coronas y aplicar el descuento.
ALTER TABLE usuarios ADD COLUMN codigo_socio TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_codigo_socio ON usuarios(codigo_socio) WHERE codigo_socio IS NOT NULL;
