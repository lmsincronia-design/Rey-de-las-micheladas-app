// Lector de QR con la cámara. Usa BarcodeDetector (Chrome/Android) y, si no existe (iPhone), jsQR.
import jsQR from 'jsqr';

// Abre la cámara dentro de `container`. Llama a onCode(texto) con cada lectura; si onCode devuelve true, se cierra.
// Devuelve una función para detener la cámara.
export async function startQrScanner(container,onCode,{onError,closeLabel='Cerrar cámara'}={}){
 if(!navigator.mediaDevices?.getUserMedia){onError?.(new Error('Este navegador no permite usar la cámara. Escribe el código a mano.'));return ()=>{};}
 let stream,timer,stopped=false;
 const stop=()=>{stopped=true;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());if(container.isConnected)container.innerHTML='';};
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
  if(!container.isConnected){stop();return stop;}
  container.innerHTML=`<div class="scanner"><video autoplay playsinline muted></video><span class="scanner-frame" aria-hidden="true"></span></div><button type="button" class="btn secondary full" data-stop-scan>${closeLabel}</button>`;
  container.querySelector('[data-stop-scan]').onclick=stop;
  const video=container.querySelector('video');video.srcObject=stream;await video.play().catch(()=>{});
  const detector='BarcodeDetector' in window?new window.BarcodeDetector({formats:['qr_code']}):null;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const read=async()=>{
   if(stopped)return;
   if(!container.isConnected){stop();return;}
   try{
    let value=null;
    if(video.readyState>=2){
     if(detector){value=(await detector.detect(video))[0]?.rawValue||null;}
     else{
      const w=video.videoWidth,h=video.videoHeight,scale=Math.min(1,640/Math.max(w,h));
      canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      value=jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,{inversionAttempts:'dontInvert'})?.data||null;
     }
    }
    if(value&&await onCode(value)){stop();return;}
   }catch{/* siguiente cuadro */}
   timer=setTimeout(read,250);
  };
  read();
 }catch(e){stop();onError?.(new Error('No pudimos abrir la cámara. Revisa el permiso o escribe el código a mano.'));}
 return stop;
}

// Saca el código de la mesa de un QR (URL /mesa?qr=CODIGO) o de un texto escrito a mano.
export function tableCodeFrom(text){
 let value=String(text||'').trim();
 try{const url=new URL(value);value=url.searchParams.get('qr')||'';}catch{/* código escrito */}
 value=value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 return /^[2-9A-HJ-NP-Z]{8}$/.test(value)?value:null;
}
// Código de canje (C + 9) o de cumpleaños (B + 9) que muestra el socio.
export function memberCodeFrom(text){
 const value=String(text||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 return /^[CB][2-9A-HJ-NP-Z]{9}$/.test(value)?value:null;
}
