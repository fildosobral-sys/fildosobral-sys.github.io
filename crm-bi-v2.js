(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FSCRMBI=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function day(value){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function add(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function period(kind,anchor=day(new Date())){
 const d=new Date(anchor+'T12:00:00Z');let start=anchor,end=anchor;
 if(kind==='semana'){start=add(anchor,-((d.getUTCDay()+6)%7));end=add(start,6);}
 if(kind==='quinzena'){const p=anchor.slice(0,8);start=p+(d.getUTCDate()<=15?'01':'16');end=d.getUTCDate()<=15?p+'15':new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).toISOString().slice(0,10);}
 if(kind==='mes'){start=anchor.slice(0,8)+'01';end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).toISOString().slice(0,10);}return {start,end};
}
const within=(at,p)=>{const s=day(at);return s>=p.start&&s<=p.end;};
function summarize(records,users,p,today=day(new Date())){
 const ids=new Set(users.map(u=>u.id)),roster=[...users];
 records.forEach(r=>{if(!ids.has(r.ownerId)){ids.add(r.ownerId);roster.push({id:r.ownerId,name:r.seller,active:false,track:true});}});
 const perSeller=roster.filter(u=>u.track!==false||records.some(r=>r.ownerId===u.id)).map(u=>{
 const own=records.filter(r=>r.ownerId===u.id),cohort=own.filter(r=>within(r.createdAt,p));
 const contacts=own.flatMap(r=>r.history.map(h=>({...h,recordId:r.id}))).filter(h=>h.type.startsWith('contato_')&&within(h.at,p));
 const wins=cohort.filter(r=>r.status==='ganha'),status={negociacao:0,aguardando:0,agendado:0,ganha:0,perdida:0};cohort.forEach(r=>{if(Object.prototype.hasOwnProperty.call(status,r.status))status[r.status]++;});
 const late=own.filter(r=>!['ganha','perdida'].includes(r.status)&&r.next&&r.next<today).length;
 const returns=contacts.filter(h=>h.type==='contato_retorno'&&typeof h.onTime==='boolean'),reasons={};
 cohort.filter(r=>r.status==='perdida').forEach(r=>{reasons[r.reason]=(reasons[r.reason]||0)+1;});
 return {user:u,total:cohort.length,wins:wins.length,conversion:cohort.length?100*wins.length/cohort.length:null,value:wins.reduce((s,r)=>s+Number(r.amount||0),0),contacts:contacts.length,contacted:new Set(contacts.map(h=>h.recordId)).size,late,status,reasons,onTime:returns.filter(h=>h.onTime).length,returns:returns.length,records:cohort};
 });
 const totals=perSeller.reduce((s,r)=>{for(const k of ['total','wins','value','contacts','contacted','late'])s[k]+=r[k];return s;},{total:0,wins:0,value:0,contacts:0,contacted:0,late:0});
 totals.conversion=totals.total?100*totals.wins/totals.total:null;return {perSeller,totals};
}
return {day,add,period,summarize};
});