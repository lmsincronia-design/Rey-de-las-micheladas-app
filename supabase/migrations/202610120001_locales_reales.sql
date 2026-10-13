-- Carga los 33 locales reales de El Rey de las Micheladas (carta oficial QR, 12-oct-2026).
-- Generado por supabase/scripts/generar-locales.mjs. Idempotente: se puede ejecutar de nuevo sin duplicar.
-- Si un local ya existe, solo se actualizan nombre, dirección y comuna: NO se tocan menu_url, coordenadas ni "active"
-- (para no pisar lo que el administrador haya editado desde /admin).
-- Latitud/longitud quedan vacías a propósito: no se inventan coordenadas.
-- Pendiente de confirmar con el dueño: comuna de "Barra del Rey · Boulevard Bellavista" y de "Alameda 1653".
insert into public.locations(id,name,address,commune,menu_url,active,verified,is_test) values
 ('a1e00000-0000-4000-8000-000000000001'::uuid,'Pío Nono 105','Pío Nono 105, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000002'::uuid,'Pío Nono 110','Pío Nono 110, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000003'::uuid,'Nueva Providencia 2020','Nueva Providencia 2020, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000004'::uuid,'Castillo del Rey · Pío Nono 420','Pío Nono 420, Recoleta','Recoleta','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000005'::uuid,'Manuel Barros Borgoño 147','Manuel Barros Borgoño 147, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000006'::uuid,'Providencia 455, local 109','Providencia 455, local 109, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000007'::uuid,'Pío Nono 114 · Karaoke del Rey','Pío Nono 114, Recoleta','Recoleta','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000008'::uuid,'Costanera 1 · Nueva Providencia 2584','Nueva Providencia 2584, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000009'::uuid,'Costanera 2 · Nueva Providencia 2584','Nueva Providencia 2584, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000010'::uuid,'General Holley 109','General Holley 109, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000011'::uuid,'M. Montt · Av. Providencia 1378','Av. Providencia 1378, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000012'::uuid,'Chacabuco 77','Chacabuco 77, Maipú','Maipú','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000013'::uuid,'Pío Nono 200 · Karaoke del Rey','Pío Nono 200, Recoleta','Recoleta','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000014'::uuid,'Irarrázaval 3517 · Plaza Ñuñoa','Irarrázaval 3517, Ñuñoa','Ñuñoa','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000015'::uuid,'Mall Plaza Tobalaba','Mall Plaza Tobalaba, Puente Alto','Puente Alto','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000016'::uuid,'Eyzaguirre','Eyzaguirre, San Bernardo','San Bernardo','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000017'::uuid,'Esquina Blanca','Esquina Blanca, Maipú','Maipú','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000018'::uuid,'Irarrázaval 3176 · Chile España','Irarrázaval 3176, Ñuñoa','Ñuñoa','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000019'::uuid,'Vespucio 01016','Vespucio 01016, La Cisterna','La Cisterna','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000020'::uuid,'Pajaritos 3488','Pajaritos 3488, Maipú','Maipú','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000021'::uuid,'Mall Plaza Oeste','Mall Plaza Oeste, Cerrillos','Cerrillos','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000022'::uuid,'Plaza Italia · Providencia 013','Providencia 013, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000023'::uuid,'Larraín 5960','Larraín 5960, La Reina','La Reina','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000024'::uuid,'Santo Domingo 255','Santo Domingo 255, Puente Alto','Puente Alto','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000025'::uuid,'Borgoño 24','Borgoño 24, Providencia','Providencia','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000026'::uuid,'San Pablo 6457','San Pablo 6457, Lo Prado','Lo Prado','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000027'::uuid,'Pastor Fernández 15000','Pastor Fernández 15000, Lo Barnechea','Lo Barnechea','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000028'::uuid,'Monjitas 467','Monjitas 467, Santiago','Santiago','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000029'::uuid,'Walker Martínez 1840','Walker Martínez 1840, La Florida','La Florida','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000030'::uuid,'Barra del Rey · Boulevard Bellavista','Boulevard Bellavista','Recoleta','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000031'::uuid,'Alameda 902','Alameda 902, Santiago','Santiago','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000032'::uuid,'Alameda 940','Alameda 940, Santiago','Santiago','https://qrfy.io/p/oOBx-dlqTy',true,true,false),
 ('a1e00000-0000-4000-8000-000000000033'::uuid,'Alameda 1653','Alameda 1653, Santiago','Santiago','https://qrfy.io/p/oOBx-dlqTy',true,true,false)
on conflict(id) do update set name=excluded.name,address=excluded.address,commune=excluded.commune;
