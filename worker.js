const DATASET="https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";
function cors(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"*"}})}
async function getIds(env){
const key="suno-id-list-v1";const cached=await caches.default.match(new Request("https://cache.local/"+key));if(cached)return cached.json();
const r=await fetch(DATASET,{cf:{cacheTtl:86400}});if(!r.ok)throw new Error("Nie można pobrać listy publicznych ID.");
const txt=await r.text();const ids=[...txt.matchAll(/https:\/\/cdn1\.suno\.ai\/([0-9a-f-]{36})\.mp3/gi)].map(m=>m[1]);
const unique=[...new Set(ids)];if(!unique.length)throw new Error("Lista ID jest pusta.");
const resp=new Response(JSON.stringify(unique),{headers:{"content-type":"application/json","cache-control":"public,max-age=86400"}});
await caches.default.put(new Request("https://cache.local/"+key),resp.clone());return unique;
}
async function clip(id){
const r=await fetch("https://studio-api.prod.suno.com/api/clip/"+id,{headers:{"user-agent":"Mozilla/5.0"},cf:{cacheTtl:3600,cacheEverything:true}});
if(!r.ok)return null;const d=await r.json();if(d.status!=="complete")return null;const version=d.major_model_version||"";if(!version)return null;
return {id:d.id||id,model_version:version,title:d.title||d.metadata?.title||"",handle:d.handle||d.metadata?.handle||"",display_name:d.display_name||d.metadata?.display_name||"",tags:d.metadata?.tags||d.tags||"",created_at:d.created_at||"",audio_url:d.audio_url||""};
}
export default {async fetch(request,env){
if(request.method==="OPTIONS")return cors({},204);const u=new URL(request.url);if(u.pathname==="/health")return cors({ok:true});
if(u.pathname==="/random"){try{
const wanted=u.searchParams.get("model")||"both",tries=Math.min(Math.max(parseInt(u.searchParams.get("tries")||"15",10),1),40),ids=await getIds(env);
const sample=[],seen=new Set();while(sample.length<Math.min(tries,ids.length)){const id=ids[Math.floor(Math.random()*ids.length)];if(!seen.has(id)){seen.add(id);sample.push(id)}}
for(let i=0;i<sample.length;i+=5){const batch=await Promise.all(sample.slice(i,i+5).map(clip));for(const d of batch){if(!d)continue;const v=d.model_version.toLowerCase();
const ok=wanted==="v4"?(v==="v4"||v==="v4-all"):wanted==="v4.5"?v.includes("4.5"):wanted==="v3"?(v==="v3"||v==="v3-all"):wanted==="v3.5"?v.includes("3.5"):wanted==="v3both"?(v==="v3"||v==="v3-all"||v.includes("3.5")):v.startsWith("v4");
if(ok)return cors({ok:true,...d})}}
return cors({ok:false,error:"Nie znaleziono pasującego utworu w tej puli prób. Kliknij LOSUJ ponownie."},404)
}catch(e){return cors({ok:false,error:String(e.message||e)},500)}}
if(u.pathname==="/clip"){const id=u.searchParams.get("id");if(!/^[0-9a-f-]{36}$/i.test(id||""))return cors({ok:false,error:"Nieprawidłowe ID."},400);try{const d=await clip(id);return d?cors({ok:true,...d}):cors({ok:false,error:"Utwór nie jest dostępny publicznie."},404)}catch(e){return cors({ok:false,error:String(e.message||e)},500)}}
return cors({ok:false,error:"Not found"},404);
} };
