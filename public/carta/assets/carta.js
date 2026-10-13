(function(){
'use strict';
var MENU=window.MENU,LOCALES=window.LOCALES,PINTA=window.PINTA;
var $=function(s,r){return (r||document).querySelector(s)};
var fmt=function(n){return '$'+Number(n).toLocaleString('es-CL')};
var norm=function(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()};
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

var state={local:null,q:'',veg:false};
var sel=store.get('rey.local');
if(sel!==null&&sel!==''&&sel!=='all'&&LOCALES[+sel])state.local=+sel;
var seen=store.get('rey.seen');

/* ── integración con el Club del Rey ──
   /carta/?local=<texto o número>&from=club
   - local: número 0–32 (id de LOCALES) o texto libre (nombre, calle o dirección del local)
   - from=club: muestra la flecha para volver al Club */
function findLocal(text){
  var q=norm(text).replace(/[^a-z0-9 ]+/g,' ').trim();
  if(!q)return null;
  if(/^\d{1,2}$/.test(q)&&LOCALES[+q])return +q;
  var stop={rey:1,del:1,las:1,de:1,la:1,el:1,los:1,local:1,micheladas:1,providencia:0};
  var toks=q.split(/\s+/).filter(function(t){return (t.length>=3||/\d/.test(t))&&!stop[t]});
  var best=-1,bestScore=0;
  LOCALES.forEach(function(l){
    var hay=' '+norm(l.name+' '+l.comuna+' '+l.qr).replace(/[^a-z0-9 ]+/g,' ')+' ';
    var s=0;toks.forEach(function(t){if(hay.indexOf(' '+t+' ')>-1)s+=/\d/.test(t)?3:1;});
    if(s>bestScore){bestScore=s;best=l.id;}
  });
  return bestScore>=2?best:null;
}
try{
  var sp=new URLSearchParams(location.search);
  var want=sp.get('local');
  if(want){var f=findLocal(want);if(f!==null){state.local=f;seen='1';}}
  if(sp.get('from')==='club'){var bk=document.getElementById('backClub');if(bk){bk.hidden=false;
    // El Club abre la carta en otra pestaña: se cierra y el cliente vuelve a la suya; si no se puede cerrar, navega al Club.
    bk.addEventListener('click',function(e){e.preventDefault();var href=bk.getAttribute('href');window.close();setTimeout(function(){location.href=href},200);});}}
}catch(e){}

/* ── helpers de carta ── */
function ctx(){
  var L=state.local!==null?LOCALES[state.local]:null;
  var f=L?L.flags:null;
  return {
    L:L,
    has:function(need){
      if(!need||need==='any')return true;
      if(!L)return need!=='none';
      if(need==='schop')return f.indexOf('schop')>-1;
      return f.indexOf(need)>-1;
    },
    bebVariant:L?(f.indexOf('bebsidras')>-1?'sidras':'std'):'std',
    lengua:L?f.indexOf('lengua')>-1:true
  };
}
function visibleCats(c){
  if(!c.L)return MENU;
  return MENU.filter(function(m){return c.L.cats.indexOf(m.id)>-1});
}
function tagHTML(t){
  var o=[];
  if(t.indexOf('hot')>-1)o.push('<span class="tgi hot">🌶 Picante</span>');
  if(t.indexOf('veg')>-1)o.push('<span class="tgi veg">🌿 Vegano</span>');
  if(t.indexOf('noalc')>-1)o.push('<span class="tgi">Sin alcohol</span>');
  return o.length?'<span class="tg">'+o.join('')+'</span>':'';
}
function priceHTML(it,full){
  if(it.pp)return '<span class="pp">'+it.pp.map(function(x,i){return '<span class="pp-i'+(i?' xl':'')+'"><small>'+esc(x[0])+'</small><b>'+fmt(x[1])+'</b></span>'}).join('')+'</span>';
  if(it.p!=null)return '<span class="price">'+fmt(it.p)+'</span>';
  if(it.tags&&it.tags.indexOf('free')>-1&&BEER_MIN!=null)return '<span class="price"><small>desde</small>'+fmt(BEER_MIN)+'</span>';
  return '';
}
function match(it,q){return !q||norm(it.n+' '+(it.d||'')).indexOf(q)>-1}
function vegOk(it){return !state.veg||(it.tags&&it.tags.indexOf('veg')>-1)}
function itemKey(ci,si,ii){return ci+'.'+si+'.'+ii}

function itemHTML(it,layout,key,cut){
  var img=it.img?'<img class="ph'+(cut?' cut':'')+'" src="assets/img/'+it.img+'.webp" alt="" loading="lazy" decoding="async" width="84" height="84">':'';
  var body='<span><span class="nm">'+esc(it.n)+'</span>'+(it.d?'<span class="ds">'+esc(it.d)+'</span>':'')+tagHTML(it.tags||[])+'</span>';
  var price=priceHTML(it);
  if(layout==='grid'){
    return '<li class="item"><button class="item-btn" type="button" data-k="'+key+'">'+img+body+price+'</button></li>';
  }
  if(layout==='moj'){
    return '<li class="item"><button class="item-btn moj" type="button" data-k="'+key+'">'+img+'<span><span class="nm">'+esc(it.n)+'</span></span>'+price+'</button></li>';
  }
  return '<li class="item"><button class="item-btn'+(img?'':' nophoto')+'" type="button" data-k="'+key+'">'+img+body+price+'</button></li>';
}

var REG={}; // key → item (para el diálogo)
var BEER_MIN=null;
function minBeer(c){
  var m=null;
  MENU.forEach(function(cat){if(cat.id!=='cervezas')return;
    cat.sections.forEach(function(s){if(s.need&&!c.has(s.need))return;
      s.items.forEach(function(it){if(it.need&&!c.has(it.need))return;
        if(it.p==null||(it.tags&&it.tags.indexOf('noalc')>-1)||it.p>9000)return;
        if(m===null||it.p<m)m=it.p;});});});
  return m;
}

function render(){
  var c=ctx(),q=norm(state.q.trim());
  var cats=visibleCats(c),html='',chips='',n=0,lastGroup='';
  REG={};BEER_MIN=minBeer(c);
  cats.forEach(function(cat,ci){
    var secHTML='',count=0;
    cat.sections.forEach(function(s,si){
      if(s.need&&!c.has(s.need))return;
      if(s.variant&&s.variant!==c.bebVariant)return;
      if(s.kind==='pinta'){
        if(q&&norm('a su pinta churrasco mechada lengua').indexOf(q)<0&&norm(PINTA.rows.map(function(r){return r[0]+' '+r[1]}).join(' ')).indexOf(q)<0)return;
        if(state.veg)return;
        count++;
        var cols=PINTA.cols.slice(0,c.lengua?3:2);
        secHTML+='<h3 class="sec-title">'+esc(s.title)+'<small>Elige tu preparación</small></h3><div class="tw"><table class="pinta"><thead><tr><th scope="col">Preparación</th>'+cols.map(function(x){return '<th scope="col">'+esc(x)+'</th>'}).join('')+'</tr></thead><tbody>'+
          PINTA.rows.map(function(r){return '<tr><th scope="row">'+esc(r[0])+(r[1]?'<small>'+esc(r[1])+'</small>':'')+'</th>'+r.slice(2,2+cols.length).map(function(v){return '<td>'+fmt(v)+'</td>'}).join('')+'</tr>'}).join('')+
          '</tbody></table></div><p class="note">'+esc(PINTA.note)+'</p>';
        return;
      }
      if(s.kind==='extras'){
        if(q||state.veg)return;
        count++;
        secHTML+='<h3 class="sec-title">'+esc(s.title)+'</h3><div class="extras">'+s.groups.map(function(g){
          return '<div class="xg"><div class="xg-h"><span class="price">'+fmt(g.price)+'</span>'+(g.label?'<small>'+esc(g.label)+'</small>':'')+'</div><ul>'+g.items.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></div>';
        }).join('')+'</div>';
        return;
      }
      var items=s.items.map(function(it,ii){return {it:it,ii:ii}}).filter(function(o){
        if(o.it.need&&!c.has(o.it.need))return false;
        return match(o.it,q)&&vegOk(o.it);
      });
      if(!items.length)return;
      count+=items.length;
      var title=s.title?'<h3 class="sec-title">'+esc(s.title)+(s.note?'<small>'+esc(s.note)+'</small>':'')+'</h3>':'';
      var cut=cat.id==='botellas'||cat.id==='bebestibles'||cat.id==='menudia';
      if(s.kind==='chips'){
        secHTML+=title+'<ul class="sabores">'+items.map(function(o){var k=itemKey(ci,si,o.ii);REG[k]=o.it;
          return '<li><button class="item-btn" style="all:unset;cursor:pointer;display:block;width:100%" type="button" data-k="'+k+'"><img class="ph" src="assets/img/'+o.it.img+'.webp" alt="" loading="lazy" decoding="async"><b>'+esc(o.it.n)+'</b></button></li>'}).join('')+'</ul>';
        return;
      }
      if(cat.layout==='mojito'&&items[0].it.pp){
        var tiers=[],tk={};
        items.forEach(function(o){var key=o.it.pp.map(function(x){return x[1]}).join('-');if(!tk[key]){tk[key]={pp:o.it.pp,list:[]};tiers.push(tk[key]);}tk[key].list.push(o);});
        secHTML+=title+tiers.map(function(t){
          return '<div class="tier"><div class="tier-h">'+t.pp.map(function(x,i){return '<span class="pp-i'+(i?' xl':'')+'"><small>'+esc(x[0])+'</small><b>'+fmt(x[1])+'</b></span>'}).join('')+'</div><ul class="tier-l">'+
            t.list.map(function(o){var k=itemKey(ci,si,o.ii);REG[k]=o.it;
              return '<li><button class="tile" type="button" data-k="'+k+'"><img class="ph" src="assets/img/'+o.it.img+'.webp" alt="" loading="lazy" decoding="async" width="64" height="64"><span class="nm">'+esc(o.it.n)+'</span></button></li>'}).join('')+'</ul></div>';
        }).join('');
        return;
      }
      var layout=cat.layout==='grid'?'grid':(cat.layout==='mojito'?'moj':'list');
      secHTML+=title+'<ul class="'+(layout==='grid'?'gridl':'list')+'">'+items.map(function(o){var k=itemKey(ci,si,o.ii);REG[k]=o.it;return itemHTML(o.it,layout,k,cut)}).join('')+'</ul>';
    });
    if(!count)return;
    n+=count;
    if(cat.group!==lastGroup){lastGroup=cat.group;html+='<h2 class="group" data-group>'+esc(cat.group)+'</h2>';}
    var head='<header class="cat-head"><h2>'+esc(cat.title)+'</h2>'+(cat.kicker?'<span class="kick">'+esc(cat.kicker)+'</span>':'')+(cat.lead?'<p class="lead">'+esc(cat.lead)+'</p>':'')+(cat.id==='micheladas'&&BEER_MIN!=null?'<div class="howpay"><div class="hp-main"><span class="hp-k">Así se paga</span><span class="hp-t">Pides tu schop o cerveza <b>desde '+fmt(BEER_MIN)+'</b> y la preparación de tu michelada va <b>por la casa</b>.</span></div><div class="hp-s"><span><b>+ $990</b> pincho adicional</span><span><b>$2.990</b> Michekids, sin cerveza</span></div></div>':'')+
      (cat.promo?'<div class="ticket"><span class="tp">'+fmt(cat.promo.price)+'</span><span class="tt"><b>Promo</b>'+esc(cat.promo.text)+'</span></div>':'')+'</header>';
    var foot='';
    if(cat.foot&&!q)foot+='<div class="foot-prices">'+cat.foot.map(function(f){return '<span class="fp">'+esc(f[0])+' <span class="price">'+fmt(f[1])+'</span></span>'}).join('')+'</div>';
    if(cat.closing&&!q)foot+='<p class="closing">'+esc(cat.closing)+'</p>';
    html+='<section class="cat" id="cat-'+cat.id+'" data-id="'+cat.id+'">'+head+secHTML+foot+'</section>';
    chips+='<button class="chip" type="button" data-go="'+cat.id+'">'+esc(cat.chip)+'</button>';
  });
  $('#carta').innerHTML=html;
  $('#chips').innerHTML=chips;
  $('#empty').classList.toggle('on',!n);
  var L=c.L;
  var base=L?'<b>'+esc(L.name)+'</b> · '+esc(L.comuna):'Carta general · todos los locales';
  $('#sum').innerHTML=base+((q||state.veg)?' · <b>'+n+(n===1?' resultado':' resultados')+'</b>':'');
  $('#sum').setAttribute('aria-live','polite');
  var nm=L?L.name:'Carta general';
  $('#heroLocalName').textContent=L?L.name:'Elige tu local';
  $('#barLocalName').textContent=nm;
  measure();spy();
}

/* ── barra / scrollspy ── */
function measure(){document.documentElement.style.setProperty('--bar-h',$('#bar').offsetHeight+'px')}
var spyTick=false;
function spy(){
  var h=$('#bar').offsetHeight+30,cur=null;
  var secs=document.querySelectorAll('.cat');
  for(var i=0;i<secs.length;i++){if(secs[i].getBoundingClientRect().top<=h)cur=secs[i].dataset.id;}
  var chips=document.querySelectorAll('#chips .chip'),box=$('#chips');
  chips.forEach(function(ch){
    var on=ch.dataset.go===cur;
    if(on&&ch.getAttribute('aria-current')!=='true'){
      box.scrollTo({left:ch.offsetLeft-box.clientWidth/2+ch.offsetWidth/2,behavior:'smooth'});
    }
    if(on)ch.setAttribute('aria-current','true');else ch.removeAttribute('aria-current');
  });
}
window.addEventListener('scroll',function(){if(!spyTick){spyTick=true;requestAnimationFrame(function(){spyTick=false;spy()})}},{passive:true});
window.addEventListener('resize',measure);

$('#chips').addEventListener('click',function(e){
  var b=e.target.closest('.chip');if(!b)return;
  var s=document.getElementById('cat-'+b.dataset.go);
  if(s)s.scrollIntoView({behavior:'smooth',block:'start'});
});

/* ── búsqueda / filtros / tamaño ── */
var qEl=$('#q'),timer;
$('#btnSearch').addEventListener('click',function(){
  var on=!$('#searchRow').classList.contains('on');
  $('#searchRow').classList.toggle('on',on);
  this.setAttribute('aria-expanded',on);
  if(on)qEl.focus();else{qEl.value='';state.q='';render();}
  measure();
});
qEl.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){state.q=qEl.value;render();window.scrollTo({top:Math.max(0,document.querySelector('.bar-sum').offsetTop-$('#bar').offsetHeight),behavior:'auto'});},160)});
$('#togVeg').addEventListener('click',function(){state.veg=!state.veg;this.setAttribute('aria-pressed',state.veg);render()});
var big=store.get('rey.size')==='l';
function applySize(){document.documentElement.dataset.size=big?'l':'';$('#btnSize').setAttribute('aria-pressed',big);$('#btnSize').setAttribute('aria-label',big?'Texto tamaño normal':'Aumentar tamaño del texto');$('#btnSize').querySelector('.a').textContent=big?'A−':'A+';measure();}
$('#btnSize').addEventListener('click',function(){big=!big;store.set('rey.size',big?'l':'n');applySize()});
applySize();

/* ── selector de local ── */
var dl=$('#dlgLocal');
function buildLocales(filter){
  var q=norm(filter||'');
  var rows=LOCALES.filter(function(l){return !q||norm(l.name+' '+l.comuna).indexOf(q)>-1});
  var by={};rows.forEach(function(l){(by[l.comuna]=by[l.comuna]||[]).push(l)});
  var out='';
  Object.keys(by).sort(function(a,b){return a.localeCompare(b,'es')}).forEach(function(com){
    out+='<div class="l-com">'+esc(com)+'</div>';
    by[com].forEach(function(l){out+='<button type="button" class="l-row" data-l="'+l.id+'"'+(state.local===l.id?' aria-current="true"':'')+'><span>'+esc(l.name)+'</span></button>'});
  });
  $('#lList').innerHTML=out||'<p class="note">No encontramos ese local. Prueba con la comuna o la calle.</p>';
}
function openLocal(){buildLocales('');$('#lq').value='';if(!dl.open)dl.showModal();}
$('#heroLocal').addEventListener('click',openLocal);
$('#barLocal').addEventListener('click',openLocal);
$('#lq').addEventListener('input',function(){buildLocales(this.value)});
$('#lList').addEventListener('click',function(e){
  var b=e.target.closest('.l-row');if(!b)return;
  state.local=+b.dataset.l;store.set('rey.local',state.local);store.set('rey.seen','1');
  dl.close();render();window.scrollTo({top:$('.bar-sum').offsetTop-$('#bar').offsetHeight,behavior:'smooth'});
});
$('#lAll').addEventListener('click',function(){state.local=null;store.set('rey.local','all');store.set('rey.seen','1');dl.close();render();});

/* ── ficha de plato ── */
var di=$('#dlgItem');
$('#carta').addEventListener('click',function(e){
  var b=e.target.closest('[data-k]');if(!b)return;
  var it=REG[b.dataset.k];if(!it)return;
  var cut=/^(bot|dia|limon|cafe|redbull|bebidas)/.test(it.img||'');
  var h='';
  if(it.img)h+='<img class="it-ph'+(cut?' cut':'')+'" src="assets/img/'+it.img+'.webp" alt="'+esc(it.n)+'">';
  h+='<h3 class="it-n" id="itN">'+esc(it.n)+'</h3>';
  if(it.d)h+='<p class="it-d">'+esc(it.d)+'</p>';
  var t=tagHTML(it.tags||[]);if(t)h+='<div class="it-t">'+t+'</div>';
  var p=priceHTML(it,true);if(p)h+='<div class="it-p">'+p+'</div>';
  if(it.tags&&it.tags.indexOf('free')>-1&&BEER_MIN!=null)h+='<p class="it-d">Pagas tu schop o cerveza (desde '+fmt(BEER_MIN)+') y la preparación de tu michelada va por la casa.</p>';
  $('#itBody').innerHTML=h;
  di.showModal();
});
[dl,di].forEach(function(d){
  d.addEventListener('click',function(e){if(e.target===d||e.target.closest('[data-close]'))d.close()});
});

render();
if(!seen&&state.local===null&&store.get('rey.local')!=='all'){setTimeout(openLocal,650);}
})();
