// Fuente única de los 33 locales de El Rey de las Micheladas, tomados de la carta oficial QR (qrfy.io/p/oOBx-dlqTy, 12-oct-2026).
// Genera: src/locales-rey.js (catálogo para mostrar la carta aun sin base de datos) y
//         supabase/migrations/202610120001_locales_reales.sql (carga en Supabase).
// Uso: node supabase/scripts/generar-locales.mjs
// Latitud/longitud quedan en null a propósito: no se inventan coordenadas (el orden "Cerca de mí" las necesita).
import {writeFileSync} from 'node:fs';
const MENU_URL='https://qrfy.io/p/oOBx-dlqTy'; // carta oficial; la carta digital propia se abre por ruta interna (/carta/index.html)
const LOCALES=[
 ['Pío Nono 105','Pío Nono 105, Providencia','Providencia'],
 ['Pío Nono 110','Pío Nono 110, Providencia','Providencia'],
 ['Nueva Providencia 2020','Nueva Providencia 2020, Providencia','Providencia'],
 ['Castillo del Rey · Pío Nono 420','Pío Nono 420, Recoleta','Recoleta'],
 ['Manuel Barros Borgoño 147','Manuel Barros Borgoño 147, Providencia','Providencia'],
 ['Providencia 455, local 109','Providencia 455, local 109, Providencia','Providencia'],
 ['Pío Nono 114 · Karaoke del Rey','Pío Nono 114, Recoleta','Recoleta'],
 ['Costanera 1 · Nueva Providencia 2584','Nueva Providencia 2584, Providencia','Providencia'],
 ['Costanera 2 · Nueva Providencia 2584','Nueva Providencia 2584, Providencia','Providencia'],
 ['General Holley 109','General Holley 109, Providencia','Providencia'],
 ['M. Montt · Av. Providencia 1378','Av. Providencia 1378, Providencia','Providencia'],
 ['Chacabuco 77','Chacabuco 77, Maipú','Maipú'],
 ['Pío Nono 200 · Karaoke del Rey','Pío Nono 200, Recoleta','Recoleta'],
 ['Irarrázaval 3517 · Plaza Ñuñoa','Irarrázaval 3517, Ñuñoa','Ñuñoa'],
 ['Mall Plaza Tobalaba','Mall Plaza Tobalaba, Puente Alto','Puente Alto'],
 ['Eyzaguirre','Eyzaguirre, San Bernardo','San Bernardo'],
 ['Esquina Blanca','Esquina Blanca, Maipú','Maipú'],
 ['Irarrázaval 3176 · Chile España','Irarrázaval 3176, Ñuñoa','Ñuñoa'],
 ['Vespucio 01016','Vespucio 01016, La Cisterna','La Cisterna'],
 ['Pajaritos 3488','Pajaritos 3488, Maipú','Maipú'],
 ['Mall Plaza Oeste','Mall Plaza Oeste, Cerrillos','Cerrillos'],
 ['Plaza Italia · Providencia 013','Providencia 013, Providencia','Providencia'],
 ['Larraín 5960','Larraín 5960, La Reina','La Reina'],
 ['Santo Domingo 255','Santo Domingo 255, Puente Alto','Puente Alto'],
 ['Borgoño 24','Borgoño 24, Providencia','Providencia'],
 ['San Pablo 6457','San Pablo 6457, Lo Prado','Lo Prado'],
 ['Pastor Fernández 15000','Pastor Fernández 15000, Lo Barnechea','Lo Barnechea'],
 ['Monjitas 467','Monjitas 467, Santiago','Santiago'],
 ['Walker Martínez 1840','Walker Martínez 1840, La Florida','La Florida'],
 ['Barra del Rey · Boulevard Bellavista','Boulevard Bellavista','Recoleta'], // comuna NO indicada en la carta: confirmar con el dueño
 ['Alameda 902','Alameda 902, Santiago','Santiago'],
 ['Alameda 940','Alameda 940, Santiago','Santiago'],
 ['Alameda 1653','Alameda 1653, Santiago','Santiago'] // la carta no indica comuna: se asumió Santiago, confirmar
];
const uuid=n=>`a1e00000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rows=LOCALES.map(([name,address,commune],i)=>({id:uuid(i+1),name,address,commune,menu_url:MENU_URL,latitude:null,longitude:null}));
writeFileSync(new URL('../../src/locales-rey.js',import.meta.url),
`// GENERADO por supabase/scripts/generar-locales.mjs — no editar a mano.
// Los 33 locales de la carta oficial (12-oct-2026). Se usan para mostrar la carta mientras la base no los tenga cargados.
// Los ids coinciden con la migración 202610120001_locales_reales.sql.
export const LOCALES_REY=${JSON.stringify(rows,null,1)};
`);
const q=s=>`'${s.replace(/'/g,"''")}'`;
writeFileSync(new URL('../migrations/202610120001_locales_reales.sql',import.meta.url),
`-- Carga los 33 locales reales de El Rey de las Micheladas (carta oficial QR, 12-oct-2026).
-- Generado por supabase/scripts/generar-locales.mjs. Idempotente: se puede ejecutar de nuevo sin duplicar.
-- Si un local ya existe, solo se actualizan nombre, dirección y comuna: NO se tocan menu_url, coordenadas ni "active"
-- (para no pisar lo que el administrador haya editado desde /admin).
-- Latitud/longitud quedan vacías a propósito: no se inventan coordenadas.
-- Pendiente de confirmar con el dueño: comuna de "Barra del Rey · Boulevard Bellavista" y de "Alameda 1653".
insert into public.locations(id,name,address,commune,menu_url,active,verified,is_test) values
${rows.map(r=>` (${q(r.id)}::uuid,${q(r.name)},${q(r.address)},${q(r.commune)},${q(r.menu_url)},true,true,false)`).join(',\n')}
on conflict(id) do update set name=excluded.name,address=excluded.address,commune=excluded.commune;
`);
console.log(rows.length,'locales generados');
