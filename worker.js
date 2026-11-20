const DATASET="https://huggingface.co/datasets/sleeping-ai/Suno-Public-Playlist-small-audio/resolve/main/suno_music.txt?download=true";

const EXP=[
"experimental",
"turntablism",
"avant-garde",
"avant garde",
"abstract",
"weird",
"crazy",
"mystic",
"psychedelic",
"surreal",
"unconventional",
"glitch",
"idm",
"leftfield",
"hybrid",
"chaotic",
"freestyle",
"experimental electronic"
];


function cors(b,s=200){

return new Response(
JSON.stringify(b),
{
status:s,
headers:{
"content-type":"application/json; charset=utf-8",
"access-control-allow-origin":"*",
"access-control-allow-methods":"GET,OPTIONS",
"access-control-allow-headers":"*"
}
}
);

}


function norm(s){

return String(s||"")
.toLowerCase()
.normalize("NFKD")
.replace(/[\u0300-\u036f]/g,"")
.replace(/[^a-z0-9+#.\- ]+/g," ")
.replace(/\s+/g," ")
.trim();

}


function terms(s){

return String(s||"")
.split(",")
.map(norm)
.filter(Boolean)
.slice(0,8);

}


function ver(v,w){

let x=norm(v);

return

w==="v3"
?
(x==="v3"||x==="v3-all")

:

w==="v3.5"
?
x.includes("3.5")

:

w==="v3both"
?
(
x==="v3"||
x==="v3-all"||
x.includes("3.5")
)

:

w==="v4"
?
(
x.startsWith("v4")&&
!x.includes("4.5")
)

:

w==="v4.5"
?
x.includes("4.5")

:

x.startsWith("v4");

}


function expscore(h){

return EXP.reduce(
(n,t)=>
n+(h.includes(norm(t))?1:0),
0
);

}


function score(d,st,ex,mode,em){

let h=
norm(
(d.tags||"")+
" "+
(d.title||"")
);


if(
ex.some(x=>h.includes(x))
)
return null;


let hits=
st.filter(
x=>h.includes(x)
).length;


if(
st.length&&
!h.includes(st[0])
)
return null;


if(
st.length&&
mode==="all"&&
hits<st.length
)
return null;


if(
st.length&&
mode==="any"&&
hits<1
)
return null;


let e=expscore(h);


if(
em==="only"&&!e
)
return null;


let s=
hits*100+
e*10+
(
st.length&&
h.includes(st[0])
?
30
:
0
);


if(em==="boost")
s+=e*25;


return{
...d,
match_score:s,
experimental_hits:e
};

}


async function ids(){

let c=
await caches.default.match(
new Request(
"https://cache.local/suno-ids"
)
);


if(c)
return c.json();


let r=
await fetch(
DATASET,
{
cf:{
cacheTtl:86400
}
}
);


if(!r.ok)
throw Error(
"Nie można pobrać listy ID."
);


let a=[
...new Set(
[
...(await r.text())
.matchAll(
/https:\/\/cdn1\.suno\.ai\/([0-9a-f-]{36})\.mp3/gi
)
]
.map(m=>m[1])
)
];


if(!a.length)
throw Error(
"Lista ID jest pusta."
);


let z=
new Response(
JSON.stringify(a),
{
headers:{
"content-type":"application/json"
}
}
);


await caches.default.put(
new Request(
"https://cache.local/suno-ids"
),
z.clone()
);


return a;

}


/*
Pomocniczo:
szukamy wartości zarówno
bezpośrednio w obiekcie clip,
jak i w metadata.
*/

function first(o,keys){

for(
const k of keys
){

if(
o &&
o[k]!==undefined &&
o[k]!==null &&
o[k]!==""
)
return o[k];

}

return null;

}


/*
Wyciągamy interesujące nas dane,
ale zachowujemy również cały oryginalny
JSON w raw_api.
*/

function extract(d,id){

const md=
d?.metadata||{};


const persona=
first(d,["persona"])||
first(md,["persona"])||
{};


const voice=
first(d,["voice"])||
first(md,["voice"])||
{};


return{

id:
d?.id||
id,


model_version:
d?.major_model_version||
d?.model_version||
md?.major_model_version||
"",


title:
d?.title||
md?.title||
"",


handle:
d?.handle||
md?.handle||
"",


display_name:
d?.display_name||
md?.display_name||
"",


tags:
md?.tags||
d?.tags||
"",


created_at:
d?.created_at||
md?.created_at||
"",


audio_url:
d?.audio_url||
md?.audio_url||
"",


has_vocal:
first(
d,
["has_vocal"]
)
??
first(
md,
["has_vocal"]
),


is_remix:
first(
d,
["is_remix"]
)
??
first(
md,
["is_remix"]
),


voice_id:
first(
d,
["voice_id"]
)
??
first(
md,
["voice_id"]
)
??
first(
voice,
["id","voice_id"]
),


voice_name:
first(
d,
["voice_name"]
)
??
first(
md,
["voice_name"]
)
??
first(
voice,
["name","voice_name"]
),


persona_id:
first(
d,
["persona_id"]
)
??
first(
md,
["persona_id"]
)
??
first(
persona,
["id","persona_id"]
),


persona_name:
first(
d,
["persona_name"]
)
??
first(
md,
["persona_name"]
)
??
first(
persona,
["name","persona_name"]
),


source_type:
first(
d,
["source_type","clip_type","type"]
)
??
first(
md,
["source_type","clip_type","type"]
),


source_clips:
first(
d,
["source_clips"]
)
??
first(
md,
["source_clips"]
),


raw_api:d

};

}


async function clip(id){

let r=
await fetch(
"https://studio-api.prod.suno.com/api/clip/"+id,
{
headers:{
"user-agent":"Mozilla/5.0"
},
cf:{
cacheTtl:3600,
cacheEverything:true
}
}
);


if(!r.ok)
return null;


let d=
await r.json();


if(
d.status!=="complete"||
!d.major_model_version
)
return null;


return extract(d,id);

}


export default{

async fetch(req){

if(req.method==="OPTIONS")
return cors({},204);


let u=
new URL(req.url);


if(u.pathname==="/health")
return cors({ok:true});


/*
================================================
DEBUG
================================================

Przykład:

/debug?id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Zwraca pełny JSON z API Suno.
*/

if(
u.pathname==="/debug"
){

let id=
u.searchParams.get("id");


if(
!id||
!/^[0-9a-f-]{36}$/i.test(id)
){

return cors(
{
ok:false,
error:
"Podaj prawidłowe ID UUID utworu."
},
400
);

}


try{

let r=
await fetch(
"https://studio-api.prod.suno.com/api/clip/"+id,
{
headers:{
"user-agent":"Mozilla/5.0"
},
cf:{
cacheTtl:3600,
cacheEverything:true
}
}
);


let body=
await r.text();


let parsed;


try{

parsed=
JSON.parse(body);

}

catch{

parsed={
raw:body
};

}


return cors(
{
ok:r.ok,
http_status:r.status,
id:id,
api:parsed
},
r.ok?200:502
);


}

catch(e){

return cors(
{
ok:false,
id:id,
error:
String(
e.message||e
)
},
500
);

}

}


if(
u.pathname!=="/random"
){

return cors(
{
ok:false,
error:"Not found"
},
404
);

}


try{

let wanted=
u.searchParams.get("model")||
"both";


/*
Cloudflare Free:
maksymalnie 20 kandydatów
na jedno wywołanie naszego endpointu.
*/

let n=
Math.min(
Math.max(
+u.searchParams.get("tries")||20,
1
),
20
);


let st=
terms(
u.searchParams.get("style")
);


let ex=
terms(
u.searchParams.get("exclude")
);


let mode=
u.searchParams.get("match")==="any"
?
"any"
:
"all";


let em=
[
"normal",
"boost",
"only"
]
.includes(
u.searchParams.get("experimental")
)
?
u.searchParams.get("experimental")
:
"normal";


let a=
await ids();


let sample=[];

let seen=
new Set();


while(
sample.length<
Math.min(n,a.length)
){

let id=
a[
Math.floor(
Math.random()*a.length
)
];


if(
!seen.has(id)
){

seen.add(id);

sample.push(id);

}

}


let m=[];

let checked=0;


/*
5 równoległych zapytań.
Nie zwiększamy tego,
żeby nie uderzać w limit
połączeń Cloudflare.
*/

for(
let i=0;
i<sample.length;
i+=5
){

let b=
await Promise.all(
sample
.slice(i,i+5)
.map(clip)
);


checked+=b.length;


for(
let d of b
){

if(
d&&
ver(
d.model_version,
wanted
)
){

let x=
score(
d,
st,
ex,
mode,
em
);


if(x)
m.push(x);

}

}

}


if(!m.length){

return cors(
{
ok:false,
checked,
error:
st.length
?
"Nie znaleziono utworu spełniającego warunki. Zwiększ liczbę prób albo poluzuj filtr."
:
"Nie znaleziono pasującego utworu."
},
404
);

}


m.sort(
(a,b)=>
b.match_score-a.match_score
);


/*
Zwracamy do 10 najlepszych.
Frontend wybiera losowo spośród
najlepszych wyników.
*/

return cors(
{
ok:true,
checked,
results:
m.slice(0,10)
}
);


}

catch(e){

return cors(
{
ok:false,
error:
String(
e.message||e
)
},
500
);

}

}

};
