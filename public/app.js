const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const app = $('#app');
const header = $('#siteHeader');
const lightbox = $('#lightbox');
let data;
let heroTimer = null;
let lightboxItems = [];
let lightboxIndex = 0;

async function fetchLocal(){
  const r = await fetch('/data/site.json', {cache:'no-store'});
  if(!r.ok) throw new Error(`site.json ${r.status}`);
  return r.json();
}

async function fetchRemote(){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), 2500);
  try{
    const r = await fetch('/api/content', {signal:controller.signal, cache:'no-store'});
    clearTimeout(t);
    if(!r.ok) return null;
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!ct.includes('json')) return null;
    return await r.json();
  }catch(e){ clearTimeout(t); return null; }
}

async function loadData(){
  // CloudBase static hosting has no `/api` backend, so the runtime content file
  // is the source of truth. A separate content API (CloudBase cloud function) is
  // preferred only when it is actually deployed and returns a valid payload.
  const local = await fetchLocal();
  const remote = await fetchRemote();
  if(remote && Array.isArray(remote.categories) && remote.categories.length) return remote;
  return local;
}

function route(){
  const raw = location.hash.replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return {raw, parts};
}

function navActive(){
  const {parts} = route();
  if(!parts.length) return 'overview';
  if(parts[0] === 'about') return 'about';
  return 'work';
}

function renderHeader(){
  const active = navActive();
  const metaLabel = active === 'overview' ? 'OVERVIEW <span>摄影作品</span>' : active === 'work' ? 'WORK <span>摄影作品</span>' : 'ABOUT <span>关于我</span>';
  header.innerHTML = `
    <div class="header-primary">
      <a class="brand" href="#/" aria-label="HOVAI overview">
        <span class="brand-en">${esc(data.site.brand)}</span>
        <span class="brand-zh">${esc(data.site.nameZh)}</span>
      </a>
      <div class="header-actions">
        <nav class="main-nav" aria-label="Primary navigation">
          <a href="#/" class="${active==='overview'?'active':''}"><span>OVERVIEW</span><span class="zh">概述</span></a>
          <a href="#/work" class="${active==='work'?'active':''}"><span>WORK</span><span class="zh">工作</span></a>
          <a href="#/about" class="${active==='about'?'active':''}"><span>ABOUT</span><span class="zh">关于我</span></a>
        </nav>
        <a class="edit-link" href="/admin.html"><span class="edit-zh">管理作品 / </span>Edit</a>
      </div>
    </div>
    <div class="header-rule"></div>
    <div class="header-meta"><span class="header-meta-label">${metaLabel}</span><span>${esc(data.site.location)}</span></div>`;
}
function catLink(cat){
  return cat.id === 'past-works' ? '#/work/past-works' : `#/work/${encodeURIComponent(cat.id)}`;
}

function renderHome(){
  const cats = data.categories;
  app.innerHTML = `<section class="app-view home-view fade-in">
    <div class="hero" id="hero">
      <div class="hero-stage">
        ${cats.map((c,i)=>`<div class="hero-slide ${i===0?'active':''}" data-hero="${i}">
          <picture>
            <source media="(max-width:760px)" srcset="${esc(c.mobileCover || c.cover)}">
            <img class="hero-image" src="${esc(c.cover)}" alt="${esc(c.title)}" style="--desk-pos:${esc(c.position||'50% 50%')};--mobile-pos:${esc(c.mobilePosition||c.position||'50% 50%')}" ${i===0?'fetchpriority="high"':''}>
          </picture>
          <div class="hero-slide-shade"></div>
        </div>`).join('')}
        <div class="hero-copy" id="heroCopy"></div>
      </div>
    </div>
    <div class="home-selector-shell">
      <div class="home-selector-inner">
        <div class="hero-selector" id="heroSelector">
          ${cats.map((c,i)=>`<button class="selector-card ${i===0?'active':''}" data-index="${i}" aria-label="Show ${esc(c.title)}">
            <img class="selector-thumb" src="${esc(c.cover)}" alt="">
            <span class="selector-meta"><span class="selector-no">${esc(c.number)}</span><span class="selector-name">${esc(c.title)}</span><span class="selector-arrow">→</span></span>
          </button>`).join('')}
        </div>
        <div class="selector-context"><span>OVERVIEW&nbsp; <em>摄影作品</em></span><span>${esc(data.site.location)}</span></div>
      </div>
    </div>
    <div class="home-list">
      ${cats.map(c=>`<a class="mobile-cat" href="${catLink(c)}"><img src="${esc(c.cover)}" alt=""><div class="text">${esc(c.title)}<div class="zh">${esc(c.titleZh)}</div></div><div class="arr">→</div></a>`).join('')}
    </div>
    ${footer()}
  </section>`;
  let active = 0;
  const copy = $('#heroCopy');
  const slides = $$('.hero-slide');
  const cards = $$('.selector-card');
  function activate(i, user=false){
    active = (i + cats.length) % cats.length;
    slides.forEach((el,n)=>el.classList.toggle('active',n===active));
    cards.forEach((el,n)=>el.classList.toggle('active',n===active));
    const c = cats[active];
    copy.classList.remove('copy-enter');
    void copy.offsetWidth;
    copy.innerHTML = `<div class="hero-index">${esc(c.number)} / 04&nbsp;&nbsp;&nbsp; HOVAI</div><h1 class="hero-title">${esc(c.title)}</h1><div class="hero-zh">${esc(c.titleZh)}</div><a class="hero-cta" href="${catLink(c)}"><span>VIEW WORK</span><span>→</span></a>`;
    copy.classList.add('copy-enter');
    if(user) restart();
  }
  function restart(){
    clearInterval(heroTimer);
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) heroTimer=setInterval(()=>activate(active+1), Number(data.site.cycleMs)||3000);
  }
  cards.forEach((el,i)=>{
    el.addEventListener('mouseenter',()=>activate(i,true));
    el.addEventListener('focus',()=>activate(i,true));
    el.addEventListener('click',()=>{ location.hash=catLink(cats[i]).replace(/^#/,'#'); });
  });
  const hero=$('#hero');
  hero.addEventListener('mouseenter',()=>clearInterval(heroTimer));
  hero.addEventListener('mouseleave',restart);
  activate(0); restart();
}
function renderWork(){
  app.innerHTML = `<section class="page fade-in">
    <div class="page-heading"><h1>Selected Work</h1><small>Still Life / People / Fashion / Past Works</small></div>
    <div class="work-grid">
      ${data.categories.map(c=>`<a class="work-card" href="${catLink(c)}"><div class="work-card-media"><img src="${esc(c.cover)}" alt="${esc(c.title)}"></div><div class="work-card-row"><span class="n">${esc(c.number)}</span><span class="t">${esc(c.title)} <span class="z">${esc(c.titleZh)}</span></span><span class="a">→</span></div></a>`).join('')}
    </div>
  </section>${footer()}`;
}

function renderCategory(id){
  const cat = data.categories.find(c=>c.id===id);
  if(!cat) return notFound();
  if(id==='past-works') return renderPastWorks(cat);
  const projects = data.projects.filter(p=>p.category===id);
  app.innerHTML = `<section class="category-layout fade-in">
    <aside class="side-index"><div class="side-title">ON THIS PAGE</div>${projects.map((p,i)=>`<a href="#/project/${encodeURIComponent(p.id)}"><span class="ix">${String(i+1).padStart(2,'0')}</span><span>${esc(p.title)}</span></a>`).join('')}</aside>
    <div class="category-content"><div class="category-head"><h1>${esc(cat.title)}</h1><span class="zh">${esc(cat.titleZh)}</span></div><div class="project-cards">
      ${projects.map(p=>`<a class="project-card" href="#/project/${encodeURIComponent(p.id)}"><div class="media"><img src="${esc(p.cover||p.items?.[0]?.src||cat.cover)}" alt="${esc(p.title)}"></div><div class="caption"><span>${esc(p.title)}</span><span class="year">${esc(p.year||'')}</span></div></a>`).join('')}
    </div></div>
  </section>${footer()}`;
}

function renderProject(id){
  const p = data.projects.find(x=>x.id===id);
  if(!p) return notFound();
  const cat = data.categories.find(c=>c.id===p.category);
  const siblings = data.projects.filter(x=>x.category===p.category);
  const items = p.items || [];
  app.innerHTML = `<section class="project-layout fade-in">
    <aside class="side-index"><div class="side-title">${esc(cat?.title||'WORK')}</div>${siblings.map((s,i)=>`<a class="${s.id===p.id?'active':''}" href="#/project/${encodeURIComponent(s.id)}"><span class="ix">${String(i+1).padStart(2,'0')}</span><span>${esc(s.title)}</span></a>`).join('')}</aside>
    <article><div class="project-top"><h1>${esc(p.title)}</h1><div class="meta">${esc(p.year||'')}<br>${esc(cat?.title||'')}</div></div><div class="project-stream">
      ${items.map((m,i)=>mediaMarkup(m,i,'project-media')).join('')}
    </div></article>
  </section><div class="progress-fixed" id="progress">01 / ${String(items.length).padStart(2,'0')}</div>${footer()}`;
  setupLightbox(items,'.project-media');
  setupProgress(items.length);
}

function mediaMarkup(m,i,cls=''){
  const rot = Number(m.rotation)||0;
  if(m.type==='video') return `<figure><video class="${cls}" data-media-index="${i}" src="${esc(m.src)}" controls playsinline preload="metadata" style="transform:rotate(${rot}deg)"></video></figure>`;
  return `<figure><img class="${cls}" data-media-index="${i}" src="${esc(m.src)}" alt="" loading="${i<2?'eager':'lazy'}" style="transform:rotate(${rot}deg)"></figure>`;
}

function renderPastWorks(cat){
  const items=data.pastWorks||[];
  app.innerHTML=`<section class="page fade-in"><div class="page-heading"><h1>${esc(cat.title)}</h1><small>${esc(cat.titleZh)}</small></div><div class="masonry">${items.map((m,i)=>`<div class="masonry-item">${m.type==='video'?`<video class="past-media" data-media-index="${i}" src="${esc(m.src)}" controls muted playsinline preload="metadata"></video>`:`<img class="past-media" data-media-index="${i}" src="${esc(m.src)}" alt="" loading="lazy">`}</div>`).join('')}</div></section>${footer()}`;
  setupLightbox(items,'.past-media');
}

function renderAbout(){
  const a=data.about;
  app.innerHTML=`<section class="about fade-in"><div class="about-grid"><div><div class="side-title">${esc(a.kicker||'ABOUT')}</div><h1>${esc(a.name)}</h1><div class="about-name-zh">${esc(a.nameZh)}</div><div class="about-intro">${esc(a.intro)}</div><div class="about-intro-zh">${esc(a.introZh)}</div><div class="about-facts"><div class="fact"><span>BASED IN</span><span>${esc(a.location)}</span></div><div class="fact"><span>EMAIL</span><a href="mailto:${esc(data.site.email)}">${esc(data.site.email)}</a></div><div class="fact"><span>WECHAT</span><span>${esc(data.site.wechat||'')}</span></div></div></div><div><div class="about-body">${esc(a.body)}<div class="zh">${esc(a.bodyZh)}</div></div><div class="about-images">${(a.images||[]).map(src=>`<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div><div class="about-quote">${esc(a.quote)}<div class="zh">${esc(a.quoteZh)}</div></div></div></div></section>${footer()}`;
}

function footer(){ return `<footer class="site-footer"><span>${esc(data.site.copyright||'© HOVAI')}</span><a href="#/">BACK TO OVERVIEW →</a></footer>`; }
function notFound(){ app.innerHTML=`<div class="error-card"><h2>Page not found</h2><a href="#/">Back to overview →</a></div>`; }

function setupProgress(total){
  if(!total) return;
  const els=$$('.project-media'); const box=$('#progress');
  const io=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible && box){ const i=Number(visible.target.dataset.mediaIndex)+1; box.textContent=`${String(i).padStart(2,'0')} / ${String(total).padStart(2,'0')}`; }
  },{threshold:[.2,.45,.7]});
  els.forEach(el=>io.observe(el));
}

function setupLightbox(items, selector){
  lightboxItems=items;
  $$(selector).forEach(el=>el.addEventListener('click',e=>{
    if(e.currentTarget.tagName==='VIDEO' && !e.altKey) return;
    openLightbox(Number(e.currentTarget.dataset.mediaIndex)||0);
  }));
}
function openLightbox(i){ lightboxIndex=i; drawLightbox(); lightbox.hidden=false; document.documentElement.style.overflow='hidden'; }
function drawLightbox(){
  const m=lightboxItems[lightboxIndex]; if(!m) return;
  const content=m.type==='video'?`<video src="${esc(m.src)}" controls autoplay playsinline></video>`:`<img src="${esc(m.src)}" alt="">`;
  lightbox.innerHTML=`${content}<button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">→</button><button class="lb-next" aria-label="Next">→</button><div class="lb-count">${String(lightboxIndex+1).padStart(2,'0')} / ${String(lightboxItems.length).padStart(2,'0')}</div>`;
  $('.lb-close',lightbox).onclick=closeLightbox;
  $('.lb-prev',lightbox).onclick=()=>{lightboxIndex=(lightboxIndex-1+lightboxItems.length)%lightboxItems.length;drawLightbox()};
  $('.lb-next',lightbox).onclick=()=>{lightboxIndex=(lightboxIndex+1)%lightboxItems.length;drawLightbox()};
}
function closeLightbox(){lightbox.hidden=true;lightbox.innerHTML='';document.documentElement.style.overflow=''}
lightbox.addEventListener('click',e=>{if(e.target===lightbox) closeLightbox()});
addEventListener('keydown',e=>{if(lightbox.hidden)return;if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')$('.lb-prev',lightbox)?.click();if(e.key==='ArrowRight')$('.lb-next',lightbox)?.click()});

function render(){
  clearInterval(heroTimer); heroTimer=null; renderHeader(); window.scrollTo({top:0,behavior:'instant'});
  const {parts}=route();
  if(!parts.length) return renderHome();
  if(parts[0]==='work' && !parts[1]) return renderWork();
  if(parts[0]==='work' && parts[1]) return renderCategory(parts[1]);
  if(parts[0]==='project' && parts[1]) return renderProject(parts[1]);
  if(parts[0]==='about') return renderAbout();
  notFound();
}

try{
  data=await loadData();
  render();
  addEventListener('hashchange',render);
}catch(e){
  console.error(e);
  app.innerHTML=`<div class="error-card"><h2>Unable to load site data</h2><p>The static site is present, but its content file could not be read.</p><pre>${esc(e.message)}</pre></div>`;
}
