// Sirve dist/ con las cabeceras de vercel.json y verifica que no haya violaciones de CSP en las pantallas principales.
// Uso: npm run build && node test/csp-check.mjs
import {chromium} from 'playwright';
import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {extname,join} from 'node:path';
const cfg=JSON.parse(readFileSync('vercel.json','utf8'));
const headers=Object.fromEntries(cfg.headers[0].headers.map(h=>[h.key,h.value]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let f=join('dist',p);if(!existsSync(f)||statSync(f).isDirectory())f=existsSync(join(f,'index.html'))&&p!=='/'?join(f,'index.html'):join('dist','index.html');
 r.writeHead(200,{...headers,'Content-Type':types[extname(f)]||'application/octet-stream'});r.end(readFileSync(f));}).listen(4177);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox']});
try{
 const page=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
 const violations=[];
 await page.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI);});});
 await page.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
 for(const path of ['/','/registro','/entrar','/locales','/ranking?demo=1','/carta/index.html']){
  await page.goto('http://localhost:4177'+path);await page.waitForTimeout(700);
  const v=await page.evaluate(()=>window.__csp||[]);v.forEach(x=>violations.push(path+' → '+x));
  const icons=await page.locator('svg.ic').count();const fontOk=await page.evaluate(()=>document.fonts.check('16px Cinzel')&&document.fonts.check('16px Anton'));
  console.log(path.padEnd(22),'íconos:',String(icons).padStart(3),' fuentes locales:',fontOk);
 }
 if(violations.length){console.log('VIOLACIONES:\n'+violations.join('\n'));process.exitCode=1;}else console.log('Sin violaciones de CSP.');
}finally{await browser.close();server.close();}
