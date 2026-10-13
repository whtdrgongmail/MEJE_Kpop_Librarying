const root=document.querySelector('.video-controls');
if(root){
 const cards=[...document.querySelectorAll('.video-card')],lang=document.documentElement.lang;
 const q=root.querySelector('[name=video-q]'),category=root.querySelector('[name=video-category]'),series=root.querySelector('[name=video-series]');
 function restore(){const params=new URLSearchParams(location.search);q.value=params.get('q')||'';category.value=params.get('category')||'';series.value=params.get('series')||'';}
 function update(sync=true){
  const words=q.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let count=0;
  for(const card of cards){card.hidden=!(words.every(w=>card.dataset.videoSearch.toLocaleLowerCase().includes(w))&&(!category.value||card.dataset.videoCategory===category.value)&&(!series.value||card.dataset.videoSeries===series.value));if(!card.hidden)count++;}
  document.querySelector('.video-count').textContent=lang==='ko'?`${count}개 영상`:`${count} videos`;
  document.querySelector('.video-empty').hidden=count>0;
  const params=new URLSearchParams();for(const [key,value] of [['q',q.value],['category',category.value],['series',series.value]])if(value)params.set(key,value);
  const query=params.size?'?'+params.toString():'';
  if(sync)history.replaceState({},'',location.pathname+query+location.hash);
  document.querySelector('.language').href='../'+(lang==='ko'?'en':'ko')+'/videos.html'+query+location.hash;
 }
 root.hidden=false;restore();update(false);
 q.addEventListener('input',()=>update());category.addEventListener('change',()=>update());series.addEventListener('change',()=>update());
 addEventListener('popstate',()=>{restore();update(false);});
}
