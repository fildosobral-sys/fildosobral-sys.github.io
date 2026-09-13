(function(){
'use strict';
const config=window.FSCRMConfig||{};let session=null;
const digits=s=>String(s||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
function ensureCredentials(){
  let token=String(localStorage.getItem('fs_access_token')||'').trim();
  let branch=String(localStorage.getItem('fs_filial')||'').trim();
  let phone=digits(localStorage.getItem('fs_whatsapp')||'');
  if(!token){
    token=String(window.prompt('CRM: informe sua credencial individual de acesso.')||'').trim();
    if(!token)throw Error('Credencial do CRM não informada.');
    if(token.length<24)throw Error('A credencial individual do CRM precisa ter no mínimo 24 caracteres.');
    localStorage.setItem('fs_access_token',token);
  }
  if(!branch){
    branch=String(window.prompt('CRM: informe sua filial exatamente como foi cadastrada. Ex.: Iguatu III')||'').trim();
    if(!branch)throw Error('Filial do CRM não informada.');
    localStorage.setItem('fs_filial',branch);
  }
  if(!phone){
    phone=digits(window.prompt('CRM: informe seu WhatsApp com DDD. Ex.: 88999999999')||'');
    if(!/^\d{10,11}$/.test(phone))throw Error('Informe um WhatsApp válido com DDD para acessar o CRM.');
    localStorage.setItem('fs_whatsapp',phone);
  }
  return {token,branch,phone,deviceId:localStorage.getItem('fs_device_id')||''};
}
async function call(action,data={}){
 if(!config.apiUrl)throw Error('O banco central ainda não foi conectado.');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.apiUrl))throw Error('Configure o endereço /exec do Apps Script.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.timeoutMs||25000);
 try{
  const auth=ensureCredentials();
  const response=await fetch(config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({version:2,action,auth,data}),redirect:'follow',cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('O banco central não respondeu.');
  const result=await response.json();
  if(!result.ok){const e=Error(result.message||'Operação não autorizada.');e.code=result.code;throw e;}
  return result.data;
 }catch(e){if(e.name==='AbortError')throw Error('A conexão demorou. Atualize o painel para verificar se a operação foi concluída.');throw e;}finally{clearTimeout(timer);}
}
function clearCredentials(){
 session=null;
 ['fs_access_token','fs_filial','fs_whatsapp'].forEach(k=>localStorage.removeItem(k));
}
window.FSCRMRemote={enabled:!!config.apiUrl,call,async connect(){session=null;session=await call('session');return session;},get session(){return session;},clearCredentials};
})();
