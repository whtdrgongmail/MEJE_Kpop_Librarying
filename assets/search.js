// Search only the readable public projection. No database or private keys.
const unique=items=>[...new Set(items)];
const fold=text=>String(text||'').normalize('NFC').trim().toLocaleLowerCase();
export function prepare(data){
 const entries=new Map(data.entries.map(e=>[e.page,e])),names=new Map();
 for(const e of data.entries)for(const name of [e.page,...Object.values(e.label),...Object.values(e.name),...e.aliases]){const n=fold(name);names.set(n,unique([...(names.get(n)||[]),e.page]));}
 const facets=new Map((data.facets||data.entries.map(e=>({value:e.page,headword:e.page,kind:e.kind,label:e.label,name:e.name}))).map(f=>[f.value,f]));
 return {...data,entries,names,facets,word_families:data.word_families||data.song_families,tagWords:new Set(data.tags.map(t=>t.word))};
}
export function resolve(data,text){if(data.entries.has(text))return [text];const n=fold(text),exact=[...data.entries.values()].filter(e=>[...Object.values(e.name),...Object.values(e.label)].some(name=>fold(name)===n)).map(e=>e.page);return exact.length?exact:data.names.get(n)||[];}
export function normalize(filters={}){
 const f={q:filters.q||'',kind:filters.kind||'',view:filters.view==='graph'?'graph':'list'};
 for(const axis of ['group','album','member','song','must','any','classification','topic'])f[axis]=unique((Array.isArray(filters[axis])?filters[axis]:filters[axis]?[filters[axis]]:[]).filter(Boolean));
 return f;
}
export function fromQuery(query){const p=new URLSearchParams(query),f={q:p.get('q')||'',kind:p.get('kind')||'',view:p.get('view')||''};for(const k of ['group','album','member','song','must','any','classification','topic'])f[k]=p.getAll(k);return normalize(f);}
export function queryString(filters){const f=normalize(filters),p=new URLSearchParams();for(const k of ['q','kind','view'])if(f[k]&&!(k==='view'&&f[k]==='list'))p.set(k,f[k]);for(const k of ['group','album','member','song','must','any','classification','topic'])for(const v of f[k])p.append(k,v);return p.toString();}
export function select(data,filters={}){
 const f=normalize(filters),q=fold(f.q),family=word=>data.song_families[word]||[word];
 const refs=(scene,word)=>(data.word_families[word]||[word]).some(page=>scene.words.includes(page));
 const scopes={group:'group',album:'album',member:'person',song:'song'};
 const invalid=unique([...f.must,...f.any].filter(word=>!data.entries.has(word)));
 for(const axis of Object.keys(scopes))for(const word of f[axis])if(data.facets.get(word)?.kind!==scopes[axis])invalid.push(word);
 for(const word of [...f.classification,...f.topic])if(!data.tagWords.has(word))invalid.push(word);
 const any=(wanted,values)=>!wanted.length||wanted.some(word=>values.includes(word));
 const sceneQuery=scene=>fold([scene.text.ko,scene.text.en,...scene.words.flatMap(word=>{const e=data.entries.get(word);return [e.name.ko,e.name.en,...Object.values(e.label),...e.aliases];}),...scene.classification,...scene.topic].join(' ')).includes(q);
 const scenes=invalid.length?[]:data.scenes.filter(s=>f.must.every(word=>refs(s,word))&&(!f.any.length||f.any.some(word=>refs(s,word)))&&any(f.group,s.groups)&&any(f.album,s.albums)&&any(f.member,s.members)&&(!f.song.length||f.song.some(word=>family(word).some(song=>s.songs.includes(song))))&&any(f.classification,s.classification)&&any(f.topic,s.topic)&&(!q||sceneQuery(s)));
 const active=q||f.must.length||f.any.length||f.group.length||f.album.length||f.member.length||f.song.length||f.classification.length||f.topic.length;
 const words=new Set(scenes.flatMap(s=>s.words));
 // A common song can be found through its supported descendants. A specific
 // language version cannot inherit a statement assigned only to its parent.
 for(const [parent,children] of Object.entries(data.word_families))if(children.some(child=>words.has(child)))words.add(parent);
 const entries=[...data.entries.values()].filter(e=>(!active||words.has(e.page))&&(!f.kind||(e.kinds||[e.kind]).includes(f.kind))&&(!q||fold([e.name.ko,e.name.en,...Object.values(e.label),...e.aliases,e.description.ko,e.description.en].join(' ')).includes(q)));
 return {filters:f,scenes,entries,invalid:unique(invalid)};
}

const ns='http://www.w3.org/2000/svg';
function svgNode(tag,attrs,text){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;}
export function graphData(data,result,limit=18){
 const allowed=new Set(result.entries.filter(e=>e.kind!=='content').map(e=>e.page)),weight=new Map();
 for(const scene of result.scenes)for(const word of scene.words)if(allowed.has(word))weight.set(word,(weight.get(word)||0)+1);
 const priority=new Set([...result.filters.must,...result.filters.any,...[...result.filters.group,...result.filters.album,...result.filters.member,...result.filters.song].map(word=>data.facets.get(word)?.headword)]);
 const nodes=result.entries.filter(e=>allowed.has(e.page)).sort((a,b)=>Number(priority.has(b.page))-Number(priority.has(a.page))||(weight.get(b.page)||0)-(weight.get(a.page)||0)).slice(0,limit),keys=new Set(nodes.map(e=>e.page)),edges=new Map();
 for(const pair of data.related||[]){if(!pair.every(word=>keys.has(word)))continue;const count=result.scenes.filter(scene=>pair.every(word=>scene.words.includes(word))).length;if(count)edges.set(JSON.stringify(pair),{from:pair[0],to:pair[1],count});}
 // Include parent/child links only for the already validated song families.
 for(const [parent,children] of Object.entries(data.word_families))if(keys.has(parent))for(const child of children)if(child!==parent&&keys.has(child)){const pair=[parent,child].sort(),key=JSON.stringify(pair);if(!edges.has(key))edges.set(key,{from:pair[0],to:pair[1],count:1});}
 return {nodes,edges:[...edges.values()],total:allowed.size};
}
function renderGraph(data,result,lang){
 const svg=document.querySelector('.explore-map');svg.replaceChildren();const model=graphData(data,result),count=model.nodes.length;let box={x:0,y:0,w:800,h:520};
 const positions=new Map(model.nodes.map((e,i)=>[e.page,{x:400+270*Math.cos(2*Math.PI*i/Math.max(count,1)-Math.PI/2),y:260+180*Math.sin(2*Math.PI*i/Math.max(count,1)-Math.PI/2)}]));
 const group=svgNode('g',{});svg.append(group);
 for(const edge of model.edges){const a=positions.get(edge.from),b=positions.get(edge.to);group.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,'stroke-width':Math.min(4,1+Math.log2(edge.count+1)/2)}));}
 for(const entry of model.nodes){const p=positions.get(entry.page),link=svgNode('a',{href:encodeURIComponent(entry.href[lang]),class:'map-node'});link.append(svgNode('title',{},entry.label[lang]));link.append(svgNode('circle',{cx:p.x,cy:p.y,r:entry.kind==='group'?25:18,class:entry.kind}));const label=entry.label[lang];link.append(svgNode('text',{x:p.x,y:p.y+38,'text-anchor':'middle'},label.length>20?label.slice(0,18)+'…':label));group.append(link);}
 document.querySelector('.map-count').textContent=lang==='ko'?`${model.total}개 표제 중 ${count}개 연결 표시 · 선은 본문에서 설명한 관계 또는 곡·버전 연결입니다.`:`Showing ${count} of ${model.total} headwords · Lines connect relationships explained in articles or songs and versions.`;
 function draw(){svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);}
 function zoom(factor){const w=box.w*factor,h=box.h*factor;if(w<160||w>1600)return;box={x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};draw();}
 document.querySelector('[data-map=plus]').onclick=()=>zoom(.8);document.querySelector('[data-map=minus]').onclick=()=>zoom(1.25);document.querySelector('[data-map=reset]').onclick=()=>{box={x:0,y:0,w:800,h:520};draw();};
 let drag=null;svg.onpointerdown=e=>{if(e.target.closest('a'))return;drag={x:e.clientX,y:e.clientY,box:{...box}};svg.setPointerCapture(e.pointerId);};svg.onpointermove=e=>{if(!drag)return;const rect=svg.getBoundingClientRect();box.x=drag.box.x-(e.clientX-drag.x)*box.w/rect.width;box.y=drag.box.y-(e.clientY-drag.y)*box.h/rect.height;draw();};svg.onpointerup=svg.onpointercancel=()=>{drag=null;};draw();
}
async function boot(){
 const form=document.querySelector('.search-tools');if(!form)return;const lang=document.documentElement.lang==='en'?'en':'ko',L=(ko,en)=>lang==='ko'?ko:en;
 let data;try{const response=await fetch(new URL('./search-data.json',import.meta.url));if(!response.ok)throw Error();data=prepare(await response.json());}catch{document.querySelector('.search-status').textContent=L('검색을 불러오지 못했습니다. 아래 표제 링크는 열 수 있습니다.','Search could not load. The headword links below remain available.');return;}
 form.querySelectorAll('[disabled]').forEach(e=>e.disabled=false);document.querySelector('.search-status').textContent='';
 const cards=[...document.querySelectorAll('.card')],pageByHref=new Map([...data.entries.values()].map(e=>[e.href[lang],e.page])),cardByPage=new Map(cards.map(card=>[pageByHref.get(decodeURIComponent(card.getAttribute('href'))),card]));let state=fromQuery(location.search),timer;
 const options=document.querySelector('#headword-options');for(const entry of data.entries.values()){const o=document.createElement('option');o.value=entry.label[lang];options.append(o);}
 function scopeValue(axis,word){const kind={group:'group',album:'album',member:'person',song:'song'}[axis];if(kind){if(data.facets.get(word)?.kind===kind)return word;const found=[...data.facets.values()].filter(f=>f.kind===kind&&[f.value,...Object.values(f.label),...Object.values(f.name)].some(n=>fold(n)===fold(word)));return found.length===1?found[0].value:word;}const matches=resolve(data,word);return matches.length===1?matches[0]:word;}
 for(const axis of ['group','album','member','song','must','any'])state[axis]=state[axis].map(word=>scopeValue(axis,word));
 function controls(){
  for(const axis of ['q','kind'])form.querySelector(`[name=${axis}]`).value=state[axis];
  for(const axis of ['group','album','member','song']){const el=form.querySelector(`[name=${axis}]`);for(const word of state[axis])if(![...el.options].some(o=>o.value===word)){const option=document.createElement('option');option.value=word;option.textContent=data.facets.get(word)?.label[lang]||L('알 수 없는 표제: ','Unknown headword: ')+word;el.append(option);}for(const option of el.options)option.selected=state[axis].length?state[axis].includes(option.value):option.value==='';}
  for(const axis of ['classification','topic'])form.querySelectorAll(`[data-tag-axis=${axis}]`).forEach(el=>el.checked=state[axis].includes(el.value));
  for(const axis of ['must','any']){const container=form.querySelector(`[data-chips=${axis}]`);container.replaceChildren();for(const word of state[axis]){const chip=document.createElement('button');chip.type='button';chip.className='condition'+(data.entries.has(word)?'':' unknown');const text=data.entries.get(word)?.label[lang]||word;chip.textContent=text+' ×';chip.setAttribute('aria-label',L(text+' 조건 제거','Remove '+text));chip.onclick=()=>{state[axis]=state[axis].filter(v=>v!==word);controls();update(true);};container.append(chip);}}
  const scopePanel=form.querySelector('.scope-disclosure');if(scopePanel&&['group','album','member','song'].some(k=>state[k].length))scopePanel.open=true;
  if(state.must.length||state.any.length||state.classification.length||state.topic.length)form.querySelector('.advanced-search').open=true;
 }
 function update(push=false){
  const result=select(data,state),visible=new Set(result.entries.map(e=>e.page));for(const [key,card] of cardByPage)card.hidden=!visible.has(key);
  document.querySelector('.index-total').textContent=L(`${visible.size}개 표제`,`${visible.size} entries`);document.querySelector('.empty').hidden=visible.size>0;
  document.querySelector('.condition-notice').textContent=result.invalid.length?L('사용할 수 없는 조건이 있습니다. 조건을 제거하거나 다른 표제를 선택해 주세요.','Some conditions are unavailable. Remove them or choose another headword.') : '';
  document.querySelector('.cards').hidden=state.view==='graph';document.querySelector('.map-panel').hidden=state.view!=='graph';document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
  if(state.view==='graph')renderGraph(data,result,lang);
  const query=queryString(state),url=location.pathname+(query?'?'+query:'');if(url!==location.pathname+location.search)history[push?'pushState':'replaceState']({},'',url);document.querySelector('.language').href='../'+(lang==='ko'?'en':'ko')+'/index.html'+(query?'?'+query:'');
 }
 for(const axis of ['group','album','member','song'])form.querySelector(`[name=${axis}]`).addEventListener('change',e=>{state[axis]=[...e.target.selectedOptions].map(o=>o.value).filter(Boolean);update(true);});
 form.querySelector('[name=kind]').addEventListener('change',e=>{state.kind=e.target.value;update(true);});
 form.querySelector('[name=q]').addEventListener('input',e=>{state.q=e.target.value;clearTimeout(timer);timer=setTimeout(()=>update(true),180);});
 for(const axis of ['classification','topic'])form.querySelectorAll(`[data-tag-axis=${axis}]`).forEach(el=>el.addEventListener('change',()=>{state[axis]=[...form.querySelectorAll(`[data-tag-axis=${axis}]:checked`)].map(e=>e.value);update(true);}));
 for(const axis of ['must','any']){
  const input=form.querySelector(`[name=${axis}-input]`),choice=form.querySelector(`[data-choice=${axis}]`);
  function commit(word){state[axis]=unique([...state[axis],word]);input.value='';choice.hidden=true;choice.replaceChildren();controls();update(true);}
  function add(){const text=input.value.trim();if(!text)return;const matches=resolve(data,text);if(matches.length<=1){commit(matches[0]||text);return;}choice.replaceChildren();choice.hidden=false;const hint=document.createElement('p');hint.textContent=L('동명이 있는 표제입니다. 하나를 선택해 주세요.','Several headwords share this name. Choose one.');choice.append(hint);for(const word of matches){const button=document.createElement('button');button.type='button';button.textContent=data.entries.get(word).label[lang];button.onclick=()=>commit(word);choice.append(button);}}
  form.querySelector(`[data-add=${axis}]`).onclick=add;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});
 }
 form.querySelector('[data-clear]').onclick=()=>{clearTimeout(timer);state=normalize();for(const el of form.querySelectorAll('[name$="-input"]'))el.value='';form.querySelectorAll('[data-choice]').forEach(el=>{el.hidden=true;el.replaceChildren();});controls();update(true);};
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{state.view=button.dataset.view;update(true);});
 addEventListener('popstate',()=>{clearTimeout(timer);state=fromQuery(location.search);controls();update(false);});controls();update(false);
}
if(typeof document!=='undefined')boot();
