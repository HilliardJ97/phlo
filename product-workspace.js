'use strict';
(()=>{
const $=id=>document.getElementById(id);
const ICONS={mic:'<rect x="8" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6"/>',grid:'<rect x="3" y="3" width="6" height="6" rx="1.4"/><rect x="13" y="3" width="6" height="6" rx="1.4"/><rect x="3" y="13" width="6" height="6" rx="1.4"/><rect x="13" y="13" width="6" height="6" rx="1.4"/>',doc:'<path d="M6 3h7l4 4v12H6z"/><path d="M13 3v5h4M9 12h5M9 15h5"/>',stack:'<path d="m3 8 8-5 8 5-8 5zM3 12l8 5 8-5M3 16l8 5 8-5"/>',plus:'<path d="M11 4v14M4 11h14"/>',diagram:'<rect x="7" y="2" width="8" height="5" rx="1"/><rect x="1" y="15" width="8" height="5" rx="1"/><rect x="13" y="15" width="8" height="5" rx="1"/><path d="M11 7v4H5v4m6-4h6v4"/>',wireframe:'<rect x="3" y="3" width="16" height="16" rx="2"/><path d="M3 8h16M8 8v11"/>',metrics:'<path d="M3 18V5m0 13h16M7 15v-4m5 4V8m5 7V4"/>',summary:'<path d="M4 5h14M4 9h14M4 13h10M4 17h7"/>',spark:'<path d="m11 2 2.7 6.3L20 11l-6.3 2.7L11 20l-2.7-6.3L2 11l6.3-2.7z"/>',arrow:'<path d="M4 11h14m-5-5 5 5-5 5"/>',back:'<path d="M18 11H4m5-5-5 5 5 5"/>',close:'<path d="m5 5 12 12M17 5 5 17"/>',more:'<circle cx="4" cy="11" r="1"/><circle cx="11" cy="11" r="1"/><circle cx="18" cy="11" r="1"/>',ref:'<rect x="3" y="4" width="13" height="14" rx="2"/><path d="M7 2h11a2 2 0 0 1 2 2v11M4 14l4-4 4 3 3-3"/>',present:'<rect x="2" y="3" width="18" height="13" rx="2"/><path d="M11 16v5m-4 0h8"/>',chevron:'<path d="m8 5 6 6-6 6"/>',export:'<path d="M11 14V2m-4 4 4-4 4 4M4 12v7h14v-7"/>',link:'<path d="m8 14 6-6M8 7l2-2a4 4 0 0 1 6 6l-2 2M14 15l-2 2a4 4 0 0 1-6-6l2-2"/>',help:'<circle cx="11" cy="11" r="9"/><path d="M8 8a3 3 0 1 1 4 3v2m-1 3h.01"/>',connection:'<path d="M7 3v5m8-5v5M5 8h12v3a6 6 0 0 1-12 0zm6 9v4"/>',menu:'<path d="M3 5h16M3 11h16M3 17h16"/>',check:'<path d="m4 11 5 5 9-10"/>',search:'<circle cx="9" cy="9" r="6"/><path d="m14 14 6 6"/>',bold:'<path d="M6 3h6a4 4 0 0 1 0 8H6zm0 8h7a4 4 0 0 1 0 8H6z"/>',heading:'<path d="M4 3v16M17 3v16M4 11h13"/>'};
const icon=(name,size=16)=>`<svg width="${size}" height="${size}" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.doc}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const inkColors=['rgb(48, 50, 47)','rgb(168, 78, 45)','rgb(63, 104, 76)','rgb(60, 87, 138)'];
const fontFamilies=['system-ui','Georgia','monospace'];
const emojis=[
 ['✅','Check'],['💡','Idea'],['🎯','Target'],['📌','Pin'],['⚠️','Warning'],['❓','Question'],
 ['🚀','Launch'],['📊','Chart'],['🔍','Search'],['👍','Thumbs up'],['👀','Eyes'],['📝','Notes']
];
const labels={diagram:'Diagram',metrics:'Metric visual',wireframe:'Wireframe',summary:'Summary',clean:'Clean up'};
const blankState=()=>({format:1,documents:[{id:'blank-document',title:'Untitled',framework:'',html:'<p data-block="first-thought"><br></p>',references:[],referenceNotes:''}],artifacts:[],current:'blank-document'});
let state=blankState();
const KEY='product-workspace-v2';let storage=true;
const TOKEN=document.querySelector('meta[name=workspace-token]')?.content||'';
const SERVER=location.protocol==='http:'||location.protocol==='https:';
let ready=false,serverRevision=0,saveBusy=false,saveDirty=false,saveBlocked=false,connection={provider:'codex'},viewVersion=0;
const undoHistory=new Map(),redoHistory=new Map();let historyRestore=false,lastEdit=0;
let pendingCapture=null,currentJob=null,currentJobTask=null;
let uploadDestination=null,imageJobRunning=false;
const inlineVisual='[data-artifact],[data-image]';
try{const saved=localStorage.getItem(KEY);if(saved){const parsed=JSON.parse(saved);if(parsed.format===1&&Array.isArray(parsed.documents)&&parsed.documents.length&&Array.isArray(parsed.artifacts))state=parsed;}}catch(e){storage=false;}
const references=JSON.parse($('reference-seed').textContent);if(!state.documents[0].references.length)state.documents[0].references=references;
let view='document',activeArtifact=null,selectionText='',selectionRange=null,selectionBlock='',selectionHeading='',makerTask='diagram',returnFocus=null,savingTimer,toastTimer,referenceFocus=null;
const doc=()=>state.documents.find(d=>d.id===state.current)||state.documents[0];
function notify(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4000);}
async function api(path,payload){
 const options=payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Token':TOKEN},body:JSON.stringify(payload)};
 let response;
 try{response=await fetch(path,options);}catch(e){throw Error('The local workspace is unavailable. Keep this tab open and restart the launcher.');}
 let data;try{data=await response.json();}catch(e){throw Error('The local workspace returned an unreadable response.');}
 if(!response.ok){const error=Error(data.error||'The request could not be completed.');error.status=response.status;throw error;}
 return data;
}
function browserBackup(){try{localStorage.setItem(KEY,JSON.stringify({...state,documents:state.documents.map(d=>({...d,references:[]}))}));storage=true;}catch(e){storage=false;}}
function save(){if(!ready)return;browserBackup();clearTimeout(savingTimer);saveDirty=true;$('saved').textContent=SERVER?'Saving…':'Browser copy only';savingTimer=setTimeout(flushSave,350);}
async function flushSave(){
 if(!SERVER||!ready||saveBusy||saveBlocked||!saveDirty)return;
 saveBusy=true;saveDirty=false;
 try{const result=await api('/api/state',{state,revision:serverRevision});serverRevision=result.revision;$('saved').textContent=saveDirty?'Saving…':'Saved on this Mac';}
 catch(e){saveDirty=true;if(e.status===409)saveBlocked=true;$('saved').textContent=saveBlocked?'Save conflict · export your copy':'Not saved · export your copy';notify(e.message);}
 finally{saveBusy=false;if(saveDirty&&!saveBlocked&&$('saved').textContent==='Saving…')setTimeout(flushSave,50);}
}
function canonicalHTML(){const c=$('editor').cloneNode(true);c.querySelectorAll(inlineVisual).forEach(el=>el.replaceChildren());return c.innerHTML;}
function caretOffset(){const s=getSelection();if(!s?.rangeCount||!$('editor').contains(s.anchorNode))return 0;const r=s.getRangeAt(0).cloneRange();r.selectNodeContents($('editor'));r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().length;}
function restoreOffsets(start,end=start){const root=$('editor');const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,pos=0,a=null,b=null;while(node=walker.nextNode()){const next=pos+node.length;if(!a&&start<=next)a=[node,Math.max(0,start-pos)];if(end<=next){b=[node,Math.max(0,end-pos)];break;}pos=next;}const r=document.createRange();if(a&&b){r.setStart(...a);r.setEnd(...b);}else{r.selectNodeContents(root);r.collapse(false);}root.focus();const s=getSelection();s.removeAllRanges();s.addRange(r);return r;}
function rememberEdit(force=false){if(historyRestore)return;const before=doc().html,next=canonicalHTML();if(before===next)return;const stack=undoHistory.get(doc().id)||[];if(force||Date.now()-lastEdit>700||!stack.length){stack.push({html:before,caret:caretOffset()});if(stack.length>80)stack.shift();}undoHistory.set(doc().id,stack);redoHistory.set(doc().id,[]);lastEdit=Date.now();}
function undoDocument(redo=false){const from=redo?redoHistory:undoHistory,to=redo?undoHistory:redoHistory;const stack=from.get(doc().id)||[],item=stack.pop();if(!item)return;const other=to.get(doc().id)||[];other.push({html:canonicalHTML(),caret:caretOffset()});to.set(doc().id,other);from.set(doc().id,stack);historyRestore=true;doc().html=item.html;$('editor').innerHTML=sanitize(item.html);ensureBlocks();hydrateInline();renderOutline();restoreOffsets(item.caret);historyRestore=false;save();}
function snapshotSelection(){
 const selected=selectionRange&&$('editor').contains(selectionRange.startContainer)&&selectionRange.toString().trim()===selectionText;
 let bounds=null;if(selected){const pre=selectionRange.cloneRange();pre.selectNodeContents($('editor'));pre.setEnd(selectionRange.startContainer,selectionRange.startOffset);bounds={start:pre.toString().length,end:pre.toString().length+selectionRange.toString().length};}
 const editor=$('editor');
 const start=selected&&(selectionRange.startContainer===editor?editor.childNodes[selectionRange.startOffset]:blockAt(selectionRange.startContainer));
 const end=selected&&(selectionRange.endContainer===editor?editor.childNodes[selectionRange.endOffset-1]:blockAt(selectionRange.endContainer));
 let wholeBlocks=[];
 if(start&&end){
  const before=document.createRange(),after=document.createRange();
  before.selectNodeContents(start);
  if(selectionRange.startContainer===editor)before.collapse(true);
  else before.setEnd(selectionRange.startContainer,selectionRange.startOffset);
  after.selectNodeContents(end);
  if(selectionRange.endContainer===editor)after.collapse(false);
  else after.setStart(selectionRange.endContainer,selectionRange.endOffset);
  if(!before.toString().trim()&&!after.toString().trim()){
   const blocks=[...$('editor').children];
   wholeBlocks=blocks.slice(blocks.indexOf(start),blocks.indexOf(end)+1);
  }
 }
 const noteBlocks=wholeBlocks.filter(block=>!block.matches(inlineVisual+',.voice-archive'));
 const structured=noteBlocks.length?noteBlocks.map(noteBlockText).join('\n\n'):selectionText;
 return {docId:doc().id,blockId:selectionBlock,selection:structured,rawSelection:selectionText,
  document:textOfDocument(),heading:selectionHeading,editorText:$('editor').textContent,bounds,
  wholeBlocks:wholeBlocks.map(block=>block.dataset.block),
  noteBlocks:noteBlocks.map(block=>({id:block.dataset.block,text:block.textContent}))};

}

function sanitize(html){const template=document.createElement('template');template.innerHTML=html;const tags=new Set(['P','DIV','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','BR','STRONG','B','EM','I','U','S','STRIKE','SPAN','SECTION','DETAILS','SUMMARY']);function walk(parent){for(const node of [...parent.children]){if(!tags.has(node.tagName)){node.replaceWith(document.createTextNode(node.textContent||''));continue;}for(const attr of [...node.attributes]){if(attr.name==='style'){
 const color=node.style.color,highlight=node.style.backgroundColor,family=node.style.fontFamily.replace(/["']/g,'');
 node.removeAttribute('style');
 if(inkColors.includes(color))node.style.color=color;
 if(highlight==='rgb(250, 228, 150)')node.style.backgroundColor=highlight;
 if(fontFamilies.includes(family))node.style.fontFamily=family;
 }else if(!['data-block','data-artifact','data-image','data-pin','data-voice-section','class','contenteditable'].includes(attr.name))node.removeAttribute(attr.name);}node.className=[...node.classList].filter(x=>['journey','placeholder','inline-artifact','question-callout','pinned-note','pinned-ordered','unattached-pin','pinned-anchor','voice-note','voice-archive'].includes(x)).join(' ');if(node.getAttribute('contenteditable')!==null)node.setAttribute('contenteditable',node.matches(inlineVisual)?'false':'true');walk(node);}}walk(template.content);return template.innerHTML;}
function captureDocument(){rememberEdit();doc().html=canonicalHTML();doc().title=$('docTitle').value||'Untitled';save();}
function ensureBlocks(){
 const editor=$('editor');
 const seen=new Set();
 for(const child of [...new Set([...editor.children,...editor.querySelectorAll('.voice-note > h1,.voice-note > h2,.voice-note > h3')])]){
  if(!child.dataset.block||seen.has(child.dataset.block))child.dataset.block=uid();
  seen.add(child.dataset.block);
 }
}
function listText(list,depth=0){
 const lines=[];
 for(const [i,item] of [...list.children].entries()){
  const contents=[...item.childNodes].filter(node=>!isNoteList(node)&&!node.dataset?.pin).map(node=>node.textContent).join('');
  lines.push('  '.repeat(depth)+(list.tagName==='OL'?(i+1)+'. ':'- ')+contents);
  for(const child of item.children){
   if(isNoteList(child))lines.push(listText(child,depth+1));
   if(child.dataset.pin)lines.push('  '.repeat(depth+1)+'- [Pin:'+child.dataset.pin+'] '+child.textContent.trim());
  }
 }
 return lines.join('\n');
}
function isNoteList(node){return node?.tagName==='UL'||node?.tagName==='OL';}
function noteBlockText(block){
 if(block.classList.contains('voice-archive'))return '';
 if(block.classList.contains('voice-note'))return documentText(block);
 if(block.classList.contains('pinned-anchor')){
  const [anchor,...pins]=block.children;
  return [anchor?.textContent.trim(),...pins.map(pin=>'  - [Pin:'+pin.dataset.pin+'] '+pin.textContent.trim())].join('\n');
 }
 if(/^H[123]$/.test(block.tagName))return '#'.repeat(Number(block.tagName[1]))+' '+block.textContent;
 if(block.dataset.pin)return 'Unattached pinned note: '+block.textContent.trim();
 if(block.classList.contains('question-callout'))return '> Question: '+(block.querySelector('p')?.textContent||'');
 if(isNoteList(block))return listText(block);
 return block.innerText??block.textContent;
}
function documentText(root){
 return [...root.children].filter(block=>!block.matches(inlineVisual+',.voice-archive')).map(noteBlockText).join('\n\n');
}
function textOfDocument(){return documentText($('editor'));}
function setupChrome(){ $('voiceButton').innerHTML=icon('mic',15)+'Talk';$('cleanDocument').innerHTML=icon('spark',15)+'Clean';$('newDocument').innerHTML=icon('plus',14);$('docIcon').innerHTML=icon('doc',18);$('connectionButton').innerHTML=icon('connection',15)+'AI connection';$('helpButton').innerHTML=icon('help',15)+'A little guidance';$('mobileToggle').innerHTML=icon('menu',17);$('moreButton').innerHTML=icon('more',17);$('presentButton').innerHTML=icon('present',15)+'Present';$('backToDeliverables').innerHTML=icon('back',14)+'All deliverables';$('exportArtifact').innerHTML=icon('export',14)+'Export';$('insertArtifact').innerHTML=icon('plus',14)+'Insert in notes';$('writingHint').innerHTML=icon('spark',13)+'Your ideas first. Select a passage or type / when you want a hand.';}
function renderSidebar(){ $('documentsNav').innerHTML=icon('doc',16)+'Documents';$('deliverablesNav').innerHTML=icon('stack',16)+'Deliverables <span class="count">'+state.documents.filter(d=>d.deliverable).length+'</span>';$('documentsNav').classList.toggle('active',view==='document');$('deliverablesNav').classList.toggle('active',view!=='document');$('docList').replaceChildren();state.documents.forEach(d=>{const b=document.createElement('button');b.className=d.id===state.current?'current':'';b.innerHTML='<i class="doc-dot"></i><span>'+esc(d.title)+'</span>';b.onclick=()=>{state.current=d.id;showDocument();save();};$('docList').append(b);});const ref=doc().references?.[0];$('sideReference').innerHTML=ref?'<img src="'+esc(ref.data)+'" alt=""><span class="mini-ref-label">'+esc(ref.name)+'</span>':'<div class="mini-ref-placeholder">Add screenshots or notes</div>';}
function showDocument(scrollBlock){view='document';$('documentView').classList.remove('hidden');$('deliverablesView').classList.add('hidden');$('detailView').classList.add('hidden');$('breadcrumbParent').textContent='Documents';$('breadcrumbTitle').textContent=doc().title;$('docTitle').value=doc().title==='Untitled'?'':doc().title;$('frameworkLabel').textContent='';$('frameworkLabel').classList.add('hidden');$('editor').innerHTML=sanitize(doc().html);ensureBlocks();hydrateInline();renderOutline();renderVoiceCommands();renderSidebar();$('sidebar').classList.remove('mobile-open');if(scrollBlock){const el=[...$('editor').children].find(x=>x.dataset.block===scrollBlock);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.animate([{background:'#f2dfc9'},{background:'transparent'}],{duration:1600});}}else window.scrollTo({top:0});}
function renderOutline(){
 const editor=$('editor'),outline=$('onPage');
 editor.classList.toggle('is-empty',!editor.innerText.trim()&&!editor.querySelector(inlineVisual));
 editor.dataset.placeholder='Start with a question, a thought, or a rough flow…';
 outline.innerHTML='<div class="outline-top"><div class="eyebrow">On this page</div><button type="button" id="outlineCommands" title="Writing commands" aria-label="Writing commands">/</button></div>';
 const trigger=$('outlineCommands');
 trigger.onmousedown=event=>event.preventDefault();
 trigger.onclick=()=>{
  const selection=getSelection();
  const block=headingLineAt(selection?.anchorNode)||blockAt(selection?.anchorNode);
  if(!block){
   const last=[...editor.children].findLast(isHeadingBlock);
   const target=last||editor.appendChild(document.createElement('p'));
   if(!target.firstChild)target.append(document.createElement('br'));
   const range=document.createRange();
   range.selectNodeContents(target);
   range.collapse(false);
   editor.focus();
   selection.removeAllRanges();
   selection.addRange(range);
  }
  showSlash(headingLineAt(selection.anchorNode)||blockAt(selection.anchorNode),'',null,trigger.getBoundingClientRect());
 };
 for(const heading of editor.querySelectorAll('h1,h2,h3')){
  if(heading.closest('.voice-archive')||!heading.textContent.trim())continue;
  const button=document.createElement('button');
  button.textContent=heading.textContent;
  button.dataset.level=heading.tagName[1];
  button.onclick=()=>heading.scrollIntoView({behavior:'smooth',block:'center'});
  outline.append(button);
 }
}
function blockAt(node){let el=node?.nodeType===Node.TEXT_NODE?node.parentElement:node;while(el&&el.parentElement!==$('editor'))el=el.parentElement;return el?.parentElement===$('editor')?el:null;}
function getHeading(block){let prev=block;while(prev){if(/^H[123]$/.test(prev.tagName))return prev.textContent;prev=prev.previousElementSibling;}return doc().title;}
function isHeadingBlock(block){
 return Boolean(block&&(
  /^(P|H[123])$/.test(block.tagName)||
  block.tagName==='DIV'&&!block.classList.length&&!block.querySelector('p,div,h1,h2,h3,ul,ol,blockquote,section,details')
 ));
}
function headingLineAt(node){
 const editor=$('editor');
 let element=node?.nodeType===Node.TEXT_NODE?node.parentElement:node;
 if(!element||element===editor||!editor.contains(element)||
  element.closest('li,blockquote,.pinned-anchor,.voice-archive,'+inlineVisual))return null;
 while(element!==editor){
  if(isHeadingBlock(element))return element;
  element=element.parentElement;
 }
 return null;
}
function selectedHeadingBlock(range){
 if(!range)return null;
 const start=headingLineAt(range.startContainer);
 return start&&start===headingLineAt(range.endContainer)?start:null;
}
function changeHeadingLevel(block,level){
 const tag=level?'H'+level:'P';
 if(block.tagName===tag)return block;
 const heading=document.createElement(tag.toLowerCase());
 for(const {name,value} of block.attributes)heading.setAttribute(name,value);
 heading.dataset.block||=uid();
 heading.append(...block.childNodes);
 if(!heading.textContent&&!heading.querySelector('br'))heading.append(document.createElement('br'));
 block.replaceWith(heading);
 return heading;
}
function formatHeadingLine(block,level){
 const editor=$('editor');
 const line=changeHeadingLevel(block,level);
 // Chrome can nest a new line inside a text wrapper. Split its wrapper around
 // the converted line so it becomes an actual document block.
 while(line.parentElement!==editor){
  const parent=line.parentElement;
  if(parent.tagName!=='DIV')break;
  const trailing=parent.cloneNode(false);
  delete trailing.dataset.block;
  delete trailing.dataset.voiceSection;
  while(line.nextSibling)trailing.append(line.nextSibling);
  parent.after(line);
  if(trailing.hasChildNodes())line.after(trailing);
  if(!parent.hasChildNodes())parent.remove();
 }
 ensureBlocks();
 return line;
}
function captureSelection(){const sel=window.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed||!$('editor').contains(sel.anchorNode)||!$('editor').contains(sel.focusNode))return false;selectionRange=sel.getRangeAt(0).cloneRange();selectionText=selectionRange.toString().trim();const block=blockAt(selectionRange.startContainer);selectionBlock=block?.dataset.block||'';selectionHeading=getHeading(block);return Boolean(selectionText);}
function hideMenus(){['selectionBar','contextMenu','slashMenu','moreMenu'].forEach(id=>$(id).classList.add('hidden'));}
function position(el,x,y){el.classList.remove('hidden');const rect=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(x,innerWidth-rect.width-10))+'px';el.style.top=Math.max(8,Math.min(y,innerHeight-rect.height-10))+'px';}
function actionButton(task,full=false){const b=document.createElement('button');b.type='button';b.dataset.task=task;b.innerHTML=icon(task==='clean'?'spark':task,15)+labels[task]+(full?'<span>↵</span>':'');b.onmousedown=e=>e.preventDefault();b.onclick=()=>openMaker(task);return b;}
function showSelectionBar(){
 const bar=$('selectionBar');
 if(!captureSelection()){bar.classList.add('hidden');return;}
 const rect=selectionRange.getBoundingClientRect();
 bar.replaceChildren();
 const formatting=document.createElement('div');
 formatting.className='selection-formatting';
 formatting.setAttribute('role','group');
 formatting.setAttribute('aria-label','Text formatting');
 appendFormatting(formatting);
 const actions=document.createElement('div');
 actions.className='selection-tools';
 actions.setAttribute('role','group');
 actions.setAttribute('aria-label','Actions for selected text');
 addPinAction(actions,$('editor'));
 for(const task of ['clean','diagram','wireframe','summary'])actions.append(actionButton(task));
 bar.append(formatting,actions);
 position(bar,rect.left,rect.top-49);
 if(bar.getBoundingClientRect().bottom>=rect.top)position(bar,rect.left,rect.bottom+8);
}
function sectionContext(){const sel=window.getSelection();const b=blockAt(sel?.anchorNode)||$('editor').lastElementChild;selectionBlock=b?.dataset.block||'';selectionHeading=getHeading(b);let head=b;while(head&&!/^H[123]$/.test(head.tagName))head=head.previousElementSibling;const result=[];let e=head?head.nextElementSibling:$('editor').firstElementChild;while(e&&!/^H[123]$/.test(e.tagName)){if(!e.hasAttribute('data-artifact'))result.push(e.innerText);e=e.nextElementSibling;}selectionText=result.join('\n').trim()||textOfDocument();selectionRange=null;}
function openMaker(task,capture){hideMenus();
 $('overlay').classList.toggle('quick-modal',task==='clean');
 if(task==='clean'){openCleanup();return;}
makerTask=task;if(!capture&&!selectionText)sectionContext();pendingCapture=capture||snapshotSelection();returnFocus=document.activeElement;$('sheet').innerHTML=`<div class="sheet-head"><h2 id="sheetTitle">${task==='diagram'?'Make the journey clear':task==='wireframe'?'Bring the flow to life':task==='metrics'?'See the metric relationships':task==='summary'?'Bring the thinking together':'Tighten this passage'}</h2><button class="icon" id="closeSheet" aria-label="Close">${icon('close')}</button></div><div class="source-row">${icon('doc',13)}${esc(doc().title)}<span style="color:#c1b9aa">/</span>${esc(pendingCapture.heading||'Selected notes')}</div><div class="eyebrow">Your selected thinking</div><div class="source-quote">${esc(pendingCapture.selection)}</div><label for="direction">Anything to add?</label><textarea id="direction" placeholder="${task==='wireframe'?'Describe the screens, requirements, and interaction you have in mind.':task==='metrics'?'Any definitions or relationships to make explicit?':task==='diagram'?'What should the diagram make clear?':'Keep my meaning. Make it easy to follow.'}"></textarea><div style="height:24px"></div><label for="outputStyle">${task==='wireframe'?'Starting point':'Structure'}</label><select id="outputStyle">${task==='wireframe'?'<option>Choose from my notes</option><option>Multi-step flow</option><option>Single screen</option>':task==='metrics'?'<option>Metric tree</option>':'<option>Choose for me</option><option>Journey</option><option>Decision flow</option>'}</select><div class="sheet-bottom"><button class="primary" id="createPreview">Create ${task==='clean'?'suggested edit':labels[task].toLowerCase()}${icon('arrow',15)}</button><p class="example-notice">${task==='wireframe'?((doc().references?.length||0)+' screenshots attached. Reviews the current flow before building the prototype.'):('Uses this passage, the document, and its attached context.')}</p></div>`;openOverlay();$('closeSheet').onclick=closeOverlay;$('createPreview').onclick=createPreview;setTimeout(()=>$('direction')?.focus(),80);}
function openOverlay(){$('overlay').classList.remove('hidden');$('sheet').focus();}
function closeOverlay(){$('overlay').classList.add('hidden');$('overlay').classList.remove('quick-modal');$('sheet').replaceChildren();returnFocus?.focus?.();}
function splitLines(s,max=23){const out=[];let line='';for(let word of String(s).split(/\s+/)){while(word.length>max){if(line){out.push(line);line='';}out.push(word.slice(0,max));word=word.slice(max);}if((line+' '+word).trim().length>max){if(line)out.push(line);line='';}line+=(line?' ':'')+word;}if(line)out.push(line);return out;}
function nodeText(n){const lines=splitLines(n.label);const detail=n.detail?splitLines(n.detail,29):[];return {lines,detail,h:Math.max(68,26+lines.length*17+detail.length*13+(n.kind==='assumption'||n.kind==='guardrail'?14:0))};}
function diagramSVG(data,thumb=false){const marker='arrow-'+uid();const nodes=data.nodes||[],edges=data.edges||[];if(!nodes.length)return '';const journey=data.layout==='journey'&&edges.length===nodes.length-1&&nodes.every(n=>edges.filter(e=>e.from===n.id).length<=1&&edges.filter(e=>e.to===n.id).length<=1);const horizontal=data.layout==='tree'||data.kind==='metrics';const positions=new Map(),depth=new Map(),visited=new Set(),visiting=new Set(),returns=new Set();const byId=new Map(nodes.map(n=>[n.id,n]));const outgoing=new Map(nodes.map(n=>[n.id,edges.filter(e=>e.from===n.id&&byId.has(e.to))]));function visit(id){if(visited.has(id))return;visiting.add(id);for(const e of outgoing.get(id)||[]){if(visiting.has(e.to)){returns.add(e);continue;}visit(e.to);}visiting.delete(id);visited.add(id);}nodes.forEach(n=>visit(n.id));const forward=edges.filter(e=>!returns.has(e)&&byId.has(e.from)&&byId.has(e.to));const indegree=new Map(nodes.map(n=>[n.id,forward.filter(e=>e.to===n.id).length]));const queue=nodes.filter(n=>indegree.get(n.id)===0).map(n=>n.id);nodes.forEach(n=>depth.set(n.id,0));while(queue.length){const id=queue.shift();for(const e of outgoing.get(id)||[]){if(returns.has(e))continue;depth.set(e.to,Math.max(depth.get(e.to),depth.get(id)+1));indegree.set(e.to,indegree.get(e.to)-1);if(indegree.get(e.to)===0)queue.push(e.to);}}const levels=[];nodes.forEach(n=>(levels[depth.get(n.id)]||=[]).push(n));let w,h;
if(journey){const orderedNodes=[...nodes].sort((a,b)=>depth.get(a.id)-depth.get(b.id));const cols=Math.min(3,nodes.length);w=cols*245+5;let y=25;for(let start=0;start<nodes.length;start+=cols){const group=orderedNodes.slice(start,start+cols),row=Math.floor(start/cols);group.forEach((n,i)=>positions.set(n.id,{x:20+(row%2?cols-1-i:i)*245,y,h:nodeText(n).h}));y+=Math.max(...group.map(n=>nodeText(n).h))+52;}h=y;}else if(horizontal){let maxY=0;levels.forEach((level,i)=>{let y=28;level.forEach(n=>{const height=nodeText(n).h;positions.set(n.id,{x:20+i*270,y,h:height});y+=height+30;});maxY=Math.max(maxY,y);});w=levels.length*270-30;h=maxY+5;}
else{const breadth=Math.max(...levels.map(l=>l.length));w=Math.max(330,breadth*245+10);let y=25;levels.forEach(level=>{const offset=(w-(level.length*245-45))/2;level.forEach((n,i)=>positions.set(n.id,{x:offset+i*245,y,h:nodeText(n).h}));y+=Math.max(...level.map(n=>nodeText(n).h))+45;});h=y;w+=returns.size*20;}
let paths='';for(const e of edges){const a=positions.get(e.from),b=positions.get(e.to);if(!a||!b)continue;let path,lx,ly;if(returns.has(e)){const x=w-8;path=`M${a.x+200} ${a.y+a.h/2} H${x} V${b.y+b.h/2} H${b.x+204}`;lx=x-20;ly=(a.y+b.y)/2;}else if(journey){if(a.y===b.y){const y=a.y+a.h/2,yy=b.y+b.h/2,forward=b.x>a.x,x=forward?a.x+200:a.x,xx=forward?b.x-3:b.x+203,m=(x+xx)/2;path=`M${x} ${y} C${m} ${y} ${m} ${yy} ${xx} ${yy}`;lx=m;ly=(y+yy)/2-8;}else{const x=a.x+100,xx=b.x+100,m=(a.y+a.h+b.y)/2;path=`M${x} ${a.y+a.h} C${x} ${m} ${xx} ${m} ${xx} ${b.y-3}`;lx=(x+xx)/2+40;ly=m-5;}}else if(horizontal){const y=a.y+a.h/2,yy=b.y+b.h/2,m=(a.x+200+b.x)/2;path=`M${a.x+200} ${y} C${m} ${y} ${m} ${yy} ${b.x-3} ${yy}`;lx=m;ly=(y+yy)/2-8;}else{const x=a.x+100,xx=b.x+100,m=(a.y+a.h+b.y)/2;path=`M${x} ${a.y+a.h} C${x} ${m} ${xx} ${m} ${xx} ${b.y-3}`;lx=(x+xx)/2+40;ly=m-5;}paths+=`<path d="${path}" fill="none" stroke="#c2b8a7" stroke-width="1.2" ${returns.has(e)?'stroke-dasharray="4 4"':''} marker-end="url(#${marker})"/>`;if(e.label)paths+=`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" fill="#9b8a72" stroke="#f5f1e9" stroke-width="4" paint-order="stroke">${esc(e.label)}</text>`;}
let boxes='';nodes.forEach(n=>{const p=positions.get(n.id),t=nodeText(n),special=n.kind==='assumption',guard=n.kind==='guardrail',color=special?'#bb8056':guard?'#7a8f76':'#c36b47',fill=special?'#f8eee0':guard?'#eff0e7':'#fffdf8';boxes+=`<g><rect x="${p.x}" y="${p.y}" width="200" height="${p.h}" rx="8" fill="${fill}" stroke="${special?'#d8b58e':guard?'#c3cdb6':'#ddd3c3'}"/><rect x="${p.x}" y="${p.y+15}" width="2.5" height="${p.h-30}" rx="1" fill="${color}"/>`;let y=p.y+24;if(special||guard){boxes+=`<text x="${p.x+15}" y="${y-4}" font-size="8" letter-spacing="1" fill="${color}">${special?'OPEN QUESTION':'GUARDRAIL'}</text>`;y+=13;}t.lines.forEach(line=>{boxes+=`<text x="${p.x+15}" y="${y}" font-size="12" font-weight="550" fill="#4d5548">${esc(line)}</text>`;y+=17;});t.detail.forEach(line=>{boxes+=`<text x="${p.x+15}" y="${y}" font-size="10" fill="#92947f">${esc(line)}</text>`;y+=13;});boxes+='</g>';});return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(data.title)}" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif"><title>${esc(data.title)}</title><defs><marker id="${marker}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 6 3.5 0 7" fill="none" stroke="#c2b8a7"/></marker></defs>${paths}${boxes}</svg>`;}
function currentData(a){return a.versions[a.versions.length-1].data;}
function wireThumb(data){const screen=data.screens?.[0];if(!screen)return '<div class="small muted">Earlier design preview</div>';return '<div style="width:165px;border:1px solid #ddd3c2;border-radius:6px;background:#fffdf8;padding:13px;box-shadow:0 6px 18px #59482909"><div style="font-size:7px;color:#a78b6d;margin-bottom:10px">'+esc(screen.eyebrow||'WIREFRAME')+'</div><div style="font-size:11px;font-weight:550;letter-spacing:-.2px;margin-bottom:7px">'+esc(screen.title)+'</div><div style="font-size:7px;color:#aaa18d;margin-bottom:11px">'+esc(screen.description.slice(0,85))+'</div>'+screen.fields.slice(0,3).map(f=>'<div style="font-size:6px;color:#9c967f;margin:5px 0 3px">'+esc(f.label)+'</div><div style="height:12px;border:1px solid #e7dfd1;border-radius:3px"></div>').join('')+'<div style="font-size:7px;text-align:center;background:#c5744c;color:white;padding:4px;border-radius:3px;margin-top:11px">'+esc(screen.actions.find(x=>x.style==='primary')?.label||'Continue')+'</div></div>';}

function thumb(a){return a.task==='wireframe'?wireThumb(currentData(a)):a.task==='diagram'||a.task==='metrics'?diagramSVG(currentData(a),true):'<div style="font-size:11px;color:#92917e;line-height:1.9;padding:10px">'+esc(currentData(a).body.slice(0,140))+'</div>';}
function hydrateInline(root=$('editor'),readOnly=false,versions=null,blocks=root.querySelectorAll('[data-artifact]')){
 hydrateImages(root,readOnly);
 for(const block of blocks){
  const artifact=state.artifacts.find(item=>item.id===block.dataset.artifact);
  if(!artifact){block.remove();continue;}
  const data=artifact.versions[versions?.[artifact.id]??artifact.versions.length-1]?.data;
  if(!data)continue;
  const title=data.title.trim()||(artifact.task==='clean'?'Suggested edit':labels[artifact.task]);
  block.className='inline-artifact';
  block.contentEditable='false';
  block.innerHTML='<div class="inline-head"><strong>'+esc(title)+'</strong></div><div class="inline-content"></div>';
  const content=block.querySelector('.inline-content');
  if(artifact.task==='wireframe'&&data.screens?.length)renderWireframe(content,data);
  else if(['diagram','metrics'].includes(artifact.task)){
   content.classList.add('diagram-preview');
   content.innerHTML=diagramSVG(data);
  }else{
   content.classList.add('text-preview');
   content.innerHTML=formattedNotes(data.body);
  }
  if(readOnly)continue;
  const button=document.createElement('button');
  button.className='quiet';
  button.textContent=artifact.task==='clean'?'Review suggested edit':'Refine or export';
  button.onclick=()=>openArtifact(artifact.id);
  const remove=document.createElement('button');
  remove.className='quiet remove-artifact';
  remove.textContent='Remove';
  remove.setAttribute('aria-label','Remove '+title);
  remove.onclick=()=>{
   lastEdit=0;
   block.remove();
   captureDocument();
   renderOutline();
   root.focus();
   notify('Removed from your notes. Press ⌘Z to undo.');
  };
  const actions=document.createElement('div');
  actions.className='inline-actions';
  actions.append(button,remove);
  block.querySelector('.inline-head').append(actions);
 }
}
async function waitForJob(job,onTick){const started=Date.now();while(Date.now()-started<580000){await new Promise(r=>setTimeout(r,1000));const result=await api('/api/jobs/'+encodeURIComponent(job));onTick?.(Math.round((Date.now()-started)/1000),result.phase,result);if(result.status==='complete')return result;if(result.status==='error')throw Error(result.error||'Generation failed.');}throw Error('This request is taking too long. Check Deliverables before starting it again.');}
function requestContext(capture,task,instruction,previous){
 const source=state.documents.find(item=>item.id===capture.docId);
 const context={task,title:source?.title||'',selection:capture.wholeDocument?'':capture.selection,heading:capture.heading,
  document:capture.document,instruction,referenceNotes:source?.referenceNotes||'',images:source?.references||[]};
 if(previous)context.previous=previous;
 if(capture.wholeDocument){
  context.documentEdition=true;
  const root=document.createElement('template');
  root.innerHTML=sanitize(source.html);
  context.existingVisuals=[...root.content.querySelectorAll('[data-artifact]')]
   .map(block=>state.artifacts.find(item=>item.id===block.dataset.artifact)?.task)
   .filter(Boolean);
 }
 return context;
}

function rememberRequest(pending){state.pending=[...(state.pending||[]),pending];save();}
function recordCreatedArtifact(pending,result){
 if(state.artifacts.some(item=>item.id===pending.id))return;
 const capture=pending.capture;state.artifacts.unshift({id:pending.id,task:pending.task,docId:capture.docId,sourceBlock:capture.blockId,source:capture.selection,capture,direction:pending.instruction,example:false,status:'draft',created:Date.now(),versions:[{data:result.data,created:Date.now(),provider:result.provider,direction:pending.instruction}]});
}
function finishRequest(pending,result){
 if(pending.operation==='revision'){
  const a=state.artifacts.find(x=>x.id===pending.artifactId);if(!a)throw Error('The source deliverable is no longer in this workspace.');
  if(!a.versions.some(v=>v.requestId===pending.id)){a.versions.push({data:result.data,created:Date.now(),provider:result.provider,direction:pending.instruction,requestId:pending.id});a.direction=pending.instruction;a.status='draft';}
 }else recordCreatedArtifact(pending,result);
 state.pending=(state.pending||[]).filter(p=>p.id!==pending.id);save();renderSidebar();
}
function editionProgress(pending,result){
 if(!pending.capture.wholeDocument||!result.data)return;
 const first=!state.artifacts.some(item=>item.id===pending.id);
 if(first)recordCreatedArtifact(pending,result);
 const edit=state.artifacts.find(item=>item.id===pending.id);
 const known=new Set(edit.generatedVisuals||[]);
 const incoming=[];
 for(const visual of result.visuals||[]){
  const id=pending.id+'-visual-'+visual.task;
  if(known.has(id))continue;
  state.artifacts.push({id,task:visual.task,docId:pending.capture.docId,sourceBlock:'',
   source:visual.selection,capture:{docId:pending.capture.docId,selection:visual.selection,heading:visual.heading,document:result.data.body},
   direction:'',example:false,status:'draft',created:Date.now(),
   versions:[{data:visual.data,created:Date.now(),provider:result.provider,direction:''}]});
  incoming.push(id);
 }
 edit.generatedVisuals=[...known,...incoming];
 edit.visualFailures=result.visualFailures||[];
 if(first){
  if($('overlay').dataset.request===pending.id&&!$('overlay').classList.contains('hidden'))closeOverlay();
  placeResult(pending);
 }else if(incoming.length&&edit.status==='accepted'){
  appendEditionVisuals(edit,incoming);
 }
 if(first||incoming.length)save();
 const completed=(result.visuals||[]).length;
 $('generationStatus').textContent=result.status==='complete'?'':completed?
  'Adding visuals · '+completed+' ready':'Building visuals…';
}
function appendEditionVisuals(edit,ids){
 const source=state.documents.find(item=>item.id===edit.docId);
 if(!source)return;
 const current=state.current===source.id&&view==='document';
 const root=current?$('editor'):document.createElement('div');
 if(!current)root.innerHTML=sanitize(source.html);
 // An undo or document replacement removes the edition's inserted blocks.
 if(![...root.children].some(block=>edit.editionBlocks?.includes(block.dataset.block)))return;
 const inserted=placeDocumentVisuals(edit,root,ids);
 if(current&&inserted.length){
  lastEdit=0;
  captureDocument();
  hydrateInline(root,false,null,inserted);
 }else if(inserted.length){source.html=root.innerHTML;save();}
}
function forgetRequest(id){state.pending=(state.pending||[]).filter(p=>p.id!==id);save();}
function recoverRequests(){for(const pending of [...(state.pending||[])]){currentJob=pending.id;waitForJob(pending.job,(_,phase,result)=>editionProgress(pending,result)).then(result=>{
 finishRequest(pending,result);
 if(!pending.capture.wholeDocument)placeResult(pending);
 if(result.visualFailures?.length)notifyVisualFailures(result.visualFailures);
}).catch(e=>{forgetRequest(pending.id);notify('An earlier request could not be recovered. Your notes are saved. '+e.message);}).finally(()=>{currentJob=state.pending?.[0]?.id||null;$('generationStatus').textContent='';});}}
async function createPreview(){
 if(!SERVER){notify('Open the local workspace with the launcher to connect AI.');return;}
 if(currentJob){notify('A request is already running. You can keep writing while it finishes.');return;}
 const capture=structuredClone(pendingCapture||snapshotSelection()),task=makerTask;
 const direction=$('direction').value.trim(),structure=$('outputStyle')?.value||'Choose for me';
 const standard=capture.wholeDocument?[
  'Edit the entire document. Return the complete revised Markdown. Keep useful original section names so any attached visual stays near its topic. Avoid repeating the document title in the body. Use level 2 for sections and level 3 for subsections, lists with sub-bullets only when they qualify or challenge the parent, short paragraphs, and sparing bold. Put each open question in a separate line using > Question:.',
  'Preserve every [Pin:...] marker as a nested bullet under the exact claim it annotates. Keep the pinned note wording intact.',
  ...documentStandards
 ].join('\n'):'';
 const instruction=[standard,direction,structure==='Choose for me'||structure==='Choose from my notes'?'':'Preferred structure: '+structure].filter(Boolean).join('\n');
 const button=$('createPreview');button.disabled=true;button.innerHTML='Creating…';const notice=$('sheet').querySelector('.example-notice');notice.textContent='Working from your notes. You can close this panel and keep writing.';
 const marker=uid();currentJob=marker;currentJobTask=task;$('overlay').dataset.request=marker;
 if(capture.wholeDocument)$('generationStatus').textContent='Cleaning up…';
 try{
  const context=requestContext(capture,task,instruction);
  if(capture.wholeDocument)context.editionDirection=direction;
  const started=await api('/api/generate',context);
  const pending={id:marker,job:started.job,operation:'create',task,capture,instruction,created:Date.now()};rememberRequest(pending);
  const result=await waitForJob(started.job,(seconds,phase,progress)=>{editionProgress(pending,progress);if($('overlay').dataset.request===marker&&$('createPreview'))$('createPreview').textContent=(phase||'Creating')+' · '+seconds+'s';});
  finishRequest(pending,result);
  if(!$('overlay').classList.contains('hidden')&&$('overlay').dataset.request===marker)closeOverlay();
  if(!capture.wholeDocument)placeResult(pending);
  if(result.visualFailures?.length)notifyVisualFailures(result.visualFailures);
 }catch(e){forgetRequest(marker);if(!$('overlay').classList.contains('hidden')&&$('overlay').dataset.request===marker){if($('createPreview')){$('createPreview').disabled=false;$('createPreview').textContent='Try again';}notice.textContent=e.message;}notify(e.message);}
 finally{currentJob=null;currentJobTask=null;$('generationStatus').textContent='';}
}

function insertIntoDocument(a){if(state.current!==a.docId){state.current=a.docId;showDocument();}const existing=$('editor').querySelector('[data-artifact="'+a.id+'"]');if(existing){existing.scrollIntoView({behavior:'smooth',block:'center'});return;}const block=[...$('editor').children].find(e=>e.dataset.block===a.sourceBlock);const card=document.createElement('section');card.dataset.artifact=a.id;card.dataset.block=uid();card.contentEditable='false';card.className='inline-artifact';if(block){let after=block;while(after.nextElementSibling&&!/^H[123]$/.test(after.nextElementSibling.tagName))after=after.nextElementSibling;after.after(card);}else $('editor').append(card);hydrateInline();captureDocument();requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'center'}));}
function showDeliverables(){hideMenus();view='deliverables';$('documentView').classList.add('hidden');$('detailView').classList.add('hidden');$('deliverablesView').classList.remove('hidden');$('breadcrumbParent').textContent='Workspace';$('breadcrumbTitle').textContent='Deliverables';renderSidebar();renderGallery();window.scrollTo({top:0});}
function renderGallery(){
 $('filters').replaceChildren();
 const grid=$('artifactGrid');
 grid.replaceChildren();
 for(const source of state.documents.filter(d=>d.deliverable)){
  const button=document.createElement('button');
  button.className='artifact-card';
  button.innerHTML='<div class="artifact-caption"><h3>'+esc(source.deliverable.title)+'</h3><div class="meta">'+new Date(source.deliverable.created).toLocaleDateString()+'</div></div>';
  button.onclick=()=>openFinishedDocument(source);
  grid.append(button);
 }
 if(!grid.children.length)grid.textContent='Use Create deliverable when your notes are ready.';
}
function openFinishedDocument(source){
 $('breadcrumbTitle').textContent=source.deliverable.title;
 const grid=$('artifactGrid');
 grid.replaceChildren();
 const back=document.createElement('button');
 back.className='back';
 back.textContent='All deliverables';
 back.onclick=showDeliverables;
 const article=document.createElement('article');
 article.className='finished-document editor';
 article.innerHTML='<h1>'+esc(source.deliverable.title)+'</h1>'+sanitize(source.deliverable.html);
 hydrateInline(article,true,source.deliverable.versions);
 grid.append(back,article);
}
const voice={
 recognition:null,sourceId:null,focusSection:null,pending:'',transcript:'',
 interim:'',running:false,listening:false,failed:false,timer:null,wakeTimer:null,
 active:false,retryTimer:null,retries:0,notice:'',commands:[],formatError:'',inflight:null,flushTimer:null
};
const voiceInstruction=[
 'Process the latest speech as two separate kinds of input: brainstorm content and instructions addressed to the editor. A speaker saying "you made two sections", "keep it under Business context", "that should just be all under that", or "delete Other trends" is directing the editor. Never transcribe those directions as document content or as green question boxes. Mixed speech can contain both kinds.',
 'Route brainstorm content by meaning to the best existing section ID, preferring the matching subsection in the established outline. Use the parent IDs to disambiguate duplicate titles. Use readOnly as context. If draft is supplied, return its complete revised notes and retain earlier useful points. Do not invent facts or confirmations.',
 'Default to a live brainstorm jot sheet. Capture distinct points, not polished paragraphs. A mission or thesis can be one sentence. For comparisons, facts, options, and tradeoffs, default to short Markdown bullets with one point each, usually 8–18 words. Split a long bullet into a parent and sub-bullets only when it helps someone scan. Cut fillers, throat-clearing, empty intensifiers, repeated labels, and adjectives that do not change the meaning. Keep concrete names, constraints, and nuances that matter.',
 'Use bold for a useful scanning label. Keep consequential questions in their own callout. Preserve uncertainty and label unverified figures.',
 'Organize details where they belong. A bare outline bullet is a placeholder. If the speech fills an existing placeholder listed in slots, emit a Fill node with that slot ID. Do not append the same thought under the section. The first line of detail gives the short explanation that belongs on the same line as the label. Add another line only for a distinct supporting detail, assumption, or example. Use bold for the label. A pin is for a challenge to an idea, not a substitute for putting the idea under the right parent. Use the speaker’s final correction if they mix up client and expert.',
 'Return an edits array with up to eight edit objects. For an existing placeholder: id is its short slot ID, label is Fill, detail is one short main line and optional supporting lines. For ordinary notes: id is an existing section ID, label is Update, detail is Markdown without headings. For a genuinely new topic, id starts new-, label is Title or parentID|Title, detail is optional Markdown. Each edit has only id, label, and detail.',
 'Use unique cmd- IDs for editor actions. Merge, Move before, Move after and Move into use sourceID|targetID. Move to top and Park (remove from the active outline) use sourceID. Moves and Park include descendants. Rename uses sourceID|new heading. Reference existing IDs, or a new- ID created in this batch. If a destructive request names an ambiguous range or target, ask a short Clarify question in Talk.',
 'Editor requests should resolve to concrete targets. Prefer the uniquely matching named heading or note. Use an active highlight to resolve “this” or “that”, and the current section to break ties only when it clearly fits. Infer an obvious target for a reversible edit and show its exact name in a proposal. Ask one focused question only when plausible targets would produce materially different edits. Never ask for permission or clarification merely because the wording is informal.',
 'Heading level uses sectionID|1, 2, or 3. For matching headings, use Match heading with sectionID|referenceSectionID. If the speaker wants multiple named headings at the same size, preserve their common outline level (usually H2 for peers) or use the clearly named reference. Use note targets when asked to move a hypothesis, remove a bullet, or edit a specific passage. Move note uses noteID|destinationSectionID; Park note uses noteID. Replace note uses noteID followed by a newline and the full replacement wording. Never remove an entire section to delete a single note. Prefer the audience entry under Who when the speaker points there.',
 'For explicit revision, Format uses sourceID then a newline and the complete revised body in Markdown, when formatSource is supplied. Preserve details except where the speaker asks to change them. For explicit full replacement with supplied content, Replace uses the same syntax and does not require formatSource. Edit named subsections individually. Identify them in a Clarify question if the scope is ambiguous.',
 'For explicit image requests, use cmd- edits. Upload image detail is destination sectionID (or root); it opens the file picker. Create image detail is sectionID followed by a newline and a compact visual brief. Move image detail is image ID from the outline followed by | and the destination sectionID. Resolve references by name and section. If multiple images or sections could match, use Clarify. Treat screenshots users request uploading as files and charts with supplied data as charts.',
 'For an explicit prototype request, Prototype uses sectionID (or root) then a newline and the user’s requirements. If a missing decision changes the flow, use Prototype question with sectionID, question, and current brief on successive lines. When answered, use the pending brief and latest answer together. A design objection or unmet constraint belongs in Talk as Clarify or Prototype question. Do not treat an editor action, objection, or clarification as a brainstorm note.'
].join('\n');

function updateVoicePanel(message){
 $('voiceStatus').textContent=message||voice.notice||(
  voice.retryTimer?'Reconnecting microphone…':
  voice.failed?(voice.formatError||'Your transcript is ready to retry.'):
  voice.listening?(voice.running?'Listening and organizing…':'Listening…'):
  voice.running?'Organizing your notes…':'Mic off');
 $('toggleVoice').textContent=voice.active?'Stop talking':voice.recognition?'Finishing…':voice.transcript?'Resume talking':'Start talking';
 $('voicePanel').dataset.state=voice.running?'working':voice.listening?'listening':'idle';
 $('toggleVoice').disabled=!voice.active&&Boolean(voice.recognition);
 $('retryVoice').classList.toggle('hidden',!voice.failed);
 const transcript=$('voiceTranscript');
 const follow=transcript.scrollHeight-transcript.clientHeight-transcript.scrollTop<30;
 transcript.textContent=(voice.transcript+(voice.interim?' '+voice.interim:'')).trim()||'Your speech will appear here.';
 if(follow)transcript.scrollTop=transcript.scrollHeight;
}
function showVoicePanel(){
 const panel=$('voicePanel');
 panel.classList.remove('hidden');
 $('voiceButton').setAttribute('aria-expanded','true');
 updateVoicePanel();
 renderVoiceCommands();
}
function stopVoice(){
 voice.active=false;
 voice.notice='';
 clearTimeout(voice.retryTimer);
 voice.retryTimer=null;
 clearInterval(voice.timer);
 clearTimeout(voice.flushTimer);
 voice.flushTimer=null;
 if(voice.recognition){
  try{voice.recognition.stop();}
  catch(error){finishRecognition(voice.recognition);}
 }else{
  updateVoicePanel();
  organizeVoice();
 }
}
function closeVoicePanel(){
 stopVoice();
 $('voicePanel').classList.add('hidden');
 renderVoiceCommands();
 $('voiceButton').setAttribute('aria-expanded','false');
}
function startVoice(){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){
  updateVoicePanel('Open this workspace in desktop Chrome to use the microphone.');
  return;
 }
 if(voice.active||voice.recognition)return;
 if(voice.sourceId!==doc().id){
  if(voice.running||voice.pending.trim()){
   updateVoicePanel('Finish or retry the previous document’s transcript before switching.');
   return;
  }
  voice.sourceId=doc().id;
  voice.commands=[];
  renderVoiceCommands();
  voice.focusSection=blockAt(getSelection()?.anchorNode)?.dataset.block||null;
  voice.transcript='';
  voice.failed=false;
 }
 voice.active=true;
 voice.retries=0;
 voice.notice='';
 voice.timer=setInterval(()=>{if(!voice.flushTimer)organizeVoice();},1200);
 connectVoice(Recognition);
}
function scheduleVoiceFlush(delay){
 clearTimeout(voice.flushTimer);
 voice.flushTimer=setTimeout(()=>{
  voice.flushTimer=null;
  organizeVoice();
 },delay);
}
const voiceRetryDelays=[500,1000,2000,4000];
function finishRecognition(recognition,issue=''){
 if(voice.recognition!==recognition)return;
 voice.recognition=null;
 voice.listening=false;
 voice.interim='';
 const terminal={
  'not-allowed':'Microphone permission was denied. Allow it in Chrome, then resume.',
  'service-not-allowed':'Speech recognition is unavailable in this browser. Try desktop Chrome.',
  'audio-capture':'No microphone was available. Check your input device, then resume.',
  'language-not-supported':'This browser does not support the current dictation language.'
 };
 if(voice.active&&!terminal[issue]&&voice.retries<voiceRetryDelays.length){
  const delay=voiceRetryDelays[voice.retries++];
  voice.retryTimer=setTimeout(()=>{
   voice.retryTimer=null;
   if(voice.active)connectVoice(window.SpeechRecognition||window.webkitSpeechRecognition);
  },delay);
 }else{
  if(voice.active)voice.notice=terminal[issue]||
   'The speech service couldn’t reconnect. Resume talking to continue.';
  voice.active=false;
  clearInterval(voice.timer);
 }
 updateVoicePanel();
 organizeVoice();
}
function connectVoice(Recognition){
 let recognition;
 try{recognition=new Recognition();}
 catch(error){
  voice.active=false;
  clearInterval(voice.timer);
  voice.notice='Speech recognition could not start. Try desktop Chrome.';
  updateVoicePanel();
  return;
 }
 voice.recognition=recognition;
 recognition.continuous=true;
 recognition.interimResults=true;
 recognition.lang=document.documentElement.lang||'en-US';
 const seen=new Set();
 recognition.onstart=()=>{
  if(voice.recognition!==recognition||!voice.active)return;
  voice.listening=true;
  updateVoicePanel();
 };
 recognition.onresult=event=>{
  if(voice.recognition!==recognition)return;
  const partial=[];
  for(let i=event.resultIndex;i<event.results.length;i++){
   const result=event.results[i];
   const text=result[0]?.transcript.trim();
   if(!text)continue;
   if(result.isFinal){
    if(seen.has(i))continue;
    seen.add(i);
    voice.retries=0;
    voice.pending+=' '+text;
    if(!voice.running&&!voice.failed&&!voice.flushTimer)scheduleVoiceFlush(600);
    voice.transcript=(voice.transcript+' '+text).trim().slice(-20000);
   }else partial.push(text);
  }
  voice.interim=partial.join(' ');
  updateVoicePanel();
 };
 recognition.onerror=event=>finishRecognition(recognition,event.error);
 recognition.onend=()=>finishRecognition(recognition);
 try{
  recognition.start();
  updateVoicePanel('Starting microphone…');
 }catch(error){
  finishRecognition(recognition,error.name==='NotAllowedError'?'not-allowed':'start-failed');
 }
}
function voiceDocumentRoot(){
 const source=state.documents.find(item=>item.id===voice.sourceId);
 if(!source)return null;
 const current=state.current===source.id&&view==='document';
 const root=current?$('editor'):document.createElement('div');
 if(!current)root.innerHTML=sanitize(source.html);
 return {source,root,current};
}
function voiceSignature(block){return sanitize(block.innerHTML);}
const voiceHeading=/^H[1-3]$/;
function indexVoiceSections(root){
 const sections=[{key:'root',id:'root',title:'Unsectioned notes',level:0,heading:null,blocks:[],parent:null}];
 const stack=[sections[0]];
 // Older Talk drafts can contain several headings in one wrapper.
 const blocks=[...root.children].flatMap(block=>block.classList.contains('voice-note')&&!block.dataset.voiceSection?
  [...block.children]:[block]);
 for(const block of blocks){
  if(block.classList.contains('voice-archive'))continue;
  if(block.matches(inlineVisual)){(stack.at(-1).assets??=[]).push(block);continue;}
  if(!voiceHeading.test(block.tagName)){
   stack.at(-1).blocks.push(block);
   continue;
  }
  const title=block.textContent.trim();
  if(!title)continue;
  if(!block.dataset.block)block.dataset.block=uid();
  const level=Number(block.tagName[1]);
  while(stack.at(-1).level>=level)stack.pop();
  const section={key:block.dataset.block,id:'s'+sections.length,title,level,heading:block,blocks:[],parent:stack.at(-1)};
  sections.push(section);
  stack.push(section);
 }
 for(const section of sections)section.draft=section.blocks.findLast(block=>block.dataset.voiceSection===section.key)||null;
 return sections;
}
function sectionVoiceSnapshot(section){
 return JSON.stringify([section.title,section.level,section.parent?.key,
  ...section.blocks.map(block=>voiceSignature(block)),...(section.assets||[]).map(block=>block.dataset.artifact||block.dataset.image)]);
}
function voiceSlots(section){
 const slots=[];
 for(const list of section.blocks.filter(isNoteList)){
  for(const item of list.children){
   const label=item.textContent.trim().replace(/[:：]$/,'');
   if(item.querySelector('ul,ol,[data-pin]')||!label||label.length>42||
    label.split(/\s+/).length>6||/[.!?;:—]/.test(label))continue;
   slots.push({id:section.id+'-b'+(slots.length+1),label,item});
  }
 }
 return slots;
}
function completeVoiceFormatSource(section){
 if(!section.heading||section.assets?.length||section.blocks.some(block=>block.matches('[data-pin]')||block.querySelector('[data-pin],[data-artifact]')))return '';
 const text=section.blocks.map(noteBlockText).join('\n').trim();
 return text.length<=2200?text:'';
}
function voiceNoteTargets(section){
 const items=[];
 for(const block of section.blocks){
  const entries=isNoteList(block)?[...block.children]:
   block.classList.contains('voice-note')?[...block.children].flatMap(node=>isNoteList(node)?[...node.children]:[node]):[block];
  for(const node of entries){
   if(!(node.matches('p,li,blockquote')||node.tagName==='DIV'&&isHeadingBlock(node))||node.closest(inlineVisual+',.voice-archive'))continue;
   const text=noteBlockText(node).trim();
   if(text)items.push({block,node,text});
  }
 }
 return items.map((item,index)=>({...item,id:section.id+'-n'+(index+1),signature:voiceSignature(item.node)}));
}
function currentVoiceFocus(destination,sections){
 if(!destination.current)return null;
 const selection=getSelection();
 if(!selection?.rangeCount||!destination.root.contains(selection.anchorNode)||!destination.root.contains(selection.focusNode))return null;
 const range=selection.getRangeAt(0);
 const section=sections.find(item=>item.heading?.contains(range.startContainer)||
  item.blocks.some(block=>block.contains(range.startContainer)));
 if(!section)return null;
 return {section:section.id,range,...(!selection.isCollapsed?{highlight:range.toString().trim().slice(0,300)}:{})};
}
function voiceContext(sections,segment,drafts,formatTargets,focus){
 const terms=text=>new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g)||[]);
 const spoken=terms(segment);
 const rank=section=>{
  const topic=terms(section.title);
  const context=terms(section.blocks.map(noteBlockText).join(' ').slice(0,900));
  return [...spoken].reduce((score,word)=>score+(topic.has(word)?4:context.has(word)?1:0),section.id===focus?.section?(focus.highlight?9:3):section.key===voice.focusSection?2:0);
 };
 const relevant=new Set(sections.map(section=>({section,score:rank(section)})).sort((a,b)=>b.score-a.score).slice(0,4).map(item=>item.section));
 for(const section of relevant){
  if(section.draft&&noteBlockText(section.draft).length<=850)drafts.add(section.id);
 }
 const formatting=/\b(?:format|formatting|reorganize|restructure|bullet|bold|clean|rewrite|revise|reword|edit|simplify|shorten|expand|tighten|turn|change)\b/i.test(segment);
 if(formatting){
  for(const section of [...relevant].slice(0,2))if(completeVoiceFormatSource(section))formatTargets.add(section.id);
 }
 const wantsNoteTargets=Boolean(focus?.highlight)||/\b(?:move|remove|delete|park|put|rewrite|replace|edit|change|reword|tighten|the one)\b/i.test(segment);
 let focusTarget;
 if(wantsNoteTargets)for(const section of relevant){
  const targets=voiceNoteTargets(section);
  if(focus?.section===section.id){
   focusTarget=targets.find(item=>item.node.contains(focus.range.startContainer)&&item.node.contains(focus.range.endContainer));
  }
  section.noteTargets=targets.map(item=>{
   const words=terms(item.text);
   return {item,score:(item===focusTarget?100:0)+[...spoken].filter(word=>words.has(word)).length};
  }).sort((a,b)=>b.score-a.score).slice(0,8).map(({item})=>item);
 }
 const outline=sections.map(section=>({
  id:section.id,title:section.title.slice(0,100),level:section.level,
  ...(focus?.section===section.id?{focus:{...(focus.highlight?{highlight:focus.highlight}:{}),...(focusTarget?{note:focusTarget.id}:{})}}:{}),
  ...(section.noteTargets?.length?{notes:section.noteTargets.map(({id,text})=>({id,text:text.slice(0,220)}))}:{}),
  ...(section.parent?{parent:section.parent.id}:{}),
  ...(section.assets?.some(node=>node.dataset.image)?{images:section.assets.flatMap(node=>{
   const image=findInlineImage(node.dataset.image);
   return image?[{id:image.id,name:image.name}]:[];
  })}:{}),
  ...(section.slots.length?{slots:section.slots.slice(0,12).map(({id,label})=>({id,label}))}:{}),
  ...(formatTargets.has(section.id)?{formatSource:completeVoiceFormatSource(section)}:{}),
  ...(relevant.has(section)?{
   readOnly:formatTargets.has(section.id)?'':section.blocks.filter(block=>block!==section.draft||!drafts.has(section.id)).map(noteBlockText).join(' ').slice(0,480),
   draft:drafts.has(section.id)?noteBlockText(section.draft):''
  }:section.draft?{hasDraft:true}:{})
 }));
 const pending=voice.commands.findLast(command=>command.action==='Prototype question'&&command.sourceId===voice.sourceId);
 if(!pending){
  const question=voice.commands.find(item=>item.action==='Clarify'&&item.sourceId===voice.sourceId);
  return JSON.stringify(question?{outline,pendingQuestion:question.text}:outline);
 }
 const section=sections.find(item=>item.key===pending.from);
 return JSON.stringify({outline,...(section?{pendingPrototype:{section:section.id,question:pending.text,brief:pending.brief}}:{})});
}
function insertVoiceBlock(root,section,block){
 const last=section.blocks.at(-1)||section.heading;
 if(last)last.after(block);
 else root.prepend(block);
}
function renderVoiceCommands(){
 const panel=$('voiceCommands');
 panel.replaceChildren();
 if($('voicePanel').classList.contains('hidden'))return;
 for(const command of voice.commands){
  if(command.sourceId&&command.sourceId!==state.current)continue;
  const card=document.createElement('div');
  const question=['Clarify','Prototype question'].includes(command.action);
  card.className='voice-command'+(question?' is-question':'');
  const orb=document.createElement('span');
  orb.className='voice-orb';
  orb.setAttribute('aria-hidden','true');
  card.append(orb);
  const message=document.createElement('p');
  message.textContent=command.text;
  if(question)message.setAttribute('role','status');
  card.append(message);
  const dismiss=document.createElement('button');
  dismiss.className='voice-dismiss';
  dismiss.setAttribute('aria-label','Dismiss');
  dismiss.title='Dismiss';
  dismiss.textContent='×';
  dismiss.onclick=()=>dismissVoiceCommand(command);
  card.append(dismiss);
  if(['Format','Replace','Replace note','Prototype'].includes(command.action)){
   const preview=document.createElement('div');
   preview.className='voice-format-preview';
   if(command.action==='Prototype')preview.textContent=command.brief;else preview.innerHTML=command.html;
   card.append(preview);
  }
  const actions=document.createElement('div');
  actions.className='voice-command-actions';
  if(!['Clarify','Prototype question'].includes(command.action)){
   const apply=document.createElement('button');
   apply.className='quiet';
   apply.textContent={'Heading level':'Change heading','Move note':'Move note','Park note':'Remove note','Replace note':'Replace note',Merge:'Merge sections',Park:'Remove section',Format:'Apply revision',Replace:'Replace section text',Rename:'Rename section','Move to top':'Move to top','Move before':'Move section','Move after':'Move section','Move into':'Nest section',Prototype:'Build prototype','Upload image':'Choose image','Create image':'Review image prompt','Move image':'Move image'}[command.action];
   apply.onclick=()=>applyVoiceCommand(command);
   actions.append(apply);
  }
  if(actions.childElementCount)card.append(actions);
  panel.append(card);
 }
}
function dismissVoiceCommand(command){
 voice.commands=voice.commands.filter(item=>item!==command);
 renderVoiceCommands();
}
function voiceSectionTree(sections,section){
 const start=sections.indexOf(section);
 const end=sections.findIndex((item,i)=>i>start&&item.level<=section.level);
 return sections.slice(start,end===-1?sections.length:end);
}
function voiceTreeSnapshot(tree){
 return JSON.stringify(tree.map(section=>[section.key,sectionVoiceSnapshot(section)]));
}
function clarifyVoice(text){
 const key=value=>value.trim().toLowerCase().replace(/[^a-z0-9 ]/g,'');
 if(!text.trim()||voice.commands.some(command=>command.action==='Clarify'&&key(command.text)===key(text)))return;
 if(voice.commands.some(command=>command.action==='Prototype question'))return;
 voice.commands=voice.commands.filter(command=>command.action!=='Clarify');
 voice.commands.push({action:'Clarify',text,sourceId:voice.sourceId});
}
function noteForSnapshot(section,prior){
 if(!section||!prior?.note)return null;
 const candidates=voiceNoteTargets(section).filter(item=>item.block.dataset.block===prior.note.block&&item.signature===prior.note.signature);
 return candidates.length===1?candidates[0]:null;
}
function queueVoiceCommand(edit,original,sections){
 if(edit.label==='Clarify'){
  clarifyVoice(edit.detail);
  return;
 }
 if(['Move note','Park note','Replace note'].includes(edit.label)){
  const [line,...body]=edit.detail.trim().split('\n');
  const [fromId,toId]=line.split('|').map(part=>part.trim());
  const prior=original.get(fromId);
  const from=sections.find(item=>item.key===prior?.key);
  const to=sections.find(item=>item.key===original.get(toId)?.key);
  const note=noteForSnapshot(from,prior);
  const replacement=body.join('\n').trim();
  if(!note||edit.label==='Move note'&&!to||edit.label==='Replace note'&&!replacement){
   clarifyVoice('Select the note you want me to edit.');
   return;
  }
  if(edit.label==='Replace note'&&(note.node.querySelector('ul,ol,[data-pin]')||note.node.closest('.pinned-anchor'))){
   clarifyVoice('Select a single note without nested items to replace it.');
   return;
  }
  const excerpt=note.text.replace(/\s+/g,' ').slice(0,100);
  const text=edit.label==='Move note'?'Move “'+excerpt+'” to '+to.title+'?':
   (edit.label==='Park note'?'Remove “':'Replace “')+excerpt+'” under '+from.title+'?';
  voice.commands.push({action:edit.label,text,from:from.key,to:to?.key,note:prior.note,
   ...(replacement?{html:formattedNotes(replacement,true)}:{}),sourceId:voice.sourceId});
  return;
 }
 if(['Upload image','Create image','Move image'].includes(edit.label)){
  const [first,...lines]=edit.detail.trim().split('\n');
  const [imageId,toId]=edit.label==='Move image'?first.split('|').map(part=>part.trim()):[null,first.trim()];
  const section=sections.find(item=>item.key===original.get(toId)?.key);
  const image=imageId&&sections.flatMap(item=>item.assets||[]).find(block=>block.dataset.image===imageId);
  const brief=lines.join('\n').trim();
  if(!section||edit.label==='Move image'&&!image||edit.label==='Create image'&&!brief){
   clarifyVoice('Which image and section should I use?');
   return;
  }
  const title=edit.label==='Move image'?'Move “'+findInlineImage(imageId).name+'”':edit.label;
  voice.commands.push({action:edit.label,text:title+' in “'+section.title+'”?',brief,imageId,
   from:section.key,sourceId:voice.sourceId});
  return;
 }
 if(['Prototype','Prototype question'].includes(edit.label)){
  const [alias,...lines]=edit.detail.trim().split('\n');
  const section=sections.find(item=>item.key===original.get(alias.trim())?.key);
  if(!section||!lines.length)return;
  const question=edit.label==='Prototype question'?lines.shift():null;
  const brief=lines.join('\n').trim();
  voice.commands=voice.commands.filter(item=>item.action!=='Clarify'&&(item.action!=='Prototype question'||item.from!==section.key));
  voice.commands.push({action:edit.label,text:question||'Build a prototype from “'+section.title+'”?',brief,
   from:section.key,sourceId:voice.sourceId});
  return;
 }
 if(['Format','Replace'].includes(edit.label)){
  const [alias,...lines]=edit.detail.trim().split('\n');
  const prior=original.get(alias.trim());
  const section=sections.find(item=>item.key===prior?.key&&item.heading);
  const markdown=lines.join('\n').trim();
  if(!section||edit.label==='Format'&&!prior.format||sectionVoiceSnapshot(section)!==prior.signature||!markdown||
   section.blocks.some(block=>block.matches('[data-pin]')||block.querySelector('[data-pin],[data-artifact]'))){
   clarifyVoice('Select the section and choose Clean up to format it safely.');
   return;
  }
  const html=formattedNotes(markdown.split('\n').filter(line=>!/^#{1,3}\s/.test(line)).join('\n'));
  if(!html)return;
  voice.commands.push({action:edit.label,text:(edit.label==='Replace'?'Replace the body of “':'Revise “')+section.title+'”?',html,
   from:section.key,fromSnapshot:prior.signature,sourceId:voice.sourceId});
  return;
 }
 const [fromId,toId]=edit.detail.split('|').map(id=>id.trim());
 const from=sections.find(section=>section.key===original.get(fromId)?.key&&section.heading);
 const to=sections.find(section=>section.key===original.get(toId)?.key&&section.heading);
 if(['Heading level','Match heading'].includes(edit.label)){
  const level=edit.label==='Match heading'?to?.level:Number(toId);
  if(!from||![1,2,3].includes(level)){clarifyVoice('Which heading should change level?');return;}
  if(from.level===level)return;
  voice.commands.push({action:'Heading level',from:from.key,to:to?.key,level,
   text:'Change “'+from.title+'” to H'+level+(to?' to match “'+to.title+'”':'')+'?',
   fromSnapshot:sectionVoiceSnapshot(from),toSnapshot:to?sectionVoiceSnapshot(to):null,sourceId:voice.sourceId});
  return;
 }
 if(edit.label==='Rename'&&from){
  if(!toId||toId.length>120||sections.some(section=>section!==from&&section.parent===from.parent&&section.title.toLowerCase()===toId.toLowerCase())){
   clarifyVoice('What unique heading should “'+from.title+'” use?');
   return;
  }
  voice.commands.push({action:'Rename',text:'Rename “'+from.title+'” to “'+toId+'”?',name:toId,
   from:from.key,fromSnapshot:sectionVoiceSnapshot(from),sourceId:voice.sourceId});
  return;
 }
 if(['Move before','Move after','Move into'].includes(edit.label)&&from&&to&&from!==to){
  const fromTree=voiceSectionTree(sections,from);
  const nesting=edit.label==='Move into';
  const levelOffset=nesting?to.level+1-from.level:to.level-from.level;
  if(fromTree.includes(to)||fromTree.some(section=>section.level+levelOffset>3)){
   clarifyVoice('Choose a different destination for “'+from.title+'” to keep the outline within three heading levels.');
   return;
  }
  const relation=edit.label.slice(5);
  voice.commands.push({action:edit.label,text:'Move “'+from.title+'” '+relation+' “'+to.title+'”?',from:from.key,to:to.key,
   fromSnapshot:sectionVoiceSnapshot(from),toSnapshot:sectionVoiceSnapshot(to),
   treeSnapshot:voiceTreeSnapshot(fromTree),sourceId:voice.sourceId});
  return;
 }
 if(edit.label==='Move to top'&&from){
  if(sections[1]===from){
   notify('“'+from.title+'” is already the first section.');
   return;
  }
  voice.commands.push({action:'Move to top',text:'Move “'+from.title+'” to the top of the outline?',
   from:from.key,fromSnapshot:sectionVoiceSnapshot(from),
   treeSnapshot:voiceTreeSnapshot(voiceSectionTree(sections,from)),sourceId:voice.sourceId});
  return;
 }

 if(!from||edit.label==='Merge'&&(!to||from===to)||!['Merge','Park'].includes(edit.label)){
  clarifyVoice('Which exact sections should change?');
  return;
 }
 const text=edit.label==='Merge'?
  'Merge “'+from.title+'”'+(from.parent?.heading?' under '+from.parent.title:' at the top level')+
  ' into “'+to.title+'”'+(to.parent?.heading?' under '+to.parent.title:' at the top level')+'?':
  'Park “'+from.title+'” in a collapsed section?';
 voice.commands.push({action:edit.label,text,from:from.key,to:to?.key,
  fromSnapshot:sectionVoiceSnapshot(from),toSnapshot:to?sectionVoiceSnapshot(to):null,
  treeSnapshot:edit.label==='Park'?voiceTreeSnapshot(voiceSectionTree(sections,from)):null,sourceId:voice.sourceId});
}
function applyVoiceCommand(command){
 if(view!=='document'||state.current!==command.sourceId){
  notify('Open the source document to apply this change.');
  return;
 }
 const root=$('editor');
 const sections=indexVoiceSections(root);
 const from=sections.find(section=>section.key===command.from);
 const to=sections.find(section=>section.key===command.to);
 if(command.note){
  const note=noteForSnapshot(from,command);
  if(!note||command.action==='Move note'&&!to){
   dismissVoiceCommand(command);
   notify('The note changed. Select it and ask Talk again.');
   return;
  }
  lastEdit=0;
  if(command.action==='Replace note'){
   note.node.innerHTML=command.html;
  }else{
   let node=note.node;
   const parent=node.parentElement;
   if(node.tagName==='LI'){
    const list=document.createElement(parent.tagName.toLowerCase());
    if(parent.children.length===1)parent.replaceWith(list);else parent.after(list);
    list.append(node);
    node=list;
   }
   if(command.action==='Move note'){
    const anchor=[...(to.assets||[]),...to.blocks].filter(block=>block.isConnected&&block!==node)
     .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1).at(-1)||to.heading;
    if(anchor)anchor.after(node);else root.prepend(node);
   }else{
    const archive=document.createElement('details');
    archive.className='voice-archive';
    const summary=document.createElement('summary');
    summary.textContent='Removed note';
    node.before(archive);
    archive.append(summary,node);
   }
  }
  ensureBlocks();
  captureDocument();
  renderOutline();
  dismissVoiceCommand(command);
  notify('Document updated. Press ⌘Z to undo.');
  return;
 }
 if(['Upload image','Create image','Move image'].includes(command.action)){
  if(!from){dismissVoiceCommand(command);notify('That section changed. Ask Talk to place the image again.');return;}
  const destination={docId:doc().id,key:from.key,title:from.title};
  if(command.action==='Upload image')chooseInlineImage(destination);
  else if(command.action==='Create image')openImageMaker(destination,command.brief);
  else {
   const image=sections.flatMap(section=>section.assets||[]).find(block=>block.dataset.image===command.imageId);
   if(!image){dismissVoiceCommand(command);notify('That image is no longer in this document.');return;}
   lastEdit=0;
   placeInlineImage(root,from,image);
   captureDocument();
   notify('Image moved. Press ⌘Z to undo.');
  }
  dismissVoiceCommand(command);
  return;
 }
 if(command.action==='Prototype'&&from){
  if(currentJob){notify('Wait for the current request to finish before starting the prototype.');return;}
  const selection=voiceSectionTree(sections,from).map(section=>
   [section.heading?section.title:'',...section.blocks.map(noteBlockText)].filter(Boolean).join('\n')
  ).join('\n').slice(0,8000)||command.brief;
  openMaker('wireframe',{docId:doc().id,blockId:blockAt(from.heading)?.dataset.block||null,
   heading:from.heading?from.title:'',selection,document:textOfDocument()});
  $('direction').value=command.brief;
  $('createPreview').click();
  dismissVoiceCommand(command);
  return;
 }
 if(!from||sectionVoiceSnapshot(from)!==command.fromSnapshot||
  command.to&&(!to||sectionVoiceSnapshot(to)!==command.toSnapshot)){
  dismissVoiceCommand(command);
  notify('The section changed. Ask Talk for the edit again.');
  return;
 }
 if(command.action==='Merge'&&(sections.some(section=>section.parent===from)||from.assets?.length)){
  notify('Move the child sections or attached visuals before merging these headings.');
  return;
 }
 const moving=command.action.startsWith('Move ');
 const tree=command.treeSnapshot?voiceSectionTree(sections,from):null;
 if(tree&&voiceTreeSnapshot(tree)!==command.treeSnapshot){
  dismissVoiceCommand(command);
  notify('The section changed. Ask Talk for the edit again.');
  return;
 }
 lastEdit=0;
 if(moving||command.action==='Park'){
  const order=[...root.querySelectorAll('*')];
  const nodes=tree.flatMap(section=>[section.heading,...section.blocks,...(section.assets||[])])
   .sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  if(moving){
   const first=sections[1]?.heading;
   const top=command.action==='Move to top';
   if(top&&first===from.heading){dismissVoiceCommand(command);return;}
   const before=top||command.action==='Move before';
   const targetTree=to?voiceSectionTree(sections,to):[];
   const targetNodes=targetTree.flatMap(section=>[section.heading,...section.blocks,...(section.assets||[])]);
   const anchor=top?(blockAt(first)||root.firstElementChild):before?to.heading:
    targetNodes.filter(node=>!nodes.includes(node)).sort((a,b)=>order.indexOf(a)-order.indexOf(b)).at(-1);
   const levelOffset=(top?(first?Number(first.tagName[1]):2):to.level+(command.action==='Move into'?1:0))-from.level;
   if(!anchor||nodes.includes(anchor)||tree.some(section=>section.level+levelOffset>3)){
    notify('Choose a different destination for this section.');
    return;
   }
   const fragment=document.createDocumentFragment();
   for(const node of nodes){
    if(levelOffset&&tree.some(section=>section.heading===node)){
     const heading=changeHeadingLevel(node,Number(node.tagName[1])+levelOffset);
     fragment.append(heading);
    }else fragment.append(node);
   }
   if(before)anchor.before(fragment);else anchor.after(fragment);
  }else{
   const archive=document.createElement('details');
   archive.className='voice-archive';
   const summary=document.createElement('summary');
   summary.textContent='Removed: '+from.title;
   from.heading.before(archive);
   archive.append(summary,...nodes);
  }
 }else if(command.action==='Heading level'){
  changeHeadingLevel(from.heading,command.level);
 }else if(command.action==='Rename'){
  from.heading.textContent=command.name;
 }else if(['Format','Replace'].includes(command.action)){
  if(from.blocks.some(block=>block.matches('[data-pin]')||block.querySelector('[data-pin],[data-artifact]'))){
   notify('Keep pinned notes in place by editing that passage in the document.');
   return;
  }
  const replacement=document.createElement('template');
  replacement.innerHTML=command.html;
  from.heading.after(replacement.content);
  from.blocks.forEach(block=>block.remove());
 }else if(command.action==='Merge'){
  let anchor=to.blocks.at(-1)||to.heading;
  for(const block of from.blocks){
   delete block.dataset.voiceSection;
   anchor.after(block);
   anchor=block;
  }
  from.heading.remove();
 }
 ensureBlocks();
 captureDocument();
 renderOutline();
 dismissVoiceCommand(command);
 notify('Document updated. Press ⌘Z to undo.');
}
function fillVoiceSlot(slot,detail){
 const lines=detail.split(/\r?\n/).map(line=>line.trim().replace(/^[-*]\s+/,'')).filter(Boolean);
 if(!lines.length)return false;
 const markup=text=>formattedNotes(text,true);
 const label=document.createElement('strong');
 label.textContent=slot.label+': ';
 slot.item.replaceChildren(label);
 slot.item.insertAdjacentHTML('beforeend',markup(lines[0]));
 if(lines.length>1){
  const supporting=document.createElement('ul');
  for(const text of lines.slice(1)){
   const item=document.createElement('li');
   item.innerHTML=markup(text);
   supporting.append(item);
  }
  slot.item.append(supporting);
 }
 return true;
}
function applyVoiceEdits(edits,original){
 const destination=voiceDocumentRoot();
 if(!destination)return;
 const {root,current,source}=destination;
 const sections=indexVoiceSections(root);
 const known=new Map(sections.map(section=>[section.key,section]));
 let changed=false,skipped=false;
 const commands=[];
 const touchedSections=new Map(sections.map(section=>[section.key,sectionVoiceSnapshot(section)]));
 const seen=new Set(sections.map(section=>section.title.toLowerCase().replace(/[^a-z0-9]/g,'')));
 for(const edit of edits.slice(0,8)){
  if(edit.id.startsWith('cmd-')){
   commands.push(edit);
   continue;
  }
  let section;
  if(edit.label==='Fill'){
   const prior=original.get(edit.id);
   section=known.get(prior?.key);
   const slot=section&&voiceSlots(section).find(item=>item.label===prior?.slot);
   if(!slot||touchedSections.get(section.key)!==prior.signature){skipped=true;continue;}
   changed=fillVoiceSlot(slot,edit.detail)||changed;
   voice.focusSection=section.key;
   continue;
  }
  if(edit.id.startsWith('new-')){
   const parts=edit.label.split('|',2);
   const parent=parts.length===2?known.get(original.get(parts[0])?.key):null;
   if(parts.length===2&&!parent){skipped=true;continue;}
   const title=parts.at(-1).trim().replace(/^#+\s*/, '');
   const titleKey=title.toLowerCase().replace(/[^a-z0-9]/g,'');
   if(!titleKey)continue;
   if(seen.has(titleKey)){
    const match=sections.find(item=>item.title.toLowerCase().replace(/[^a-z0-9]/g,'')===titleKey);
    if(match)original.set(edit.id,{key:match.key});
    continue;
   }
   const heading=document.createElement(parent?.heading?'h'+Math.min(3,parent.level+1):'h2');
   heading.dataset.block=uid();
   heading.textContent=title;
   if(parent?.heading){
    const index=sections.indexOf(parent);
    const next=sections.slice(index+1).find(candidate=>candidate.level<=parent.level);
    if(next)next.heading.before(heading);else root.append(heading);
   }else root.append(heading);
   section={key:heading.dataset.block,heading,blocks:[]};
   original.set(edit.id,{key:section.key});
   seen.add(titleKey);
   changed=true;
  }else{
   const prior=original.get(edit.id);
   section=known.get(prior?.key);
   if(!section||sectionVoiceSnapshot(section)!==prior.signature){skipped=true;continue;}
  }
  const detail=edit.detail.split('\n').filter(line=>!/^#{1,3}(?:\s|$)/.test(line.trim())).join('\n');
  const html=formattedNotes(detail);
  if(!html)continue;
  const block=document.createElement('div');
  block.className='voice-note';
  block.dataset.voiceSection=section.key;
  block.dataset.block=original.get(edit.id)?.replaceDraft?section.draft.dataset.block:uid();
  block.innerHTML=html;
  if(section.draft&&original.get(edit.id)?.replaceDraft){
   const selection=getSelection();
   if(section.draft.querySelector('[data-pin],[data-artifact]')||
    current&&root.contains(document.activeElement)&&section.draft.contains(selection?.anchorNode)){
    skipped=true;
    continue;
   }
   section.draft.replaceWith(block);
  }else insertVoiceBlock(root,section,block);
  voice.focusSection=section.key;
  changed=true;
 }
 if(changed&&current){lastEdit=0;captureDocument();renderOutline();}
 else if(changed){source.html=root.innerHTML;save();}
 if(skipped)notify('Kept the sections you changed while Talk was working.');
 if(commands.length){
  const latest=indexVoiceSections(root);
  const before=new Set(voice.commands);
  for(const command of commands.filter(item=>item.label!=='Clarify'))queueVoiceCommand(command,original,latest);
  if(!voice.commands.some(item=>!before.has(item)&&item.action!=='Clarify')){
   const question=commands.find(item=>item.label==='Clarify');
   if(question)queueVoiceCommand(question,original,latest);
  }else voice.commands=voice.commands.filter(item=>item.action!=='Clarify');
  // Keep a repeated request from creating an identical stack of proposals.
  const seenCommands=new Set();
  voice.commands=voice.commands.filter(command=>{
   const key=JSON.stringify([command.sourceId,command.action,command.text,command.html,command.brief]);
   if(seenCommands.has(key))return false;
   seenCommands.add(key);
   return true;
  });
  renderVoiceCommands();
 }
}
async function waitForVoiceJob(job){
 let transportErrors=0;
 const startedAt=Date.now();
 const deadline=startedAt+220000;
 while(Date.now()<deadline){
  await new Promise(resolve=>setTimeout(resolve,transportErrors?Math.min(4000,400*2**transportErrors):Date.now()-startedAt<8000?400:900));
  let result;
  try{result=await api('/api/jobs/'+encodeURIComponent(job));transportErrors=0;}
  catch(error){
   if(error.status===404)throw Error('The local server restarted before voice finished. Retry this transcript.');
   if(error.status&&error.status<500)throw error;
   if(++transportErrors<=5){updateVoicePanel('Reconnecting to your notes…');continue;}
   throw error;
  }
  if(result.status==='complete')return result;
  if(result.status==='error')throw Error(result.error||'Voice formatting failed.');
 }
 throw Error('Voice formatting is taking longer than expected. Retry will check the same request.');
}
function exactVoiceEdit(segment,sections){
 const spoken=segment.trim().replace(/[.!?]+$/,'');
 const named=title=>{
  const key=title.trim().replace(/^the\s+|\s+section$/gi,'').toLowerCase();
  const matches=sections.filter(section=>section.heading&&section.title.toLowerCase()===key);
  return matches.length===1?matches[0]:null;
 };
 const edit=(label,source,target)=>source&&{id:'cmd-local',label,detail:target?source.id+'|'+target.id:source.id};
 const level=spoken.match(/^(?:make|set|change) (.+?) (?:to |an? )?(?:h|heading )([123])$/i);
 if(level){
  const section=named(level[1]);
  if(section)return {id:'cmd-local',label:'Heading level',detail:section.id+'|'+level[2]};
 }
 const match=spoken.match(/^make (.+?) match (.+)$/i);
 if(match){
  const target=named(match[2]);
  if(target)return edit('Match heading',named(match[1]),target);
 }
 const top=spoken.match(/^move (.+) to the top$/i);
 if(top)return edit('Move to top',named(top[1]));
 const remove=spoken.match(/^(?:remove|delete|park) (.+)$/i);
 if(remove)return edit('Park',named(remove[1]));
 const move=spoken.match(/^move (.+?) (before|after|into) (.+)$/i);
 if(!move)return null;
 const target=named(move[3]);
 return target?edit('Move '+move[2].toLowerCase(),named(move[1]),target):null;
}
async function organizeVoice(){
 if(voice.running||voice.failed||(!voice.pending.trim()&&!voice.inflight))return;
 if(currentJob&&currentJobTask!=='wireframe'){
  if(!voice.recognition&&!voice.wakeTimer)voice.wakeTimer=setTimeout(()=>{
   voice.wakeTimer=null;
   organizeVoice();
  },1000);
  return;
 }
 const destination=voiceDocumentRoot();
 if(!destination)return;
 const previous=voice.inflight;
 const segment=previous?.segment||voice.pending.trim().slice(0,7000);
 if(!previous)voice.pending=voice.pending.trim().slice(segment.length).trim();
 const sections=indexVoiceSections(destination.root);
 const localEdit=!previous&&exactVoiceEdit(segment,sections);
 if(localEdit){
  const original=new Map(sections.map(section=>[section.id,{key:section.key}]));
  queueVoiceCommand(localEdit,original,sections);
  renderVoiceCommands();
  if(voice.pending.trim())scheduleVoiceFlush(0);
  updateVoicePanel();
  return;
 }
 const drafts=new Set(),formatTargets=new Set();
 for(const section of sections){
  section.slots=voiceSlots(section);
 }
 const focus=currentVoiceFocus(destination,sections);
 const context=voiceContext(sections,segment,drafts,formatTargets,focus);
 const baseline=previous?.baseline||new Map();
 for(const section of sections){
  const signature=sectionVoiceSnapshot(section);
  if(!previous)baseline.set(section.id,{key:section.key,signature,replaceDraft:drafts.has(section.id),format:formatTargets.has(section.id)});
  if(!previous)for(const item of section.noteTargets||[]){
   if(item.block.dataset.block)baseline.set(item.id,{key:section.key,note:{block:item.block.dataset.block,signature:item.signature}});
  }
  const labels=section.slots.map(slot=>slot.label);
  for(const slot of section.slots.slice(0,12)){
   if(!previous&&labels.indexOf(slot.label)===labels.lastIndexOf(slot.label))baseline.set(slot.id,{key:section.key,signature,slot:slot.label});
  }
 }
 voice.running=true;
 updateVoicePanel();
 try{
  if(!voice.inflight){
   const started=await api('/api/generate',{task:'clean',voiceEdit:true,title:destination.source.title,heading:'Live brainstorm',
    selection:segment,document:context,instruction:voiceInstruction});
   voice.inflight={job:started.job,segment,baseline};
  }
  const result=await waitForVoiceJob(voice.inflight.job);
  applyVoiceEdits(result.data.nodes,baseline);
  voice.inflight=null;
  voice.formatError='';
  voice.failed=false;
 }catch(error){
  const message=error.message||'Voice formatting failed.';
  // Terminal jobs must be regenerated; polling interruptions retain the same job.
  if(!/taking longer|local workspace is unavailable|unreadable response/i.test(message)){
   voice.inflight=null;
  }
  if(!voice.inflight)voice.pending=[segment,voice.pending].filter(Boolean).join(' ');
  voice.failed=true;
  voice.formatError=message;
  notify(message);
 }finally{
  voice.running=false;
  updateVoicePanel();
  if(voice.pending.trim()&&!voice.failed)scheduleVoiceFlush(voice.recognition?300:0);
 }
}
$('voiceButton').onmousedown=event=>event.preventDefault();
$('voiceButton').onclick=showVoicePanel;
$('closeVoice').onclick=closeVoicePanel;
$('toggleTranscript').onclick=()=>{
 const transcript=$('voiceTranscript');
 const expanded=!transcript.classList.toggle('hidden');
 $('toggleTranscript').setAttribute('aria-expanded',String(expanded));
 if(expanded)transcript.scrollTop=transcript.scrollHeight;
};
$('toggleVoice').onclick=()=>voice.active?stopVoice():startVoice();
$('retryVoice').onclick=()=>{voice.failed=false;voice.formatError='';organizeVoice();};

function createDeliverable(){
 captureDocument();
 const source=doc();
 if(!textOfDocument().trim()&&!$('editor').querySelector(inlineVisual)){
  notify('Write something before creating a deliverable.');
  return;
 }
 const versions={};
 for(const block of $('editor').querySelectorAll('[data-artifact]')){
  const artifact=state.artifacts.find(item=>item.id===block.dataset.artifact);
  if(artifact)versions[artifact.id]=artifact.versions.length-1;
 }
 source.deliverable={title:source.title,html:source.html,versions,created:Date.now()};
 save();
 renderSidebar();
 notify('Finished document saved to Deliverables.');
}
function openArtifact(id){hideMenus();activeArtifact=state.artifacts.find(a=>a.id===id);if(!activeArtifact)return;view='detail';viewVersion=activeArtifact.versions.length-1;$('documentView').classList.add('hidden');$('deliverablesView').classList.add('hidden');$('detailView').classList.remove('hidden');$('breadcrumbParent').textContent='Documents';$('breadcrumbTitle').textContent=currentData(activeArtifact).title;renderSidebar();renderArtifact();window.scrollTo({top:0});}

function sourceIsCurrent(a){const d=state.documents.find(x=>x.id===a.docId);if(!d||!a.capture)return false;const c=document.createElement('div');c.innerHTML=sanitize(d.html);c.querySelectorAll('[data-artifact]').forEach(e=>e.remove());return documentText(c).trim()===a.capture.document.trim();}
function renderArtifact(){
 const a=activeArtifact;if(!a)return;viewVersion=Math.max(0,Math.min(viewVersion,a.versions.length-1));const d=a.versions[viewVersion].data,source=state.documents.find(x=>x.id===a.docId),latest=viewVersion===a.versions.length-1;
 $('artifactTitle').textContent=d.title;$('artifactSubtitle').textContent=labels[a.task]+' · '+(source?.title||'Document')+' · Version '+(viewVersion+1)+(a.example?' · Earlier design example':'');
 $('stageAnnotation').textContent=a.task==='wireframe'?'Interactive wireframe. Authentication, payments, and external actions are simulated.':d.summary;
 $('artifactStage').innerHTML=a.task==='wireframe'?'<div id="wireframeHost" style="max-width:100%"></div>':a.task==='diagram'||a.task==='metrics'?diagramSVG(d):'<div class="text-preview formatted-preview">'+formattedNotes(d.body)+'</div>';
 if(a.task==='wireframe')renderWireframe($('wireframeHost'),d);
 $('insertArtifact').disabled=!latest;
 $('insertArtifact').innerHTML=icon(a.task==='clean'?'check':'plus',14)+(a.task==='clean'?'Apply suggested edit':'Insert in notes');
 const designNote=a.task==='wireframe'&&d.body?'<div class="section"><div class="eyebrow">Design notes</div><p class="wireframe-design-note">'+esc(d.body)+'</p></div>':'';
 const extra=[...(d.assumptions||[]).map(x=>'<p><strong>Assumption:</strong> '+esc(x)+'</p>'),...(d.questions||[]).map(x=>'<p><strong>Open:</strong> '+esc(x)+'</p>')].join('');
 $('inspector').innerHTML=`<div class="section"><div class="eyebrow">Source document</div><button class="source-link" id="viewSource">${icon('doc',13)}${esc(source?.title||'Document')}${icon('chevron',11)}</button><p>${esc(a.source.slice(0,300))}</p><p>${a.capture&&!sourceIsCurrent(a)?'Your notes have changed since this request.':'Created from this passage and its document context.'}</p></div><div class="section"><div class="eyebrow">Refine</div><p>${esc(a.direction||'Tell me what to change. The other decisions will be preserved.')}</p><textarea id="revisionDirection" placeholder="What would you change?"></textarea><button class="primary" id="previewRevision">Create revision ${icon('arrow',13)}</button><p class="example-notice" id="revisionStatus">Earlier versions stay available.</p></div>${designNote}${extra?'<div class="section"><div class="eyebrow">Assumptions & open questions</div>'+extra+'</div>':''}<div class="section"><div class="eyebrow">Versions</div>${a.versions.map((v,i)=>'<button class="version" data-version="'+i+'" style="width:100%;justify-content:flex-start"><span class="version-dot" style="opacity:'+(i===viewVersion?1:.25)+'"></span>Version '+(i+1)+(i===a.versions.length-1?'<span class="muted">Latest</span>':'')+'</button>').join('')}${!latest?'<button class="secondary" id="restoreVersion" style="width:100%;font-size:11px">Restore this version</button>':''}</div>`;
 $('viewSource').onclick=()=>{state.current=a.docId;showDocument(a.sourceBlock);};
 $('inspector').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>{viewVersion=Number(b.dataset.version);renderArtifact();});
 if($('restoreVersion'))$('restoreVersion').onclick=()=>{if(a.versions.length>=100){notify('This deliverable has reached its version limit. Export a copy before continuing.');return;}a.versions.push({data:structuredClone(d),created:Date.now(),direction:'Restored version '+(viewVersion+1)});viewVersion=a.versions.length-1;a.status='draft';hydrateInline();save();renderArtifact();};
 $('previewRevision').onclick=()=>reviseArtifact(a,d);
}
async function reviseArtifact(a,previous){
 const instruction=$('revisionDirection').value.trim();if(!instruction)return;if(currentJob){notify('A request is already running.');return;}if(a.example){notify('Select the original notes and create a new AI deliverable from them first.');return;}if(a.versions.length>=100){notify('This deliverable has reached its version limit.');return;}
 const source=state.documents.find(x=>x.id===a.docId),copy=document.createElement('div');copy.innerHTML=sanitize(source.html);copy.querySelectorAll('[data-artifact]').forEach(x=>x.remove());
 const capture={...a.capture,document:documentText(copy)};
 const button=$('previewRevision');button.disabled=true;button.textContent='Creating…';currentJob=a.id;
 try{const job=await api('/api/generate',requestContext(capture,a.task,instruction,previous));const pending={id:uid(),job:job.job,operation:'revision',task:a.task,artifactId:a.id,instruction,capture,created:Date.now()};rememberRequest(pending);const result=await waitForJob(job.job,(seconds,phase)=>{if(activeArtifact?.id===a.id&&$('revisionStatus'))$('revisionStatus').textContent=(phase||'Creating revision')+' · '+seconds+'s';});finishRequest(pending,result);if(activeArtifact?.id===a.id&&view==='detail'){viewVersion=a.versions.length-1;renderArtifact();}notify('Revision ready. The previous version is preserved.');}
 catch(e){state.pending=(state.pending||[]).filter(p=>!(p.operation==='revision'&&p.artifactId===a.id));save();notify(e.message);if(activeArtifact?.id===a.id&&$('revisionStatus'))$('revisionStatus').textContent=e.message;}
 finally{currentJob=null;if(activeArtifact?.id===a.id&&$('previewRevision')){$('previewRevision').disabled=false;$('previewRevision').innerHTML='Create revision '+icon('arrow',13);}}
}
function renderWireframe(host,data){
 const screens=data.screens||[];
 const wfValues={},selectedChips=new Map(),prefix=uid();
 let wfStep=0,wfComplete=false;
 function draw(){
 if(!screens.length){host.innerHTML='<div class="text-preview">This is an earlier design example. Create a new wireframe from your notes to use the AI version.</div>';return;}
 if(wfComplete){host.innerHTML='<div class="wireframe"><div class="wf-body"><div class="wf-check">'+icon('check',23)+'</div><h2>Flow complete.</h2><p>This is a wireframe. No data was submitted.</p><button class="wf-main" data-restart>Start again</button></div></div>';host.querySelector('[data-restart]').onclick=()=>{wfComplete=false;wfStep=0;draw();};return;}
 wfStep=Math.min(wfStep,screens.length-1);const screen=screens[wfStep];
 const fields=screen.fields.map(f=>{
  const id='wf-'+prefix+'-'+screen.id+'-'+f.id,required=f.required?' required':'',type=f.type;
  let input='';
  if(type==='select')input='<select id="'+esc(id)+'" data-field="'+esc(f.id)+'"'+required+'><option value="">'+esc(f.placeholder||'Choose an option')+'</option>'+f.options.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select>';
  else if(type==='chips')input='<input class="wf-search" id="'+esc(id)+'" data-chip-search="'+esc(f.id)+'" placeholder="'+esc(f.placeholder||'Search options')+'"><div class="wf-chips" data-chips="'+esc(f.id)+'"></div>';
  else if(type==='textarea')input='<textarea id="'+esc(id)+'" data-field="'+esc(f.id)+'" placeholder="'+esc(f.placeholder)+'"'+required+' style="width:100%;min-height:90px;border:1px solid #e0d9cc;border-radius:6px;padding:10px;font:inherit"></textarea>';
  else if(type==='checkbox')input='<input id="'+esc(id)+'" data-field="'+esc(f.id)+'" type="checkbox"'+required+' style="width:auto">';
  else input='<input id="'+esc(id)+'" data-field="'+esc(f.id)+'" type="'+esc(type)+'" placeholder="'+esc(f.placeholder)+'" autocomplete="'+(type==='password'?'new-password':'off')+'"'+required+'>';
  return '<div class="wf-field full"><label for="'+esc(id)+'">'+esc(f.label)+(f.required?' <span style="color:#b1a28b">*</span>':'')+'</label>'+input+'</div>';
 }).join('');
 const actions=screen.actions.map((action,i)=>'<button type="button" data-wf-action="'+i+'" class="'+(action.style==='primary'?'wf-main':action.style==='social'?'wf-social':'wf-back')+'">'+esc(action.label)+(action.style==='primary'?icon('arrow',12):'')+'</button>').join('');
 host.innerHTML='<div class="wireframe"><div class="wf-header"><span class="wf-logo">'+esc(data.title)+'</span><span style="font-size:9px;color:#ac9e88;font-weight:400">Wireframe</span></div><div class="wf-progress"><span style="width:'+((wfStep+1)/screens.length*100)+'%"></span></div><form class="wf-body" data-wireframe-form><div class="wf-step">'+esc(screen.eyebrow||'Step '+(wfStep+1)+' of '+screens.length)+'</div><h2>'+esc(screen.title)+'</h2>'+(screen.description?'<p>'+esc(screen.description)+'</p>':'')+(screen.notice?'<div class="wf-note">'+esc(screen.notice)+'</div>':'')+'<div class="wf-fields">'+fields+'</div><div style="margin-top:20px">'+actions+'</div>'+(screen.footer?'<div class="wf-foot">'+esc(screen.footer)+'</div>':'')+'</form><div class="screen-switcher">'+screens.map((s,i)=>'<button type="button" data-screen="'+i+'" class="'+(wfStep===i?'active':'')+'">'+(i+1)+'</button>').join('')+'</div></div>';
 host.querySelector('form').onsubmit=e=>e.preventDefault();
 host.querySelectorAll('[data-field]').forEach(input=>{const key=screen.id+'-'+input.dataset.field;if(input.type!=='password'&&wfValues[key]!==undefined){if(input.type==='checkbox')input.checked=wfValues[key];else input.value=wfValues[key];}input.oninput=()=>{if(input.type!=='password')wfValues[key]=input.type==='checkbox'?input.checked:input.value;};});
 for(const f of screen.fields.filter(f=>f.type==='chips')){
  const key=screen.id+'-'+f.id;if(!selectedChips.has(key))selectedChips.set(key,new Set());
  const render=()=>{const search=[...host.querySelectorAll('[data-chip-search]')].find(x=>x.dataset.chipSearch===f.id);const box=[...host.querySelectorAll('[data-chips]')].find(x=>x.dataset.chips===f.id);box.replaceChildren();f.options.filter(x=>x.toLowerCase().includes(search.value.toLowerCase())).forEach(option=>{const b=document.createElement('button');b.type='button';b.className='wf-chip'+(selectedChips.get(key).has(option)?' selected':'');b.setAttribute('aria-pressed',String(selectedChips.get(key).has(option)));b.textContent=(selectedChips.get(key).has(option)?'✓ ':'+ ')+option;b.onclick=()=>{const set=selectedChips.get(key);if(set.has(option))set.delete(option);else set.add(option);render();};box.append(b);});};
  [...host.querySelectorAll('[data-chip-search]')].find(x=>x.dataset.chipSearch===f.id).oninput=render;render();
 }
 host.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{wfStep=Number(b.dataset.screen);draw();});
 host.querySelectorAll('[data-wf-action]').forEach(b=>b.onclick=()=>{const action=screen.actions[Number(b.dataset.wfAction)];if(action.target==='@social'){notify('Social sign-in is simulated in this wireframe.');return;}const next=screens.findIndex(x=>x.id===action.target),goingForward=action.target==='@complete'||next>wfStep;
  if(goingForward&&action.style!=='skip'){if(!host.querySelector('form').reportValidity())return;const missing=screen.fields.find(f=>f.type==='chips'&&f.required&&!selectedChips.get(screen.id+'-'+f.id)?.size);if(missing){notify('Choose at least one option for '+missing.label+'.');return;}}
  if(action.target==='@complete'){wfComplete=true;draw();return;}if(next>=0){wfStep=next;draw();}
 });
 }
 draw();
}
function formattedNotes(body,inline=false){
 const decorate=text=>esc(text)
  .replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
  .replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
 const lines=body.trim().split(/\r?\n/);
 if(inline)return lines.map(line=>decorate(line.replace(/^#{1,3}\s*/,''))).join('<br>');
 let html='';
 const listRoot=document.createElement('div'),lists=[];
 function flushLists(){
  html+=listRoot.innerHTML;
  listRoot.replaceChildren();
  lists.length=0;
 }
 for(const line of lines){
  const item=line.match(/^(\s*)(?:([-*])|(\d+)\.)\s+(.+)$/);
  if(item){
   const indent=item[1].replace(/\t/g,'  ').length;
   const tag=item[2]?'UL':'OL';
   while(lists.length&&lists.at(-1).indent>indent)lists.pop();
   if(lists.at(-1)?.indent===indent&&lists.at(-1).element.tagName!==tag)lists.pop();
   if(lists.at(-1)?.indent!==indent){
    const list=document.createElement(tag);
    const parent=lists.at(-1)?.element.lastElementChild||listRoot;
    parent.append(list);
    lists.push({indent,element:list});
   }
   const li=document.createElement('li');
   li.innerHTML=decorate(item[4]);
   lists.at(-1).element.append(li);
   continue;
  }
  if(!line.trim())continue;
  flushLists();
  const heading=line.match(/^(#{1,3})\s*(.+)$/);
  const question=line.match(/^>\s*Question:\s*(.+)$/i);
  if(question)html+='<blockquote class="question-callout"><strong>Open question</strong><p>'+decorate(question[1])+'</p></blockquote>';
  else if(heading){
   const level=heading[1].length;
   html+='<h'+level+'>'+decorate(heading[2])+'</h'+level+'>';
  }else html+='<p>'+decorate(line)+'</p>';
 }
 flushLists();
 return html;
}
const documentStandards=[
 'Match the document to its job. A live product brainstorm should let someone see why the product exists, who we chose, how it works today, what we need to learn, and what we would try. Use the headings supported by the notes. A decision brief leads with its recommendation and its reasons. A spec groups requirements by user flow and distinguishes open decisions.',
 'Use orange level-2 headings for distinct sections, such as Product / Why, Users / Who, User Journey, Success Metrics, and Proposed Solution. Use level 3 when one section needs two different subtopics. Infer headings from short standalone labels, including bold labels without Markdown heading marks.',
 'When the document is a live brainstorm, write scan-friendly notes with one thought per bullet. Keep a mission or guiding thesis to one sentence. Cut filler, redundant adjectives, and repeated lead-ins. Split a comparison or tradeoff into short labeled bullets. Use a nested bullet for an implication or caveat that belongs to its parent. Preserve specific evidence, qualifiers and assumptions.',
 'Fill an existing outline label before adding another bullet. Put one short detail on the same line as its bold label. Use sub-bullets for separate details that qualify, explain, or support it. A new sibling bullet must add a distinct peer idea. Keep pins for challenges tied to a specific claim.',
 'Use bullets for parallel facts or options. Use bold front labels when bullets form a set the reader may scan, such as **Offerings**, **Mission**, **Business objective**, **Trends**, **Competition**, and **Strengths**. Do not bold the whole bullet. Use numbered lists for a sequence someone must follow, such as onboarding steps. Use prose for causal reasoning. Use italics for a short caveat, scope choice, or working assumption. Do not use decoration to make everything look equally important.',
 'An open question identifies something unknown that could change the decision or what you build next. Rewrite it as a specific question where possible. Render each as > Question: followed by the question on a single line. Keep a suspected explanation near the question as a labeled hypothesis. Keep minor unknowns in the text. Never turn guesses, requested copy or unsupported percentages into evidence.',
 'Name the stated North Star first. Put supporting measures and diagnostics underneath. Keep guardrails separate.',
 'Decide what to build inline. A concrete multi-step journey earns a diagram. A set of related outcome, driver, or guardrail metrics earns a metric tree. A solution earns a clickable prototype only when notes describe decisions or requirements for identifiable screens and actions. An idea alone does not. Use source facts and screenshots in the visual brief. A statistical chart requires data, labels, and units, so never substitute invented figures or a diagram presented as a chart.',
 'Use a visual when it clarifies a real sequence, relationship, or interaction. Organize explicit requirements near their supporting evidence.',
];
function cleanWholeDocument(){
 const editor=$('editor');
 ensureBlocks();
 const first=[...editor.children].find(block=>!block.hasAttribute('data-artifact')&&block.textContent.trim());
 if(!first){notify('Write a few notes before cleaning up the document.');return;}
 selectionRange=document.createRange();
 selectionRange.selectNodeContents(editor);
 selectionText=selectionRange.toString().trim();
 selectionBlock=first.dataset.block;
 selectionHeading=doc().title;
 hideMenus();
 $('overlay').classList.add('quick-modal');
 openCleanup(true);
}
function openCleanup(wholeDocument=false){
 makerTask='clean';
 const editor=$('editor');
 if(!selectionRange||!editor.contains(selectionRange.startContainer)||selectionRange.collapsed){
  let block=[...editor.children].find(el=>el.dataset.block===selectionBlock);
  if(block&&!block.innerText.trim())block=block.previousElementSibling;
  if(!block||block.hasAttribute('data-artifact')||!block.innerText.trim()){
   notify('Select text or place the cursor in the paragraph you want to clean up.');
   $('overlay').classList.remove('quick-modal');
   return;
  }
  selectionRange=document.createRange();
  selectionRange.selectNodeContents(block);
  selectionBlock=block.dataset.block;
  selectionText=selectionRange.toString().trim();
 }
 pendingCapture={...snapshotSelection(),wholeDocument};
 returnFocus=editor;
 $('sheet').innerHTML='<div class="sheet-head"><h2 id="sheetTitle">'+(wholeDocument?'Clean up document':'Clean up')+'</h2><button class="icon" id="closeSheet" aria-label="Close">'+icon('close')+'</button></div><label for="direction">Direction (optional)</label><textarea id="direction" rows="2" placeholder="Keep my voice. Make it easier to scan."></textarea><div class="sheet-bottom"><button class="primary" id="createPreview">Clean up</button><p class="example-notice">'+(wholeDocument?'Formats the whole document and adds visuals when the notes support them.':'Applies to the passage in your notes. Press ⌘Z to undo.')+'</p></div>'+(wholeDocument?'<details class="cleanup-standard"><summary>Document standards</summary><ul>'+documentStandards.map(rule=>'<li>'+esc(rule)+'</li>').join('')+'</ul></details>':'');
 openOverlay();
 $('closeSheet').onclick=closeOverlay;
 $('createPreview').onclick=createPreview;
 $('direction').onkeydown=event=>{
  if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('createPreview').click();}
 };
 $('direction').focus();
}
function artifactBlock(root,artifact){
 if(root.querySelector('[data-artifact="'+artifact.id+'"]'))return;
 const source=[...root.children].find(el=>el.dataset.block===artifact.sourceBlock);
 const block=document.createElement('section');
 block.dataset.artifact=artifact.id;
 block.dataset.block=uid();
 block.contentEditable='false';
 if(source)source.after(block);else root.append(block);
 return block;
}
function restoreEarlierResults(){
 for(const source of state.documents){
  if(source.inlineResults)continue;
  const root=document.createElement('div');
  root.innerHTML=sanitize(source.html);
  for(const artifact of state.artifacts.filter(item=>item.docId===source.id)){
   if(['summary','clean'].includes(artifact.task)&&artifact.status==='accepted')continue;
   artifactBlock(root,artifact);
  }
  source.html=root.innerHTML;
  source.inlineResults=true;
 }
}
function notifyVisualFailures(failures){
 notify('Some visuals could not be created: '+failures.map(task=>labels[task]).join(', ')+'.');
}
function placeResult(pending){
 if(pending.operation!=='create')return;
 const artifact=state.artifacts.find(item=>item.id===pending.id);
 const source=state.documents.find(item=>item.id===pending.capture.docId);
 if(!artifact||!source)return;
 const current=view==='document'&&source.id===state.current;
 if(current&&artifact.task==='clean'&&applyCleanup(artifact)){
  notify('Cleaned up in your notes. Press ⌘Z to undo.');
  return;
 }
 const root=current?$('editor'):document.createElement('div');
 if(!current)root.innerHTML=sanitize(source.html);
 artifactBlock(root,artifact);
 if(current){
  lastEdit=0;
  captureDocument();
  hydrateInline();
 }else{
  source.html=root.innerHTML;
  save();
 }
 notify(artifact.task==='clean'?'Your notes changed. Review the suggested edit below the source.':'Added to your notes.');
}
function relinkVisuals(previous,revised){
 const heading=element=>/^H[1-3]$/.test(element.tagName);
 const key=text=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
 const revisedBlocks=[...revised.children];
 const sectionEnd=new Map();
 let topic='';
 let attachmentTarget;
 for(const block of revisedBlocks){
  if(heading(block))topic=key(block.textContent);
  sectionEnd.set(topic,block);
 }
 for(const block of previous){
  if(!block.matches(inlineVisual)){
   if(heading(block)||block.textContent.length<75&&sectionEnd.has(key(block.textContent))){
    attachmentTarget=key(block.textContent);
   }
   continue;
  }
  const target=sectionEnd.get(attachmentTarget||'');
  if(target){
   target.after(block);
   sectionEnd.set(attachmentTarget||'',block);
  }else if(block.dataset.image)revised.append(block);
 }
}
function placeDocumentVisuals(documentEdit,editor=$('editor'),ids=documentEdit.generatedVisuals||[]){
 const inserted=[];
 const blocks=[...editor.children];
 const headingKey=text=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
 for(const id of ids){
  const visual=state.artifacts.find(item=>item.id===id);
  if(!visual)continue;
  const heading=blocks.find(block=>/^H[123]$/.test(block.tagName)&&
   headingKey(block.textContent)===headingKey(visual.capture.heading));
  let anchor=heading;
  while(anchor?.nextElementSibling&&!/^H[123]$/.test(anchor.nextElementSibling.tagName)){
   anchor=anchor.nextElementSibling;
  }
  visual.sourceBlock=anchor?.dataset.block||'';
  visual.capture.blockId=visual.sourceBlock;
  const block=artifactBlock(editor,visual);
  if(block)inserted.push(block);
 }
 return inserted;
}
function preservePinnedNotes(source,revised){
 const pins=source.flatMap(block=>[...(block.matches('[data-pin]')?[block]:[]),...block.querySelectorAll('[data-pin]')]);
 if(!pins.length)return;
 const label=item=>[...item.childNodes].filter(node=>!isNoteList(node)&&!node.dataset?.pin).map(node=>node.textContent).join('').trim();
 for(const pin of pins){
  const marker='[Pin:'+pin.dataset.pin+']';
  const oldParent=pin.parentElement?.closest('li');
  const oldParagraph=pin.parentElement?.classList.contains('pinned-anchor')?pin.parentElement.firstElementChild:null;
  const placeholder=[...revised.querySelectorAll('li')].find(item=>label(item).startsWith(marker));
  if(placeholder&&placeholder.parentElement.parentElement.tagName==='LI'){
   const list=placeholder.parentElement;
   const parent=list.parentElement;
   list.before(pin);
   placeholder.remove();
   if(!list.children.length)list.remove();
   pin.classList.remove('unattached-pin');
   continue;
  }
  if(placeholder)placeholder.remove();
  const matches=oldParent?[...revised.querySelectorAll('li')].filter(item=>label(item)===label(oldParent)):[];
  const paragraphs=oldParagraph?[...revised.children].filter(block=>block.tagName===oldParagraph.tagName&&block.textContent.trim()===oldParagraph.textContent.trim()):[];
  if(paragraphs.length===1){
   const wrapper=document.createElement('div');
   wrapper.className='pinned-anchor';
   paragraphs[0].before(wrapper);
   wrapper.append(paragraphs[0],pin);
   pin.classList.remove('unattached-pin');
  }else if(matches.length===1){
   matches[0].append(pin);
   pin.classList.remove('unattached-pin');
  }else{
   pin.classList.add('unattached-pin');
   revised.append(pin);
  }
 }
}
function applyCleanup(artifact){
 const editor=$('editor');
 const capture=artifact.capture;
 if(!capture?.bounds)return false;
 const data=currentData(artifact);
 lastEdit=0;
 const blocks=[...editor.children];
 if(capture.wholeDocument&&blocks.length!==capture.wholeBlocks.length)return false;
 if(capture.wholeBlocks?.length){
  const index=blocks.findIndex(block=>block.dataset.block===capture.wholeBlocks[0]);
  const selected=blocks.slice(index,index+capture.wholeBlocks.length);
  if(index<0||selected.length!==capture.wholeBlocks.length||
   selected.some((block,i)=>block.dataset.block!==capture.wholeBlocks[i]))return false;
  const notes=selected.filter(block=>!block.matches(inlineVisual+',.voice-archive'));
  if(!notes.length)return false;
  if(capture.noteBlocks){
   if(notes.length!==capture.noteBlocks.length||notes.some((block,i)=>
    block.dataset.block!==capture.noteBlocks[i].id||block.textContent!==capture.noteBlocks[i].text))return false;
  }else if(editor.textContent!==capture.editorText||notes.length!==selected.length)return false;
  const replacement=document.createElement('template');
  replacement.innerHTML=formattedNotes(data.body);
  preservePinnedNotes(selected,replacement.content);
  const caret=replacement.content.lastElementChild;
  const newNotes=[...replacement.content.children];
  if(capture.wholeDocument)relinkVisuals(selected,replacement.content);
  notes[0].before(replacement.content);
  notes.forEach(block=>block.remove());
  if(capture.wholeDocument){
   ensureBlocks();
   artifact.editionBlocks=newNotes.map(block=>block.dataset.block);
  }
  if(caret){
   const range=document.createRange();
   range.selectNodeContents(caret);
   range.collapse(false);
   const selection=getSelection();
   selection.removeAllRanges();
   selection.addRange(range);
  }
 }else{
  if(editor.textContent!==capture.editorText)return false;
  const range=restoreOffsets(capture.bounds.start,capture.bounds.end);
  if(range.toString().trim()!==(capture.rawSelection||capture.selection))return false;
  const start=blockAt(range.startContainer),end=blockAt(range.endContainer);
  if(start&&end&&blocks.slice(blocks.indexOf(start),blocks.indexOf(end)+1).some(el=>el.matches(inlineVisual+',[data-pin]')||el.querySelector('[data-pin]')))return false;
  document.execCommand('insertHTML',false,formattedNotes(data.body,true));
 }
 ensureBlocks();
 if(capture.wholeDocument)placeDocumentVisuals(artifact);
 captureDocument();
 hydrateInline();
 renderOutline();
 artifact.status='accepted';
 save();
 editor.focus();
 return true;
}
function textInsertion(a,replace){
 const data=a.versions[a.versions.length-1].data;state.current=a.docId;showDocument(a.sourceBlock);
 if(replace){
  if(!applyCleanup(a))notify('Select the current passage to apply a new edit.');

 }else{
  const block=[...$('editor').children].find(e=>e.dataset.block===a.sourceBlock);let after=block;while(after?.nextElementSibling&&!/^H[123]$/.test(after.nextElementSibling.tagName))after=after.nextElementSibling;
  lastEdit=0;for(const line of data.body.split('\n')){const p=document.createElement('p');p.dataset.block=uid();p.textContent=line;if(!line)p.append(document.createElement('br'));if(after){after.after(p);after=p;}else{$('editor').append(p);after=p;}}
  captureDocument();a.status='accepted';save();notify('Inserted below your notes. Cmd/Ctrl+Z undoes it.');
 }
}

function referencesSheet(){returnFocus=document.activeElement;$('sheet').innerHTML=`<div class="sheet-head"><h2 id="sheetTitle">Context</h2><button class="icon" id="closeSheet" aria-label="Close">${icon('close')}</button></div><p>Add screenshots and notes to guide AI edits and prototypes.</p><div class="references-grid" id="referencesGrid"></div><button class="upload-box" id="uploadReferences">${icon('plus',18)}Add screenshots<span style="font-size:10px;color:#a99c89">PNG, JPG, or WebP</span></button><div class="reference-notes"><label for="referenceNotes">Notes</label><textarea id="referenceNotes" placeholder="What should the collaborator know about the current product?"></textarea><p class="example-notice">Images and notes save with this document on your Mac. Export a workspace copy whenever you need one.</p></div>`;openOverlay();$('closeSheet').onclick=closeOverlay;$('uploadReferences').onclick=()=>$('referenceInput').click();$('referenceNotes').value=doc().referenceNotes||'';$('referenceNotes').oninput=()=>{doc().referenceNotes=$('referenceNotes').value;save();};renderReferences();}
function renderReferences(){const grid=$('referencesGrid');if(!grid)return;grid.replaceChildren();(doc().references||[]).forEach(ref=>{const b=document.createElement('button');b.className='reference-tile';b.innerHTML='<img src="'+esc(ref.data)+'" alt="'+esc(ref.name)+'"><span class="ref-caption">'+esc(ref.name)+'</span>';b.onclick=()=>{const image=document.createElement('img');image.src=ref.data;image.alt=ref.name;image.style.cssText='max-width:100%;border:1px solid var(--line);border-radius:8px';$('sheet').replaceChildren();const head=document.createElement('div');head.className='sheet-head';head.innerHTML='<h2 id="sheetTitle">'+esc(ref.name)+'</h2>';const back=document.createElement('button');back.className='icon';back.innerHTML=icon('close');back.onclick=referencesSheet;head.append(back);$('sheet').append(head,image);};grid.append(b);});}
async function connectionSheet(){
 returnFocus=document.activeElement;
 try{if(SERVER)connection=await api('/api/connection');}catch(e){notify(e.message);}
 $('sheet').innerHTML=`<div class="sheet-head"><h2 id="sheetTitle">Bring your own AI</h2><button class="icon" id="closeSheet" aria-label="Close">${icon('close')}</button></div><h3 style="font-size:22px;font-weight:550;letter-spacing:-.6px;margin:0 0 12px">Your tools. Your thinking.</h3><p>AI runs only when you ask. Each request includes your selected passage, its document, and attached context.</p><label for="provider">Connection</label><select id="provider"><option value="codex">ChatGPT through local Codex</option><option value="gemini">Gemini API</option></select><div id="codexConnection"><div class="source-quote">${connection.codexSignedIn?'Signed in with ChatGPT. Uses your existing Codex plan and limits.':SERVER?'Sign in with ChatGPT using codex login, then reopen this panel.':'Open the workspace through its launcher to enable AI.'}</div></div><div id="geminiConnection" class="hidden"><label for="geminiKey">Gemini API key</label><input id="geminiKey" type="password" autocomplete="off" placeholder="${connection.geminiConfigured?'Key connected for this server session':'Paste your API key'}" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:7px;margin-bottom:20px"><label for="geminiModel">Model</label><input id="geminiModel" value="${esc(connection.model||'gemini-3.8-flash')}" style="width:100%;padding:11px;border:1px solid var(--line);border-radius:7px"><p class="example-notice">API requests may incur usage charges on your Google API project. Your Gemini app subscription is separate. The key stays in this server’s memory and is not saved to documents, exports, or disk.</p></div><div class="sheet-bottom"><p class="example-notice" id="connectionStatus"></p><button class="primary" id="saveConnection">Use this connection</button></div>`;
 openOverlay();$('closeSheet').onclick=closeOverlay;$('provider').value=connection.provider||'codex';const change=()=>{$('geminiConnection').classList.toggle('hidden',$('provider').value!=='gemini');$('codexConnection').classList.toggle('hidden',$('provider').value!=='codex');};$('provider').onchange=change;change();
 $('saveConnection').onclick=async()=>{if(!SERVER){notify('Start the local workspace with the launcher first.');return;}try{await api('/api/connection',{provider:$('provider').value,key:$('geminiKey').value,model:$('geminiModel').value});connection=await api('/api/connection');closeOverlay();notify('AI connection updated.');}catch(e){$('connectionStatus').textContent=e.message;}};
}

function helpSheet(){returnFocus=document.activeElement;$('sheet').innerHTML=`<div class="sheet-head"><h2 id="sheetTitle">A little guidance</h2><button class="icon" id="closeSheet" aria-label="Close">${icon('close')}</button></div><p>A quiet place to think, with a little help when you ask.</p><div class="help-list"><div><strong>Write naturally</strong><p>Type /h1, /h2, or /h3 to make a heading. Select text for formatting or type /emoji to insert an emoji.</p></div><div><strong>Work with a passage</strong><p>Select your notes, then choose an action from the floating bar. Right-click for diagrams, metrics, wireframes, summaries, and cleanup.</p></div><div><strong>Use a command</strong><p>Type /diagram, /metrics, /wireframe, /summary, or /clean at the end of a section, then press Enter.</p></div><div><strong>Follow the work</strong><p>Visuals, wireframes and summaries appear beside your notes. Use Create deliverable to save a finished copy of the whole document.</p></div><div><strong>Keep a copy</strong><p>Your writing, references, and deliverable versions save on this Mac. The top-right menu exports a portable workspace copy. Cmd/Ctrl+Z undoes writing and accepted edits during this session.</p></div></div><p class="example-notice" style="margin-top:20px">This is a local workspace with real AI generation. A second window cannot silently overwrite newer work.</p>`;openOverlay();$('closeSheet').onclick=closeOverlay;}
function download(content,type,name){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportWorkspace(){captureDocument();download(JSON.stringify(state,null,2),'application/json','product-workspace.json');notify('Workspace exported, including reference images.');}
function showMore(e){hideMenus();$('moreMenu').innerHTML='<div class="menu-caption">Workspace</div><button id="exportWorkspace">'+icon('export',14)+'Export workspace</button><button id="importWorkspace">'+icon('doc',14)+'Open workspace</button>';position($('moreMenu'),e.clientX-170,e.clientY+16);$('exportWorkspace').onclick=()=>{hideMenus();exportWorkspace();};$('importWorkspace').onclick=()=>{$('workspaceInput').click();hideMenus();};}
function addPinAction(menu,target){
 const editor=$('editor');
 if(target===editor){
  const selection=getSelection();
  const node=selection?.rangeCount&&!selection.isCollapsed?selection.getRangeAt(0).startContainer:selection?.anchorNode;
  target=node?.nodeType===Node.TEXT_NODE?node.parentElement:node||editor;
 }
 const pin=target.closest('[data-pin]');
 const item=target.closest('li');
 const list=item?.parentElement;
 const parent=list?.parentElement;
 const nested=isNoteList(list)&&parent?.tagName==='LI'&&editor.contains(parent)&&
  ![...item.children].some(child=>isNoteList(child)||child.hasAttribute('data-pin'))&&item.textContent.trim();
 const line=blockAt(target);
 const previous=line?.previousElementSibling;
 const plain=!item&&line?.matches('p,div:not(.pinned-anchor)')&&line.textContent.trim()&&
  previous?.matches('p,div:not([data-pin]),h1,h2,h3,ul,ol')&&previous.textContent.trim();
 if(!pin&&!nested&&!plain)return;
 const button=document.createElement('button');
 button.textContent=pin?'Unpin note':'Pin to parent';
 button.onmousedown=event=>event.preventDefault();
 button.onclick=()=>{
  lastEdit=0;
  if(pin){
   const owner=pin.parentElement;
   if(owner.tagName==='LI'){
    const tag=pin.classList.contains('pinned-ordered')?'OL':'UL';
    let childList=pin.nextElementSibling;
    if(childList?.tagName!==tag){
     childList=document.createElement(tag);
     pin.after(childList);
    }
    const child=document.createElement('li');
    child.append(...pin.childNodes);
    childList.prepend(child);
   }else{
    const paragraph=document.createElement('p');
    paragraph.append(...pin.childNodes);
    if(owner.classList.contains('pinned-anchor')){
     owner.after(paragraph);
     pin.remove();
     if(!owner.querySelector('[data-pin]')){
      const anchor=owner.firstElementChild;
      anchor.dataset.block=owner.dataset.block;
      owner.replaceWith(anchor);
     }
    }else pin.before(paragraph);
   }
   pin.remove();
  }else{
   const note=document.createElement('div');
   note.className='pinned-note'+(list?.tagName==='OL'?' pinned-ordered':'');
   note.dataset.pin=uid();
   if(nested){
    note.append(...item.childNodes);
    list.before(note);
    item.remove();
    if(!list.children.length)list.remove();
   }else{
    note.append(...line.childNodes);
    const first=note.firstChild;
    if(first?.nodeType===Node.TEXT_NODE)first.textContent=first.textContent.replace(/^\s*(?:↳|→|➜|->)\s*/,'');
    if(isNoteList(previous)){
     const owner=previous.lastElementChild;
     if(previous.tagName==='OL')note.classList.add('pinned-ordered');
     owner.append(note);
    }else if(previous.classList.contains('pinned-anchor'))previous.append(note);
    else{
     const wrapper=document.createElement('div');
     wrapper.className='pinned-anchor';
     wrapper.dataset.block=previous.dataset.block;
     previous.before(wrapper);
     wrapper.append(previous,note);
    }
    line.remove();
   }
  }
  hideMenus();
  ensureBlocks();
  captureDocument();
  editor.focus();
 };
 menu.append(button);
}
function addNoteAnnotationActions(menu){
 for(const [label,action] of [
  ['Highlight',()=>{
   if(!selectionRange||selectionRange.collapsed){notify('Select text to highlight.');return;}
   lastEdit=0;
   formatText('hiliteColor','rgb(250, 228, 150)');
  }],
  ['Mark as question',()=>{
   const source=[...$('editor').children].find(block=>block.dataset.block===selectionBlock);
   if(!source||!source.textContent.trim()||!['P','DIV'].includes(source.tagName)||source.hasAttribute('data-artifact')){
    notify('Choose a paragraph to mark as a question.');
    return;
   }
   lastEdit=0;
   const box=document.createElement('blockquote');
   box.className='question-callout';
   box.dataset.block=source.dataset.block;
   const label=document.createElement('strong');
   label.textContent='Open question';
   const note=document.createElement('p');
   note.append(...source.childNodes);
   box.append(label,note);
   source.replaceWith(box);
   captureDocument();
   $('editor').focus();
  }]
 ]){
  const button=document.createElement('button');
  button.textContent=label;
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>{hideMenus();action();};
  menu.append(button);
 }
}
function showContextMenu(e){if(!$('editor').contains(e.target)||e.target.closest(inlineVisual))return;e.preventDefault();if(!captureSelection())sectionContext();hideMenus();$('contextMenu').innerHTML='<div class="menu-caption">Work with this thinking</div>';addPinAction($('contextMenu'),e.target);['diagram','metrics','wireframe','summary','clean'].forEach(t=>$('contextMenu').append(actionButton(t,true)));$('contextMenu').append(document.createElement('hr'));addNoteAnnotationActions($('contextMenu'));appendFormatting($('contextMenu'),selectionRange||(getSelection()?.rangeCount?getSelection().getRangeAt(0):null));position($('contextMenu'),e.clientX,e.clientY);}
const slashActions={h1:'Heading 1',h2:'Heading 2',h3:'Heading 3',...labels,prototype:'Wireframe',image:'Upload image','ai-image':'Create AI image',bold:'Bold',italic:'Italic',color:'Text color',font:'Font',emoji:'Emoji'};
function formatText(command,value=null,range=selectionRange){
 const editor=$('editor');
 editor.focus();
 if(range&&editor.contains(range.startContainer)){
  const selection=getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
 }
 document.execCommand('styleWithCSS',false,['foreColor','fontName','hiliteColor'].includes(command));
 document.execCommand(command,false,value);
 captureDocument();
}
function appendFormatting(menu,headingRange=selectionRange){
 const toolbar=menu.classList.contains('selection-formatting');
 const block=selectedHeadingBlock(headingRange);
 if(block){
  const button=document.createElement('button');
  button.textContent=(/^H[123]$/.test(block.tagName)?block.tagName:'Text')+' ▾';
  button.className='heading-picker';
  button.setAttribute('aria-label','Heading level');
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>{
   const rect=button.getBoundingClientRect();
   const range=headingRange.cloneRange();
   const start=range.startContainer,end=range.endContainer,startOffset=range.startOffset,endOffset=range.endOffset;
   hideMenus();
   writingMenu([0,1,2,3].map(level=>({label:level?'Heading '+level:'Body text',shortcut:level?'H'+level:'',run:()=>{
    if(!$('editor').contains(block))return;
    hideMenus();
    lastEdit=0;
    const heading=formatHeadingLine(block,level);
    range.setStart(start===block?heading:start,startOffset);
    range.setEnd(end===block?heading:end,endOffset);
    $('editor').focus();
    const selection=getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    captureDocument();
    renderOutline();
    if(toolbar)showSelectionBar();
   }})),rect);
  };
  menu.append(button);
 }
 const formats=[
  ['bold','Bold','B'], ['italic','Italic','I'],
  ...(toolbar?[['underline','Underline','U'],['strikeThrough','Strikethrough','S'],['highlight','Highlight','Highlight']]:[]),
  ['color','Text color','Color'], ['font','Font','Font'], ['emoji','Emoji','☺']
 ];
 for(const [command,label,short] of formats){
  const button=document.createElement('button');
  button.textContent=toolbar?short:label;
  button.classList.add('format-'+command);
  button.setAttribute('aria-label',label);
  button.title=label;
  const toggle=['bold','italic','underline','strikeThrough'].includes(command);
  if(toolbar&&toggle)button.setAttribute('aria-pressed',String(document.queryCommandState(command)));
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>{
   const rect=button.getBoundingClientRect();
   const range=selectionRange?.cloneRange();
   hideMenus();
   lastEdit=0;
   if(toggle||command==='highlight'){
    if(command==='highlight')formatText('hiliteColor','rgb(250, 228, 150)',range);
    else formatText(command,null,range);
    if(toolbar)showSelectionBar();
   }else showFormatPicker(command,range,rect);
  };
  menu.append(button);
 }

}
function showFormatPicker(command,range,rect){
 const options=command==='emoji'?emojis.map(([value,name])=>[value+' '+name,value]):
  command==='color'?inkColors.map((value,i)=>[['Default','Orange','Green','Blue'][i],value]):
  fontFamilies.map((value,i)=>[['Sans','Serif','Mono'][i],value]);
 const picker=$('slashMenu');
 picker.replaceChildren();
 for(const [label,value] of options){
  const button=document.createElement('button');
  button.textContent=label;
  button.onmousedown=event=>event.preventDefault();
  button.onclick=()=>{
   hideMenus();
   formatText({emoji:'insertText',color:'foreColor',font:'fontName'}[command],value,range);
  };
  picker.append(button);
 }
 position(picker,rect.left,rect.bottom+8);
}
function writingToken(block){
 const selection=getSelection();
 if(!block||!selection?.isCollapsed||!selection.rangeCount)return null;
 const caret=selection.getRangeAt(0);
 const prefix=document.createRange();
 prefix.selectNodeContents(block);
 prefix.setEnd(caret.endContainer,caret.endOffset);
 const text=prefix.toString();
 const match=text.match(/(?:^|\s)([/:])([a-z0-9_+-]*)$/i);
 if(!match)return null;
 let offset=text.length-match[1].length-match[2].length;
 const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
 const range=caret.cloneRange();
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(offset<=node.length){
   range.setStart(node,offset);
   return {prefix:match[1],term:match[2].toLowerCase(),range};
  }
  offset-=node.length;
 }
 return null;
}
function writingMenu(rows,rect){
 const menu=$('slashMenu');
 menu.replaceChildren();
 for(const {label,shortcut,run} of rows){
  const button=document.createElement('button');
  const title=document.createElement('span');
  title.className='command-label';
  title.textContent=label;
  button.append(title);
  if(shortcut){
   const key=document.createElement('kbd');
   key.className='command-shortcut';
   key.textContent=shortcut;
   button.append(key);
  }
  button.onmousedown=event=>event.preventDefault();
  button.onclick=run;
  menu.append(button);
 }
 if(!rows.length){menu.classList.add('hidden');return;}
 menu.firstElementChild.setAttribute('aria-current','true');
 position(menu,rect.left,rect.bottom+8);
}
function showSlash(block,term,token,anchor){
 const rect=anchor||token?.range.getBoundingClientRect()||block.getBoundingClientRect();
 const headings=isHeadingBlock(block);
 const rows=Object.entries(slashActions).filter(([command,label])=>
  (headings||!/^h[123]$/.test(command))&&(command.startsWith(term)||label.toLowerCase().startsWith(term)))
  .map(([command,label])=>({label,shortcut:'/'+command,run:()=>invokeSlash(command,block,token)}));
 writingMenu(rows,rect);
}
function showEmojiToken(token){
 const term=token.term.replace(/[_+-]/g,' ');
 const rows=emojis.filter(([,name])=>name.toLowerCase().includes(term))
  .map(([emoji,name])=>({label:emoji+'  '+name,run:()=>{
   hideMenus();
   formatText('insertText',emoji,token.range);
  }}));
 writingMenu(rows,token.range.getBoundingClientRect());
}
function useWritingMenu(event){
 const menu=$('slashMenu');
 if(menu.classList.contains('hidden')||!['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))return false;
 const choices=[...menu.querySelectorAll('button')];
 if(!choices.length)return false;
 event.preventDefault();
 event.stopPropagation();
 if(event.key==='Escape'){hideMenus();return true;}
 const current=choices.findIndex(button=>button.hasAttribute('aria-current'));
 if(event.key==='Enter'){(choices[current]||choices[0]).click();return true;}
 choices[current]?.removeAttribute('aria-current');
 const next=choices[(current+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length];
 next.setAttribute('aria-current','true');
 next.scrollIntoView({block:'nearest'});
 return true;
}
function invokeSlash(command,block,token=writingToken(block)){
 const selection=getSelection();
 const range=token?.range||selection.getRangeAt(0).cloneRange();
 if(token){range.deleteContents();range.collapse(true);}
 hideMenus();
 if(/^h[123]$/.test(command)){
  lastEdit=0;
  const heading=formatHeadingLine(block,Number(command[1]));
  range.selectNodeContents(heading);
  range.collapse(false);
 }
 selection.removeAllRanges();
 selection.addRange(range);
 captureDocument();
 renderOutline();
 if(command==='bold'||command==='italic'){formatText(command,null,range);return;}
 if(['color','font','emoji'].includes(command)){
  showFormatPicker(command,range.cloneRange(),block.getBoundingClientRect());
  return;
 }
 if(/^h[123]$/.test(command))return;
 if(command==='image'||command==='ai-image'){
  const sections=indexVoiceSections($('editor'));
  const section=sections.find(item=>item.heading===block||item.blocks.includes(block))||sections[0];
  const destination={docId:doc().id,key:section.key,title:section.title};
  if(command==='image')chooseInlineImage(destination);
  else openImageMaker(destination);
  return;
 }
 sectionContext();
 openMaker(command==='prototype'?'wireframe':command);
}
$('editor').addEventListener('mouseup',e=>{if(e.button===0)setTimeout(showSelectionBar,20);});
$('editor').addEventListener('keyup',event=>{
 if((event.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))||
  ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'))showSelectionBar();
});
$('editor').addEventListener('contextmenu',showContextMenu);$('editor').addEventListener('input',e=>{if(e.target.closest(inlineVisual))return;
 const anchor=getSelection()?.anchorNode;
 const element=anchor?.nodeType===Node.TEXT_NODE?anchor.parentElement:anchor;
 const spoken=element?.closest?.('[data-voice-section]');
 if(spoken){delete spoken.dataset.voiceSection;spoken.classList.remove('voice-note');}
 ensureBlocks();captureDocument();
 const block=headingLineAt(getSelection()?.anchorNode)||blockAt(getSelection()?.anchorNode);
 const token=e.isComposing?null:writingToken(block);
 if(token?.prefix==='/')showSlash(block,token.term,token);
 else if(token?.prefix===':')showEmojiToken(token);
 else $('slashMenu').classList.add('hidden');
 renderOutline();
});
function changeListDepth(event,selection){
 const editor=$('editor');
 const node=selection?.anchorNode;
 const element=node?.nodeType===Node.TEXT_NODE?node.parentElement:node;
 const item=element?.closest('li');
 const list=item?.parentElement;
 if(!item||!isNoteList(list)||!editor.contains(item)||!selection.isCollapsed)return;
 const previous=item.previousElementSibling;
 const parent=list.parentElement;
 if(event.shiftKey?parent.tagName!=='LI':!previous)return;
 event.preventDefault();
 const offset=selection.anchorOffset;
 lastEdit=0;
 if(event.shiftKey){
  if(item.nextElementSibling){
   const trailing=[...list.children].slice([...list.children].indexOf(item)+1);
   const nested=document.createElement(list.tagName);
   nested.append(...trailing);
   item.append(nested);
  }
  parent.after(item);
  if(!list.children.length)list.remove();
 }else{
  let nested=previous.lastElementChild;
  if(nested?.tagName!==list.tagName){
   nested=document.createElement(list.tagName);
   previous.append(nested);
  }
  nested.append(item);
 }
 if(item.contains(node))selection.collapse(node,offset);
 else selection.collapse(item,0);
 captureDocument();
}
function startNoteList(event,block,selection){
 if(event.key!==' '||!block||!['P','DIV'].includes(block.tagName)||!selection?.isCollapsed)return false;
 const marker=block.textContent;
 if(!/^(-|\*|1\.)$/.test(marker))return false;
 event.preventDefault();
 const list=document.createElement(marker==='1.'?'ol':'ul');
 list.dataset.block=block.dataset.block;
 const item=document.createElement('li');
 item.append(document.createElement('br'));
 list.append(item);
 block.replaceWith(list);
 selection.collapse(item,0);
 lastEdit=0;
 captureDocument();
 renderOutline();
 return true;
}
$('editor').addEventListener('keydown',e=>{if(e.target.closest(inlineVisual)||e.isComposing||useWritingMenu(e))return;const sel=window.getSelection(),block=headingLineAt(sel?.anchorNode)||blockAt(sel?.anchorNode);if(e.key==='Tab'){changeListDepth(e,sel);return;}if(startNoteList(e,block,sel))return;if(e.key===' '&&isHeadingBlock(block)&&/^#{1,3}$/.test(block.textContent)){e.preventDefault();const level=block.textContent.length;lastEdit=0;block.replaceChildren();const heading=formatHeadingLine(block,level);const caret=document.createRange();caret.selectNodeContents(heading);caret.collapse(true);$('editor').focus();sel.removeAllRanges();sel.addRange(caret);ensureBlocks();captureDocument();renderOutline();return;}const commandToken=writingToken(block);const command=commandToken?.prefix==='/'?commandToken.term:null;
 if((e.key==='Enter'||e.key===' '&&/^h[123]$/.test(command))&&command&&(!/^h[123]$/.test(command)||isHeadingBlock(block))&&Object.hasOwn(slashActions,command)){e.preventDefault();invokeSlash(command,block);return;}if(e.key==='Enter'&&block&&/^H[123]$/.test(block.tagName)&&sel?.isCollapsed){const before=sel.getRangeAt(0).cloneRange();before.selectNodeContents(block);before.setEnd(sel.anchorNode,sel.anchorOffset);if(before.toString().length===block.textContent.length){e.preventDefault();const p=document.createElement('p');p.dataset.block=uid();p.innerHTML='<br>';block.after(p);const caret=document.createRange();caret.selectNodeContents(p);caret.collapse(true);$('editor').focus();sel.removeAllRanges();sel.addRange(caret);captureDocument();return;}}if(e.key==='Escape')hideMenus();});
$('editor').addEventListener('paste',e=>{if(e.target.closest(inlineVisual))return;e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));ensureBlocks();captureDocument();});
$('docTitle').oninput=()=>{doc().title=$('docTitle').value||'Untitled';$('breadcrumbTitle').textContent=doc().title;renderSidebar();save();};$('documentsNav').onclick=()=>showDocument();$('deliverablesNav').onclick=showDeliverables;$('backToDeliverables').textContent='Back to notes';$('backToDeliverables').onclick=()=>showDocument(activeArtifact?.sourceBlock);$('createDeliverable').onclick=createDeliverable;$('cleanDocument').onclick=cleanWholeDocument;
$('newDocument').onclick=()=>{captureDocument();const id=uid();state.documents.push({id,title:'Untitled',framework:'',html:'<p data-block="'+uid()+'"><br></p>',references:[],referenceNotes:'',inlineResults:true});state.current=id;showDocument();save();$('docTitle').focus();$('docTitle').select();};
$('sideReference').onclick=referencesSheet;$('connectionButton').onclick=connectionSheet;$('helpButton').onclick=helpSheet;$('moreButton').onclick=showMore;$('mobileToggle').onclick=()=>$('sidebar').classList.toggle('mobile-open');
$('presentButton').onclick=()=>{const on=document.body.classList.toggle('present');$('presentButton').innerHTML=icon('present',15)+(on?'Exit presentation':'Present');};$('overlay').onclick=e=>{if(e.target===$('overlay'))closeOverlay();};
document.addEventListener('mousedown',e=>{if(!e.target.closest('.selection-bar,.menu,.editor'))hideMenus();});document.addEventListener('keydown',e=>{if(!e.target.closest(inlineVisual)&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&$('editor').contains(document.activeElement)&&$('overlay').classList.contains('hidden')){e.preventDefault();undoDocument(e.shiftKey);return;}if(e.key==='Escape'){if(!$('overlay').classList.contains('hidden'))closeOverlay();else{hideMenus();if(document.body.classList.contains('present'))$('presentButton').click();}}if(e.shiftKey&&e.key==='F10'&&$('editor').contains(document.activeElement)){e.preventDefault();captureSelection();const r=selectionRange?.getBoundingClientRect()||$('editor').getBoundingClientRect();showContextMenu({target:$('editor'),preventDefault(){},clientX:r.left,clientY:r.bottom});}if(e.key==='Tab'&&!$('overlay').classList.contains('hidden')){const elements=[...$('sheet').querySelectorAll('button,input,textarea,select,[tabindex]')].filter(x=>!x.disabled);if(elements.length){const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}});

$('insertArtifact').onclick=()=>{const a=activeArtifact;if(!a)return;if(a.task==='summary'||a.task==='clean')textInsertion(a,a.task==='clean');else{state.current=a.docId;showDocument(a.sourceBlock);lastEdit=0;insertIntoDocument(a);a.status='accepted';save();notify('Inserted in your source document.');}};
$('exportArtifact').onclick=()=>{if(!activeArtifact)return;const d=activeArtifact.versions[viewVersion].data,name=d.title.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(activeArtifact.task==='diagram'||activeArtifact.task==='metrics')download(diagramSVG(d),'image/svg+xml',name+'.svg');else if(activeArtifact.task==='wireframe'){
 const safeData=JSON.stringify(d).replace(/</g,'\\u003c');
 const runtime=exportWireframeRuntime.toString();
 download('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(d.title)+'</title><style>'+document.querySelector('style').textContent+'</style></head><body style="padding:30px;display:flex;justify-content:center"><main id="wireframeHost" style="max-width:100%"></main><script>const data='+safeData+';('+runtime+')(data);<\/script></body></html>','text/html',name+'.html');
 }else download(d.body,'text/plain',name+'.txt');notify('Deliverable exported.');};
function exportWireframeRuntime(data){
 const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let step=0;
 function draw(){const s=data.screens[step];if(!s){document.getElementById('wireframeHost').textContent='Flow complete. No data was submitted.';return;}
 const fields=s.fields.map(f=>'<div class="wf-field full"><label>'+e(f.label)+'</label>'+(f.type==='select'?'<select>'+f.options.map(x=>'<option>'+e(x)+'</option>').join('')+'</select>':f.type==='chips'?'<div class="wf-chips">'+f.options.map(x=>'<button type="button" class="wf-chip" data-chip>'+e(x)+'</button>').join('')+'</div>':f.type==='textarea'?'<textarea placeholder="'+e(f.placeholder)+'"></textarea>':'<input type="'+e(f.type)+'" placeholder="'+e(f.placeholder)+'" autocomplete="off">')+'</div>').join('');
 document.getElementById('wireframeHost').innerHTML='<div class="wireframe"><div class="wf-header">'+e(data.title)+'<span class="small muted">Wireframe</span></div><div class="wf-progress"><span style="width:'+((step+1)/data.screens.length*100)+'%"></span></div><div class="wf-body"><div class="wf-step">'+e(s.eyebrow)+'</div><h2>'+e(s.title)+'</h2><p>'+e(s.description)+'</p>'+(s.notice?'<div class="wf-note">'+e(s.notice)+'</div>':'')+'<div class="wf-fields">'+fields+'</div>'+s.actions.map((a,i)=>'<button type="button" data-action="'+i+'" class="'+(a.style==='primary'?'wf-main':'wf-social')+'">'+e(a.label)+'</button>').join('')+'<div class="wf-foot">'+e(s.footer)+'<br>Prototype only. No authentication, payments, or submission.</div></div></div>';
 document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>b.classList.toggle('selected'));
 document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=s.actions[Number(b.dataset.action)];if(a.target==='@social'){alert('Social sign-in is simulated.');return;}step=a.target==='@complete'?data.screens.length:data.screens.findIndex(x=>x.id===a.target);draw();});
 }draw();
}


async function imageData(file){
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12000000)throw Error('Choose PNG, JPG, or WebP images under 12 MB.');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 return canvas.toDataURL('image/jpeg',.86);
}
function findInlineImage(id){
 for(const document of state.documents){
  const image=document.inlineImages?.find(item=>item.id===id);
  if(image)return image;
 }
}
function hydrateImages(root,readOnly){
 for(const block of root.querySelectorAll('[data-image]')){
  const image=findInlineImage(block.dataset.image);
  if(!image)continue;
  block.className='document-image';
  block.contentEditable='false';
  const picture=document.createElement('img');
  picture.src=image.data;
  picture.alt=image.name;
  picture.loading='lazy';
  const caption=document.createElement('div');
  caption.className='image-caption';
  const text=document.createElement('span');
  text.textContent=image.name;
  caption.append(text);
  if(!readOnly){
   const remove=document.createElement('button');
   remove.className='quiet';
   remove.textContent='Remove';
   remove.setAttribute('aria-label','Remove '+image.name);
   remove.onclick=()=>{
    lastEdit=0;
    block.remove();
    captureDocument();
    renderOutline();
    notify('Image removed from the page. Press ⌘Z to undo.');
   };
   caption.append(remove);
  }
  block.replaceChildren(picture,caption);
 }
}
function placeInlineImage(root,section,block){
 const existing=new Set([section.heading,...section.blocks,...(section.assets||[])]);
 const ordered=[...root.querySelectorAll('*')].filter(node=>node!==block&&existing.has(node));
 // Keep the blank command line available for writing after an inserted image.
 while(ordered.at(-1)?.tagName==='P'&&!ordered.at(-1).textContent.trim())ordered.pop();
 const anchor=ordered.at(-1);
 if(anchor)anchor.after(block);
 else root.prepend(block);
}
function insertImage(destination,image){
 if(view!=='document'||doc().id!==destination.docId)throw Error('Return to the source document to insert this image.');
 const root=$('editor');
 const section=indexVoiceSections(root).find(item=>item.key===destination.key);
 if(!section)throw Error('The original section is missing. Reopen the image command in the right section.');
 const images=doc().inlineImages??=[];
 if(images.length>=8)throw Error('This document has reached its eight-image limit.');
 images.push(image);
 const block=document.createElement('section');
 block.dataset.image=image.id;
 block.dataset.block=uid();
 lastEdit=0;
 placeInlineImage(root,section,block);
 hydrateImages(root,false);
 captureDocument();
 renderOutline();
 notify('Image added to your notes.');
}
function chooseInlineImage(destination){
 uploadDestination=destination;
 $('inlineImageInput').click();
}
$('inlineImageInput').onchange=async event=>{
 const destination=uploadDestination;
 const file=event.target.files[0];
 event.target.value='';
 if(!file||!destination)return;
 try{insertImage(destination,{id:uid(),name:file.name.slice(0,160),data:await imageData(file),origin:'upload'});}
 catch(error){notify(error.message);}
};
function openImageMaker(destination,brief=''){
 const section=indexVoiceSections($('editor')).find(item=>item.key===destination.key);
 if(!section)return;
 const context=section.blocks.map(noteBlockText).join(' ').slice(0,600);
 returnFocus=document.activeElement;
 $('overlay').classList.add('quick-modal');
 $('sheet').innerHTML='<div class="sheet-head"><h2 id="sheetTitle">Create AI image</h2><button id="closeImage" class="icon" aria-label="Close">'+icon('close',15)+'</button></div>'+
  '<form id="imageForm"><label for="imagePrompt">Image description</label><textarea id="imagePrompt" maxlength="3000" required placeholder="Describe one image"></textarea>'+
  '<div id="imagePreview" class="image-preview hidden"></div><div id="imageStatus" class="small muted" role="status"></div>'+
  '<div class="sheet-bottom"><button class="primary" id="generateImage">Generate preview</button><button type="button" class="primary hidden" id="acceptImage">Insert image</button></div></form>';
 const form=$('imageForm'),prompt=$('imagePrompt'),status=$('imageStatus'),generate=$('generateImage'),accept=$('acceptImage'),preview=$('imagePreview');
 prompt.value=brief.slice(0,3000);
 $('closeImage').onclick=closeOverlay;
 openOverlay();
 prompt.focus();
 let result;
 prompt.oninput=()=>{
  result=null;
  preview.classList.add('hidden');
  accept.classList.add('hidden');
  status.textContent='';
 };
 form.onsubmit=async event=>{
  event.preventDefault();
  if(imageJobRunning||!prompt.value.trim())return;
  const description=prompt.value.trim();
  status.textContent='Creating one preview…';
  preview.classList.add('hidden');
  accept.classList.add('hidden');
  generate.disabled=true;
  prompt.readOnly=true;
  imageJobRunning=true;
  try{
   const instruction=[description,context?'Notes for context: '+context:''].filter(Boolean).join('\n\n');
   const started=await api('/api/generate',{task:'image',prompt:instruction});
   const job=await waitForJob(started.job);
   const [header,encoded]=job.data.image.split(',');
   const blob=new Blob([Uint8Array.from(atob(encoded),character=>character.charCodeAt(0))],
    {type:header.slice(5,-7)});
   result={id:uid(),name:description.slice(0,160),data:await imageData(blob),origin:'generated'};
   const picture=document.createElement('img');
   picture.src=result.data;
   picture.alt=result.name;
   preview.replaceChildren(picture);
   preview.classList.remove('hidden');
   accept.classList.remove('hidden');
   status.textContent='Ready to insert in '+destination.title+'.';
  }catch(error){status.textContent=error.message;}
  finally{imageJobRunning=false;generate.disabled=false;prompt.readOnly=false;}
 };
 accept.onclick=()=>{
  if(!result)return;
  try{insertImage(destination,result);closeOverlay();}
  catch(error){status.textContent=error.message;}
 };
}
$('referenceInput').onchange=async e=>{try{const files=[...e.target.files];if((doc().references?.length||0)+files.length>8)throw Error('Keep up to eight references per document.');const uploads=[];for(const file of files)uploads.push({id:uid(),name:file.name,data:await imageData(file)});const next=[...(doc().references||[]),...uploads];if(next.reduce((n,r)=>n+r.data.length*.75,0)>12000000)throw Error('These references exceed 12 MB. Use fewer or smaller images.');doc().references=next;renderReferences();renderSidebar();save();}catch(err){notify(err.message);}finally{e.target.value='';}};


$('workspaceInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(currentJob){notify('Wait for the current request before replacing the workspace.');e.target.value='';return;}try{if(file.size>24000000)throw Error('Choose a workspace smaller than 24 MB.');const parsed=JSON.parse(await file.text());if(!SERVER)throw Error('Open the local workspace with the launcher to import a workspace.');await api('/api/validate',{state:parsed});if(!confirm('Replace this workspace with the file? Export your current work first if needed.'))return;state=parsed;state.current=state.documents.some(d=>d.id===state.current)?state.current:state.documents[0].id;showDocument();save();notify('Workspace opened.');}catch(err){notify('Could not open workspace: '+err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(saveDirty||saveBusy||saveBlocked){e.preventDefault();e.returnValue='';}});
async function init(){
 $('editor').contentEditable='false';
 if(SERVER){try{const result=await api('/api/state');serverRevision=result.revision;if(result.state)state=result.state;const needsMigration=state.documents.some(d=>!d.inlineResults);restoreEarlierResults();connection=await api('/api/connection');ready=true;showDocument();$('saved').textContent='Saved on this Mac';if(!result.state||needsMigration)save();recoverRequests();}catch(e){saveBlocked=true;ready=true;showDocument();$('saved').textContent='Not connected · export your copy';notify(e.message);}}
 else{ready=true;showDocument();$('saved').textContent='Offline copy · use launcher for AI';}
 $('editor').contentEditable='true';
 const status=document.querySelector('.preview-label');if(status){status.textContent=SERVER?'Local workspace':'Offline copy';status.title='AI is used only when you ask.';}
}

setupChrome();init();
})();
