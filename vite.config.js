import {defineConfig,loadEnv} from 'vite';
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
 const key=env.VITE_SUPABASE_ANON_KEY||'';
 let role='';try{role=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role||'';}catch{/* publishable keys are not JWTs */}
 if(key.startsWith('sb_secret_')||role==='service_role')throw new Error('VITE_SUPABASE_ANON_KEY debe ser publishable/anon. La clave privada no puede compilarse en la web.');
 return {};
});
