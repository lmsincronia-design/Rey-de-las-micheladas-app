// Estado compartido y navegación (sin recargar la página).
export const estado = { me: null };

export function ir(ruta, reemplazar = false) {
  history[reemplazar ? 'replaceState' : 'pushState'](null, '', ruta);
  dispatchEvent(new Event('cambioruta'));
}
