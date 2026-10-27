import {defineConfig,loadEnv} from 'vite';
import {resolve} from 'node:path';
// En desarrollo, /garzon abre la app del garzón (en Vercel lo hace la regla de vercel.json).
const garzonRoute={name:'garzon-route',configureServer(server){server.middlewares.use((req,_res,next)=>{if(/^\/garzon\/?(\?|$)/.test(req.url||''))req.url='/garzon.html'+(req.url.split('?')[1]?'?'+req.url.split('?')[1]:'');next();});}};
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
 const key=env.VITE_SUPABASE_ANON_KEY||'';
 let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role||'';}catch{/* publishable keys are not JWTs */}
 if(key.startsWith('sb_secret_')||role==='service_role')throw new Error('VITE_SUPABASE_ANON_KEY debe ser publishable/anon. La clave privada no puede compilarse en la web.');
 return {plugins:[garzonRoute],build:{rollupOptions:{input:{main:resolve(import.meta.dirname,'index.html'),garzon:resolve(import.meta.dirname,'garzon.html')}}}};
});
