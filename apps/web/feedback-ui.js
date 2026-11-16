/*
 * The contents of this file are subject to the Common Public Attribution License Version 1.0
 * (CPAL-1.0); you may not use this file except in compliance with the License.
 * Obtain the License at https://opensource.org/license/CPAL-1.0 or see LICENSE.
 * The License is based on MPL 1.1; CPAL Sections 14 and 15 address attribution and network use.
 * Software distributed under the License is supplied AS IS, WITHOUT WARRANTY OF ANY KIND.
 * Original Code: Musixene Artist Platform.
 * Original and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC).
 * Portions written by Musixene: Copyright (c) 2026 Musixene. All Rights Reserved.
 */
// Private feedback is rendered only as text; no note HTML or drafts are persisted in the browser.
const element = (tag, text) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; return node; };
function button(label, action) {
  const node=element('button',label); node.type='button';
  node.addEventListener('click',async()=>{node.disabled=true;try{await action();}finally{node.disabled=false;}});
  return node;
}
function status() { const node=element('p');node.setAttribute('role','status');return node; }
function download(data,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=element('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function trackFeedback(track, {api, liked, onLike}) {
  const root=element('div');root.className='track-feedback';
  const message=status();
  const like=button('Like',async()=>{
    try { const result=await api(`/api/feedback/tracks/${track.id}/like`,{method:'POST',body:JSON.stringify({liked:!liked})});liked=result.liked;onLike(liked);paint();message.textContent=liked?'Liked.':'Like removed.'; }
    catch(error){message.textContent=error.message;}
  });
  like.setAttribute('aria-label',`Like ${track.title}`);
  function paint(){like.setAttribute('aria-pressed',String(liked));like.textContent=liked?'Liked ♥':'Like ♡';}paint();
  const details=element('details'),summary=element('summary','Note to Artist');details.append(summary);
  details.append(element('p','Private: visible to you and this artist’s administrators. A reply is not promised. Maximum 2,000 characters.'));
  const form=element('form'),label=element('label','Your note'),input=element('textarea');input.required=true;input.maxLength=4000;input.rows=3;label.append(input);form.append(label);
  const submit=element('button','Send note');submit.type='submit';form.append(submit);details.append(form);
  const list=element('ul'),more=button('More notes',()=>load(nextPage,true));more.hidden=true;details.append(list,more);
  let nextPage=null, requestId=crypto.randomUUID(), lastBody='';
  async function load(page=0,append=false){
    try {
      const result=await api(`/api/feedback/tracks/${track.id}?page=${page}`);
      if(!append)list.replaceChildren();
      for(const note of result.notes){const row=element('li');row.append(element('p',note.body),element('small',new Date(note.created_at).toLocaleString()));row.append(button('Delete note',async()=>{try{await api(`/api/feedback/notes/${note.id}/delete`,{method:'POST',body:'{}'});await load();message.textContent='Note deleted.';}catch(error){message.textContent=error.message;}}));list.append(row);}
      nextPage=result.nextPage;more.hidden=nextPage===null;
    }catch(error){message.textContent=error.message;}
  }
  details.addEventListener('toggle',()=>{if(details.open)load();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;
    try {
      if([...input.value].length>2000)throw new Error('Use at most 2,000 characters.');
      if(input.value!==lastBody){requestId=crypto.randomUUID();lastBody=input.value;}
      await api(`/api/feedback/tracks/${track.id}/notes`,{method:'POST',body:JSON.stringify({body:input.value,requestId})});
      input.value='';lastBody='';requestId=crypto.randomUUID();await load();message.textContent='Note sent privately to the artist.';
    }catch(error){message.textContent=error.message;}finally{submit.disabled=false;}
  });
  root.addEventListener('feedback-cleared',()=>{liked=false;paint();list.replaceChildren();nextPage=null;more.hidden=true;message.textContent='Your feedback was cleared.';});
  root.append(like,details,message);return root;
}
export function mountFeedbackData(parent,api,onDelete=()=>{}){
  parent.replaceChildren();const details=element('details');details.append(element('summary','My private feedback'));
  details.append(element('p','Likes and notes are private to you and this artist’s administrators. Notes remain until deleted. Disabling an account retains them. You can read/export your feedback, including for unpublished tracks, or delete it. Backups may retain deleted data until the operator’s backup expiry. Export files contain private information.'));
  const message=status(),list=element('div');let page=0,next=null;
  async function load(){
    try{const data=await api(`/api/feedback/history?page=${page}`);next=data.nextPage;list.replaceChildren(element('p',`${data.likeCount} likes · ${data.noteCount} notes · page ${page+1}`));
      for(const note of data.notes){const row=element('div');row.append(element('strong',note.track_title),element('p',note.body),button('Delete note',async()=>{try{await api(`/api/feedback/notes/${note.id}/delete`,{method:'POST',body:'{}'});await load();}catch(error){message.textContent=error.message;}}));list.append(row);}
      for(const like of data.likes)list.append(element('p',`Liked: ${like.track_title}`));
      previous.disabled=page===0;more.disabled=next===null;
    }catch(error){message.textContent=error.message;}
  }
  const previous=button('Previous feedback page',async()=>{if(page>0)page--;await load();}),more=button('Next feedback page',async()=>{if(next!==null)page=next;await load();});
  const exportPage=button('Export this feedback page',async()=>{try{download(await api(`/api/feedback/export?page=${page}`),`my-feedback-${page+1}.json`);message.textContent='Feedback page exported.';}catch(error){message.textContent=error.message;}});
  const confirm=element('input');confirm.type='checkbox';const label=element('label','I want to permanently delete all my likes and notes');label.append(confirm);
  const remove=button('Delete all my feedback',async()=>{if(!confirm.checked){message.textContent='Check the deletion confirmation first.';return;}try{await api('/api/feedback/delete',{method:'POST',body:'{}'});onDelete();page=0;confirm.checked=false;await load();message.textContent='All your feedback was deleted from this installation.';}catch(error){message.textContent=error.message;}});
  details.addEventListener('toggle',()=>{if(details.open)load();});details.append(list,previous,more,exportPage,label,remove,message);parent.append(details);
}
export function mountFeedbackAdmin(parent,api,state){
  parent.replaceChildren();parent.append(element('h2','Private feedback'),element('p','Visible only to administrators. Likes show current status, not listening evidence. Exports contain private listener information. Export and removal actions are recorded without note text in a 90-day audit log.'));
  function filter(label,values){const wrapper=element('label',label),select=element('select');select.setAttribute('aria-label',label);const all=element('option','All');all.value='';select.append(all);for(const item of values){const option=element('option',item.label);option.value=item.id;select.append(option);}wrapper.append(select);parent.append(wrapper);return select;}
  const tracks=filter('Feedback track',state.tracks.map(t=>({id:t.id,label:t.title}))),users=filter('Feedback listener',state.users.map(u=>({id:u.id,label:u.username})));
  let page=0,next=null;const content=element('div'),message=status();
  const query=()=>new URLSearchParams({page,track:tracks.value,listener:users.value});
  async function load(){try{const data=await api(`/api/admin/feedback?${query()}`);next=data.nextPage;content.replaceChildren(element('p',`${data.likeCount} likes · ${data.noteCount} notes · page ${page+1}`));
    for(const note of data.notes){const row=element('article');row.append(element('h3',`${note.track_title} · ${note.username}`),element('small',new Date(note.created_at).toLocaleString()),element('p',note.body),button('Remove note',async()=>{try{await api(`/api/admin/feedback/notes/${note.id}/delete`,{method:'POST',body:'{}'});await load();message.textContent='Note removed.';}catch(error){message.textContent=error.message;}}));content.append(row);}
    for(const like of data.likes)content.append(element('p',`${like.username} likes ${like.track_title}`));previous.disabled=page===0;more.disabled=next===null;
  }catch(error){message.textContent=error.message;}}
  const previous=button('Previous feedback page',async()=>{if(page>0)page--;await load();}),more=button('Next feedback page',async()=>{if(next!==null)page=next;await load();});
  parent.append(button('Load feedback',async()=>{page=0;await load();}),content,previous,more,button('Export feedback page',async()=>{try{download(await api(`/api/admin/feedback/export?${query()}`),`artist-feedback-${page+1}.json`);message.textContent='Private feedback page exported.';}catch(error){message.textContent=error.message;}}),message);
}
