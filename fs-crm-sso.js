(function(){
'use strict';

const CRM_API='https://script.google.com/macros/s/AKfycbxjtJ0FcukKj2lnOxgHcbxLhGScAVKQn5CXZOzfRHqN-Pr9ZeNO-nQXx6jwSmm66Hu9/exec';
const CRM_MANAGE='https://fildosobral-sys.github.io/orcamentos-crm/orcamentos-gestao.html';
const SUPPORT_PHONE='5588988222564';
const VERIFY_TTL=12*60*60*1000;
const ATTEMPTS_KEY='fs_sso_login_attempts';

const digits=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
const upper=v=>String(v||'').trim().toUpperCase();
const branch=v=>upper(v).replace(/\s+/g,' ');
const role=v=>upper(v).replace(/\s+/g,'_');

function deviceId(){
  let id=localStorage.getItem('fs_device_id');
  if(!id){id=(crypto&&crypto.randomUUID)?crypto.randomUUID():'fs-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem('fs_device_id',id);}
  return id;
}
function creds(){return {token:String(localStorage.getItem('fs_access_token')||'').trim(),branch:branch(localStorage.getItem('fs_filial')||''),phone:digits(localStorage.getItem('fs_whatsapp')||'')};}
function validCreds(c){return !!(c&&c.token.length>=12&&c.branch&&/^\d{10,11}$/.test(c.phone));}
function fingerprint(actor,c){return [branch(actor?.branch||c.branch),upper(actor?.name||''),role(actor?.role||''),digits(c.phone)].join('|');}
function recent(){const t=Number(localStorage.getItem('fs_access_verified_at')||0);return t>0&&(Date.now()-t)>=0&&(Date.now()-t)<VERIFY_TTL;}
function clearSSO(){
  ['fs_access_token','fs_filial','fs_whatsapp','fs_nome','fs_cargo','fs_crm_role','fs_can_manage','fs_is_owner','fs_pode_compartilhar','fs_access_persisted','fs_access_verified_at','fs_access_verified_fingerprint','fsAuthGlobal','plataformaAutorizada','vendedorLogado','nomeVendedorLogado','fs_sso_source'].forEach(k=>localStorage.removeItem(k));
  sessionStorage.removeItem('fs_access_done');
}
function setStatus(msg,type){
  const el=document.getElementById('fsAccessStatus'); if(!el)return;
  if(!msg){el.style.display='none';el.textContent='';return;}
  el.style.display='block';el.textContent=msg;
  if(type==='ok'){el.style.background='#ecfdf5';el.style.borderColor='#a7f3d0';el.style.color='#065f46';}
  else if(type==='info'){el.style.background='#eff6ff';el.style.borderColor='#bfdbfe';el.style.color='#1e40af';}
  else{el.style.background='#fff1f2';el.style.borderColor='#fecdd3';el.style.color='#9f1239';}
}
function lock(msg){document.documentElement.classList.add('fs-auth-lock');if(msg)setStatus(msg,'error');}
function unlock(){
  document.documentElement.classList.remove('fs-auth-lock');
  const m=document.getElementById('fsAccessModal'),b=document.getElementById('fsAccessBackdrop'),g=document.getElementById('fsAccessGate');
  if(m)m.classList.remove('open');if(b)b.classList.remove('open');if(g)g.style.display='none';setStatus('','ok');
}
async function sessionCRM(c){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),25000);
  try{
    const response=await fetch(CRM_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({version:2,action:'session',auth:{token:c.token,branch:c.branch,phone:c.phone,deviceId:deviceId()},data:{}}),redirect:'follow',cache:'no-store',signal:ctl.signal});
    if(!response.ok)throw Error('O banco central não respondeu.');
    const json=await response.json();
    if(!json.ok){const e=Error(json.message||'Acesso não autorizado.');e.code=json.code||'UNAUTHORIZED';throw e;}
    const actor=json.data&&json.data.actor;
    if(!actor||!actor.name)throw Error('O banco central não retornou a identificação do usuário.');
    return actor;
  }catch(e){if(e.name==='AbortError')throw Error('A validação demorou. Tente novamente.');throw e;}finally{clearTimeout(timer);}
}
function save(actor,c){
  localStorage.setItem('fs_access_token',c.token);
  localStorage.setItem('fs_filial',actor.branch||c.branch);
  localStorage.setItem('fs_whatsapp',c.phone);
  localStorage.setItem('fs_nome',actor.name);
  localStorage.setItem('fs_cargo',actor.role||'VENDEDOR');
  localStorage.setItem('fs_crm_role',actor.role||'VENDEDOR');
  localStorage.setItem('fs_can_manage',actor.canManage?'1':'0');
  localStorage.setItem('fs_is_owner',actor.isOwner?'1':'0');
  localStorage.setItem('fs_pode_compartilhar',actor.isOwner?'1':'0');
  localStorage.setItem('fs_access_persisted','1');
  localStorage.setItem('fs_access_verified_at',String(Date.now()));
  localStorage.setItem('fs_access_verified_fingerprint',fingerprint(actor,c));
  localStorage.setItem('fsAuthGlobal','ok-@fildO1060');
  localStorage.setItem('fs_sso_source','crm');
  localStorage.setItem('plataformaAutorizada','true');
  localStorage.setItem('vendedorLogado',actor.name);
  localStorage.setItem('nomeVendedorLogado',actor.name);
  sessionStorage.setItem('fs_access_done','1');
  applyIdentity(actor);
}
function applyIdentity(actor){
  const a=document.getElementById('menuUserName'),b=document.getElementById('menuRole');
  if(a)a.textContent=actor?.name||localStorage.getItem('fs_nome')||'Usuário';
  if(b)b.textContent=actor?.role||localStorage.getItem('fs_cargo')||'USUÁRIO';
  manageButtons(actor?.isOwner===true||localStorage.getItem('fs_is_owner')==='1');
}
function manageButtons(owner){
  ['btnSharePanel','btnSharePanelFooter','btnShareMenu'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.hidden=!owner;el.style.display=owner?'':'none';el.style.visibility=owner?'visible':'hidden';el.style.opacity=owner?'1':'0';if(owner){const s=el.querySelector('span:nth-child(2)');if(s&&/compartilhamento/i.test(s.textContent))s.textContent='Gerenciar acessos';}});
}
function attempts(add){let n=Number(sessionStorage.getItem(ATTEMPTS_KEY)||0)||0;if(add)n++;if(add)sessionStorage.setItem(ATTEMPTS_KEY,String(n));return n;}
function resetAttempts(){sessionStorage.removeItem(ATTEMPTS_KEY);}
function support(){const c=creds(),name=localStorage.getItem('fs_nome')||'';const text=['Olá, preciso de suporte para acessar a Central FS.','Usuário: '+(name||'não identificado'),'Filial: '+(c.branch||'não informada'),'WhatsApp: '+(c.phone||'não informado')].join('\n');window.open('https://wa.me/'+SUPPORT_PHONE+'?text='+encodeURIComponent(text),'_blank','noopener');}

function prepareModal(){
  const modal=document.getElementById('fsAccessModal');if(!modal)return null;
  const title=document.getElementById('fsAccessTitle');if(title)title.textContent='🔐 Acesso à Central FS';
  const p=title&&title.nextElementSibling;if(p&&p.tagName==='P')p.textContent='Use a mesma credencial do Orçamentos CRM. Você entra uma vez e navega por todos os módulos.';
  ['fsAccessNome','fsAccessCargo','fsAccessGenero'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const label=modal.querySelector('label[for="'+id+'"]');if(label)label.style.display='none';el.style.display='none';});
  const filial=document.getElementById('fsAccessFilial'),whats=document.getElementById('fsAccessWhats');
  if(filial){filial.placeholder='EX.: IGUATU III';const l=modal.querySelector('label[for="fsAccessFilial"]');if(l)l.textContent='Filial';}
  if(whats){const l=modal.querySelector('label[for="fsAccessWhats"]');if(l)l.textContent='WhatsApp com DDD';}
  let token=document.getElementById('fsAccessTokenCRM');
  if(!token){
    const label=document.createElement('label');label.htmlFor='fsAccessTokenCRM';label.textContent='Credencial individual';
    const wrap=document.createElement('div');wrap.style.cssText='position:relative;display:flex;align-items:center;margin-bottom:0';
    token=document.createElement('input');token.id='fsAccessTokenCRM';token.type='password';token.autocomplete='current-password';token.placeholder='DIGITE SUA CREDENCIAL';token.style.paddingRight='48px';
    const eye=document.createElement('button');eye.type='button';eye.textContent='👁️';eye.setAttribute('aria-label','Mostrar credencial');eye.style.cssText='position:absolute;right:8px;border:0;background:transparent;font-size:19px;cursor:pointer;padding:8px';
    eye.onclick=function(){const show=token.type==='password';token.type=show?'text':'password';eye.textContent=show?'🙈':'👁️';};
    wrap.append(token,eye);
    const first=modal.querySelector('label[for="fsAccessFilial"]');modal.insertBefore(label,first);modal.insertBefore(wrap,first);
  }
  let supportBtn=document.getElementById('fsAccessSupportCRM');
  if(!supportBtn){supportBtn=document.createElement('button');supportBtn.type='button';supportBtn.id='fsAccessSupportCRM';supportBtn.textContent='📱 Solicitar suporte';supportBtn.style.cssText='display:none;width:100%;margin-top:10px;min-height:46px;border-radius:14px;border:1px solid #b7e0ca;background:#effcf5;color:#17663f;font-weight:800;cursor:pointer';supportBtn.onclick=support;modal.querySelector('.fs-access-actions')?.after(supportBtn);}
  return {modal,token,filial,whats,ok:document.getElementById('fsAccessOk'),clear:document.getElementById('fsAccessCancel'),backdrop:document.getElementById('fsAccessBackdrop'),supportBtn};
}
function showModal(message){
  return new Promise(resolve=>{
    const x=prepareModal();if(!x){resolve(null);return;}
    lock(message||'');
    const c=creds();x.token.value=c.token||'';x.filial.value=c.branch||'';x.whats.value=c.phone||'';
    x.ok.disabled=false;x.ok.textContent='Entrar';
    x.ok.onclick=function(){
      const data={token:String(x.token.value||'').trim(),branch:branch(x.filial.value),phone:digits(x.whats.value)};
      if(data.token.length<12){setStatus('Informe sua credencial individual.','error');x.token.focus();return;}
      if(!data.branch){setStatus('Informe sua filial. Ex.: IGUATU III.','error');x.filial.focus();return;}
      if(!/^\d{10,11}$/.test(data.phone)){setStatus('Informe um WhatsApp válido com DDD.','error');x.whats.focus();return;}
      x.ok.disabled=true;x.ok.textContent='Validando…';x.modal.classList.remove('open');x.backdrop?.classList.remove('open');resolve(data);
    };
    x.clear.onclick=function(){x.token.value='';x.filial.value='';x.whats.value='';setStatus('Dados limpos.','info');x.token.focus();};
    x.backdrop?.classList.add('open');x.modal.classList.add('open');
    setTimeout(()=>x.token.focus(),60);
  });
}
async function confirmAccess(force){
  let c=creds();
  if(!force&&validCreds(c)&&recent()&&localStorage.getItem('fs_sso_source')==='crm'){
    unlock();applyIdentity({name:localStorage.getItem('fs_nome'),role:localStorage.getItem('fs_cargo'),isOwner:localStorage.getItem('fs_is_owner')==='1'});
    sessionCRM(c).then(actor=>save(actor,c)).catch(err=>{if(/credencial|revogad|identidade|autorizad/i.test(String(err.message||''))){clearSSO();lock('Sua sessão não é mais válida. Entre novamente.');confirmAccess(true);}});
    return true;
  }
  while(true){
    if(!force&&validCreds(c)){
      try{const actor=await sessionCRM(c);save(actor,c);resetAttempts();unlock();return true;}catch(err){if(!/credencial|revogad|identidade|autorizad/i.test(String(err.message||''))&&recent()){unlock();return true;}clearSSO();setStatus(err.message||'Não foi possível validar seu acesso.','error');}
    }
    const data=await showModal('');if(!data)return false;
    try{const actor=await sessionCRM(data);save(actor,data);resetAttempts();unlock();return true;}
    catch(err){clearSSO();const n=attempts(true);const x=prepareModal();if(x&&n>=5)x.supportBtn.style.display='block';setStatus((err.message||'Acesso não autorizado.')+(n>=5?' Você pode solicitar suporte abaixo.':''),'error');force=true;c={};}
  }
}

// Na primeira atualização, invalida apenas a antiga marca local; preserva dados para migração.
if(localStorage.getItem('fs_sso_source')!=='crm'){
  localStorage.removeItem('fsAuthGlobal');
  localStorage.removeItem('fs_access_verified_at');
  localStorage.removeItem('fs_access_verified_fingerprint');
}
window.fsConfirmarAcesso=function(force){return confirmAccess(!!force);};

function bindActions(){
  prepareModal();
  const shareIds=['btnSharePanel','btnSharePanelFooter','btnShareMenu'];
  shareIds.forEach(id=>{const el=document.getElementById(id);if(!el||el.dataset.crmSsoBound)return;el.dataset.crmSsoBound='1';el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.location.href=CRM_MANAGE;},true);});
  const sw=['btnTrocarUsuario','btnTrocarUsuarioFooter'];sw.forEach(id=>{const el=document.getElementById(id);if(!el||el.dataset.crmSsoBound)return;el.dataset.crmSsoBound='1';el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(!confirm('Trocar de usuário encerrará esta sessão e as credenciais serão solicitadas novamente. Deseja continuar?'))return;clearSSO();confirmAccess(true);},true);});
  const out=['btnSairAcesso','btnSairAcessoFooter'];out.forEach(id=>{const el=document.getElementById(id);if(!el||el.dataset.crmSsoBound)return;el.dataset.crmSsoBound='1';el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(!confirm('Sair encerrará a sessão única da Central e do CRM. Deseja realmente sair?'))return;clearSSO();lock('Sessão encerrada. Informe suas credenciais para entrar novamente.');confirmAccess(true);},true);});
  applyIdentity({name:localStorage.getItem('fs_nome'),role:localStorage.getItem('fs_cargo'),isOwner:localStorage.getItem('fs_is_owner')==='1'});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindActions);else bindActions();
new MutationObserver(bindActions).observe(document.documentElement,{childList:true,subtree:true});
})();
