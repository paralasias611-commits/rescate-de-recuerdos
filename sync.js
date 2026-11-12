/* Rescate de recuerdos · capa de sincronización con Supabase (sin librerías)
   - Todo se guarda primero en el teléfono (funciona sin internet) y luego se sincroniza.
   - Los cambios de ambos se combinan (fusión de 3 vías), así no se pisan entre sí. */
(function(){
'use strict';
const C=window.RR_CFG;
if(!C||!C.url||/TU-PROYECTO/.test(C.url)||!C.key)return;
const L=localStorage;
const SYNC=/^(nm|nk|tops|cap|book|nw[mf]|ac[mf]|st[mf]|dy[mf]|cp[mf]|done[mf]|go[mf]|pl[mf]|ph:.+)$/;
const isO=x=>x&&typeof x=='object'&&!Array.isArray(x);
const J=s=>{try{return JSON.parse(s)}catch(e){return s}};
const S=v=>typeof v=='string'?v:JSON.stringify(v);
const canon=v=>JSON.stringify(v,(k,x)=>isO(x)?Object.keys(x).sort().reduce((a,c)=>(a[c]=x[c],a),{}):x);
const eq=(a,b)=>canon(a)===canon(b);
const enc=encodeURIComponent,sleep=ms=>new Promise(r=>setTimeout(r,ms));
let M=J(L.getItem('__rr')||'{}');if(!isO(M))M={};M.dirty=M.dirty||{};M.base=M.base||{};M.up=M.up||[];
let SS=J(L.getItem('__rr_s')||'null');if(!isO(SS))SS=null;
const saveM=()=>L.setItem('__rr',JSON.stringify(M));
const saveS=()=>{if(SS)L.setItem('__rr_s',JSON.stringify(SS));else L.removeItem('__rr_s')};
const RR=window.RRSYNC={onChange:null,onLost:null};

/* ---------- localStorage con "espejo" en la nube ---------- */
function mark(k,old){if(!M.dirty[k]){M.dirty[k]=1;M.base[k]=old===null?undefined:J(old)}saveM();sched()}
window.RRLS=new Proxy(L,{
 get(t,k){if(typeof k!='string')return undefined;if(k==='clear')return()=>L.clear();const v=L.getItem(k);return v===null?undefined:v},
 set(t,k,v){const old=L.getItem(k);L.setItem(k,String(v));if(SYNC.test(k))mark(k,old);return true},
 deleteProperty(t,k){const old=L.getItem(k);L.removeItem(k);if(SYNC.test(k)&&old!==null)mark(k,old);return true},
 has(t,k){return L.getItem(k)!==null}
});

/* ---------- fusión de 3 vías (base = último valor sincronizado) ---------- */
const ik=x=>isO(x)?(x.id!==undefined?'i'+x.id:(x.by!==undefined&&x.t!==undefined?'c'+x.by+':'+x.t:undefined)):undefined;
function m3(b,m,t){
 if(eq(m,b))return t;if(eq(t,b))return m;if(eq(m,t))return m;
 if(isO(m)&&isO(t)){const o={},bb=isO(b)?b:{};for(const k of new Set([...Object.keys(m),...Object.keys(t),...Object.keys(bb)])){const v=m3(bb[k],m[k],t[k]);if(v!==undefined)o[k]=v}return o}
 if(Array.isArray(m)&&Array.isArray(t)){
  const bb=Array.isArray(b)?b:[];
  if(m.concat(t).length&&m.concat(t).every(x=>ik(x)!==undefined)){
   const bm=new Map(bb.map(x=>[ik(x),x])),mm=new Map(m.map(x=>[ik(x),x])),tm=new Map(t.map(x=>[ik(x),x])),out=[];
   for(const i of new Set([...mm.keys(),...tm.keys()])){const bx=bm.get(i),mx=mm.get(i),tx=tm.get(i);if(bx&&(!mx||!tx))continue;out.push(mx&&tx?m3(bx,mx,tx):(mx||tx))}
   return out.sort((a,c)=>(a.t||0)-(c.t||0))}
  const n=Math.max(m.length,t.length),out=[];for(let i=0;i<n;i++){const v=m3(bb[i],m[i],t[i]);out.push(v===undefined?null:v)}return out}
 return m}

/* ---------- red ---------- */
async function refresh(){
 const r=await fetch(C.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:C.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:SS.ref})});
 if(!r.ok){if(r.status>=400&&r.status<500)lost();throw new Error('refresh '+r.status)}
 const j=await r.json();SS={tok:j.access_token,ref:j.refresh_token,exp:Date.now()+(j.expires_in||3600)*1000};saveS()}
async function tokOK(){if(!SS){const e=new Error('nosess');e.status=401;throw e}if(Date.now()>SS.exp-30000)await refresh()}
async function api(method,path,body,extra){await tokOK();
 const h=Object.assign({apikey:C.key,Authorization:'Bearer '+SS.tok,'Content-Type':'application/json'},extra||{});
 const r=await fetch(C.url+'/rest/v1/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
 if(!r.ok){const e=new Error(String(r.status));e.status=r.status;throw e}
 const t=await r.text();return t?JSON.parse(t):[]}
const sh=()=>({apikey:C.key,Authorization:'Bearer '+SS.tok});
let D,IG=()=>0,IP=()=>0,ID=()=>0,IK=()=>[];
const toData=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(b)});
async function upImg(id){await tokOK();const rec=await IG(id);if(!rec||!rec.img)return;const blob=await(await fetch(rec.img)).blob();
 const r=await fetch(`${C.url}/storage/v1/object/photos/${id}.jpg`,{method:'POST',headers:Object.assign(sh(),{'Content-Type':'image/jpeg','x-upsert':'true'}),body:blob});if(!r.ok)throw new Error('up'+r.status)}
async function dlImg(path){await tokOK();const r=await fetch(`${C.url}/storage/v1/object/authenticated/photos/${path}`,{headers:sh()});if(!r.ok)throw new Error('dl'+r.status);return r.blob()}
async function rmImg(paths){await tokOK();for(let i=0;i<paths.length;i+=100)await fetch(`${C.url}/storage/v1/object/photos`,{method:'DELETE',headers:Object.assign(sh(),{'Content-Type':'application/json'}),body:JSON.stringify({prefixes:paths.slice(i,i+100)})}).catch(()=>0)}

/* ---------- subir cambios ---------- */
let busy=false,tm;
function sched(){clearTimeout(tm);tm=setTimeout(flush,2500)}
async function ins(k,v){try{await api('POST','kv',{key:k,value:v},{Prefer:'return=minimal'});return true}catch(e){if(e.message=='409')return false;throw e}}
async function cas(k,v,ver){const r=await api('PATCH',`kv?key=eq.${enc(k)}&version=eq.${ver}`,{value:v,version:ver+1},{Prefer:'return=representation'});return r.length>0}
async function pushKey(k){
 const isPh=k.startsWith('ph:'),id=isPh?k.slice(3):null;
 for(let i=0;i<6;i++){
  const raw=L.getItem(k),mine=raw===null?undefined:J(raw);
  if(isPh&&mine!==undefined&&M.up.includes(id)){await upImg(id);M.up=M.up.filter(x=>x!=id);saveM()}
  const rows=await api('GET',`kv?key=eq.${enc(k)}&select=value,version`);
  const row=rows[0],theirs=row&&!(row.value&&row.value.__del)?row.value:undefined,base=M.base[k];
  const merged=row?m3(base,mine,theirs):mine,out=merged===undefined?{__del:1}:merged;
  let ok;if(!row)ok=await ins(k,out);else if(eq(out,row.value))ok=true;else ok=await cas(k,out,row.version);
  if(ok){
   if(isPh&&merged===undefined){await rmImg([(base&&base.path)||(theirs&&theirs.path)||id+'.jpg']);await ID(id)}
   if(L.getItem(k)===raw){if(merged===undefined)L.removeItem(k);else if(!eq(merged,mine))L.setItem(k,S(merged));delete M.dirty[k];delete M.base[k]}
   else M.base[k]=merged;
   saveM();return true}
  await sleep(120*(i+1))}
 return false}
async function flush(){if(busy||!SS)return;busy=true;try{for(const k of Object.keys(M.dirty)){try{await pushKey(k)}catch(e){break}}}finally{busy=false}}

/* ---------- bajar cambios ---------- */
async function fixPhotos(){
 let ch=false,miss=[];
 for(let i=0;i<L.length;i++){const k=L.key(i);if(k&&k.startsWith('ph:')){const m=J(L.getItem(k));if(m&&!m.__del)miss.push([k.slice(3),m.path||k.slice(3)+'.jpg'])}}
 const have=new Set((await IK())||[]);miss=miss.filter(([id])=>!have.has(id)&&!M.up.includes(id));
 for(let i=0;i<miss.length&&i<30;i+=3){await Promise.all(miss.slice(i,i+3).map(async([id,p])=>{try{await IP({id,img:await toData(await dlImg(p))});ch=true}catch(e){}}))}
 return ch}
async function pull(){
 const since=new Date((M.since||0)-5000).toISOString();
 const rows=await api('GET',`kv?select=key,value,updated_at&updated_at=gt.${enc(since)}&order=updated_at.asc&limit=2000`);
 let ch=false;
 for(const r of rows){const u=Date.parse(r.updated_at);if(u>(M.since||0))M.since=u;
  if(!SYNC.test(r.key)||M.dirty[r.key])continue;
  const del=r.value&&r.value.__del,cur=L.getItem(r.key);
  if(del){if(cur!==null){L.removeItem(r.key);ch=true}if(r.key.startsWith('ph:'))await ID(r.key.slice(3))}
  else if(cur===null||!eq(J(cur),r.value)){L.setItem(r.key,S(r.value));ch=true}}
 saveM();
 if(await fixPhotos())ch=true;
 if(ch&&RR.onChange)RR.onChange()}

/* ---------- ciclo ---------- */
let timer=null;
async function tick(){if((typeof document!='undefined'&&document.hidden)||!SS)return;try{await flush();await pull()}catch(e){}}
function lost(){SS=null;saveS();clearInterval(timer);timer=null;if(RR.onLost)RR.onLost()}
RR.start=function(first){if(!SS)return Promise.resolve();
 if(!timer){timer=setInterval(tick,C.poll||8000);if(typeof document!='undefined'){document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()})}if(typeof addEventListener!='undefined')addEventListener('online',tick)}
 return first?Promise.race([tick(),sleep(7000)]):(tick(),Promise.resolve())};
RR.stop=()=>{clearInterval(timer);timer=null};
RR.hasSession=()=>!!SS;
RR.logout=()=>{SS=null;saveS();RR.stop()};

RR.login=async function(key){
  try {
    // Validar la clave independiente en Supabase
    const res = await fetch(C.url + '/functions/v1/validar-clave', {
      method: 'POST',
      headers: {
        apikey: C.key,
        Authorization: 'Bearer ' + C.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ clave: key })
    });

    if (!res.ok) {
      if (res.status >= 500) return false;
      return null;
    }

    const data = await res.json();

    if (!data.token_hash || !data.email) return null;

    // Intercambiar el token por una sesión de Supabase
    const auth = await fetch(C.url + '/auth/v1/verify', {
      method: 'POST',
      headers: {
        apikey: C.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token_hash: data.token_hash,
        type: 'magiclink'
      })
    });

    if (!auth.ok) return null;

    const j = await auth.json();

    if (!j.access_token || !j.refresh_token) return null;

    SS = {
      tok: j.access_token,
      ref: j.refresh_token,
      exp: Date.now() + (j.expires_in || 3600) * 1000
    };

    saveS();

    return data.email === C.users.m ? 'm' :
           data.email === C.users.f ? 'f' : null;

  } catch (e) {
    return false;
  }
};

RR.wipeAll=async function(){const rows=await api('GET','kv?select=key&key=like.ph:*&limit=5000');await rmImg(rows.map(r=>r.key.slice(3)+'.jpg'));await api('POST','rpc/wipe_all',{});M.dirty={};M.base={};M.up=[];M.since=0;saveM()};

/* ---------- fotos: la galería usa IndexedDB para las imágenes y la nube para compartirlas ---------- */
RR.attachDB=function(db){D=db;
 IG=id=>D.run('readonly',s=>s.get(id));IP=r=>D.run('readwrite',s=>s.put(r));ID=id=>D.run('readwrite',s=>s.delete(id));IK=()=>D.run('readonly',s=>s.getAllKeys());
 db.all=async()=>{const keys=new Set((await IK())||[]),out=[];
  for(let i=0;i<L.length;i++){const k=L.key(i);if(!k||!k.startsWith('ph:'))continue;const m=J(L.getItem(k));if(!m||m.__del)continue;const id=m.id||k.slice(3);if(!keys.has(id))continue;const rec=await IG(id);if(rec&&rec.img)out.push(Object.assign({},m,{id,rx:m.rx||{},cm:m.cm||[],img:rec.img}))}
  return out};
 db.put=async p=>{const id=p.id,rec=await IG(id);if(!rec||!rec.img){await IP({id,img:p.img});if(!M.up.includes(id))M.up.push(id)}
  window.RRLS['ph:'+id]=JSON.stringify({id,by:p.by,cat:p.cat,t:p.t,rx:p.rx||{},cm:p.cm||[],path:id+'.jpg'});saveM()};
 db.del=async id=>{await ID(id);M.up=M.up.filter(x=>x!=id);saveM();delete window.RRLS['ph:'+id]}};
RR._t={m3,flush,pull,pushKey,eq};
})();
