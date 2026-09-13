/* Acompanhamento comercial isolado. Sem rede e sem alteração de preços. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FSCRMCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PREFIX = 'fs_crm_v1:record:';
  const STATUS = { negociacao: 'Em negociação', aguardando: 'Aguardando resposta', agendado: 'Retorno agendado', ganha: 'Venda concluída', perdida: 'Não concluído' };
  const REASONS = ['Preço', 'Condição de pagamento', 'Falta de estoque', 'Prazo de entrega', 'Comprou em outro lugar', 'Adiou a compra', 'Desistiu', 'Sem resposta', 'Outro'];
  const norm = s => String(s || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
  const phone = s => { const n = String(s || '').replace(/\D/g, ''); return n.length === 10 || n.length === 11 ? '55' + n : n; };
  const validPhone = s => /^55\d{10,11}$/.test(phone(s));
  function day(d = new Date()) { return new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && day(new Date(s + 'T12:00:00')) === s; }
  function plus(s, n) { if (!validDate(s)) throw Error('Data inválida.'); const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return day(d); }
  const closed = r => ['ganha', 'perdida'].includes(r.status);
  const leader = a => a.canManage === true;
  const canRead = (r, a) => norm(r.branch) === norm(a.branch) && (leader(a) || (r.ownerId && a.id ? r.ownerId === a.id : norm(r.seller) === norm(a.name)));
  function assertAccess(r, a) { if (!a.name || !a.branch || !canRead(r, a)) throw Error('Este orçamento pertence a outro vendedor ou filial.'); }
  function event(r, a, type, detail, now) { r.history.push({ at: now.toISOString(), actor: a.name, type, detail }); }
  function create(legacy, meta, actor, now = new Date()) {
    const seller = String(legacy.vendedor || actor.name).trim();
    if (!meta || meta.kind !== 'cliente') return null;
    if (!['presencial', 'online'].includes(meta.channel) || !['proprio', 'terceiro'].includes(meta.buyer)) throw Error('Informe o canal e para quem é a compra.');
    if (!actor.name || !actor.branch || !seller || (!leader(actor) && norm(seller) !== norm(actor.name))) throw Error('Identificação do vendedor ou filial inválida. Entre pela página inicial.');
    if (!legacy.__backendId || !legacy.cliente || !legacy.codigo_produto) throw Error('Orçamento incompleto.');
    const id = String(legacy.__backendId);
    const date = Number.isFinite(Date.parse(legacy.data_calculo)) ? legacy.data_calculo : now.toISOString();
    const r = { schema: 1, id, revision: 1, branch: actor.branch, seller, client: String(legacy.cliente), phone: String(legacy.whatsapp || ''), product: String(legacy.codigo_produto), amount: Number(legacy.preco_promocional) || 0,
      createdAt: date, updatedAt: now.toISOString(), channel: meta.channel, buyer: meta.buyer, consent: meta.consent === true, status: legacy.venda_bem_sucedida === true ? 'ganha' : 'negociacao', reason: '', next: meta.next || plus(day(now), 2), note: String(legacy.anotacoes || ''), delivered: '', post: 'pendente', issue: '', issueOwner: '', issueDue: '', relation: '', history: [] };
    if (!validDate(r.next)) throw Error('Informe uma data válida para o retorno.');
    if (closed(r)) r.next = '';
    event(r, actor, 'cadastro', 'Pesquisa de cliente incluída no acompanhamento.', now);
    return r;
  }
  function edit(record, patch, actor, now = new Date()) {
    assertAccess(record, actor);
    const r = JSON.parse(JSON.stringify(record));
    const allowed = ['status', 'reason', 'next', 'note', 'phone', 'consent', 'delivered', 'post', 'issue', 'issueOwner', 'issueDue', 'relation', 'channel', 'buyer'];
    allowed.forEach(k => { if (Object.prototype.hasOwnProperty.call(patch, k)) r[k] = patch[k]; });
    if (!Object.prototype.hasOwnProperty.call(STATUS, r.status)) throw Error('Status inválido.');
    if (!['presencial', 'online'].includes(r.channel) || !['proprio', 'terceiro'].includes(r.buyer)) throw Error('Canal ou destinatário inválido.');
    if (typeof r.consent !== 'boolean') throw Error('Preferência de contato inválida.');
    if (r.phone && !validPhone(r.phone)) throw Error('Informe um WhatsApp brasileiro com DDD válido.');
    for (const k of ['next', 'delivered', 'issueDue', 'relation']) if (r[k] && !validDate(r[k])) throw Error('Data inválida.');
    if (r.status === 'perdida' && !REASONS.includes(r.reason)) throw Error('Selecione o motivo de não fechamento.');
    if (r.status === 'perdida' && r.reason === 'Outro' && !String(r.note).trim()) throw Error('Descreva o motivo nas observações.');
    if (!closed(r) && !r.next) throw Error('Defina a próxima data de retorno.');
    if (closed(r)) r.next = '';
    if (r.status !== 'perdida') r.reason = '';
    if (r.delivered && r.delivered > day(now)) throw Error('Confirme apenas entregas já realizadas.');
    if (!['pendente', 'bem', 'problema', 'sem_resposta', 'resolvido'].includes(r.post)) throw Error('Resultado de pós-venda inválido.');
    if (r.status !== 'ganha') {
      if (record.status === 'ganha') { r.delivered = ''; r.post = 'pendente'; r.issue = ''; r.issueOwner = ''; r.issueDue = ''; r.relation = ''; }
      else if (r.delivered || r.post !== 'pendente' || r.relation) throw Error('Conclua a venda antes de registrar o pós-venda.');
    }
    if (r.post !== 'pendente' && !r.delivered) throw Error('Informe a entrega ou retirada confirmada.');
    if (r.post === 'problema' && (!String(r.issue).trim() || !String(r.issueOwner).trim() || !r.issueDue)) throw Error('Informe o problema, responsável e prazo de solução.');
    if (r.relation && (!r.delivered || !['bem', 'resolvido'].includes(r.post))) throw Error('Agende relacionamento após confirmar que está tudo certo com o produto.');
    if (r.relation && r.relation < plus(r.delivered, 30)) throw Error('Agende o relacionamento pelo menos 30 dias após a entrega.');
    const lastRelation = r.history.filter(h=>h.type==='contato_relacionamento').at(-1);
    if (r.relation && lastRelation && r.relation < plus(day(new Date(lastRelation.at)),30)) throw Error('Mantenha pelo menos 30 dias entre contatos de relacionamento.');
    const changed = allowed.filter(k => r[k] !== record[k]);
    if (!changed.length) return record;
    event(r, actor, 'atualizacao', changed.map(k => k + ': ' + String(record[k] ?? '') + ' → ' + String(r[k])).join(' | '), now);
    r.revision++; r.updatedAt = now.toISOString();
    return r;
  }
  function tasks(r) {
    if (!closed(r)) return [{ kind: 'retorno', date: r.next, title: 'Retomar negociação' }];
    if (r.status !== 'ganha') return [];
    if (r.post === 'problema') return [{ kind: 'suporte', date: r.issueDue, title: 'Resolver atendimento' }];
    const result = [];
    if (r.delivered && ['pendente', 'sem_resposta'].includes(r.post)) {
      const contacts = r.history.filter(h => h.type === 'contato_pos');
      const last = contacts.at(-1);
      result.push({ kind: 'pos', date: last ? plus(day(new Date(last.at)), 3) : plus(r.delivered, 3), title: 'Conferir produto recebido' });
    }
    if (r.relation && ['bem', 'resolvido'].includes(r.post)) result.push({ kind: 'relacionamento', date: r.relation, title: 'Relacionamento' });
    return result;
  }
  function sameClient(a, b) { return a.branch === b.branch && validPhone(a.phone) && phone(a.phone) === phone(b.phone); }
  function contactBlock(r, kind, records, now = new Date()) {
    if (!r.consent) return 'Registre a permissão do cliente para contato pelo WhatsApp.';
    if (!validPhone(r.phone)) return 'Cadastre um WhatsApp válido com DDD.';
    const group = records.filter(x => x.id === r.id || sameClient(r, x));
    if (group.some(x => x.history.some(h => h.type === 'nao_contatar') && !x.consent)) return 'Este cliente pediu para não receber contatos.';
    if (kind !== 'suporte' && group.some(x => x.post === 'problema')) return 'Há um atendimento pendente para este cliente. Resolva-o antes de uma abordagem comercial.';
    if (kind === 'retorno' && closed(r)) return 'Esta negociação já foi encerrada.';
    if (kind === 'pos' && (r.status !== 'ganha' || !r.delivered || !['pendente', 'sem_resposta'].includes(r.post))) return 'O pós-venda exige venda concluída e entrega confirmada, com acompanhamento pendente.';
    if (kind === 'relacionamento' && (r.status !== 'ganha' || !['bem', 'resolvido'].includes(r.post))) return 'Conclua o pós-venda antes do contato comercial.';
    if (kind === 'suporte' && r.post !== 'problema') return 'Não há atendimento pendente.';
    const last = group.flatMap(x => x.history).filter(h => h.type.startsWith('contato_')).sort((a,b) => b.at.localeCompare(a.at))[0];
    if (last && kind !== 'suporte' && now - new Date(last.at) < 2 * 86400000) return 'Já houve contato com este cliente há menos de 2 dias. Aguarde para evitar mensagens repetidas.';
    return '';
  }
  function contact(record, kind, outcome, note, next, actor, records, now = new Date()) {
    assertAccess(record, actor);
    if (!['retorno', 'pos', 'relacionamento', 'suporte'].includes(kind)) throw Error('Tipo de contato inválido.');
    const block = contactBlock(record, kind, records, now); if (block) throw Error(block);
    if (!['Mensagem enviada', 'Cliente respondeu', 'Sem resposta'].includes(outcome)) throw Error('Informe o resultado do contato.');
    if ((kind === 'retorno' || kind === 'relacionamento') && (!validDate(next) || next <= day(now))) throw Error('Agende o próximo contato para uma data futura.');
    if (kind === 'relacionamento' && next < plus(day(now), 30)) throw Error('Deixe pelo menos 30 dias até o próximo contato de relacionamento.');
    const r = JSON.parse(JSON.stringify(record));
    event(r, actor, 'contato_' + kind, outcome + (note ? ' — ' + note : ''), now);
    if (kind === 'retorno') {
      r.history.at(-1).scheduledFor = record.next;
      r.history.at(-1).onTime = !!record.next && day(now) <= record.next;
    }
    if (kind === 'retorno') { r.status = outcome === 'Cliente respondeu' ? 'agendado' : 'aguardando'; r.next = next; }
    if (kind === 'pos') r.post = 'sem_resposta';
    if (kind === 'relacionamento') r.relation = next;
    r.revision++; r.updatedAt = now.toISOString(); return r;
  }
  function message(r, kind, actor) {
    const first = r.client.trim().split(/\s+/)[0];
    const intro = `Oi, ${first}! Aqui é ${actor.name}, da Zenir.`;
    if (kind === 'pos') return `${intro} Está tudo certo com ${r.product} que você recebeu? Se ficou alguma dúvida ou apareceu algum problema, me conte para eu ajudar.`;
    if (kind === 'suporte') return `${intro} Estou acompanhando o atendimento sobre ${r.product}. Pode me contar como está a situação agora? Quero ajudar a encaminhar a solução.`;
    if (kind === 'relacionamento') return `${intro} Espero que esteja tudo bem! Se estiver precisando de algo para sua casa, fico à disposição para ajudar a encontrar uma boa opção. Sem compromisso.`;
    return `${intro} Ficou alguma dúvida sobre ${r.product} que você consultou comigo? Posso conferir as condições atuais e ajudar a encontrar a opção que melhor atende você. Fico à disposição!`;
  }
  function store(storage) {
    const key = id => PREFIX + encodeURIComponent(id);
    function get(id) { const raw = storage.getItem(key(id)); return raw ? JSON.parse(raw) : null; }
    function all() {
      const result = [];
      for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k.startsWith(PREFIX)) { const r = JSON.parse(storage.getItem(k)); if (!r || r.schema !== 1 || !r.id || !Array.isArray(r.history)) throw Error('Registro de acompanhamento inválido. Exporte o backup antes de recuperar os dados.'); result.push(r); } }
      return result;
    }
    function put(r, expected = 0) {
      const current = get(r.id);
      if ((current?.revision || 0) !== expected) throw Error('O orçamento mudou em outra aba. Feche e abra o registro para atualizar.');
      storage.setItem(key(r.id), JSON.stringify(r)); return r;
    }
    return { get, all, put };
  }
  return { PREFIX, STATUS, REASONS, norm, phone, validPhone, day, plus, validDate, closed, leader, canRead, create, edit, tasks, sameClient, contactBlock, contact, message, store };
});
