// Vercel server function. Never expose service_role or per-local POS keys to Vite.
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método no permitido'});}
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Envía JSON'});
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bindings=process.env.POS_KEYS_JSON;
 if(!url||!key||!bindings)return res.status(503).json({error:'Integración de caja pendiente de configuración'});
 try {
 let body=req.body;
 if(typeof body==='string'){if(Buffer.byteLength(body)>65536)return res.status(413).json({error:'Solicitud demasiado grande'});body=JSON.parse(body);}
 if(!body||Array.isArray(body)||JSON.stringify(body).length>65536)return res.status(400).json({error:'Solicitud inválida'});
 const {local_id,action}=body;
 const allowed=JSON.parse(bindings);
 const expected=allowed[local_id];
 const token=/^Bearer (.{20,512})$/.exec(req.headers.authorization||'')?.[1]||'';
 const digest=createHash('sha256').update(token).digest();
 if(typeof expected!=='string'||!/^[a-fA-F0-9]{64}$/.test(expected)||!token||!timingSafeEqual(digest,Buffer.from(expected,'hex')))return res.status(401).json({error:'Llave de local inválida'});
 const actions={
 'sale': ['pos_record_sale',{location_value:local_id,folio_value:body.folio,amount_value:body.amount,people_value:body.people,codes:body.codes,redemption_code:body.redemption_code||null}],
 'cancel_sale': ['pos_cancel_sale',{location_value:local_id,folio_value:body.folio}],
 'confirm_redemption': ['pos_confirm_redemption',{location_value:local_id,code_value:body.code}],
 'member': ['pos_member',{code_value:body.code}]
 };
 if(!actions[action])return res.status(400).json({error:'Acción inválida'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const [name,args]=actions[action];const {data,error}=await db.rpc(name,args);
 if(error)return res.status(400).json({error:error.code==='P0001'?error.message:'Revisa los datos de la operación'});
 return res.status(200).json({ok:true,data});
 }catch{return res.status(400).json({error:'Configuración o solicitud inválida'});}
}
