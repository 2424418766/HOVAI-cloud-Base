const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const app=$('#adminApp');
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
let data=null, original=null, loadedVersion=0, active='home', selectedProject=null, busy=false;
const BASE=(window.HOVAI_API_BASE||'').replace(/\/$/,'');

async function api(url,options={}){
  const r=await fetch(BASE+url,{credentials:'same-origin',...options,headers:{...(options.body && !(options.body instanceof Blob) ? {'content-type':'application/json'}:{}),...(options.headers||{})}});
  let payload=null; const ct=r.headers.get('content-type')||'';
  try{payload=ct.includes('application/json')?await r.json():await r.text()}catch{}
  if(!r.ok){const msg=(payload&&payload.error)||payload||`${r.status} ${r.statusText}`;throw new Error(String(msg))}
  return payload;
}
function toast(msg){const old=$('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600)}
function setStatus(msg){const el=$('#topStatus');if(el)el.textContent=msg}
function safeId(s){return String(s||'project').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||`project-${Date.now()}`}
function field(label,value,key,type='text',extra=''){
  return `<div class="field"><label>${esc(label)}</label>${type==='textarea'?`<textarea data-key="${esc(key)}" ${extra}>${esc(value)}</textarea>`:`<input type="${type}" data-key="${esc(key)}" value="${esc(value)}" ${extra}>`}</div>`
}
function mediaPreview(m){return m?.type==='video'?`<video src="${esc(m.src)}" muted playsinline preload="metadata"></video>`:`<img src="${esc(m?.src||'')}" alt="">`}

async function boot(){
  try{
    const st=await api('/api/auth/status');
    if(!st.configured) return renderLogin('后台尚未配置。请先在 CloudBase 控制台 → 环境 → 云函数配置中设置环境变量 ADMIN_PASSWORD 和 SESSION_SECRET（至少 24 个字符），并部署云函数 api。');
    if(!st.authenticated) return renderLogin('');
    await loadContent(); renderShell();
  }catch(e){renderLogin(`无法连接后台：${e.message}`)}
}
function renderLogin(message=''){
  app.innerHTML=`<div class="login-wrap"><form class="login-card" id="loginForm"><h1>HOVAI</h1><div class="sub">PORTFOLIO CONTENT EDITOR</div><div class="field"><label>ADMIN PASSWORD</label><input id="password" type="password" autocomplete="current-password" required></div><button class="btn" type="submit">LOGIN</button>${message?`<div class="notice">${esc(message)}</div>`:''}<div class="hint" style="margin-top:20px">网站前台不依赖登录；即使后台尚未配置，CloudBase 仍可正常展示静态作品。</div></form></div>`;
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api('/api/auth/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});await loadContent();renderShell()}catch(err){$('.notice')?.remove();$('#loginForm').insertAdjacentHTML('beforeend',`<div class="notice">${esc(err.message)}</div>`)}finally{btn.disabled=false}};
}
async function loadContent(){data=await api('/api/content');original=clone(data);loadedVersion=Number(data.version)||0;if(!selectedProject)selectedProject=data.projects?.[0]?.id||null}
function renderShell(){
  app.innerHTML=`<header class="admin-top"><div class="admin-brand">HOVAI / EDIT</div><div class="status" id="topStatus">Version ${loadedVersion}</div><a class="btn ghost small" href="/" target="_blank">VIEW SITE ↗</a><button class="btn secondary small" id="reloadBtn">RELOAD</button><button class="btn small" id="saveBtn">SAVE</button><button class="btn ghost small" id="logoutBtn">LOG OUT</button></header><div class="admin-grid"><nav class="admin-nav" id="adminNav">${[['home','首页'],['projects','项目'],['past','更多案例'],['about','关于'],['json','JSON']].map(([k,n])=>`<button data-tab="${k}" class="${active===k?'active':''}">${n}</button>`).join('')}</nav><main class="admin-content" id="adminContent"></main></div>`;
  $('#adminNav').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;active=b.dataset.tab;renderShell()};
  $('#reloadBtn').onclick=async()=>{if(!confirm('放弃尚未保存的修改并重新载入？'))return;await loadContent();renderShell();toast('已重新载入')};
  $('#saveBtn').onclick=save;
  $('#logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});renderLogin('已退出。')};
  renderActive();
}
function renderActive(){if(active==='home')renderHomeEditor();else if(active==='projects')renderProjects();else if(active==='past')renderPast();else if(active==='about')renderAbout();else renderJson()}

function renderHomeEditor(){
  const c=$('#adminContent');
  c.innerHTML=`<div class="section-head"><div><h2>首页 / Categories</h2><p>封面、手机端封面与裁切位置。首页自动轮播时间也可在这里调整。</p></div></div><div class="edit-card" style="margin-bottom:14px"><div class="two">${field('Brand',data.site.brand,'site.brand')}${field('中文名',data.site.nameZh,'site.nameZh')}${field('Location',data.site.location,'site.location')}${field('轮播毫秒',data.site.cycleMs,'site.cycleMs','number','min="1200" step="100"')}</div></div><div class="cards">${data.categories.map((cat,i)=>`<article class="edit-card" data-cat="${i}"><div class="preview"><img src="${esc(cat.cover)}" alt="" style="object-position:${esc(cat.position||'50% 50%')}"></div><h3>${esc(cat.number)} / ${esc(cat.title)}</h3><div class="two">${field('English',cat.title,'title')}${field('中文',cat.titleZh,'titleZh')}</div>${field('Desktop cover',cat.cover,'cover')}${field('Mobile cover',cat.mobileCover||cat.cover,'mobileCover')}<div class="two">${field('Desktop object-position',cat.position||'50% 50%','position')}${field('Mobile object-position',cat.mobilePosition||cat.position||'50% 50%','mobilePosition')}</div><div class="upload-zone"><div><strong>替换封面</strong><div class="hint">图片会自动压缩为适合网页的 WebP；可分别设置桌面与手机。</div></div><div class="row"><button class="btn ghost small upload-cover" data-mode="cover">Desktop</button><button class="btn ghost small upload-cover" data-mode="mobileCover">Mobile</button></div></div></article>`).join('')}</div>`;
  bindPathFields(c);
  $$('.edit-card[data-cat]',c).forEach(card=>{
    const i=Number(card.dataset.cat);
    card.querySelectorAll('[data-key]').forEach(el=>el.addEventListener('input',()=>{data.categories[i][el.dataset.key]=el.value;const img=card.querySelector('.preview img');img.src=data.categories[i].cover;img.style.objectPosition=data.categories[i].position||'50% 50%'}));
    card.querySelectorAll('.upload-cover').forEach(btn=>btn.onclick=async()=>{const f=await pickFile('image/*');if(!f)return;const up=await uploadFile(f);data.categories[i][btn.dataset.mode]=up.url;if(btn.dataset.mode==='cover')card.querySelector('.preview img').src=up.url;renderHomeEditor();toast('封面已上传，记得保存')});
  });
}
function bindPathFields(root){
  $$('[data-key^="site."]',root).forEach(el=>el.addEventListener('input',()=>{const k=el.dataset.key.split('.')[1];data.site[k]=el.type==='number'?Number(el.value):el.value}));
}

function renderProjects(){
  if(!data.projects?.length)selectedProject=null;
  if(selectedProject&&!data.projects.find(p=>p.id===selectedProject))selectedProject=data.projects[0]?.id||null;
  const p=data.projects.find(x=>x.id===selectedProject);
  const c=$('#adminContent');
  c.innerHTML=`<div class="section-head"><div><h2>项目 / Projects</h2><p>新增、排序、移动图片、旋转、上传图片或视频。</p></div><button class="btn secondary small" id="addProject">+ NEW PROJECT</button></div><div class="project-editor"><aside class="project-list"><div class="items">${data.projects.map(x=>`<button class="item ${x.id===selectedProject?'active':''}" data-project="${esc(x.id)}">${esc(x.title||x.id)}</button>`).join('')}</div></aside><section class="project-detail" id="projectDetail">${p?projectDetail(p):'<div class="hint">暂无项目。</div>'}</section></div>`;
  $$('.project-list .item',c).forEach(b=>b.onclick=()=>{selectedProject=b.dataset.project;renderProjects()});
  $('#addProject').onclick=()=>{const cat=data.categories[0]?.id||'still-life';const id=`new-${Date.now()}`;data.projects.push({id,category:cat,title:'New Project',year:String(new Date().getFullYear()),cover:'',items:[]});selectedProject=id;renderProjects()};
  if(p)bindProjectDetail(p);
}
function projectDetail(p){
  return `<div class="row" style="justify-content:space-between"><h3 style="font-weight:400;margin:0 0 15px;font-size:18px">${esc(p.title)}</h3><button class="btn danger small" id="deleteProject">DELETE PROJECT</button></div><div class="two">${field('Title',p.title,'title')}${field('Year',p.year||'','year')}</div><div class="two"><div class="field"><label>Category</label><select data-key="category">${data.categories.filter(c=>c.id!=='past-works').map(c=>`<option value="${esc(c.id)}" ${c.id===p.category?'selected':''}>${esc(c.title)} / ${esc(c.titleZh)}</option>`).join('')}</select></div>${field('ID',p.id,'id')}</div>${field('Cover URL',p.cover||'','cover')}<div class="upload-zone"><div><strong>上传素材</strong><div class="hint">图片自动压缩；视频保留原文件并使用分块上传。</div><div class="progress"><i id="uploadProgress"></i></div></div><button class="btn secondary small" id="uploadMedia">+ IMAGE / VIDEO</button></div><div class="media-list">${(p.items||[]).map((m,i)=>mediaRow(p,m,i)).join('')}</div>`;
}
function mediaRow(p,m,i){
  return `<div class="media-row" data-i="${i}"><div class="media-thumb">${mediaPreview(m)}</div><div><div class="media-src">${esc(m.src)}</div><div class="hint">${esc(m.type||'image')} · rotation ${Number(m.rotation)||0}°</div></div><div class="media-actions"><button class="btn ghost small" data-act="up">↑</button><button class="btn ghost small" data-act="down">↓</button><button class="btn ghost small" data-act="rotate">↻ 90°</button><select data-act="move" class="btn ghost small"><option value="">Move to…</option>${data.projects.filter(x=>x.id!==p.id).map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select><button class="btn danger small" data-act="remove">REMOVE</button></div></div>`
}
function bindProjectDetail(p){
  const detail=$('#projectDetail');
  $$('[data-key]',detail).forEach(el=>el.addEventListener('change',()=>{
    const old=p.id; p[el.dataset.key]=el.value;
    if(el.dataset.key==='id'){p.id=safeId(p.id);selectedProject=p.id;if(old!==p.id)renderProjects()}
  }));
  $$('input[data-key]',detail).forEach(el=>el.addEventListener('input',()=>{p[el.dataset.key]=el.value}));
  $('#deleteProject').onclick=()=>{if(!confirm(`删除项目 “${p.title}”？`))return;data.projects=data.projects.filter(x=>x!==p);selectedProject=data.projects[0]?.id||null;renderProjects()};
  $('#uploadMedia').onclick=async()=>{const f=await pickFile('image/*,video/*');if(!f)return;const up=await uploadFile(f,progress=>{const bar=$('#uploadProgress');if(bar)bar.style.width=`${progress}%`});const item={type:up.type.startsWith('video/')?'video':'image',src:up.url,rotation:0};p.items=p.items||[];p.items.push(item);if(!p.cover)p.cover=up.url;renderProjects();toast('素材已上传，记得保存')};
  $$('.media-row',detail).forEach(row=>row.onclick=e=>{const btn=e.target.closest('[data-act]');if(!btn)return;const i=Number(row.dataset.i),items=p.items;const act=btn.dataset.act;if(act==='up'&&i>0)[items[i-1],items[i]]=[items[i],items[i-1]];else if(act==='down'&&i<items.length-1)[items[i+1],items[i]]=[items[i],items[i+1]];else if(act==='rotate')items[i].rotation=((Number(items[i].rotation)||0)+90)%360;else if(act==='remove')items.splice(i,1);renderProjects()});
  $$('select[data-act="move"]',detail).forEach(sel=>sel.onchange=()=>{if(!sel.value)return;const row=sel.closest('.media-row'),i=Number(row.dataset.i);const dest=data.projects.find(x=>x.id===sel.value);if(!dest)return;const [m]=p.items.splice(i,1);dest.items=dest.items||[];dest.items.push(m);renderProjects();toast(`已移动到 ${dest.title}`)});
}

function renderPast(){
  const c=$('#adminContent'),items=data.pastWorks||[];
  c.innerHTML=`<div class="section-head"><div><h2>更多案例 / Past Works</h2><p>错落图墙；视频也可以直接穿插。</p></div><button class="btn secondary small" id="addPast">+ UPLOAD</button></div><div class="progress"><i id="uploadProgress"></i></div><div class="past-grid" style="margin-top:14px">${items.map((m,i)=>`<div class="past-item" data-i="${i}"><div class="thumb">${mediaPreview(m)}</div><div class="row"><span class="hint">${String(i+1).padStart(2,'0')}</span><div class="row"><button class="btn ghost small" data-act="up">↑</button><button class="btn ghost small" data-act="down">↓</button><button class="btn danger small" data-act="remove">×</button></div></div></div>`).join('')}</div>`;
  $('#addPast').onclick=async()=>{const f=await pickFile('image/*,video/*');if(!f)return;const up=await uploadFile(f,p=>{const b=$('#uploadProgress');if(b)b.style.width=`${p}%`});data.pastWorks.push({type:up.type.startsWith('video/')?'video':'image',src:up.url});renderPast();toast('已上传，记得保存')};
  $$('.past-item',c).forEach(row=>row.onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const i=Number(row.dataset.i);if(b.dataset.act==='up'&&i>0)[items[i-1],items[i]]=[items[i],items[i-1]];else if(b.dataset.act==='down'&&i<items.length-1)[items[i+1],items[i]]=[items[i],items[i+1]];else if(b.dataset.act==='remove')items.splice(i,1);renderPast()});
}

function renderAbout(){
  const a=data.about,c=$('#adminContent');
  c.innerHTML=`<div class="section-head"><div><h2>关于 / About</h2><p>联系方式、介绍、结束语以及 About 图片。</p></div></div><div class="about-edit"><div>${field('Name',a.name,'name')}${field('中文名',a.nameZh,'nameZh')}${field('Intro',a.intro,'intro')}${field('Intro 中文',a.introZh,'introZh')}${field('Location',a.location,'location')}${field('Email',data.site.email,'site.email','email')}${field('WeChat',data.site.wechat||'','site.wechat')}</div><div>${field('Body',a.body,'body','textarea')}${field('Body 中文',a.bodyZh,'bodyZh','textarea')}${field('Quote',a.quote,'quote','textarea')}${field('Quote 中文',a.quoteZh,'quoteZh','textarea')}</div></div><div class="section-head" style="margin-top:24px"><div><h2 style="font-size:18px">About images</h2><p>建议保留 2–6 张观察/个人照片。</p></div><button class="btn secondary small" id="addAboutImage">+ UPLOAD</button></div><div class="past-grid">${(a.images||[]).map((src,i)=>`<div class="past-item" data-i="${i}"><div class="thumb"><img src="${esc(src)}" alt=""></div><div class="row"><span class="hint">${String(i+1).padStart(2,'0')}</span><button class="btn danger small" data-remove>×</button></div></div>`).join('')}</div>`;
  $$('[data-key]',c).forEach(el=>el.addEventListener('input',()=>{if(el.dataset.key.startsWith('site.'))data.site[el.dataset.key.split('.')[1]]=el.value;else a[el.dataset.key]=el.value}));
  $('#addAboutImage').onclick=async()=>{const f=await pickFile('image/*');if(!f)return;const up=await uploadFile(f);a.images=a.images||[];a.images.push(up.url);renderAbout();toast('已上传，记得保存')};
  $$('[data-remove]',c).forEach(b=>b.onclick=()=>{a.images.splice(Number(b.closest('.past-item').dataset.i),1);renderAbout()});
}

function renderJson(){
  const c=$('#adminContent');
  c.innerHTML=`<div class="section-head"><div><h2>JSON</h2><p>高级编辑。修改后点击“APPLY JSON”，再用顶部 SAVE 写入线上内容。</p></div><button class="btn secondary small" id="applyJson">APPLY JSON</button></div><div class="json-box"><textarea id="jsonText">${esc(JSON.stringify(data,null,2))}</textarea></div>`;
  $('#applyJson').onclick=()=>{try{const next=JSON.parse($('#jsonText').value);if(!Array.isArray(next.categories)||!Array.isArray(next.projects))throw new Error('categories / projects 缺失');data=next;toast('JSON 已应用，记得保存')}catch(e){alert(e.message)}};
}

async function save(){
  if(busy)return;busy=true;const btn=$('#saveBtn');if(btn)btn.disabled=true;setStatus('Checking…');
  try{
    const remote=await api('/api/content');const rv=Number(remote.version)||0;
    if(rv!==loadedVersion){if(!confirm(`线上内容已从 Version ${loadedVersion} 变为 Version ${rv}。继续保存会覆盖线上新修改，是否继续？`))throw new Error('已取消保存')}
    setStatus('Saving…');const result=await api('/api/content',{method:'PUT',body:JSON.stringify(data)});data.version=Number(result.version)||rv+1;loadedVersion=data.version;original=clone(data);setStatus(`Saved · Version ${loadedVersion}`);toast('保存成功')
  }catch(e){setStatus(`Save failed · ${e.message}`);if(e.message!=='已取消保存')alert(`保存失败：${e.message}`)}finally{busy=false;if(btn)btn.disabled=false}
}
function pickFile(accept){return new Promise(resolve=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.onchange=()=>resolve(i.files?.[0]||null);i.click()})}
async function compressImage(file){
  if(!file.type.startsWith('image/') || file.type==='image/gif')return file;
  const bitmap=await createImageBitmap(file);const max=3000;const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,w,h);bitmap.close?.();
  const blob=await new Promise(res=>canvas.toBlob(res,'image/webp',0.9));if(!blob)return file;return new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp',lastModified:Date.now()});
}
async function uploadFile(input,onProgress=()=>{}){
  let file=input;if(file.type.startsWith('image/')){setStatus('Optimizing image…');file=await compressImage(file)}
  setStatus('Uploading…');onProgress(1);
  const init=await api('/api/upload/init',{method:'POST',body:JSON.stringify({name:file.name,type:file.type||'application/octet-stream',size:file.size})});
  const chunkSize=init.chunkSize;
  for(let i=0;i<init.totalChunks;i++){
    const chunk=file.slice(i*chunkSize,Math.min(file.size,(i+1)*chunkSize));
    await api(`/api/upload/chunk/${encodeURIComponent(init.id)}/${i}`,{method:'POST',body:chunk,headers:{'content-type':'application/octet-stream'}});
    onProgress(Math.round(((i+1)/init.totalChunks)*92));
  }
  const done=await api(`/api/upload/complete/${encodeURIComponent(init.id)}`,{method:'POST',body:JSON.stringify({})});onProgress(100);setStatus(`Uploaded · ${file.name}`);return {url:done.url,type:file.type,name:file.name,size:file.size};
}

boot();
