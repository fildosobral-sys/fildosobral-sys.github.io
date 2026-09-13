(function(){
'use strict';
const R=window.FSCRMRemote,B=window.FSCRMBI,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={negociacao:'Em negociação',aguardando:'Aguardando resposta',agendado:'Retorno agendado',ganha:'Concluída',perdida:'Não concluída'};
const date=s=>s?new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>v===null?'—':v.toFixed(1).replace('.',',')+'%';
let data=null,kind='mes',summary=null,loading=false,lastFocus=null;
function clear(){data=null;summary=null;$('content').hidden=true;$('identity').textContent='';$('seller-cards').replaceChildren();$('metrics').replaceChildren();$('detail-body').replaceChildren();$('permission-list').replaceChildren();$('reasons').replaceChildren();$('detail').close();}
function state(text,error=false){$('state').textContent=text;$('state').dataset.error=String(error);}
async function refresh(){
 if(loading)return;loading=true;$('refresh').disabled=true;
 try{
  if(!R.enabled){clear();state('A página de gestão está preparada. Conecte a planilha Google e cadastre os usuários para visualizar a equipe. Nenhum dado de outro colaborador é carregado neste modo.');return;}
  await R.connect();
  if(!R.session.actor.canManage)throw Error('Acesso restrito. Você pode consultar somente seus próprios orçamentos. A visão da equipe exige autorização do desenvolvedor.');
  data=await R.call('team');
  if(!data.actor.canManage)throw Error('Autorização da equipe não concedida.');
  $('identity').textContent=data.actor.name+' · '+data.actor.branch;
  const selected=$('seller').value;
  $('seller').innerHTML='<option value="">Toda a equipe</option>'+data.users.filter(u=>u.track!==false).map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('');
  $('seller').value=selected;render();$('content').hidden=false;state('');
  $('updated').textContent='Atualizado em '+new Date(data.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'. Atualização automática a cada minuto enquanto esta página estiver visível.';
 }catch(e){clear();state(e.message,true);}finally{loading=false;$('refresh').disabled=false;}
}
function render(){
 if(!data)return;
 const anchor=$('anchor').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor))return;
 const p=B.period(kind,anchor),selected=$('seller').value;
 const users=data.users.filter(u=>!selected||u.id===selected),records=data.records.filter(r=>!selected||r.ownerId===selected);
 summary=B.summarize(records,users,p);
 $('period-label').textContent=date(p.start)+' a '+date(p.end);
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===kind)));
 const t=summary.totals;
 const metrics=[['Pesquisas de orçamento',t.total,'Criadas no período'],['Vendas concluídas',t.wins,'Dos orçamentos do período'],['Conversão',pct(t.conversion),'Vendas ÷ pesquisas'],['Contatos registrados',t.contacts,'Realizados no período'],['Retornos atrasados',t.late,'Pendências atuais'],['Valor concluído',money(t.value),'Dos orçamentos do período']];
 $('metrics').innerHTML=metrics.map(m=>'<div class="metric"><small>'+m[0]+'</small><strong>'+m[1]+'</strong><span>'+m[2]+'</span></div>').join('');
 const sort=$('sort').value;
 summary.perSeller.sort((a,b)=>sort==='name'?a.user.name.localeCompare(b.user.name,'pt-BR'):(b[sort]??-1)-(a[sort]??-1)||a.user.name.localeCompare(b.user.name,'pt-BR'));
 $('roster-count').textContent=summary.perSeller.length+' colaboradores';
 $('seller-cards').innerHTML=summary.perSeller.map(r=>{
  const initials=r.user.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('');
  return '<article class="seller-card"><div class="seller-top"><span class="avatar">'+esc(initials)+'</span><div><h3>'+esc(r.user.name)+'</h3><small>'+(r.user.active?'Cadastrado':'Inativo · histórico preservado')+'</small></div></div><div class="seller-numbers"><div><strong>'+r.total+'</strong><small>Orçamentos</small></div><div><strong>'+r.wins+'</strong><small>Vendas</small></div><div><strong>'+r.contacts+'</strong><small>Contatos</small></div></div><div class="conversion"><div class="conversion-label"><span>Conversão</span><strong>'+pct(r.conversion)+'</strong></div><div class="bar" role="img" aria-label="Conversão '+pct(r.conversion)+'"><i style="width:'+Math.max(0,Math.min(100,r.conversion||0))+'%"></i></div></div><div class="tags">'+Object.entries(r.status).map(([k,v])=>'<span class="tag '+(k==='ganha'?'won':k==='perdida'?'lost':'')+'">'+esc(labels[k])+': '+v+'</span>').join('')+'</div><p class="late">'+r.late+' retorno(s) atrasado(s)</p><p class="updated">'+(r.returns?r.onTime+'/'+r.returns+' retornos realizados no prazo':'Sem retornos confirmados no período')+'</p><button data-seller="'+esc(r.user.id)+'">Ver orçamentos e histórico</button></article>';
 }).join('')||'<p>Nenhum colaborador cadastrado para este filtro.</p>';
 const reasons={};summary.perSeller.forEach(r=>Object.entries(r.reasons).forEach(([k,v])=>reasons[k]=(reasons[k]||0)+v));
 $('reasons').innerHTML=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="reason"><span>'+esc(k||'Não informado')+'</span><strong>'+v+'</strong></div>').join('')||'<p>Nenhum motivo de perda registrado nos orçamentos deste período.</p>';
 $('permissions').hidden=!data.actor.isOwner;
 if(data.actor.isOwner)$('permission-list').innerHTML=data.users.map(u=>'<div class="permission"><span>'+esc(u.name)+'<br><small>'+esc(u.role)+'</small></span>'+(u.isOwner?'<strong>Desenvolvedor</strong>':'<label><input type="checkbox" data-permission="'+esc(u.id)+'" '+(u.canManage?'checked':'')+'>Ver equipe</label>')+'</div>').join('');
}
function openDetail(id){
 const r=summary?.perSeller.find(r=>r.user.id===id);if(!r)return;
 lastFocus=document.activeElement;$('detail-title').textContent=r.user.name;
 $('detail-body').innerHTML=r.records.map(q=>'<article class="detail-record"><small>'+esc(labels[q.status])+' · '+date(q.createdAt)+'</small><h3>'+esc(q.client)+'</h3><p>'+esc(q.product)+'</p><p>'+money(q.amount)+' · Próximo retorno: '+date(q.next)+'</p>'+(q.reason?'<p>Motivo: '+esc(q.reason)+'</p>':'')+'<details><summary>Histórico de acompanhamento</summary><ol>'+q.history.slice().reverse().map(h=>'<li><strong>'+esc(h.actor)+' · '+date(h.at)+'</strong><br>'+esc(h.detail)+'</li>').join('')+'</ol></details></article>').join('')||'<p>Nenhum orçamento criado no período escolhido. Os contatos e atrasos podem se referir a orçamentos anteriores.</p>';
 $('detail').showModal();
}
$('anchor').value=B.day(new Date());
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.period;render();}));
['anchor','seller','sort'].forEach(id=>$(id).addEventListener('change',render));
$('refresh').addEventListener('click',refresh);
$('seller-cards').addEventListener('click',e=>{const b=e.target.closest('[data-seller]');if(b)openDetail(b.dataset.seller);});
$('close-detail').addEventListener('click',()=>$('detail').close());
$('detail').addEventListener('close',()=>lastFocus?.focus());
$('permission-list').addEventListener('change',async e=>{
 const input=e.target;if(!input.dataset.permission)return;input.disabled=true;
 try{await R.call('permission',{userId:input.dataset.permission,canManage:input.checked});await refresh();}
 catch(err){input.checked=!input.checked;state(err.message,true);}finally{input.disabled=false;}
});
window.addEventListener('storage',e=>{if(e.key===null||e.key.startsWith('fs_')){clear();refresh();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else refresh();});
window.addEventListener('pagehide',clear);
window.addEventListener('pageshow',()=>refresh());
setInterval(()=>{if(!document.hidden)refresh();},60000);
refresh();
})();