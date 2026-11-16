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
const $ = id => document.getElementById(id);
let csrf = '', state;
function el(tag, text) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; return node; }
function status(text) { $('admin-status').textContent=text; }
async function api(path, data, file) {
  const response=await fetch(path,{credentials:'same-origin',method:data===undefined && !file?'GET':'POST',headers:{...(csrf?{'X-CSRF-Token':csrf}:{}),...(file?{'Content-Type':file.type || 'application/octet-stream'}:data!==undefined?{'Content-Type':'application/json'}:{})},body:file || (data===undefined?undefined:JSON.stringify(data))});
  const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Request failed'); return result;
}
function field(form,label,value='',type='text') {
  const wrapper=el('label',label), input=el('input'); input.type=type;
  if(type==='checkbox') input.checked=Boolean(value); else input.value=value;
  if(type==='number') { input.min=0; input.max=1000000; input.step=1; }
  wrapper.append(input); form.append(wrapper); return input;
}
function button(parent,label,action) { const b=el('button',label); b.type='button'; b.addEventListener('click',()=>run(action,b)); parent.append(b); return b; }
async function run(action,b) { if(b)b.disabled=true; try { await action(); status('Saved.'); } catch(error){status(error.message);} finally {if(b)b.disabled=false;} }
function form(parent,save,label='Save') { const f=el('form'); const submit=el('button',label); submit.type='submit'; f.addEventListener('submit',event=>{event.preventDefault(); run(()=>save(),submit);}); parent.append(f); return { f, finish(){ f.append(submit); } }; }
async function refresh() { state=await api('/api/admin/state'); render(); }
function render() {
  for(const id of ['settings-form','invite-form','invite-list','listener-list','track-form','track-list','collection-new','collection-list']) $(id).replaceChildren();
  const settings=form($('settings-form'),async()=>{await api('/api/admin/settings',{name:name.value,tagline:tagline.value,accent:accent.value,registration:registration.checked});await refresh();});
  const name=field(settings.f,'Artist name',state.settings.name), tagline=field(settings.f,'Tagline',state.settings.tagline), accent=field(settings.f,'Accent color',state.settings.accent,'color'), registration=field(settings.f,'Allow public signup (unchecked means invite-only)',state.settings.registration,'checkbox');
  name.maxLength=100; tagline.maxLength=200; name.required=tagline.required=true; settings.finish();
  const invite=form($('invite-form'),async()=>{const result=await api('/api/admin/invitations',{username:bound.value,hours:Number(hours.value)});$('invite-token').textContent=`Invitation token (copy now): ${result.token} — expires ${new Date(result.expiresAt).toLocaleString()}`;await refresh();},'Create invitation');
  const bound=field(invite.f,'Restrict to username (optional)'), hours=field(invite.f,'Expires in hours (1–720)',72,'number'); hours.min=1;hours.max=720;invite.finish();
  for(const invitation of state.invitations) {
    const row=el('p',`${invitation.username || 'Any new username'} · ${invitation.used_at?'Used':invitation.expires_at<=Date.now()?'Expired / revoked':`Expires ${new Date(invitation.expires_at).toLocaleString()}`}`);
    if(!invitation.used_at && invitation.expires_at>Date.now()) button(row,'Revoke',async()=>{await api(`/api/admin/invitations/${invitation.id}/revoke`,{});await refresh();});
    $('invite-list').append(row);
  }
  for(const user of state.users) {
    const card=el('details'), title=el('summary',`${user.username} · ${user.role}${user.disabled?' · disabled':''}`);card.append(title);$('listener-list').append(card);
    const edit=form(card,async()=>{await api(`/api/admin/users/${user.id}`,{role:role.value,disabled:disabled.checked,...(password.value?{password:password.value}:{})});password.value='';await refresh();});
    const role=el('select'); role.setAttribute('aria-label','Role'); for(const value of ['listener','administrator']){const option=el('option',value);option.value=value;role.append(option);} role.value=user.role;const roleLabel=el('label','Role');roleLabel.append(role);edit.f.append(roleLabel);
    const disabled=field(edit.f,'Disable account',user.disabled,'checkbox'), password=field(edit.f,'New password (leave empty to keep current)','','password');password.autocomplete='new-password';password.minLength=12;password.maxLength=128;edit.finish();
  }
  const create=form($('track-form'),async()=>{await api('/api/admin/tracks',{title:title.value,artist:artist.value});await refresh();},'Create draft');
  const title=field(create.f,'Track title'),artist=field(create.f,'Artist',state.settings.name);title.required=artist.required=true;title.maxLength=200;artist.maxLength=100;create.finish();
  for(const track of state.tracks) {
    const card=el('details'); card.append(el('summary',`${track.position}. ${track.title} · ${track.visible?'Published':'Draft'}`));$('track-list').append(card);
    if(track.artwork){const image=el('img');image.src=`/api/tracks/${track.id}/artwork`;image.alt=`Artwork for ${track.title}`;image.width=120;card.append(image);}
    const edit=form(card,async()=>{await api(`/api/admin/tracks/${track.id}`,{title:title.value,artist:artist.value,visible:visible.checked,position:Number(order.value),removeArtwork:remove.checked});await refresh();});
    const title=field(edit.f,'Title',track.title),artist=field(edit.f,'Artist',track.artist),visible=field(edit.f,'Published',track.visible,'checkbox'),order=field(edit.f,'Position',track.position,'number'),remove=field(edit.f,'Remove artwork',false,'checkbox');title.required=artist.required=true;title.maxLength=200;artist.maxLength=100;edit.finish();
    for(const kind of ['audio','artwork']) {
      const uploadForm=form(card,async()=>{if(!file.files[0])throw new Error('Choose a file');await api(`/api/admin/tracks/${track.id}/${kind}`,undefined,file.files[0]);await refresh();},`Upload ${kind}`);
      const file=field(uploadForm.f,`Choose ${kind}`,'','file');file.required=true;file.accept=kind==='audio'?'.wav,.mp3,.m4a,.ogg':'.png,.jpg,.jpeg';uploadForm.finish();
    }
  }
  collectionForm($('collection-new'));
  for(const collection of state.collections) {const card=el('details');card.append(el('summary',collection.title));$('collection-list').append(card);collectionForm(card,collection);}
}
function collectionForm(parent,collection={title:'',visible:0,position:0,trackIds:[]}) {
  let trackIds=[...collection.trackIds];
  const edit=form(parent,async()=>{await api('/api/admin/collections',{id:collection.id,title:title.value,visible:visible.checked,position:Number(order.value),trackIds});await refresh();},collection.id?'Save collection':'Create collection');
  const title=field(edit.f,'Collection title',collection.title),visible=field(edit.f,'Published',collection.visible,'checkbox'),order=field(edit.f,'Position',collection.position,'number');title.required=true;title.maxLength=200;
  const selection=el('select'); selection.setAttribute('aria-label','Add track'); const label=el('label','Add track'); for(const track of state.tracks){const option=el('option',track.title);option.value=track.id;selection.append(option);} label.append(selection);edit.f.append(label);
  const list=el('ol');
  function draw(){list.replaceChildren();trackIds.forEach((id,i)=>{const row=el('li',state.tracks.find(t=>t.id===id)?.title || id);button(row,'Move up',()=>{if(i>0)[trackIds[i-1],trackIds[i]]=[trackIds[i],trackIds[i-1]];draw();});button(row,'Move down',()=>{if(i<trackIds.length-1)[trackIds[i+1],trackIds[i]]=[trackIds[i],trackIds[i+1]];draw();});button(row,'Remove',()=>{trackIds.splice(i,1);draw();});list.append(row);});}
  button(edit.f,'Add track',()=>{if(selection.value && !trackIds.includes(selection.value))trackIds.push(selection.value);draw();});edit.f.append(list);draw();edit.finish();
  if(collection.id)button(parent,'Delete collection',async()=>{await api(`/api/admin/collections/${collection.id}/delete`,{});await refresh();});
}
try { const me=await api('/api/me');csrf=me.csrf;if(me.user.role!=='administrator')throw new Error('Administrator access required. Sign in with an administrator account in the listening room.');await refresh();$('administration').hidden=false;status('Ready.'); }
catch(error){status(error.message);}
