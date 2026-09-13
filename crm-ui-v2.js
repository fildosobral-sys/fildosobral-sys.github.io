(function () {
  'use strict';
  const C = window.FSCRMCore;
  const remote=window.FSCRMRemote; let serverRows=[], syncing=null;
  if (!C) return;
  let db, panel, modal, draft, messageDraft, revision, lastFocus, activityPeriod = '7';
  const $ = (id) => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = v => v ? new Date(v.length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR') : 'Não definido';
  const actor = () => remote?.session ? {...remote.session.actor,canManage:false} : ({name:localStorage.getItem('fs_nome')||'',branch:localStorage.getItem('fs_filial')||'',role:localStorage.getItem('fs_cargo')||'',canManage:false});
  function cacheRecord(r){const i=serverRows.findIndex(x=>x.id===r.id);if(i<0)serverRows.push(r);else serverRows[i]=r;return r;}
  async function refreshData(){
    if(remote?.enabled){await remote.connect();serverRows=(await remote.call('listMine')).records;for(const record of serverRows)window.FSCRMBridge?.setSale(record.id,record.status==='ganha');}
    await reconcile();render();
    const link=$('fscrm-team-link');if(link)link.hidden=remote?.enabled?!remote.session?.actor.canManage:!['DESENVOLVEDOR_MASTER','DESENVOLVER_MASTER'].includes(C.norm(actor().role));
  }
  const opt = (v, label, selected) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const field = (label, id, value, type = 'text', extra = '') => `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select = (label, id, entries, val) => `<label>${label}<select id="${id}">${entries.map(([k,v]) => opt(k,v,val)).join('')}</select></label>`;
  function notify(message, error = false) { const box = $('fscrm-notice'); if (box) { box.textContent = message; box.dataset.error = String(error); } if (error && typeof showToast === 'function') showToast(message, 'error'); }
  function fail(e) { notify(e.message || String(e), true); const box = $('fscrm-modal-error'); if (box) box.textContent = e.message || String(e); }
  function source() { const data = JSON.parse(localStorage.getItem('calculosDesconto') || '[]'); if (!Array.isArray(data)) throw Error('O histórico original não está em um formato válido.'); return data.filter(r=>C.norm(r.vendedor)===C.norm(actor().name)); }
  function available() { return db.all().filter(r => C.canRead(r, actor())); }
  async function ingest(row) {
    if (!row.fs_crm_v1 || row.fs_crm_v1.kind !== 'cliente' || db.get(row.__backendId)) return;
    const meta = row.fs_crm_v1;
    if(remote?.enabled && meta.storage!=='central')return;
    // Não atribuir silenciosamente a outra filial ou a outro vendedor.
    if (C.norm(meta.branch) !== C.norm(actor().branch)) return;
    if (!C.leader(actor()) && C.norm(row.vendedor) !== C.norm(actor().name)) return;
    const record = C.create(row, meta, actor());
    if(record){if(remote?.enabled)cacheRecord(await remote.call('create',{legacy:row,meta}));else db.put(record);}
  }
  async function reconcile() {
    if(syncing)return syncing;
    syncing=(async()=>{for(const row of source())await ingest(row);})();
    try{await syncing;}finally{syncing=null;}
  }
  function capture() {
    if(remote?.enabled && !remote.session)throw Error('Aguarde a validação do acesso central ou use Atualizar painel.');
    const kind = $('fscrm-kind')?.value;
    if (!kind) throw Error('A área de acompanhamento não está pronta. Recarregue a página antes de salvar.');
    if (kind === 'simulacao') return { kind };
    const a = actor();
    if (!a.name || !a.branch) throw Error('Entre pela página inicial para identificar vendedor e filial.');
    const next = $('fscrm-next').value;
    if (!C.validDate(next) || next < C.day()) throw Error('Informe uma data de retorno a partir de hoje.');
    const consent = $('fscrm-consent').checked;
    const number = $('whatsapp').value.trim();
    if (number && !C.validPhone(number)) throw Error('Informe o WhatsApp do cliente com DDD.');
    if (consent && !number) throw Error('Informe o WhatsApp autorizado pelo cliente.');
    return { kind, ownerId:a.id||null, version:2,storage:remote?.enabled?'central':'local', branch: a.branch, channel: $('fscrm-channel').value, buyer: $('fscrm-buyer').value, next, consent };
  }
  function captureSafe() { try { return capture(); } catch(e) { fail(e); return false; } }
  async function save(r, oldRevision, command) {
    if(remote?.enabled){
      const keys=['status','reason','next','note','phone','consent','delivered','post','issue','issueOwner','issueDue','relation','channel','buyer'];
      const patch={};keys.forEach(k=>patch[k]=r[k]);
      r=cacheRecord(await remote.call(command?.action||'update',{id:r.id,expectedRevision:oldRevision,requestId:crypto.randomUUID(),patch,...(command?.data||{})}));
    }else db.put(r,oldRevision);
    try { window.FSCRMBridge?.setSale(r.id, r.status === 'ganha'); }
    catch(e) { notify('Acompanhamento salvo. O histórico antigo não foi atualizado: ' + e.message, true); }
    render();
  }
  async function setLegacyStatus(id, sold) {
    try {
      const r = db.get(id); if (!r) return false;
      const updated = C.edit(r, { status: sold ? 'ganha' : 'negociacao', next: C.plus(C.day(), 2) }, actor());
      await save(updated, r.revision);
      notify(sold ? 'Venda concluída. Registre a entrega para agendar o pós-venda.' : 'Negociação reaberta. Retorno agendado em dois dias.');
    } catch(e) { fail(e); }
    return true;
  }
  function mount() {
    db=remote?.enabled?{all:()=>serverRows,get:id=>serverRows.find(r=>r.id===id)||null}:C.store(localStorage);
    const metadata = document.createElement('div');
    metadata.id = 'fscrm-capture'; metadata.className = 'fscrm';
    metadata.innerHTML = `<h3>Acompanhamento do cliente</h3><p>Pesquisas reais entram no painel. Simulações internas continuam apenas no histórico de cálculos.</p><div class="fscrm-grid">
      ${select('Tipo de registro', 'fscrm-kind', [['cliente','Pesquisa de cliente'],['simulacao','Simulação interna']], 'cliente')}
      ${select('Atendimento', 'fscrm-channel', [['presencial','Presencial'],['online','Online']], 'presencial')}
      ${select('Compra para', 'fscrm-buyer', [['proprio','O próprio cliente'],['terceiro','Terceiro']], 'proprio')}
      ${field('Próximo retorno', 'fscrm-next', C.plus(C.day(),2), 'date')}
      </div><label class="fscrm-check"><input type="checkbox" id="fscrm-consent"> Cliente autorizou contato pelo WhatsApp sobre esta negociação.</label>`;
    $('discountForm').appendChild(metadata);
    $('discountForm').addEventListener('reset', () => setTimeout(() => {
      ['fscrm-channel','fscrm-buyer','fscrm-next','fscrm-consent'].forEach(id => $(id).disabled = false);
      $('fscrm-next').value = C.plus(C.day(),2);
    },0));
    $('fscrm-kind').addEventListener('change', () => {
      ['fscrm-channel','fscrm-buyer','fscrm-next','fscrm-consent'].forEach(id => $(id).disabled = $('fscrm-kind').value === 'simulacao');
    });
    panel = document.createElement('section'); panel.id = 'fscrm-panel'; panel.className = 'fscrm';
    panel.innerHTML = `<details open><summary>Acompanhamento comercial <span id="fscrm-count"></span></summary>
      <div class="fscrm-body"><p class="fscrm-local">${remote?.enabled?'Banco central configurado • Somente seus registros':'Modo local de preparação • Sem dados compartilhados entre aparelhos'}</p>
      <div id="fscrm-notice" role="status" aria-live="polite"></div>
      <div class="fscrm-toolbar"><a id="fscrm-team-link" href="./orcamentos-gestao.html" hidden>Gestão da equipe</a><button type="button" data-action="refresh">Atualizar painel</button><button type="button" data-action="export">Exportar backup</button><button type="button" data-action="restore">Restaurar backup</button><input id="fscrm-file" type="file" accept="application/json,.json" hidden></div>
      <h3>Agenda de acompanhamento</h3><p>Retornos de hoje e atrasados, independentemente da data do orçamento. Lembretes atualizados ao abrir esta página.</p><div id="fscrm-agenda"></div>
      <h3>Orçamentos</h3><div class="fscrm-filters">
      ${field('Criados a partir de', 'fscrm-from', '', 'date')}${field('Criados até', 'fscrm-to', '', 'date')}
      ${select('Situação', 'fscrm-status-filter', [['','Todas'], ...Object.entries(C.STATUS)], '')}
      <label id="fscrm-seller-wrap">Vendedor<select id="fscrm-seller-filter"><option value="">Todos</option></select></label>
      ${field('Buscar cliente ou produto', 'fscrm-search', '', 'search')}
      </div><div id="fscrm-stats" class="fscrm-stats"></div><div id="fscrm-records"></div>
      
      <details class="fscrm-old"><summary>Classificar registros anteriores</summary><p>Registros antigos não entram automaticamente nos indicadores. Inclua apenas pesquisas reais de clientes. A inclusão mantém o cálculo original.</p><div id="fscrm-old-list"></div></details>
      </div></details>`;
    $('historySection').before(panel);
    modal = document.createElement('dialog'); modal.id = 'fscrm-modal'; modal.className = 'fscrm'; modal.setAttribute('aria-labelledby','fscrm-modal-title'); document.body.appendChild(modal);
    modal.addEventListener('close', () => lastFocus?.focus());
    modal.addEventListener('click', click);
    panel.addEventListener('click', click);
    panel.addEventListener('change', e => { if(e.target.id === 'fscrm-activity-period') { activityPeriod = e.target.value; render(); } });
    ['fscrm-from','fscrm-to','fscrm-status-filter','fscrm-seller-filter'].forEach(id => $(id).addEventListener('change', render));
    $('fscrm-search').addEventListener('input', render);
    $('fscrm-file').addEventListener('change', restore);
    window.addEventListener('storage', e => { if(e.key&&e.key.startsWith('fs_')&&!e.key.startsWith(C.PREFIX)){serverRows=[];panel.hidden=true;location.reload();return;}
      if(e.key===null||e.key.startsWith(C.PREFIX)||e.key==='calculosDesconto'){refreshData().catch(fail);} });
    document.addEventListener('visibilitychange', () => { if(!document.hidden)refreshData().catch(fail); });
    render();
    if(remote?.enabled)panel.querySelector('[data-action="restore"]').hidden=true;
    refreshData().catch(fail);
  }
  function render() {
    const a = actor();
    panel.hidden = !a.name || !a.branch || document.documentElement.classList.contains('fs-module-auth-lock');
    if (panel.hidden) return;
    const all = available(), today = C.day();
    const sellerChoice = $('fscrm-seller-filter').value;
    $('fscrm-seller-wrap').hidden = !C.leader(a);
    $('fscrm-seller-filter').innerHTML = opt('', 'Todos', sellerChoice) + [...new Set(all.map(r => r.seller))].sort().map(s => opt(s,s,sellerChoice)).join('');
    let rows = all.filter(r => !C.leader(a) || !sellerChoice || r.seller === sellerChoice);
    const agenda = rows.flatMap(r => C.tasks(r).filter(t => t.date && t.date <= today).map(t => ({r,t}))).sort((a,b) => a.t.date.localeCompare(b.t.date));
    $('fscrm-count').textContent = `${all.length} registros · ${agenda.length} ações para hoje ou atrasadas`;
    $('fscrm-agenda').innerHTML = agenda.length ? agenda.map(({r,t}) => `<button class="fscrm-agenda-row" data-action="open" data-id="${esc(r.id)}"><span><strong>${esc(t.title)} · ${esc(r.client)}</strong><small>${esc(r.seller)} · ${esc(r.product)}</small></span><span class="${t.date < today ? 'fscrm-overdue' : ''}">${date(t.date)}${t.date < today ? ' · Atrasado' : ' · Hoje'}</span></button>`).join('') : '<p class="fscrm-empty">Nenhuma ação vencendo hoje. Os retornos futuros aparecem nos respectivos orçamentos.</p>';
    const from = $('fscrm-from').value, to = $('fscrm-to').value, status = $('fscrm-status-filter').value, search = C.norm($('fscrm-search').value);
    if (from && to && from > to) { notify('A data inicial deve ser anterior à data final.',true); return; }
    rows = rows.filter(r => { const d = C.day(new Date(r.createdAt)); return (!from || d >= from) && (!to || d <= to) && (!status || r.status === status) && (!search || C.norm(r.client + ' ' + r.product).includes(search)); });
    rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const wins = rows.filter(r => r.status === 'ganha');
    $('fscrm-stats').innerHTML = [['Orçamentos',rows.length],['Em negociação',rows.filter(r=>!C.closed(r)).length],['Vendas concluídas',wins.length],['Conversão',rows.length ? (100*wins.length/rows.length).toFixed(1)+'%' : '—'],['Valor concluído',money(wins.reduce((s,r)=>s+r.amount,0))]].map(([k,v])=>`<div><small>${k}</small><strong>${v}</strong></div>`).join('');
    $('fscrm-records').innerHTML = rows.length ? rows.map(r => `<article class="fscrm-card"><div><span class="fscrm-badge" data-status="${r.status}">${C.STATUS[r.status]}</span><h4>${esc(r.client)}</h4><p>${esc(r.product)}</p><small>${esc(r.seller)} · ${date(r.createdAt)} · ${r.channel === 'online' ? 'Online' : 'Presencial'} · ${r.buyer === 'terceiro' ? 'Para terceiro' : 'Para si'}</small></div><div class="fscrm-card-side"><strong>${money(r.amount)}</strong><small>${r.next ? 'Retorno: '+date(r.next) : r.reason ? esc(r.reason) : r.delivered ? 'Entrega: '+date(r.delivered) : 'Entrega ainda não informada'}</small><button type="button" data-action="open" data-id="${esc(r.id)}">Acompanhar</button></div></article>`).join('') : '<p class="fscrm-empty">Nenhum orçamento corresponde aos filtros.</p>';
    
    const old = source().filter(r => r.fs_crm_v1?.kind!=='simulacao' && !db.get(r.__backendId) && r.__backendId && (C.leader(a) || C.norm(r.vendedor) === C.norm(a.name)));
    $('fscrm-old-list').innerHTML = old.length ? old.map(r => `<div class="fscrm-old-row"><span>${esc(r.cliente)} · ${esc(r.codigo_produto)} · ${esc(r.vendedor)}</span><button type="button" data-action="enroll" data-id="${esc(r.__backendId)}">Classificar</button></div>`).join('') : '<p>Nenhum registro anterior aguardando classificação.</p>';
  }
  function show(title, body, actions) {
    if (!modal.open) lastFocus = document.activeElement;
    modal.innerHTML = `<div class="fscrm-modal-head"><h2 id="fscrm-modal-title">${esc(title)}</h2><button type="button" data-action="close" aria-label="Fechar">×</button></div><div id="fscrm-modal-error" role="alert"></div>${body}<div class="fscrm-modal-actions">${actions}<button type="button" data-action="close">Fechar</button></div>`;
    if (!modal.open) modal.showModal();
  }
  function open(id) {
    draft = db.get(id); if (!draft || !C.canRead(draft,actor())) throw Error('Orçamento não disponível para este usuário.');
    const r = draft; revision=r.revision;
    show('Acompanhar negociação', `<p><strong>${esc(r.client)}</strong> · ${esc(r.product)}<br>${esc(r.seller)} · ${money(r.amount)}</p><div class="fscrm-grid">
      ${select('Status','fscrm-edit-status',Object.entries(C.STATUS),r.status)}
      ${select('Motivo de não fechamento','fscrm-edit-reason',[['','Selecione'],...C.REASONS.map(x=>[x,x])],r.reason)}
      ${field('Próximo retorno','fscrm-edit-next',r.next,'date')}${field('WhatsApp com DDD','fscrm-edit-phone',r.phone,'tel')}
      ${select('Atendimento','fscrm-edit-channel',[['presencial','Presencial'],['online','Online']],r.channel)}
      ${select('Compra para','fscrm-edit-buyer',[['proprio','O próprio cliente'],['terceiro','Terceiro']],r.buyer)}
      </div><label class="fscrm-check"><input type="checkbox" id="fscrm-edit-consent" ${r.consent?'checked':''}> Cliente autoriza contato pelo WhatsApp.</label>
      <label>Observações<textarea id="fscrm-edit-note" rows="3" maxlength="2000">${esc(r.note)}</textarea></label>
      <details ${r.status==='ganha'?'open':''}><summary>Entrega e pós-venda</summary><p>O lembrete aparece três dias após a entrega ou retirada confirmada.</p><div class="fscrm-grid">
      ${field('Entrega / retirada confirmada','fscrm-edit-delivered',r.delivered,'date',`max="${C.day()}"`)}
      ${select('Resultado do pós-venda','fscrm-edit-post',[['pendente','Aguardando contato'],['bem','Está tudo certo'],['sem_resposta','Aguardando resposta'],['problema','Precisa de atendimento'],['resolvido','Problema resolvido']],r.post)}
      ${field('Problema relatado','fscrm-edit-issue',r.issue)}${field('Responsável pela solução','fscrm-edit-issueOwner',r.issueOwner)}${field('Prazo de solução','fscrm-edit-issueDue',r.issueDue,'date')}${field('Próximo relacionamento (opcional)','fscrm-edit-relation',r.relation,'date')}
      </div></details><details><summary>Histórico de acompanhamento (${r.history.length})</summary><ol class="fscrm-history">${r.history.slice().reverse().map(h=>`<li><strong>${esc(h.actor)} · ${new Date(h.at).toLocaleString('pt-BR')}</strong><p>${esc(h.detail)}</p></li>`).join('')}</ol></details>
      <p class="fscrm-hint">Salve as alterações antes de preparar uma mensagem.</p>`,
      `<button type="button" class="fscrm-primary" data-action="save">Salvar alterações</button><button type="button" data-action="message">Preparar contato</button><button type="button" class="fscrm-danger" data-action="stop">Não contatar este cliente</button>`);
  }
  async function editSave() {
    const patch = {};
    ['status','reason','next','phone','note','delivered','post','issue','issueOwner','issueDue','relation','channel','buyer'].forEach(k=>patch[k]=$('fscrm-edit-'+k).value.trim());
    patch.consent=$('fscrm-edit-consent').checked;
    if (!draft.consent && patch.consent && draft.history.some(h=>h.type==='nao_contatar')) throw Error('Cliente com pedido de interrupção. A reautorização deve ser documentada antes de retomar; mantenha sem contato nesta versão.');
    const r = C.edit(draft,patch,actor()); await save(r,revision); modal.close(); notify('Acompanhamento atualizado.');
  }
  async function messageOpen() {
    const r=db.get(draft.id); if(r.revision!==revision) throw Error('O orçamento mudou. Feche e abra novamente.');
    const kind=r.post==='problema'?'suporte':r.status==='ganha'?(r.post==='bem'||r.post==='resolvido'?'relacionamento':'pos'):'retorno';
    const block=C.contactBlock(r,kind,db.all()); if(block) throw Error(block);
    const task=C.tasks(r).find(t=>t.kind===kind);
    if(task?.date && task.date>C.day()) throw Error('Este contato está agendado para '+date(task.date)+'. Ajuste a agenda se combinou outra data com o cliente.');
    if(remote?.enabled)await remote.call('checkContact',{id:r.id,kind});
    messageDraft={r,kind};
    show('Preparar contato', `<p><strong>${esc(r.client)}</strong> · ${esc(r.phone)}</p><label>Mensagem para revisar<textarea id="fscrm-message" rows="7" maxlength="2000">${esc(C.message(r,kind,actor()))}</textarea></label><p>O WhatsApp será aberto para você revisar e enviar. Só confirme o contato depois de realizá-lo.</p>
      ${select('Resultado do contato','fscrm-outcome',[['','Selecione após o contato'],['Mensagem enviada','Mensagem enviada'],['Cliente respondeu','Cliente respondeu'],['Sem resposta','Sem resposta']], '')}
      ${field('Observação do contato (opcional)','fscrm-contact-note','')}
      ${kind==='retorno'||kind==='relacionamento'?field('Próximo contato','fscrm-contact-next',C.plus(C.day(),kind==='relacionamento'?60:3),'date'):''}`,
      `<button type="button" class="fscrm-primary" data-action="whatsapp">Abrir WhatsApp</button><button type="button" data-action="copy">Copiar mensagem</button><button type="button" data-action="confirm-contact">Confirmar contato realizado</button>`);
  }
  async function confirmContact() {
    const {r,kind}=messageDraft;
    const updated=C.contact(r,kind,$('fscrm-outcome').value,$('fscrm-contact-note').value,$('fscrm-contact-next')?.value||'',actor(),db.all());
    await save(updated,r.revision,{action:'contact',data:{kind,outcome:$('fscrm-outcome').value,note:$('fscrm-contact-note').value,next:$('fscrm-contact-next')?.value||''}}); modal.close(); notify('Contato registrado. Atualize o status ou o pós-venda conforme a resposta do cliente.');
  }
  async function stop() {
    const r = db.get(draft.id); if(!C.canRead(r,actor())) throw Error('Sem acesso.');
    const updated=C.edit(r,{consent:false},actor());
    const next=JSON.parse(JSON.stringify(updated));
    next.history.push({at:new Date().toISOString(),actor:actor().name,type:'nao_contatar',detail:'Cliente pediu interrupção dos contatos. Bloqueio também considerado em outros orçamentos com o mesmo telefone nesta filial.'});
    if(next.revision===r.revision) next.revision++;
    next.updatedAt=new Date().toISOString(); await save(next,r.revision,{action:'stop'});modal.close();notify('Pedido de interrupção registrado.');
  }
  function enroll(id) {
    const r=source().find(x=>x.__backendId===id); if(!r || (!C.leader(actor())&&C.norm(r.vendedor)!==C.norm(actor().name))) throw Error('Registro não disponível.');
    draft=r;
    show('Classificar pesquisa anterior', `<p>${esc(r.cliente)} · ${esc(r.codigo_produto)}</p><p>Confirme que foi uma pesquisa real de cliente e que pertence à ${esc(actor().branch)}.</p><div class="fscrm-grid">${select('Atendimento','fscrm-enroll-channel',[['presencial','Presencial'],['online','Online']],'presencial')}${select('Compra para','fscrm-enroll-buyer',[['proprio','O próprio cliente'],['terceiro','Terceiro']],'proprio')}${field('Próximo retorno','fscrm-enroll-next',C.plus(C.day(),2),'date')}</div><label class="fscrm-check"><input id="fscrm-enroll-consent" type="checkbox"> Cliente autorizou contato pelo WhatsApp.</label>`, `<button type="button" data-action="enroll-confirm" class="fscrm-primary">Incluir pesquisa no acompanhamento</button>`);
  }
  function exportBackup() {
    const payload={type:'fs-crm-backup',version:1,branch:actor().branch,exportedAt:new Date().toISOString(),records:available()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='acompanhamento-orcamentos-'+C.day()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Backup exportado com os registros disponíveis para este usuário.');
  }
  async function restore(e) {
    try {
      if(remote?.enabled)throw Error('Restauração local indisponível no banco central. Use Classificar registros anteriores para importar pesquisas identificadas.');
      const file=e.target.files[0]; if(!file)return;
      if(file.size>10*1024*1024)throw Error('Backup maior que o limite de 10 MB.');
      const data=JSON.parse(await file.text());
      if(data.type!=='fs-crm-backup'||data.version!==1||!Array.isArray(data.records)||C.norm(data.branch)!==C.norm(actor().branch))throw Error('Backup incompatível ou de outra filial.');
      for(const r of data.records) {
        if(!r || r.schema!==1 || typeof r.id!=='string' || !r.id || !Number.isInteger(r.revision) || r.revision<1 || !C.STATUS[r.status] || !Array.isArray(r.history) || !C.canRead(r,actor()) || !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.updatedAt)) || !Number.isFinite(r.amount))throw Error('Backup contém registros inválidos ou sem permissão para este usuário.');
        for(const k of ['client','seller','branch','product','phone','note']) if(typeof r[k]!=='string')throw Error('Backup com campos inválidos.');
        for(const h of r.history)if(!h||typeof h.type!=='string'||typeof h.actor!=='string'||typeof h.detail!=='string'||!Number.isFinite(Date.parse(h.at)))throw Error('Histórico inválido no backup.');
        C.edit(r,{},actor());
      }
      let added=0,skipped=0;
      for(const r of data.records){if(db.get(r.id)){skipped++;continue;}db.put(r);added++;}
      render();notify(`${added} registros restaurados; ${skipped} já existentes preservados. Nenhum registro foi sobrescrito.`);
    }catch(err){fail(err);}finally{e.target.value='';}
  }
  async function click(e) {
    const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;
    b.disabled=true;
    try {
      switch(b.dataset.action){
        case 'close':modal.close();break;
        case 'refresh':await refreshData();notify('Painel atualizado.');break;
        case 'open':open(b.dataset.id);break;
        case 'save':await editSave();break;
        case 'message':await messageOpen();break;
        case 'stop':await stop();break;
        case 'confirm-contact':await confirmContact();break;
        case 'whatsapp': {
          const {r,kind}=messageDraft,block=C.contactBlock(db.get(r.id),kind,db.all());if(block)throw Error(block);
          if(remote?.enabled)await remote.call('checkContact',{id:r.id,kind});
          const text=$('fscrm-message').value.trim();if(!text)throw Error('Escreva a mensagem antes de abrir o WhatsApp.');
          window.open('https://wa.me/'+C.phone(r.phone)+'?text='+encodeURIComponent(text),'_blank','noopener,noreferrer');break;
        }
        case 'copy':await navigator.clipboard.writeText($('fscrm-message').value);$('fscrm-modal-error').textContent='Mensagem copiada. O contato ainda não foi registrado.';break;
        case 'enroll':enroll(b.dataset.id);break;
        case 'enroll-confirm':{
          const r=C.create(draft,{kind:'cliente',channel:$('fscrm-enroll-channel').value,buyer:$('fscrm-enroll-buyer').value,next:$('fscrm-enroll-next').value,consent:$('fscrm-enroll-consent').checked},actor());if(remote?.enabled)cacheRecord(await remote.call('create',{legacy:draft,meta:{kind:'cliente',channel:r.channel,buyer:r.buyer,next:r.next||C.plus(C.day(),2),consent:r.consent},imported:true}));else db.put(r);modal.close();render();notify('Pesquisa incluída. O cálculo original foi preservado.');break;
        }
        case 'export':exportBackup();break;
        case 'restore':$('fscrm-file').click();break;
      }
    }catch(err){fail(err);}finally{b.disabled=false;}
  }
  window.FSCRM={capture:captureSafe,has:id=>!!db?.get(id),setLegacyStatus,
    async saved(row){try{await ingest(row);render();}catch(e){fail(Error('Cálculo salvo no histórico. Não foi possível atualizar o acompanhamento: '+e.message));}},
    async refresh(){try{await refreshData();}catch(e){fail(e);}}
  };
  document.addEventListener('DOMContentLoaded',()=>{try{mount();}catch(e){console.error('Acompanhamento comercial:',e);if(typeof showToast==='function')showToast('Não foi possível carregar o acompanhamento. Os cálculos originais continuam disponíveis.','error');}});
})();
