import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.startsWith('YOUR-'));
export const supabase=configured ? createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}) : null;
export async function rpc(name,args={}) {
 if (!supabase) throw new Error('La conexión con Supabase aún no está configurada.');
 const {data,error}=await supabase.rpc(name,args); if(error) throw error; return data;
}
export async function rows(table, configure=q=>q) {
 if(!supabase) return [];
 const {data,error}=await configure(supabase.from(table).select('*')); if(error) throw error; return data;
}
export async function profile(id) {
 const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error) throw error; return data;
}
export async function authAction(method,...args) {
 if(!supabase) throw new Error('Falta conectar Supabase para habilitar las cuentas.');
 const {data,error}=await supabase.auth[method](...args); if(error) throw error; return data;
}
