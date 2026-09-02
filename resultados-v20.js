(() => {
  'use strict';

  const STORE = 'fs_gestao_resultados_v2';
  const LEGACY_STORE = 'fs_gestao_resultados_v1';
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct2 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const efficiencyPct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date();
  const monthDefault = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const moneyFields = new Set(['general', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed']);

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const num = (value) => {
    if (typeof value === 'number') return Math.max(0, Number.isFinite(value) ? value : 0);
    let text = String(value ?? '').trim().replace(/R\$|\s/g, '');
    if (!text) return 0;
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    const parsed = Number(text);
    return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
  };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const sellerIdentity = (seller = {}, index = 0) => {
    if (seller.id) return String(seller.id);
    const slug = String(seller.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `seller-${slug || index + 1}`;
  };
  const monthLabel = (month) => {
    const [year, number] = month.split('-').map(Number);
    return new Date(year, number - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };
  const automaticWeekEnds = (month) => {
    const [year, number] = String(month || monthDefault).split('-').map(Number);
    const days = new Date(year, number, 0).getDate(), firstDay = new Date(year, number - 1, 1).getDay();
    const mondayOffset = (firstDay + 6) % 7;
    const ends = [], firstEnd = Math.min(days, 7 - mondayOffset);
    for (let end = firstEnd; end < days; end += 7) ends.push(end);
    if (ends.at(-1) !== days) ends.push(days);
    return ends;
  };
  const normalizeWeekEnds = (month, raw) => {
    const [year, number] = String(month || monthDefault).split('-').map(Number), days = new Date(year, number, 0).getDate();
    const source = Array.isArray(raw) ? raw : String(raw || '').split(/[,;\s]+/);
    const ends = [...new Set(source.map((value) => Math.round(num(value))).filter((value) => value >= 1 && value <= days))].sort((a, b) => a - b);
    if (!ends.length) return [];
    if (ends.at(-1) !== days) ends.push(days);
    return ends;
  };
  const automaticWeeks = (month) => automaticWeekEnds(month).length;
  const recordKey = (branch, month) => `${String(branch || 'SEM FILIAL').trim().toUpperCase()}|${month}`;
  const baseRecord = (branch = '', month = monthDefault) => ({
    branch, month, businessDays: 25, weeks: automaticWeeks(month), weekEnds: [],
    mercantileGoal: 1220000, grossProfitGoal: 407000,
    eligibleGoal: 0, eligibleGoalConfirmed: false, servicesGoal: 60000, efficiencyGoal: 0.055,
    goals: [1220000, 1220000, 1281000],
    warrantyGoal: 81200, warrantyWeekly: 13300,
    ecommerce: 0, returns: 0, sellerCount: 0,
    auditOwner: '', auditSource: '', auditNote: '', configAudit: [],
    daily: {}, sellers: [], updatedAt: new Date().toISOString()
  });
  const normalizeRecord = (raw = {}) => {
    const legacyGoal = Array.isArray(raw.goals) ? num(raw.goals[0]) : 0;
    const mercantileGoal = num(raw.mercantileGoal) || legacyGoal || 1220000;
    const weekEnds = normalizeWeekEnds(raw.month || monthDefault, raw.weekEnds);
    return {
      ...baseRecord(raw.branch || '', raw.month || monthDefault), ...raw,
      weeks: weekEnds.length || automaticWeeks(raw.month || monthDefault), weekEnds,
      mercantileGoal,
      grossProfitGoal: num(raw.grossProfitGoal) || 407000,
      eligibleGoal: 0,
      eligibleGoalConfirmed: false,
      servicesGoal: num(raw.servicesGoal) || 60000,
      efficiencyGoal: num(raw.efficiencyGoal) || 0.055,
      goals: [mercantileGoal, mercantileGoal, mercantileGoal * 1.05],
      daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : {},
      sellers: Array.isArray(raw.sellers) ? raw.sellers.map((seller, index) => ({
        ...seller,
        id: sellerIdentity(seller, index),
        commissionMercantileRate: Object.prototype.hasOwnProperty.call(seller, 'commissionMercantileRate') ? num(seller.commissionMercantileRate) : (num(seller.general) ? num(seller.commissionMercantile) / num(seller.general) * 100 : 0),
        commissionServiceRate: Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5,
        updatedAt: seller.updatedAt || raw.updatedAt || new Date(0).toISOString()
      })) : [],
      configAudit: Array.isArray(raw.configAudit) ? raw.configAudit : []
    };
  };

  function tierGoals(source = db) {
    const mercantile = num(source.mercantileGoal), gross = num(source.grossProfitGoal);
    return [
      { name: 'Meta 1', mercantile, grossProfit: gross * 0.95, mercPct: 1, grossPct: 0.95 },
      { name: 'Meta 2', mercantile, grossProfit: gross, mercPct: 1, grossPct: 1 },
      { name: 'Meta 3', mercantile: mercantile * 1.05, grossProfit: gross, mercPct: 1.05, grossPct: 1 }
    ];
  }
  function tierRate(tier, mercantileResult, grossProfitResult, grossAvailable = true) {
    const mercRate = tier.mercantile ? num(mercantileResult) / tier.mercantile : 0;
    const grossRate = tier.grossProfit ? num(grossProfitResult) / tier.grossProfit : 0;
    const overall = grossAvailable ? Math.min(mercRate, grossRate) : mercRate;
    return { mercRate, grossRate, grossAvailable, overall, passed: mercRate >= 1 && (!grossAvailable || grossRate >= 1) };
  }
  function configSnapshot(source = db) {
    return {
      businessDays: num(source.businessDays), weeks: num(source.weeks), weekEnds: normalizeWeekEnds(source.month, source.weekEnds), sellerCount: num(source.sellerCount),
      mercantileGoal: num(source.mercantileGoal), grossProfitGoal: num(source.grossProfitGoal),
      servicesGoal: num(source.servicesGoal), efficiencyGoal: num(source.efficiencyGoal), warrantyGoal: num(source.warrantyGoal), warrantyWeekly: num(source.warrantyWeekly)
    };
  }

  function loadVault() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved?.records) return saved;
    } catch (error) { /* use migration/default */ }
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE));
      if (legacy) {
        const record = normalizeRecord(legacy);
        const key = recordKey(record.branch, record.month);
        return { version: 2, currentKey: key, records: { [key]: record } };
      }
    } catch (error) { /* use default */ }
    const record = baseRecord();
    const key = recordKey(record.branch, record.month);
    return { version: 2, currentKey: key, records: { [key]: record } };
  }

  let vault = loadVault();
  if (!Array.isArray(vault.historyEntries)) vault.historyEntries = [];
  let db = normalizeRecord(vault.records[vault.currentKey] || Object.values(vault.records)[0] || baseRecord());
  let activeScope = 'branch';
  let activeSellerProfileId = null;
  let openSellerIndex = null;
  let printSellerOnlyId = null;
  let openDailyKey = null;
  let openWeeklyIndex = null;

  function persist(showState = true) {
    const key = recordKey(db.branch, db.month);
    db.updatedAt = new Date().toISOString();
    vault.currentKey = key;
    vault.records[key] = clone(db);
    localStorage.setItem(STORE, JSON.stringify(vault));
    if (showState) {
      const state = document.getElementById('saveState');
      state.textContent = '✓ Dados salvos neste aparelho';
      state.className = 'save-state';
    }
  }

  function carryRecord(branch, month) {
    return normalizeRecord({
      ...baseRecord(branch, month),
      businessDays: db.businessDays, weeks: automaticWeeks(month), weekEnds: [],
      mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal,
      servicesGoal: db.servicesGoal, efficiencyGoal: db.efficiencyGoal,
      warrantyGoal: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly,
      sellerCount: db.sellerCount, auditOwner: db.auditOwner, auditSource: db.auditSource,
      sellers: db.sellers.map((seller, index) => ({ id: sellerIdentity(seller, index), name: seller.name || '', assignedGoal: num(seller.assignedGoal), plannedDays: num(seller.plannedDays) || num(db.businessDays), commissionMercantileRate: num(seller.commissionMercantileRate), commissionServiceRate: Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5, general: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, nfs: 0, days: 0, justifiedDays: 0, notes: '', commitment: '', deadline: '', updatedAt: new Date().toISOString() }))
    });
  }

  function switchContext(branch, month, keepCurrentData = false) {
    persist(false);
    const nextKey = recordKey(branch, month);
    if (vault.records[nextKey]) db = normalizeRecord(vault.records[nextKey]);
    else if (keepCurrentData) db = normalizeRecord({ ...clone(db), branch, month });
    else db = carryRecord(branch, month);
    activeScope = 'branch';
    persist();
    renderAll();
  }

  function isoDate(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  function monthParts() {
    const [year, month] = db.month.split('-').map(Number);
    return { year, month, days: new Date(year, month, 0).getDate() };
  }
  function emptyDay(key) {
    return { status: new Date(`${key}T12:00:00`).getDay() === 0 ? 'off' : 'pending', goalPercent: 0, general: 0, grossProfit: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, nfs: 0 };
  }
  function dayData(key) { return db.daily[key] || emptyDay(key); }
  function allDays() {
    const { year, month, days } = monthParts();
    return Array.from({ length: days }, (_, index) => {
      const key = isoDate(year, month, index + 1);
      return { key, date: new Date(`${key}T12:00:00`), data: dayData(key) };
    });
  }
  function hasCompleteGrossProfit(items = allDays()) {
    const launchedSales = items.map((item) => item.data || item).filter((day) => day.status === 'done' && num(day.general) > 0);
    return launchedSales.length > 0 && launchedSales.every((day) => num(day.grossProfit) > 0);
  }
  function isWorked(day) { return day.status === 'done'; }
  function aggregate(list = allDays().map((item) => item.data)) {
    return list.reduce((total, day) => {
      total.general += num(day.general); total.grossProfit += num(day.grossProfit); total.eligible += num(day.eligible);
      total.warranty += num(day.warranty); total.other += num(day.other); total.mixed += num(day.mixed);
      total.nfs += num(day.nfs); if (isWorked(day)) total.worked += 1;
      return total;
    }, { general: 0, grossProfit: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, nfs: 0, worked: 0 });
  }
  function calculate() {
    const days = allDays().map((item) => item.data);
    const result = aggregate(days);
    result.services = result.warranty + result.other + result.mixed;
    result.revenue = result.general + num(db.ecommerce);
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    const dailyTickets = days.filter((day) => num(day.nfs) > 0).map((day) => num(day.general) / num(day.nfs));
    result.ticket = dailyTickets.length ? dailyTickets.reduce((sum, value) => sum + value, 0) / dailyTickets.length : 0;
    result.remaining = Math.max(0, num(db.businessDays) - result.worked);
    result.storeDailyAvg = result.worked ? result.general / result.worked : 0;
    result.dailyAvg = result.worked ? result.revenue / result.worked : 0;
    result.projection = result.storeDailyAvg * num(db.businessDays) + num(db.ecommerce);
    result.grossProfitDaily = result.worked ? result.grossProfit / result.worked : 0;
    result.grossProfitProjection = result.grossProfitDaily * num(db.businessDays);
    result.servicesDaily = result.worked ? result.services / result.worked : 0;
    result.servicesProjection = result.servicesDaily * num(db.businessDays);
    result.warrantyDaily = result.worked ? result.warranty / result.worked : 0;
    result.warrantyProjection = result.warrantyDaily * num(db.businessDays);
    return result;
  }
  function grossProfitRate() { return num(db.mercantileGoal) ? num(db.grossProfitGoal) / num(db.mercantileGoal) : 0; }
  function sellerScopeResult(seller) {
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const planned = num(seller.plannedDays) || num(db.businessDays);
    const worked = num(seller.days), revenue = num(seller.general), dailyAvg = worked ? revenue / worked : 0;
    const projection = dailyAvg * planned, referenceRate = grossProfitRate();
    return {
      general: revenue, revenue, grossProfit: revenue * referenceRate, eligible: num(seller.eligible), warranty: num(seller.warranty), other: num(seller.other), mixed: num(seller.mixed),
      services, nfs: num(seller.nfs), worked, remaining: Math.max(0, planned - worked), dailyAvg, projection,
      grossProfitProjection: projection * referenceRate, servicesProjection: worked ? services / worked * planned : 0,
      efficiency: num(seller.eligible) ? services / num(seller.eligible) : 0, ticket: num(seller.nfs) ? revenue / num(seller.nfs) : 0
    };
  }
  function scopeGoalSource() {
    if (activeScope === 'branch') return db;
    let mercantile = 0;
    if (activeScope === 'all') mercantile = db.sellers.reduce((sum, seller) => sum + sellerMetrics(seller).individualGoal, 0);
    else {
      const seller = db.sellers[Number(activeScope.split(':')[1])];
      mercantile = seller ? sellerMetrics(seller).individualGoal : 0;
    }
    const share = num(db.mercantileGoal) ? mercantile / num(db.mercantileGoal) : 0;
    return {
      ...db, mercantileGoal: mercantile, grossProfitGoal: mercantile * grossProfitRate(),
      servicesGoal: num(db.servicesGoal) * share,
      warrantyGoal: num(db.warrantyGoal) * share
    };
  }
  function currentScope() {
    if (activeScope === 'branch') return { type: 'branch', label: db.branch || 'Filial', result: calculate(), goals: db };
    if (activeScope.startsWith('seller:')) {
      const seller = db.sellers[Number(activeScope.split(':')[1])];
      if (seller) return { type: 'seller', label: seller.name || 'Vendedor sem nome', result: sellerScopeResult(seller), goals: scopeGoalSource() };
      activeScope = 'branch'; return currentScope();
    }
    const results = db.sellers.map(sellerScopeResult);
    const result = results.reduce((total, item) => {
      ['general', 'revenue', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed', 'services', 'nfs', 'worked', 'remaining', 'projection', 'grossProfitProjection', 'servicesProjection'].forEach((field) => { total[field] += num(item[field]); });
      return total;
    }, { general: 0, revenue: 0, grossProfit: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, services: 0, nfs: 0, worked: 0, remaining: 0, projection: 0, grossProfitProjection: 0, servicesProjection: 0 });
    result.dailyAvg = result.worked ? result.revenue / result.worked : 0;
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    result.ticket = result.nfs ? result.revenue / result.nfs : 0;
    return { type: 'all', label: 'Todos os vendedores', result, goals: scopeGoalSource() };
  }
  function renderScopeSelector() {
    const select = document.getElementById('scopeQuick'); if (!select) return;
    const options = [`<option value="branch">${esc(db.branch || 'Filial não informada')} — Filial</option>`];
    if (db.sellers.length) options.push('<option value="all">Todos os vendedores</option>');
    db.sellers.forEach((seller, index) => options.push(`<option value="seller:${index}">${esc(seller.name || `Vendedor ${index + 1}`)}</option>`));
    select.innerHTML = options.join('');
    if (![...select.options].some((option) => option.value === activeScope)) activeScope = 'branch';
    select.value = activeScope;
  }
  function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
  function clampRate(value) { return Math.max(0, Math.min(100, value * 100)); }
  function statusClass(value) { return value >= 1 ? 'positive' : value >= 0.85 ? 'warning' : 'negative'; }
  function configuredSellerCount() {
    return Math.max(Math.round(num(db.sellerCount)), db.sellers.filter((seller) => seller.name?.trim()).length);
  }
  function dailyGoalMetrics(key, source = dayData(key)) {
    const percent = num(source.goalPercent);
    const branchGoal = num(db.mercantileGoal) * percent / 100;
    const serviceGoal = branchGoal * 0.07;
    const namedSellers = db.sellers.map((seller) => String(seller.name || '').trim()).filter(Boolean);
    const sellerCount = Math.max(Math.round(num(db.sellerCount)), namedSellers.length);
    const sellerNames = namedSellers.slice(0, sellerCount);
    while (sellerNames.length < sellerCount) sellerNames.push(`Vendedor ${sellerNames.length + 1}`);
    const perSeller = sellerCount ? branchGoal / sellerCount : 0;
    const servicePerSeller = sellerCount ? serviceGoal / sellerCount : 0;
    const actualServices = num(source.warranty) + num(source.other) + num(source.mixed);
    return { key, percent, branchGoal, serviceGoal, sellerCount, sellerNames, perSeller, servicePerSeller, actualServices };
  }
  function dayReachedPrimaryGoal(data) {
    if (data.status !== 'done') return false;
    if (num(data.goalPercent) > 0) {
      const daily = dailyGoalMetrics('', data);
      return num(data.general) >= daily.branchGoal && daily.actualServices >= daily.serviceGoal;
    }
    const tier = tierGoals()[0], days = Math.max(1, num(db.businessDays));
    const mercantileReached = num(data.general) >= tier.mercantile / days;
    return mercantileReached && (!num(data.grossProfit) || num(data.grossProfit) >= tier.grossProfit / days);
  }

  function selectedDailyGoalDate() {
    const input = document.getElementById('dailyGoalDate');
    const first = `${db.month}-01`, last = `${db.month}-${String(monthParts().days).padStart(2, '0')}`;
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (!input.value || input.value < first || input.value > last) input.value = todayKey.startsWith(`${db.month}-`) ? todayKey : first;
    input.min = first; input.max = last;
    return input.value;
  }
  function renderDailyGoalSummary(metrics) {
    document.getElementById('dailyGoalSummary').innerHTML = `
      <div class="daily-goal-metric highlight"><span>META DA FILIAL NO DIA</span><strong>${brl.format(metrics.branchGoal)}</strong></div>
      <div class="daily-goal-metric"><span>META DE SERVIÇOS/GARANTIA (7%)</span><strong>${brl.format(metrics.serviceGoal)}</strong></div>
      <div class="daily-goal-metric"><span>META POR VENDEDOR</span><strong>${metrics.sellerCount ? brl.format(metrics.perSeller) : 'Cadastre a equipe'}</strong></div>
      <div class="daily-goal-metric"><span>SERVIÇOS/GARANTIA POR VENDEDOR</span><strong>${metrics.sellerCount ? brl.format(metrics.servicePerSeller) : 'Cadastre a equipe'}</strong></div>`;
    document.getElementById('dailyGoalTeam').innerHTML = metrics.sellerCount
      ? `<strong>Média automática por vendedor:</strong> ${brl.format(metrics.perSeller)} de mercantil e ${brl.format(metrics.servicePerSeller)} de serviços/garantia (7%) para cada um, considerando ${metrics.sellerCount} vendedor(es).`
      : '<strong>Equipe ainda não configurada.</strong> Informe a quantidade de vendedores em Configuração ou cadastre os nomes na aba Vendedores.';
    const key = selectedDailyGoalDate(), greeting = timeGreeting(), message = missionMessage({ id: db.branch || 'filial', name: 'Equipe' }, key, 'positive');
    document.getElementById('dailyGoalMotivation').innerHTML = `<strong>${greeting}, equipe!</strong><br>${esc(message)}<br><small>Mensagem exclusiva para ${new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR')}.</small>`;
    document.getElementById('downloadDailyGoal').disabled = !metrics.percent;
  }
  function renderDailyGoalPlanner() {
    const key = selectedDailyGoalDate(), metrics = dailyGoalMetrics(key);
    const percentInput = document.getElementById('dailyGoalPercent');
    percentInput.value = metrics.percent || '';
    renderDailyGoalSummary(metrics);
  }
  function previewDailyGoalFromPlanner() {
    const key = selectedDailyGoalDate(), data = { ...dayData(key), goalPercent: num(document.getElementById('dailyGoalPercent').value) };
    db.daily[key] = data;
    persist(false);
    renderDailyGoalSummary(dailyGoalMetrics(key, data));
  }
  function saveDailyGoalFromPlanner() {
    const key = selectedDailyGoalDate(), data = { ...dayData(key) };
    data.goalPercent = num(document.getElementById('dailyGoalPercent').value);
    db.daily[key] = data; persist(); renderAll();
  }
  function roundedCanvasRect(ctx, x, y, width, height, radius = 24) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }
  function fitCanvasFont(ctx, text, maxWidth, weight = 800, startSize = 23, minSize = 14) {
    let size = startSize; ctx.font = `${weight} ${size}px Arial, sans-serif`;
    while (size > minSize && ctx.measureText(String(text)).width > maxWidth) { size -= 1; ctx.font = `${weight} ${size}px Arial, sans-serif`; }
  }
  function drawCanvasMetric(ctx, x, y, width, height, label, value, accent = false, note = '') {
    ctx.fillStyle = accent ? '#e3f2ff' : '#f4f7fc'; roundedCanvasRect(ctx, x, y, width, height, 24); ctx.fill();
    const compact = height <= 105, labelY = y + (compact ? 27 : 32), valueY = y + (compact ? 70 : note ? 80 : 86);
    ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, String(label).toUpperCase(), width - 56, 800, compact ? 18 : 20, 11); ctx.fillText(String(label).toUpperCase(), x + 28, labelY);
    ctx.fillStyle = '#102a43'; fitCanvasFont(ctx, value, width - 56, 900, compact ? 31 : 36, 19); ctx.fillText(value, x + 28, valueY);
    if (note) { ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, note, width - 56, 600, 16, 11); ctx.fillText(note, x + 28, y + height - 14); }
  }
  function drawCenteredCanvasMetric(ctx, x, y, width, height, label, value, accent = false, note = '') {
    ctx.fillStyle = accent ? '#e3f2ff' : '#f4f7fc'; roundedCanvasRect(ctx, x, y, width, height, 24); ctx.fill();
    ctx.textAlign = 'center';
    const compact = height <= 105, labelY = y + (compact ? 27 : 32), valueY = y + (compact ? 70 : note ? 80 : 86);
    ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, String(label).toUpperCase(), width - 48, 800, compact ? 18 : 20, 11); ctx.fillText(String(label).toUpperCase(), x + width / 2, labelY);
    ctx.fillStyle = '#102a43'; fitCanvasFont(ctx, value, width - 48, 900, compact ? 31 : 36, 19); ctx.fillText(value, x + width / 2, valueY);
    if (note) { ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, note, width - 48, 600, 16, 11); ctx.fillText(note, x + width / 2, y + height - 14); }
    ctx.textAlign = 'left';
  }
  function drawWrappedCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/); let line = '', lines = [];
    words.forEach((word) => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; });
    if (line) lines.push(line); lines = lines.slice(0, maxLines);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  }
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.')), 'image/png'));
  }
  async function shareOrDownloadImage(canvas, filename, title) {
    const blob = await canvasToBlob(canvas), file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    } catch (error) { if (error.name === 'AbortError') return; }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1200);
  }
  function imageHeader(ctx, title, subtitle, width, centered = false) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, '#0879e8'); gradient.addColorStop(1, '#6b4ce6');
    ctx.fillStyle = gradient; roundedCanvasRect(ctx, 54, 50, width - 108, 220, 38); ctx.fill();
    const textX = centered ? width / 2 : 92; ctx.textAlign = centered ? 'center' : 'left';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 53px Arial, sans-serif'; ctx.fillText(title, textX, 139);
    ctx.font = '600 25px Arial, sans-serif'; ctx.fillText(subtitle, textX, 198); ctx.textAlign = 'left';
  }
  async function exportDailyGoalImage(key) {
    const data = dayData(key), metrics = dailyGoalMetrics(key, data);
    if (!metrics.percent) { alert('Informe o percentual da meta deste dia antes de baixar.'); return; }
    const date = new Date(`${key}T12:00:00`), services = metrics.actualServices;
    const efficiency = num(data.eligible) ? services / num(data.eligible) : 0;
    const goalRate = metrics.branchGoal ? num(data.general) / metrics.branchGoal : 0;
    const serviceRate = metrics.serviceGoal ? services / metrics.serviceGoal : 0;
    const ticket = num(data.nfs) ? num(data.general) / num(data.nfs) : 0;
    const greeting = timeGreeting(), motivationalText = missionMessage({ id: db.branch || 'filial', name: 'Equipe' }, key, 'positive');
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    imageHeader(ctx, 'META DO DIA - FILIAL', `${db.branch || 'Filial não informada'}  |  ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`, canvas.width);
    ctx.fillStyle = '#102a43'; ctx.font = '900 31px Arial, sans-serif'; ctx.fillText('Missão do dia', 64, 334);
    const percentText = `${metrics.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    drawCanvasMetric(ctx, 64, 365, 296, 142, 'Percentual do dia', percentText);
    drawCanvasMetric(ctx, 392, 365, 296, 142, 'Meta mercantil', brl.format(metrics.branchGoal), true);
    drawCanvasMetric(ctx, 720, 365, 296, 142, 'Serviços/garantia 7%', brl.format(metrics.serviceGoal));
    ctx.fillStyle = '#102a43'; ctx.font = '900 31px Arial, sans-serif'; ctx.fillText('Média por vendedor', 64, 568);
    drawCanvasMetric(ctx, 64, 598, 460, 154, 'Mercantil por vendedor', metrics.sellerCount ? brl.format(metrics.perSeller) : 'Equipe não cadastrada', true, metrics.sellerCount ? `${metrics.sellerCount} vendedor(es)` : '');
    drawCanvasMetric(ctx, 556, 598, 460, 154, 'Serviços/garantia por vendedor', metrics.sellerCount ? brl.format(metrics.servicePerSeller) : 'Equipe não cadastrada', false, 'Sempre 7% da meta mercantil');
    ctx.fillStyle = '#102a43'; ctx.font = '900 31px Arial, sans-serif'; ctx.fillText('Resultado registrado no dia', 64, 815);
    const results = [
      ['Venda mercantil', brl.format(num(data.general)), pct.format(goalRate)], ['Venda elegível', brl.format(num(data.eligible)), 'Base da eficiência'],
      ['Serviços realizados', brl.format(services), `${pct.format(serviceRate)} da missão`], ['Eficiência', efficiencyPct.format(efficiency), 'Serviços ÷ elegível'],
      ['Ticket médio', brl.format(ticket), `${num(data.nfs)} nota(s)`], ['Situação', data.status === 'done' ? 'Lançado' : data.status === 'off' ? 'Não trabalha' : 'Pendente', 'Atualização do dia']
    ];
    results.forEach(([label, value, note], index) => { const col = index % 3, row = Math.floor(index / 3); drawCanvasMetric(ctx, 64 + col * 328, 846 + row * 174, 296, 148, label, value, index === 0, note); });
    ctx.fillStyle = '#edf7ff'; roundedCanvasRect(ctx, 64, 1205, 952, 270, 28); ctx.fill();
    ctx.fillStyle = '#0879e8'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText(`${greeting}, equipe!`, 94, 1260);
    ctx.fillStyle = '#203a56'; ctx.font = '800 25px Arial, sans-serif'; drawWrappedCanvasText(ctx, motivationalText, 94, 1310, 882, 34, 4);
    ctx.fillStyle = '#526175'; ctx.font = '700 20px Arial, sans-serif'; ctx.fillText('Vamos juntos cumprir a missão do dia!', 94, 1435);
    ctx.fillStyle = '#748296'; ctx.font = '600 18px Arial, sans-serif'; ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`, 64, 1560);
    const safeBranch = String(db.branch || 'filial').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    await shareOrDownloadImage(canvas, `meta-diaria-${safeBranch || 'filial'}-${key}.png`, `Meta do dia - ${date.toLocaleDateString('pt-BR')}`);
  }

  function dailyIssues() {
    const issues = [];
    allDays().forEach(({ key, date, data }) => {
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const hasValue = ['general', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed', 'nfs'].some((field) => num(data[field]) > 0);
      if (num(data.eligible) > num(data.general)) issues.push(`${label}: venda elegível maior que a venda geral.`);
      if (num(data.grossProfit) > num(data.general)) issues.push(`${label}: lucro bruto maior que a venda mercantil.`);
      if (data.status === 'done' && num(data.general) > 0 && num(data.nfs) === 0) issues.push(`${label}: informe a quantidade de NFs.`);
      if (data.status === 'off' && hasValue) issues.push(`${label}: dia sem trabalho possui valores.`);
      if (data.status === 'pending' && date < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && key.slice(0, 7) === monthDefault) issues.push(`${label}: dia anterior ainda está pendente.`);
    });
    return issues;
  }

  function renderOverview() {
    const scope = currentScope(), result = scope.result, goalSource = scope.goals;
    const grossAvailable = scope.type !== 'branch' || hasCompleteGrossProfit();
    setText('heroEyebrow', scope.type === 'branch' ? 'Venda mercantil total da filial' : scope.type === 'all' ? 'Venda mercantil total dos vendedores' : `Venda mercantil total — ${scope.label}`);
    setText('revenueHero', brl.format(result.revenue)); setText('workedHero', result.worked); setText('remainingHero', result.remaining);
    setText('dailyHero', brl.format(result.dailyAvg)); setText('projectionHero', brl.format(result.projection));
    setText('eligibleKpi', brl.format(result.eligible)); setText('servicesKpi', brl.format(result.services));
    setText('grossProfitKpiLabel', scope.type === 'branch' ? 'Lucro bruto' : 'Lucro bruto de referência');
    setText('grossProfitKpi', grossAvailable ? brl.format(result.grossProfit) : 'Não informado');
    setText('grossProfitKpiSub', scope.type === 'branch' ? (grossAvailable ? `${pct.format(num(goalSource.grossProfitGoal) ? result.grossProfit / num(goalSource.grossProfitGoal) : 0)} da meta de lucro` : 'Não interfere no percentual mercantil') : `${pct2.format(grossProfitRate())} da venda mercantil`);
    const conversion = result.eligible ? result.services / result.eligible : 0;
    setText('efficiencyKpi', efficiencyPct.format(result.efficiency)); setText('conversionKpi', result.eligible ? efficiencyPct.format(conversion) : 'Não calculada'); setText('ticketKpi', brl.format(result.ticket));
    setText('nfKpi', `${result.nfs.toLocaleString('pt-BR')} notas fiscais • média dos tickets diários`);
    const tiers = tierGoals(goalSource), firstGoal = tiers[0].mercantile;
    const projectedRate = firstGoal ? result.projection / firstGoal : 0;
    const projectedGrossRate = tiers[0].grossProfit ? result.grossProfitProjection / tiers[0].grossProfit : 0;
    setText('projectionText', result.worked ? (grossAvailable ? `Projeção da Meta 1: mercantil ${pct.format(projectedRate)} • lucro bruto ${pct.format(projectedGrossRate)}.` : `Projeção da Meta 1 mercantil: ${pct.format(projectedRate)} • lucro bruto não informado.`) : 'Preencha os resultados diários para calcular.');
    document.getElementById('projectionBar').style.width = `${clampRate(projectedRate)}%`;
    document.getElementById('goalGrid').innerHTML = tiers.map((tier) => {
      const rates = tierRate(tier, result.revenue, result.grossProfit, grossAvailable);
      const missingMerc = Math.max(0, tier.mercantile - result.revenue), missingGross = Math.max(0, tier.grossProfit - result.grossProfit);
      const needMerc = result.remaining ? missingMerc / result.remaining : 0, needGross = result.remaining ? missingGross / result.remaining : 0;
      const grossStatus = grossAvailable ? pct.format(rates.grossRate) : 'Não informado';
      const grossMissing = grossAvailable ? brl.format(missingGross) : '—';
      const grossNeed = grossAvailable ? brl.format(needGross) : '—';
      return `<article class="goal ${rates.passed ? 'goal-pass' : ''}"><div class="goal-head"><div><div class="goal-title">${tier.name}</div><div class="goal-subtitle">${grossAvailable ? `${pct.format(tier.mercPct)} mercantil + ${pct.format(tier.grossPct)} lucro bruto` : `${pct.format(tier.mercPct)} mercantil • lucro bruto não informado`}</div></div><span class="pill ${statusClass(rates.overall)}">${rates.passed ? '✓ Atingida' : pct.format(rates.overall)}</span></div><div class="bar"><span style="width:${clampRate(rates.overall)}%"></span></div><dl class="goal-dual"><dt></dt><dd class="goal-col-head">Mercantil</dd><dd class="goal-col-head">Lucro bruto</dd><dt>Objetivo</dt><dd>${brl.format(tier.mercantile)}</dd><dd>${brl.format(tier.grossProfit)}</dd><dt>Atingimento</dt><dd class="${statusClass(rates.mercRate)}">${pct.format(rates.mercRate)}</dd><dd class="${grossAvailable ? statusClass(rates.grossRate) : ''}">${grossStatus}</dd><dt>Falta</dt><dd class="${missingMerc ? 'negative' : 'positive'}">${brl.format(missingMerc)}</dd><dd class="${grossAvailable ? (missingGross ? 'negative' : 'positive') : ''}">${grossMissing}</dd><dt>Necessário/dia</dt><dd>${brl.format(needMerc)}</dd><dd>${grossNeed}</dd></dl></article>`;
    }).join('');
    const servicesRate = num(goalSource.servicesGoal) ? result.services / num(goalSource.servicesGoal) : 0;
    setText('servicesRate', pct.format(servicesRate)); document.getElementById('servicesRate').className = `pill ${statusClass(servicesRate)}`;
    setText('servicesCurrent', brl.format(result.services)); setText('servicesGoal', brl.format(num(goalSource.servicesGoal)));
    setText('servicesProjection', `Projeção: ${brl.format(result.servicesProjection)} • ${pct.format(num(goalSource.servicesGoal) ? result.servicesProjection / num(goalSource.servicesGoal) : 0)} da meta`);
    document.getElementById('servicesBar').style.width = `${clampRate(servicesRate)}%`;
    const sellerCount = scope.type === 'seller' ? 1 : configuredSellerCount();
    const plannedDays = Math.max(1, num(scope.type === 'seller' ? result.worked + result.remaining : db.businessDays));
    const mercantileGap = Math.max(0, firstGoal - result.revenue);
    const servicesGap = Math.max(0, num(goalSource.servicesGoal) - result.services);
    const gapMetric = (label, value, note, type = 'mercantile') => `<div class="monthly-gap-metric ${type}"><span>${label}</span><strong class="${value ? 'negative' : 'positive'}">${brl.format(value)}</strong><small>${note}</small></div>`;
    document.getElementById('monthlyGapGrid').innerHTML = [
      gapMetric('Falta mercantil total', mercantileGap, `Meta 1: ${brl.format(firstGoal)}`),
      gapMetric('Mercantil / dia da filial', mercantileGap / plannedDays, `${plannedDays} dia(s) planejado(s)`),
      gapMetric('Mercantil / vendedor', sellerCount ? mercantileGap / sellerCount : 0, sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe'),
      gapMetric('Mercantil / dia / vendedor', sellerCount ? mercantileGap / plannedDays / sellerCount : 0, sellerCount ? `Divisão diária para ${sellerCount}` : 'Configure a equipe'),
      gapMetric('Falta serviços total', servicesGap, `Meta: ${brl.format(num(goalSource.servicesGoal))}`, 'services'),
      gapMetric('Serviços / dia da filial', servicesGap / plannedDays, `${plannedDays} dia(s) planejado(s)`, 'services'),
      gapMetric('Serviços / vendedor', sellerCount ? servicesGap / sellerCount : 0, sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe', 'services'),
      gapMetric('Serviços / dia / vendedor', sellerCount ? servicesGap / plannedDays / sellerCount : 0, sellerCount ? `Divisão diária para ${sellerCount}` : 'Configure a equipe', 'services')
    ].join('');
    const detailLayout = document.getElementById('overviewDetailLayout');
    const ecommercePanel = document.getElementById('ecommerceOverview');
    const showEcommerce = scope.type === 'branch';
    detailLayout.classList.toggle('without-ecommerce', !showEcommerce);
    ecommercePanel.hidden = !showEcommerce;
    if (showEcommerce) {
      const ecommerce = num(db.ecommerce), consolidated = result.revenue;
      setText('storeSalesOverview', brl.format(result.general));
      setText('ecommerceSalesOverview', brl.format(ecommerce));
      setText('consolidatedSalesOverview', brl.format(consolidated));
      setText('consolidatedDailyOverview', brl.format(result.dailyAvg));
      document.getElementById('ecommerceGoalBars').innerHTML = tiers.map((tier) => {
        const rate = tier.mercantile ? consolidated / tier.mercantile : 0;
        return `<div class="commerce-bar-row"><div><strong>${tier.name}</strong><span>${pct.format(rate)}</span></div><div class="bar"><span style="width:${clampRate(rate)}%"></span></div><small>${brl.format(consolidated)} de ${brl.format(tier.mercantile)}</small></div>`;
      }).join('');
    }
    const messages = [];
    if (!db.branch) messages.push('Informe a filial antes de fechar ou imprimir o resultado.');
    if (!result.worked) messages.push('Comece pelo lançamento diário para ativar as análises.');
    else {
      const achieved = tiers.filter((tier) => tierRate(tier, result.revenue, result.grossProfit, grossAvailable).passed).at(-1);
      messages.push(achieved ? `${scope.label} já atingiu a ${achieved.name}${grossAvailable ? ' nos dois critérios' : ' pelo resultado mercantil'}.` : grossAvailable ? `Meta 1 pendente: faltam ${brl.format(Math.max(0, firstGoal - result.revenue))} em mercantil e ${brl.format(Math.max(0, tiers[0].grossProfit - result.grossProfit))} em lucro bruto${scope.type === 'branch' ? '' : ' de referência'}.` : `Meta 1 mercantil pendente: faltam ${brl.format(Math.max(0, firstGoal - result.revenue))}. Lucro bruto não informado.`);
      messages.push(grossAvailable ? (result.projection >= firstGoal && result.grossProfitProjection >= tiers[0].grossProfit ? 'O ritmo atual projeta fechamento dentro da Meta 1.' : 'A projeção ainda não atende aos dois critérios da Meta 1.') : (result.projection >= firstGoal ? 'O ritmo atual projeta fechamento dentro da Meta 1 mercantil.' : 'A projeção mercantil ainda está abaixo da Meta 1.'));
      messages.push(`Eficiência: ${efficiencyPct.format(result.efficiency)} • meta: ${efficiencyPct.format(num(db.efficiencyGoal))}.`);
    }
    const issues = dailyIssues(); if (issues.length) messages.push(`${issues.length} pendência(s) precisam de revisão no lançamento diário.`);
    document.getElementById('insights').innerHTML = messages.map((message, index) => `<div class="metric" style="margin-bottom:8px"><span>${index === 0 ? 'ATENÇÃO' : index === 1 ? 'STATUS' : 'ANÁLISE'}</span><strong>${esc(message)}</strong></div>`).join('');
  }

  function moneyInput(field, value, key, disabled = false) {
    return `<input class="money-input" data-f="${field}" inputmode="decimal" type="text" value="${value ? esc(brl.format(value)) : ''}" aria-label="${field} em ${key}" ${disabled ? 'disabled' : ''}>`;
  }
  function statusSelect(data) {
    return `<select class="status-${data.status}" data-f="status"><option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pendente</option><option value="done" ${data.status === 'done' ? 'selected' : ''}>✓ Lançado</option><option value="off" ${data.status === 'off' ? 'selected' : ''}>Não trabalha</option></select>`;
  }
  function renderDaily() {
    const rows = allDays();
    renderDailyGoalPlanner();
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    document.getElementById('dailyBody').innerHTML = rows.map(({ key, date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed);
      const efficiency = num(data.eligible) ? services / num(data.eligible) : 0;
      const ticket = num(data.nfs) ? num(data.general) / num(data.nfs) : 0;
      const disabled = data.status === 'off';
      const reached = dayReachedPrimaryGoal(data);
      const classes = [disabled ? 'day-off' : '', key === todayKey ? 'today-row' : '', reached ? 'goal-hit' : ''].join(' ');
      const dailyGoal = dailyGoalMetrics(key, data);
      return `<tr class="${classes}" data-date="${key}"><td><strong>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</strong><br><span class="muted">${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>${dailyGoal.percent ? `<span class="day-goal-table-note">${dailyGoal.percent.toLocaleString('pt-BR')}% · ${brl.format(dailyGoal.branchGoal)}</span><button class="day-goal-table-btn" data-daily-export="${key}">Imagem do dia</button>` : ''}${reached ? '<br><span class="goal-hit-badge">Meta dia ✓</span>' : ''}</td><td>${statusSelect(data)}</td>${['general', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed'].map((field) => `<td>${moneyInput(field, num(data[field]), key, disabled)}</td>`).join('')}<td class="derived">${brl.format(services)}</td><td class="derived ${statusClass(num(db.efficiencyGoal) ? efficiency / num(db.efficiencyGoal) : 0)}">${efficiencyPct.format(efficiency)}</td><td><input data-f="nfs" inputmode="numeric" type="number" min="0" step="1" value="${num(data.nfs) || ''}" ${disabled ? 'disabled' : ''}></td><td class="derived">${brl.format(ticket)}</td></tr>`;
    }).join('');
    document.getElementById('dailyCards').innerHTML = rows.map(({ key, date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed);
      const efficiency = num(data.eligible) ? services / num(data.eligible) : 0;
      const ticket = num(data.nfs) ? num(data.general) / num(data.nfs) : 0;
      const disabled = data.status === 'off', reached = dayReachedPrimaryGoal(data);
      const dailyGoal = dailyGoalMetrics(key, data), isOpen = openDailyKey === key;
      return `<article class="day-card ${isOpen ? 'is-open' : ''} ${disabled ? 'day-off' : ''} ${key === todayKey ? 'today-row' : ''} ${reached ? 'goal-hit' : ''}" data-date="${key}"><div class="day-card-head"><button class="day-card-toggle" type="button" aria-expanded="${isOpen}" aria-controls="day-content-${key}"><div class="day-card-title"><strong>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</strong><span>${date.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>${reached ? '<span class="goal-hit-badge">Meta dia atingida ✓</span>' : ''}</div><span class="day-card-chevron" aria-hidden="true">⌄</span></button>${statusSelect(data)}</div><div class="day-card-content" id="day-content-${key}" ${isOpen ? '' : 'hidden'}><div class="day-goal-strip"><div><label>Percentual do dia (%)</label><input data-f="goalPercent" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${dailyGoal.percent || ''}" placeholder="Ex.: 3,51"></div><div class="day-goal-mini"><span>META FILIAL</span><strong>${brl.format(dailyGoal.branchGoal)}</strong></div><div class="day-goal-mini"><span>SERVIÇOS 7%</span><strong>${brl.format(dailyGoal.serviceGoal)}</strong></div><div class="day-goal-mini"><span>POR VENDEDOR</span><strong>${dailyGoal.sellerCount ? brl.format(dailyGoal.perSeller) : '—'}</strong></div><button class="btn small day-goal-export" data-daily-export="${key}" ${dailyGoal.percent ? '' : 'disabled'}>Baixar imagem HD</button></div><div class="day-card-grid">${[['general', 'Venda mercantil'], ['grossProfit', 'Lucro bruto'], ['eligible', 'Venda elegível'], ['warranty', 'Garantia'], ['other', 'Outros serviços'], ['mixed', 'Presta-mista']].map(([field, label]) => `<div class="day-card-field"><label>${label}</label>${moneyInput(field, num(data[field]), key, disabled)}</div>`).join('')}<div class="day-card-field"><label>Notas fiscais</label><input data-f="nfs" inputmode="numeric" type="number" min="0" step="1" value="${num(data.nfs) || ''}" ${disabled ? 'disabled' : ''}></div></div><div class="day-card-results"><div><span>SERVIÇOS</span><strong>${brl.format(services)}</strong></div><div><span>EFICIÊNCIA</span><strong class="${statusClass(num(db.efficiencyGoal) ? efficiency / num(db.efficiencyGoal) : 0)}">${efficiencyPct.format(efficiency)}</strong></div><div><span>TICKET</span><strong>${brl.format(ticket)}</strong></div></div></div></article>`;
    }).join('');
    bindDailyInputs(document.getElementById('dailyBody'));
    bindDailyInputs(document.getElementById('dailyCards'));
    document.querySelectorAll('.day-card-toggle').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-date]');
      openDailyKey = openDailyKey === card.dataset.date ? null : card.dataset.date;
      renderDaily();
      if (openDailyKey) document.querySelector(`.day-card[data-date="${openDailyKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    document.querySelectorAll('[data-daily-export]').forEach((button) => button.addEventListener('click', () => exportDailyGoalImage(button.dataset.dailyExport)));
    const issues = dailyIssues();
    const box = document.getElementById('dailyValidation');
    box.classList.toggle('show', issues.length > 0);
    box.innerHTML = issues.length ? `<strong>Revise ${issues.length} pendência(s):</strong><br>${issues.slice(0, 5).map(esc).join('<br>')}${issues.length > 5 ? `<br>+ ${issues.length - 5} outra(s)` : ''}` : '';
  }
  function bindMoneyBehavior(input) {
    if (!input || input.dataset.moneyBound) return;
    input.dataset.moneyBound = '1';
    input.addEventListener('focus', () => { const value = num(input.value); input.value = value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; input.select(); });
    input.addEventListener('blur', () => { const value = num(input.value); input.value = value ? brl.format(value) : ''; });
  }
  function bindDailyInputs(container) {
    container.querySelectorAll('.money-input').forEach(bindMoneyBehavior);
    container.querySelectorAll('[data-f]').forEach((element) => {
      element.addEventListener('change', (event) => {
        const holder = event.target.closest('[data-date]');
        const key = holder.dataset.date, field = event.target.dataset.f;
        const data = { ...dayData(key) };
        if (field === 'status') {
          data.status = event.target.value;
          if (data.status === 'off') ['general', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed', 'nfs'].forEach((item) => { data[item] = 0; });
        } else {
          data[field] = field === 'nfs' ? Math.round(num(event.target.value)) : num(event.target.value);
          if (data.status === 'pending' && field !== 'goalPercent') data.status = 'done';
        }
        db.daily[key] = data; persist(); renderAll();
      });
    });
  }

  function weekBuckets() {
    return calendarWeekBuckets(allDays(), db.weekEnds);
  }
  function calendarWeekBuckets(days, customEnds = []) {
    const ends = normalizeWeekEnds(days[0]?.key?.slice(0, 7) || db.month, customEnds);
    if (ends.length) {
      const buckets = ends.map(() => []);
      days.forEach((item) => {
        const day = item.date.getDate(), found = ends.findIndex((end) => day <= end), index = found < 0 ? buckets.length - 1 : found;
        buckets[index].push(item);
      });
      return buckets.filter((items) => items.length);
    }
    const buckets = [], keys = [];
    days.forEach((item) => {
      const monday = new Date(item.date); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const key = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
      let index = keys.indexOf(key);
      if (index < 0) { keys.push(key); buckets.push([]); index = buckets.length - 1; }
      buckets[index].push(item);
    });
    return buckets;
  }
  function weekStats(items) {
    const result = aggregate(items.map((item) => item.data));
    result.services = result.warranty + result.other + result.mixed;
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    result.pendingDays = items.filter((item) => item.data.status === 'pending').length;
    return result;
  }
  function weekPhase(items, pendingDays) {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const first = new Date(items[0].date); first.setHours(0, 0, 0, 0);
    const last = new Date(items.at(-1).date); last.setHours(0, 0, 0, 0);
    if (todayStart < first) return 'future';
    if (todayStart > last || pendingDays === 0) return 'closed';
    return 'current';
  }
  function weekTargetContext(items) {
    const workingDays = items.filter((item) => item.data.status !== 'off');
    const monthWorkingDays = allDays().filter((item) => item.data.status !== 'off').length;
    const configuredDays = workingDays.filter((item) => num(item.data.goalPercent) > 0);
    const share = configuredDays.reduce((sum, item) => sum + num(item.data.goalPercent), 0) / 100;
    return { share, plannedShare: monthWorkingDays ? workingDays.length / monthWorkingDays : 0, configured: configuredDays.length, expected: workingDays.length, useDaily: workingDays.length > 0 && configuredDays.length === workingDays.length };
  }
  function weeklyTierTarget(tier, context, weeks) {
    const share = context.useDaily ? context.share : context.plannedShare || 1 / weeks;
    return {
      ...tier,
      mercantile: tier.mercantile * share,
      grossProfit: tier.grossProfit * share
    };
  }
  function renderWeekly() {
    const weeks = Math.max(1, num(db.weeks));
    const grid = document.getElementById('weeklyGrid');
    grid.innerHTML = weekBuckets().map((items, index) => {
      const result = weekStats(items), targetContext = weekTargetContext(items);
      const grossAvailable = hasCompleteGrossProfit(items);
      const serviceTarget = targetContext.useDaily ? num(db.mercantileGoal) * targetContext.share * 0.07 : num(db.servicesGoal) * targetContext.plannedShare;
      const serviceRate = serviceTarget ? result.services / serviceTarget : 0;
      const primaryTarget = weeklyTierTarget(tierGoals()[0], targetContext, weeks).mercantile;
      const plannedDays = items.filter((item) => item.data.status !== 'off').length;
      const sellerCount = configuredSellerCount();
      const salesGap = Math.max(0, primaryTarget - result.general), serviceGap = Math.max(0, serviceTarget - result.services);
      const averageDay = result.worked ? result.general / result.worked : 0, serviceAverageDay = result.worked ? result.services / result.worked : 0;
      const targetDay = plannedDays ? primaryTarget / plannedDays : 0, targetServiceDay = plannedDays ? serviceTarget / plannedDays : 0;
      const paceProjection = averageDay * plannedDays, ticket = result.nfs ? result.general / result.nfs : 0;
      const goals = tierGoals().map((tier) => {
        const target = weeklyTierTarget(tier, targetContext, weeks), mercTarget = target.mercantile, grossTarget = target.grossProfit;
        const rates = tierRate(target, result.general, result.grossProfit, grossAvailable);
        const missingMerc = Math.max(0, mercTarget - result.general), missingGross = Math.max(0, grossTarget - result.grossProfit);
        return `<div class="week-goal ${rates.passed ? 'goal-pass' : ''}"><header><span>${tier.name}</span><span class="${statusClass(rates.overall)}">${rates.passed ? '✓ Atingida' : pct.format(rates.overall)}</span></header><dl><dt>Mercantil / semana</dt><dd>${brl.format(mercTarget)}</dd><dt>Lucro bruto / semana</dt><dd>${grossAvailable ? brl.format(grossTarget) : 'Não informado'}</dd><dt>Falta mercantil</dt><dd class="${missingMerc ? 'negative' : 'positive'}">${brl.format(missingMerc)}</dd><dt>Falta lucro bruto</dt><dd class="${grossAvailable ? (missingGross ? 'negative' : 'positive') : ''}">${grossAvailable ? brl.format(missingGross) : '—'}</dd></dl></div>`;
      }).join('');
      const primary = tierRate(weeklyTierTarget(tierGoals()[0], targetContext, weeks), result.general, result.grossProfit, grossAvailable);
      const hasResults = result.worked > 0 || result.general > 0 || result.grossProfit > 0;
      const phase = weekPhase(items, result.pendingDays);
      const visualClass = phase === 'future' ? '' : phase === 'current' ? 'week-near' : primary.passed ? 'week-good' : 'week-bad';
      const targetNote = targetContext.useDaily
        ? `Meta semanal calculada pela soma dos percentuais diários: ${pct2.format(targetContext.share)} da meta mensal.`
        : targetContext.configured
          ? `Percentuais diários incompletos (${targetContext.configured}/${targetContext.expected}); meta proporcional aos dias úteis desta semana.`
          : 'Meta proporcional aos dias úteis da semana, sempre de segunda-feira a domingo.';
      const efficiencyRate = num(db.efficiencyGoal) ? result.efficiency / num(db.efficiencyGoal) : 0;
      const mercantileStatus = hasResults ? (result.general >= primaryTarget ? 'passed' : 'failed') : '';
      const efficiencyStatus = result.eligible > 0 ? (efficiencyRate >= 1 ? 'passed' : 'failed') : '';
      const projectionRate = primaryTarget ? paceProjection / primaryTarget : 0;
      const expanded = openWeeklyIndex === index;
      const toggleStatus = phase === 'future' ? '' : phase === 'current' ? 'warning' : primary.passed ? 'positive' : 'negative';
      const pendingLabel = result.pendingDays === 1 ? '1 pendente' : `${result.pendingDays} pendentes`;
      const donut = (label, rate, value, color) => `<div class="week-donut-item"><div class="week-donut" style="--rate:${Math.min(100, Math.max(0, rate * 100)).toFixed(2)};--donut:${color}"><strong>${pct.format(rate)}</strong></div><strong>${label}</strong><small>${value}</small></div>`;
      const chart = `<div class="week-chart-panel" ${expanded ? '' : 'hidden'}><div class="week-chart-title"><strong>Percentuais e projeção da semana</strong><span>Comparação com as metas do período</span></div><div class="week-donut-grid">${donut('Mercantil', primary.mercRate, `${brl.format(result.general)} de ${brl.format(primaryTarget)}`, primary.mercRate >= 1 ? '#169b62' : '#df4053')}${donut('Serviços', serviceRate, `${brl.format(result.services)} de ${brl.format(serviceTarget)}`, serviceRate >= 1 ? '#169b62' : '#df4053')}${donut('Projeção', projectionRate, brl.format(paceProjection), projectionRate >= 1 ? '#169b62' : '#0879e8')}</div></div>`;
      const conversion = result.eligible ? result.services / result.eligible : 0;
      const conversionTarget = num(db.efficiencyGoal);
      const conversionStatus = result.eligible ? (conversion >= conversionTarget ? 'passed' : 'failed') : '';
      const sellerNote = sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe';
      const perSellerSales = sellerCount ? salesGap / sellerCount : 0;
      const perSellerService = sellerCount ? serviceGap / sellerCount : 0;
      const perDaySellerSales = sellerCount && plannedDays ? salesGap / plannedDays / sellerCount : 0;
      const perDaySellerService = sellerCount && plannedDays ? serviceGap / plannedDays / sellerCount : 0;
      return `<article class="week ${visualClass}"><div class="week-top"><div><div class="week-title">${index + 1}ª semana</div><div class="week-date">${items[0].date.toLocaleDateString('pt-BR')} a ${items.at(-1).date.toLocaleDateString('pt-BR')}</div></div><div class="week-head-actions">${result.pendingDays && phase !== 'future' ? `<span class="week-pending-chip ${phase === 'current' ? 'current' : ''}">${pendingLabel}</span>` : ''}<button type="button" class="week-status-toggle ${toggleStatus}" data-week-toggle="${index}" aria-expanded="${expanded}"><span>${hasResults || phase === 'closed' ? pct.format(primary.overall) : 'Sem dados'}</span><span class="chevron">⌄</span></button></div></div>${chart}<div class="week-metrics"><div class="metric result-status ${mercantileStatus}"><span>VENDA MERCANTIL</span><strong>${brl.format(result.general)} · ${pct.format(primary.mercRate)}</strong></div><div class="metric"><span>LUCRO BRUTO</span><strong>${grossAvailable ? brl.format(result.grossProfit) : 'Não informado'}</strong></div><div class="metric"><span>SERVIÇOS</span><strong class="${statusClass(serviceRate)}">${brl.format(result.services)} · ${pct.format(serviceRate)}</strong></div><div class="metric result-status ${efficiencyStatus}"><span>EFICIÊNCIA</span><strong>${result.eligible > 0 ? efficiencyPct.format(result.efficiency) : 'Não calculada'}</strong></div><div class="metric result-status ${conversionStatus}"><span>TAXA DE CONVERSÃO</span><strong>${result.eligible ? efficiencyPct.format(conversion) : 'Não calculada'}</strong><small>Serviços ÷ venda elegível</small></div></div><div class="week-analysis"><div class="metric"><span>MÉDIA MERCANTIL / DIA</span><strong>${brl.format(averageDay)}</strong><small>Meta/dia: ${brl.format(targetDay)}</small></div><div class="metric"><span>FALTA MERCANTIL / DIA</span><strong class="${salesGap ? 'negative' : 'positive'}">${brl.format(plannedDays ? salesGap / plannedDays : 0)}</strong><small>Total: ${brl.format(salesGap)}</small></div><div class="metric"><span>FALTA MERCANTIL / VENDEDOR</span><strong class="${salesGap ? 'negative' : 'positive'}">${brl.format(perSellerSales)}</strong><small>${sellerNote}</small></div><div class="metric emphasized"><span>MERCANTIL / DIA / VENDEDOR</span><strong class="${salesGap ? 'negative' : 'positive'}">${brl.format(perDaySellerSales)}</strong><small>${sellerNote}</small></div><div class="metric"><span>PROJEÇÃO PELO RITMO</span><strong>${brl.format(paceProjection)}</strong><small>Ticket: ${brl.format(ticket)}</small></div><div class="metric"><span>MÉDIA SERVIÇOS / DIA</span><strong>${brl.format(serviceAverageDay)}</strong><small>Meta/dia: ${brl.format(targetServiceDay)}</small></div><div class="metric"><span>FALTA SERVIÇOS / DIA</span><strong class="${serviceGap ? 'negative' : 'positive'}">${brl.format(plannedDays ? serviceGap / plannedDays : 0)}</strong><small>Total: ${brl.format(serviceGap)}</small></div><div class="metric"><span>FALTA SERVIÇOS / VENDEDOR</span><strong class="${serviceGap ? 'negative' : 'positive'}">${brl.format(perSellerService)}</strong><small>${sellerNote}</small></div><div class="metric emphasized services"><span>SERVIÇOS / DIA / VENDEDOR</span><strong class="${serviceGap ? 'negative' : 'positive'}">${brl.format(perDaySellerService)}</strong><small>${sellerNote}</small></div><div class="metric"><span>NOTAS FISCAIS</span><strong>${result.nfs}</strong><small>${result.worked} dia(s) lançado(s)</small></div></div><div class="hint">${targetNote}${grossAvailable ? '' : ' • Lucro bruto não informado; percentual calculado somente pelo mercantil.'}</div><div class="week-goals">${goals}</div></article>`;
    }).join('');
    grid.querySelectorAll('[data-week-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.weekToggle);
        openWeeklyIndex = openWeeklyIndex === index ? null : index;
        renderWeekly();
      });
    });
  }

  function sellerMetrics(seller) {
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const count = num(db.sellerCount) || db.sellers.length;
    const individualGoal = num(seller.assignedGoal) || (count ? num(db.mercantileGoal) / count : 0);
    const serviceGoal = individualGoal * 0.07;
    const rate = individualGoal ? num(seller.general) / individualGoal : 0;
    const serviceRate = serviceGoal ? services / serviceGoal : 0;
    const ticket = num(seller.nfs) ? num(seller.general) / num(seller.nfs) : 0;
    const hasEligible = num(seller.eligible) > 0, efficiency = hasEligible ? services / num(seller.eligible) : 0;
    const plannedDays = num(seller.plannedDays) || num(db.businessDays);
    const projection = num(seller.days) ? (num(seller.general) / num(seller.days)) * plannedDays : 0;
    const serviceProjection = num(seller.days) ? (services / num(seller.days)) * plannedDays : 0;
    const dailyAverage = num(seller.days) ? num(seller.general) / num(seller.days) : 0;
    const serviceDailyAverage = num(seller.days) ? services / num(seller.days) : 0;
    const targetDailyAverage = plannedDays ? individualGoal / plannedDays : 0;
    const serviceTargetDailyAverage = plannedDays ? serviceGoal / plannedDays : 0;
    const missing = Math.max(0, individualGoal - num(seller.general));
    const serviceMissing = Math.max(0, serviceGoal - services);
    const remainingDays = Math.max(0, plannedDays - num(seller.days));
    const neededPerDay = remainingDays ? missing / remainingDays : 0;
    const serviceNeededPerDay = remainingDays ? serviceMissing / remainingDays : 0;
    const projectedGap = individualGoal - projection, serviceProjectedGap = serviceGoal - serviceProjection;
    const grossReference = individualGoal * grossProfitRate();
    return { services, individualGoal, serviceGoal, grossReference, plannedDays, remainingDays, rate, serviceRate, ticket, hasEligible, efficiency, projection, serviceProjection, projectedGap, serviceProjectedGap, dailyAverage, serviceDailyAverage, targetDailyAverage, serviceTargetDailyAverage, missing, serviceMissing, neededPerDay, serviceNeededPerDay };
  }
  function timeGreeting(moment = new Date()) {
    const hour = moment.getHours();
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  }
  const positiveMotivations = [
    'Seu resultado mostra consistência. Continue firme e transforme o bom ritmo em uma grande entrega.',
    'Parabéns pela evolução! Mantenha o foco e faça deste dia mais um passo acima.',
    'Você está construindo um excelente caminho. Siga com energia, disciplina e confiança.',
    'O bom resultado de hoje nasceu do seu esforço. Continue nessa pegada!',
    'Seu desempenho inspira confiança. Preserve o ritmo e busque uma entrega ainda melhor.',
    'Você está mostrando força comercial. Aproveite o embalo e avance com determinação.',
    'Meta se conquista com constância, e você está no caminho certo. Vamos em frente!',
    'Excelente ritmo! Continue cuidando de cada oportunidade e celebrando cada avanço.',
    'Seu trabalho está aparecendo nos números. Mantenha a intensidade e vá além.',
    'Parabéns pela entrega! Hoje é dia de repetir as boas atitudes e ampliar o resultado.',
    'Você provou que consegue. Agora é manter a confiança e continuar crescendo.',
    'O resultado positivo confirma sua dedicação. Siga firme, uma venda de cada vez.',
    'Grande desempenho! Continue com atitude, presença e vontade de vencer.',
    'Seu esforço está gerando resultado. Proteja esse ritmo e busque novas oportunidades.',
    'Você está fazendo acontecer. Mantenha o foco e deixe seu resultado falar ainda mais alto.',
    'Parabéns pelo avanço! Consistência hoje significa uma meta mais próxima amanhã.',
    'O caminho está bem construído. Continue acelerando com qualidade e confiança.',
    'Seu ritmo é positivo e merece reconhecimento. Siga forte até o fechamento.',
    'Boa entrega! Continue transformando atendimento em confiança e confiança em resultado.',
    'Você está vencendo o dia com trabalho. Mantenha a energia e continue avançando.',
    'O resultado mostra que sua estratégia está funcionando. Repita o que deu certo e evolua.',
    'Parabéns pela performance! Sua constância pode fazer deste mês um grande marco.',
    'Você está deixando a meta cada vez mais perto. Continue firme e concentrado.',
    'Ótimo trabalho! Preserve a disciplina e busque uma oportunidade a mais hoje.',
    'Seu desempenho merece destaque. Continue com humildade, energia e ambição saudável.',
    'O bom momento é fruto da sua dedicação. Aproveite e faça o dia render ainda mais.',
    'Você está mostrando que resultado se constrói com atitude. Continue nessa direção.',
    'Parabéns! Mantenha o padrão de excelência e siga conquistando novos resultados.',
    'Seu avanço fortalece toda a equipe. Continue sendo protagonista da sua meta.',
    'O ritmo está forte. Confie no processo, cuide do cliente e continue entregando.',
    'Feche o dia com a mesma força que começou. Você está preparado para ir além.'
  ];
  const supportMotivations = [
    'Um resultado abaixo do esperado não define sua capacidade. Levante a cabeça e recomece forte hoje.',
    'Dias difíceis também fazem parte da caminhada. Confie em você e busque a próxima oportunidade.',
    'Não carregue o peso de ontem. Hoje existe uma nova chance de fazer diferente e avançar.',
    'Respire, reorganize o foco e siga. Sua reação de hoje pode mudar todo o resultado do mês.',
    'O momento pede calma e atitude. Você tem capacidade para recuperar e surpreender.',
    'Nem todo dia sai como planejado, mas todo novo dia permite uma grande retomada.',
    'Seu potencial continua intacto. Ajuste a rota, mantenha a confiança e volte para o jogo.',
    'Resultado é construção. Dê o próximo passo com coragem e deixe a evolução acontecer.',
    'Não se abata pelos números atuais. Concentre-se na próxima venda e faça acontecer.',
    'A meta ainda está viva. Trabalhe uma oportunidade por vez e confie na sua recuperação.',
    'Você não precisa resolver tudo de uma vez. Vença o próximo atendimento e ganhe ritmo.',
    'Transforme a pressão em direção. Foco no cliente, atitude na abordagem e confiança no fechamento.',
    'O mês ainda oferece oportunidades. Recomece com energia e mostre sua força.',
    'Uma fase difícil é passageira. Sua disciplina e sua atitude podem virar esse cenário.',
    'Não permita que um resultado momentâneo diminua sua confiança. Você pode reagir.',
    'A recuperação começa em uma decisão: acreditar, agir e persistir. Conte com a equipe.',
    'Hoje é um novo ponto de partida. Faça o básico bem feito e recupere o ritmo.',
    'Olhe para frente. Cada cliente é uma possibilidade real de mudar o seu dia.',
    'Você já superou desafios antes. Use sua experiência e volte ainda mais determinado.',
    'O resultado pode oscilar, mas sua atitude precisa permanecer forte. Siga em frente.',
    'Sem culpa e sem medo: analise, ajuste e ataque as melhores oportunidades de hoje.',
    'Acredite no processo. Constância e coragem transformam dias difíceis em grandes viradas.',
    'Sua meta não exige perfeição, exige persistência. Continue tentando com inteligência.',
    'Não desista do mês por causa de um dia. A próxima conversa pode abrir uma grande venda.',
    'Você tem talento e capacidade. Recupere a confiança e coloque energia na próxima ação.',
    'Toda virada começa pequena. Conquiste a primeira venda e deixe o ritmo crescer.',
    'O cenário atual não é o resultado final. Continue trabalhando e escreva uma nova história.',
    'Mantenha a cabeça erguida. O apoio está aqui e as oportunidades continuam chegando.',
    'Use o resultado como orientação, não como peso. Ajuste a estratégia e avance.',
    'Ainda há tempo para reagir. Faça deste dia o início de uma sequência positiva.',
    'Confie na sua força. Persistência, foco e uma boa oportunidade podem mudar tudo.'
  ];
  const nameSeed = (value) => [...String(value || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  function suggestedMissionTone(seller) {
    const key = arguments[1] || selectedSellerMissionDate(), period = sellerPeriodAnalysis(seller, key);
    if (period.hasResult) return period.positive ? 'positive' : 'support';
    const metrics = sellerMetrics(seller), hasResult = num(seller.general) > 0 || num(seller.days) > 0;
    if (!hasResult) return 'positive';
    return metrics.projection >= metrics.individualGoal || metrics.rate >= 1 ? 'positive' : 'support';
  }
  function selectedMissionTone(seller, key) {
    return seller.missionTones?.[key] || suggestedMissionTone(seller, key);
  }
  function missionMessage(subject, key, tone = 'positive') {
    const day = Math.max(1, Number(String(key).slice(-2)) || 1), list = tone === 'support' ? supportMotivations : positiveMotivations;
    const index = (day - 1 + nameSeed(subject?.id || subject?.name) % list.length) % list.length;
    const firstName = String(subject?.name || 'Equipe').trim().split(/\s+/)[0] || 'Equipe';
    return `${firstName}, ${list[index].charAt(0).toLowerCase()}${list[index].slice(1)}`;
  }
  function sellerMissionMetrics(seller, key) {
    const metrics = sellerMetrics(seller), percent = num(dayData(key).goalPercent), branchMission = dailyGoalMetrics(key);
    const mercantileGoal = metrics.individualGoal * percent / 100;
    const serviceGoal = mercantileGoal * 0.07;
    return { key, percent, mercantileGoal, serviceGoal, branchMercantilePerSeller: branchMission.perSeller, branchServicePerSeller: branchMission.servicePerSeller, sellerCount: branchMission.sellerCount, metrics };
  }
  const EFFICIENCY_TARGET = 0.07, CONVERSION_TARGET = 0.35;
  function sellerResultPeriod(seller) {
    if (seller.resultPeriod) return seller.resultPeriod;
    const hasLegacyResult = num(seller.general) > 0 || num(seller.eligible) > 0 || num(seller.warranty) + num(seller.other) + num(seller.mixed) > 0 || num(seller.nfs) > 0;
    return hasLegacyResult ? 'accumulated' : 'none';
  }
  function sellerPeriodAnalysis(seller, key) {
    const mission = sellerMissionMetrics(seller, key), metrics = mission.metrics, period = sellerResultPeriod(seller);
    const labels = { goalMonth: 'Meta do mês, sem resultado', none: 'Meta do dia, sem resultado', day: 'Resultado do dia', week: 'Resultado da semana', fortnight: 'Resultado da quinzena', accumulated: 'Acumulado até o momento', month: 'Fechamento do mês', custom: 'Período personalizado' };
    const hasResult = period !== 'none' && period !== 'goalMonth';
    const periodDays = period === 'day' ? 1 : period === 'month' ? metrics.plannedDays : Math.max(1, num(seller.days));
    const mercantileTarget = period === 'day' ? mission.mercantileGoal : period === 'month' ? metrics.individualGoal : metrics.targetDailyAverage * periodDays;
    const serviceTarget = period === 'day' ? mission.serviceGoal : period === 'month' ? metrics.serviceGoal : metrics.serviceTargetDailyAverage * periodDays;
    const branchMonthlyShare = mission.sellerCount ? num(db.mercantileGoal) / mission.sellerCount : 0;
    const branchDailyAverage = branchMonthlyShare / Math.max(1, num(db.businessDays) || metrics.plannedDays);
    const branchMercantileTarget = period === 'day' ? mission.branchMercantilePerSeller : period === 'month' ? branchMonthlyShare : branchDailyAverage * periodDays;
    const branchServiceTarget = branchMercantileTarget * EFFICIENCY_TARGET;
    const sales = num(seller.general), services = metrics.services, eligible = num(seller.eligible);
    const mercantileRate = mercantileTarget ? sales / mercantileTarget : 0, serviceRate = serviceTarget ? services / serviceTarget : 0;
    const branchMercantileRate = branchMercantileTarget ? sales / branchMercantileTarget : 0, branchServiceRate = branchServiceTarget ? services / branchServiceTarget : 0;
    const efficiency = eligible ? services / eligible : 0, conversion = sales ? eligible / sales : 0;
    const mercantileDifference = sales - mercantileTarget, serviceDifference = services - serviceTarget;
    const branchMercantileDifference = sales - branchMercantileTarget, branchServiceDifference = services - branchServiceTarget;
    const reachedEitherReference = (mercantileRate >= 1 && serviceRate >= 1) || (branchMercantileRate >= 1 && branchServiceRate >= 1);
    const positive = hasResult && reachedEitherReference && efficiency >= EFFICIENCY_TARGET && conversion >= CONVERSION_TARGET;
    const dateRange = seller.resultStart || seller.resultEnd ? `${seller.resultStart ? new Date(`${seller.resultStart}T12:00:00`).toLocaleDateString('pt-BR') : 'início'} a ${seller.resultEnd ? new Date(`${seller.resultEnd}T12:00:00`).toLocaleDateString('pt-BR') : 'hoje'}` : '';
    return { ...mission, period, periodLabel: labels[period] || labels.custom, dateRange, hasResult, periodDays, mercantileTarget, serviceTarget, branchMercantileTarget, branchServiceTarget, sales, services, eligible, mercantileRate, serviceRate, branchMercantileRate, branchServiceRate, efficiency, conversion, mercantileDifference, serviceDifference, branchMercantileDifference, branchServiceDifference, positive };
  }
  function selectedSellerMissionDate() {
    const input = document.getElementById('sellerMissionDate');
    const first = `${db.month}-01`, last = `${db.month}-${String(monthParts().days).padStart(2, '0')}`;
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (!input.value || input.value < first || input.value > last) input.value = todayKey.startsWith(`${db.month}-`) ? todayKey : first;
    input.min = first; input.max = last; return input.value;
  }
  function renderSellerMission(seller) {
    const key = selectedSellerMissionDate(), mission = sellerMissionMetrics(seller, key), analysis = sellerPeriodAnalysis(seller, key);
    const financial = sellerFinancials(seller), financialComparison = sellerFinancialComparison(seller, analysis.period);
    const suggested = suggestedMissionTone(seller, key), tone = selectedMissionTone(seller, key), message = missionMessage(seller, key, tone);
    const isMonthlyGoal = analysis.period === 'goalMonth';
    const summaryItems = isMonthlyGoal ? [
      ['Meta mercantil mensal', brl.format(mission.metrics.individualGoal)], ['Meta mensal de serviços (7%)', brl.format(mission.metrics.serviceGoal)],
      ['Média mercantil por dia', brl.format(mission.metrics.targetDailyAverage)], ['Média de serviços por dia', brl.format(mission.metrics.serviceTargetDailyAverage)],
      ['Eficiência de serviços', '7,00%'], ['Taxa de conversão', '35,00%'],
      ['Ganho se bater as metas', brl.format(financial.targetTotal)], [financialComparison.currentLabel, brl.format(financialComparison.current)], [financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap))]
    ] : [
      ['Percentual do dia', mission.percent ? `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : 'Não informado'],
      ['Mercantil da filial/vendedor', mission.sellerCount ? brl.format(mission.branchMercantilePerSeller) : 'Equipe não configurada'], ['Serviços da filial/vendedor', mission.sellerCount ? brl.format(mission.branchServicePerSeller) : 'Equipe não configurada'],
      ['Eficiência', '7,00%'], ['Conversão', '35,00%'], [`${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% sobre a meta individual`, brl.format(mission.mercantileGoal)], ['Serviços individuais do dia', brl.format(mission.serviceGoal)],
      ['Ganho se bater as metas', brl.format(financial.targetTotal)], [financialComparison.currentLabel, brl.format(financialComparison.current)], [financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap))]
    ];
    document.getElementById('sellerMissionSummary').innerHTML = summaryItems.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('sellerMissionSectionTitle').textContent = isMonthlyGoal ? 'Meta do mês do vendedor' : 'Missão do dia do vendedor';
    document.getElementById('sellerMissionDateField').hidden = isMonthlyGoal;
    const preview = document.getElementById('sellerPeriodPreview');
    preview.innerHTML = analysis.hasResult
      ? `<strong>${esc(analysis.periodLabel)}${analysis.dateRange ? ` • ${esc(analysis.dateRange)}` : ''}</strong><br>${analysis.period === 'month' ? 'Fechamento comparado com a meta mensal completa.' : `Projeção proporcional a ${analysis.periodDays} dia(s) trabalhado(s), de ${analysis.metrics.plannedDays} planejado(s).`}<div class="period-preview-grid"><div><span>META PELA FILIAL</span><b>${brl.format(analysis.branchMercantileTarget)}</b></div><div><span>ATINGIMENTO FILIAL</span><b>${pct2.format(analysis.branchMercantileRate)}</b></div><div><span>META INDIVIDUAL</span><b>${brl.format(analysis.mercantileTarget)}</b></div><div><span>ATINGIMENTO INDIVIDUAL</span><b>${pct2.format(analysis.mercantileRate)}</b></div><div><span>${financialComparison.currentLabel.toUpperCase()}</span><b>${brl.format(financialComparison.current)}</b></div><div><span>${financialComparison.gapLabel.toUpperCase()}</span><b>${brl.format(Math.abs(financialComparison.gap))}</b></div></div>`
      : isMonthlyGoal
        ? `<strong>Imagem da meta do mês</strong><br>Serão mostradas as metas mensais mercantil e de serviços, os indicadores fixos e as projeções financeiras. O percentual e as missões do dia não aparecerão.`
        : `<strong>Imagem da meta do dia</strong><br>A imagem mostrará o percentual do dia, a missão da filial por vendedor, a missão individual e a mensagem motivacional, sem resultados.`;
    document.querySelectorAll('[data-mission-tone]').forEach((button) => button.classList.toggle('active', button.dataset.missionTone === tone));
    document.getElementById('sellerToneSuggestion').textContent = seller.missionTones?.[key] ? 'Tom escolhido manualmente para este dia' : `Sugestão automática: ${suggested === 'positive' ? 'resultado positivo' : 'apoio e recuperação'}`;
    document.getElementById('sellerMotivationPreview').innerHTML = `${esc(message)}<br><small>Mensagem exclusiva deste dia; não se repete durante o mês.</small>`;
    document.getElementById('sellerMissionImage').disabled = !isMonthlyGoal && !mission.percent;
    document.getElementById('sellerMissionImage').textContent = isMonthlyGoal ? 'Baixar / compartilhar meta do mês' : 'Baixar / compartilhar missão em imagem';
  }
  async function exportSellerMonthlyGoalImage(seller, key, analysis, financial) {
    const metrics = analysis.metrics, tone = selectedMissionTone(seller, key), motivationalText = missionMessage(seller, key, tone);
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1620;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const [year, month] = String(db.month).split('-').map(Number);
    imageHeader(ctx, 'META DO MÊS - VENDEDOR', `${seller.name || 'Vendedor'}  |  ${new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`, canvas.width);

    ctx.fillStyle = '#f5f2ff'; roundedCanvasRect(ctx, 54, 305, 972, 510, 30); ctx.fill();
    ctx.fillStyle = '#6b4ce6'; roundedCanvasRect(ctx, 76, 331, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('META INDIVIDUAL DO VENDEDOR', 102, 359);
    drawCanvasMetric(ctx, 64, 390, 460, 125, 'Meta mercantil mensal', brl.format(metrics.individualGoal), true);
    drawCanvasMetric(ctx, 556, 390, 460, 125, 'Meta mensal de serviços (7%)', brl.format(metrics.serviceGoal));
    drawCanvasMetric(ctx, 64, 535, 460, 125, 'Média mercantil por dia', brl.format(metrics.targetDailyAverage), true, `Meta mensal ÷ ${metrics.plannedDays} dias planejados`);
    drawCanvasMetric(ctx, 556, 535, 460, 125, 'Média de serviços por dia', brl.format(metrics.serviceTargetDailyAverage), false, `Meta de serviços ÷ ${metrics.plannedDays} dias planejados`);
    drawCanvasMetric(ctx, 64, 680, 460, 105, 'Eficiência de serviços', '7,00%');
    drawCanvasMetric(ctx, 556, 680, 460, 105, 'Taxa de conversão', '35,00%');

    ctx.fillStyle = '#effaf5'; roundedCanvasRect(ctx, 54, 845, 972, 350, 30); ctx.fill();
    ctx.fillStyle = '#169b62'; roundedCanvasRect(ctx, 76, 871, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 29px Arial, sans-serif'; ctx.fillText('PROJEÇÃO FINANCEIRA', 102, 899);
    drawCanvasMetric(ctx, 64, 920, 460, 125, 'Ganho se bater as metas', brl.format(financial.targetTotal), true, 'Inclui comissões, repousos e atestados');
    drawCanvasMetric(ctx, 556, 920, 460, 125, 'Projeção no ritmo atual', brl.format(financial.projectedTotal), false, num(seller.days) ? `${num(seller.days)} dia(s) considerado(s)` : 'Aguardando resultados');
    drawCanvasMetric(ctx, 64, 1065, 296, 105, 'Comissão mercantil', pct2.format(financial.mercantileRate));
    drawCanvasMetric(ctx, 392, 1065, 296, 105, 'Comissão de serviços', pct2.format(financial.serviceRate));
    drawCanvasMetric(ctx, 720, 1065, 296, 105, 'Repousos + atestados', `${financial.paidDays} dia(s)`);

    ctx.fillStyle = tone === 'positive' ? '#e9f8f1' : '#fff0f2'; roundedCanvasRect(ctx, 64, 1230, 952, 190, 26); ctx.fill();
    ctx.fillStyle = '#203a56'; ctx.font = '700 25px Arial, sans-serif'; drawWrappedCanvasText(ctx, motivationalText, 94, 1288, 884, 34, 3);
    ctx.fillStyle = '#102a43'; ctx.font = '800 20px Arial, sans-serif'; ctx.fillText(`${db.branch || 'Filial não informada'}`, 64, 1485);
    ctx.fillStyle = '#748296'; ctx.font = '600 17px Arial, sans-serif'; ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`, 64, 1525);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    await shareOrDownloadImage(canvas, `meta-mensal-${safeName || 'vendedor'}-${db.month}.png`, `Meta do mês - ${seller.name || 'Vendedor'}`);
  }
  async function exportSellerMissionImage(seller, key = selectedSellerMissionDate()) {
    if (!seller) return;
    const analysis = sellerPeriodAnalysis(seller, key), mission = analysis, metrics = analysis.metrics, financial = sellerFinancials(seller);
    const tone = selectedMissionTone(seller, key), motivationalText = missionMessage(seller, key, tone), financialComparison = sellerFinancialComparison(seller, analysis.period);
    if (analysis.period === 'goalMonth') { await exportSellerMonthlyGoalImage(seller, key, analysis, financial); return; }
    if (!mission.percent) { alert('Informe primeiro o percentual deste dia na meta diária da filial.'); return; }
    const hasFollowUp = analysis.hasResult;
    const date = new Date(`${key}T12:00:00`), canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = hasFollowUp ? 2210 : 1660;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    imageHeader(ctx, hasFollowUp ? 'RESULTADO - VENDEDOR' : 'MISSÃO DO DIA - VENDEDOR', `${seller.name || 'Vendedor'}  |  ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`, canvas.width);

    ctx.fillStyle = '#edf7ff'; roundedCanvasRect(ctx, 54, 300, 972, 340, 30); ctx.fill();
    ctx.fillStyle = '#0879e8'; roundedCanvasRect(ctx, 76, 326, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('PEDIDO DA EMPRESA PARA A FILIAL', 102, 354);
    drawCanvasMetric(ctx, 64, 378, 296, 125, 'Percentual do dia', `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
    drawCanvasMetric(ctx, 392, 378, 296, 125, 'Mercantil filial / vendedor', mission.sellerCount ? brl.format(mission.branchMercantilePerSeller) : 'Não configurada', true);
    drawCanvasMetric(ctx, 720, 378, 296, 125, 'Serviços filial / vendedor', mission.sellerCount ? brl.format(mission.branchServicePerSeller) : 'Não configurada', true);
    drawCanvasMetric(ctx, 64, 519, 460, 101, 'Eficiência de serviços', '7,00%');
    drawCanvasMetric(ctx, 556, 519, 460, 101, 'Taxa de conversão', '35,00%');

    ctx.fillStyle = '#f5f2ff'; roundedCanvasRect(ctx, 54, 665, 972, 420, 30); ctx.fill();
    ctx.fillStyle = '#6b4ce6'; roundedCanvasRect(ctx, 76, 691, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('META INDIVIDUAL DO VENDEDOR', 102, 719);
    ctx.fillStyle = '#64748b'; ctx.font = '700 20px Arial, sans-serif'; ctx.fillText(`Meta mensal cadastrada: ${brl.format(metrics.individualGoal)}  •  ${metrics.plannedDays} dias planejados`, 102, 751);
    drawCanvasMetric(ctx, 64, 778, 296, 125, 'Percentual aplicado', `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
    drawCanvasMetric(ctx, 392, 778, 296, 125, 'Mercantil individual do dia', brl.format(mission.mercantileGoal), true, `${mission.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da meta individual`);
    drawCanvasMetric(ctx, 720, 778, 296, 125, 'Serviços individuais do dia', brl.format(mission.serviceGoal), false, '7% do mercantil individual');
    drawCanvasMetric(ctx, 64, 922, 460, 137, 'Meta mercantil por dia planejado', brl.format(metrics.targetDailyAverage), false, `${brl.format(metrics.individualGoal)} ÷ ${metrics.plannedDays} dias`);
    drawCanvasMetric(ctx, 556, 922, 460, 137, 'Meta de serviços por dia planejado', brl.format(metrics.serviceTargetDailyAverage), false, `${brl.format(metrics.serviceGoal)} ÷ ${metrics.plannedDays} dias`);

    ctx.fillStyle = '#effaf5'; roundedCanvasRect(ctx, 54, 1110, 972, 225, 30); ctx.fill();
    ctx.fillStyle = '#169b62'; roundedCanvasRect(ctx, 76, 1136, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 29px Arial, sans-serif'; ctx.fillText('PROJEÇÃO FINANCEIRA', 102, 1164);
    drawCanvasMetric(ctx, 64, 1182, 296, 130, 'Ganho se bater as metas', brl.format(financial.targetTotal), true, `Merc. ${pct2.format(financial.mercantileRate)} • Serv. ${pct2.format(financial.serviceRate)}`);
    drawCanvasMetric(ctx, 392, 1182, 296, 130, financialComparison.currentLabel, brl.format(financialComparison.current), false, num(seller.days) ? `${num(seller.days)} de ${financial.plannedDays} dia(s)` : 'Aguardando resultados');
    drawCanvasMetric(ctx, 720, 1182, 296, 130, financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap)), false, financialComparison.gapNote);
    if (hasFollowUp) {
      const rangeNote = analysis.dateRange || analysis.periodLabel;
      ctx.fillStyle = '#102a43'; ctx.font = '900 31px Arial, sans-serif'; ctx.fillText('RESULTADO DO PERÍODO', 64, 1400);
      ctx.fillStyle = '#64748b'; ctx.font = '600 18px Arial, sans-serif'; ctx.fillText(rangeNote, 64, 1428);
      const mercantileCards = [
        ['Mercantil realizado', brl.format(analysis.sales)],
        [`Filial: ${analysis.branchMercantileDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.branchMercantileDifference)), `Atingiu ${pct2.format(analysis.branchMercantileRate)}`],
        [`Individual: ${analysis.mercantileDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.mercantileDifference)), `Atingiu ${pct2.format(analysis.mercantileRate)}`]
      ];
      mercantileCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1450, 296, 140, label, value, index === 1, note));
      const serviceCards = [
        ['Serviços realizados', brl.format(analysis.services)],
        [`Filial: ${analysis.branchServiceDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.branchServiceDifference)), `Atingiu ${pct2.format(analysis.branchServiceRate)}`],
        [`Individual: ${analysis.serviceDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.serviceDifference)), `Atingiu ${pct2.format(analysis.serviceRate)}`]
      ];
      serviceCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1610, 296, 140, label, value, index === 1, note));
      const indicatorCards = [
        ['Eficiência atual', analysis.eligible ? efficiencyPct.format(analysis.efficiency) : 'Não calculada', 'Meta 7%'],
        ['Conversão atual', analysis.sales ? efficiencyPct.format(analysis.conversion) : 'Não calculada', 'Meta 35%'],
        ['Situação', analysis.positive ? 'Meta atingida' : 'Abaixo da meta', analysis.positive ? 'Parabéns pelo resultado' : 'Siga firme na recuperação']
      ];
      indicatorCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1770, 296, 140, label, value, index < 2, note));
    }
    const motivationY = hasFollowUp ? 1940 : 1370, branchY = hasFollowUp ? 2145 : 1575, footerY = hasFollowUp ? 2182 : 1615;
    ctx.fillStyle = tone === 'positive' ? '#e9f8f1' : '#fff0f2'; roundedCanvasRect(ctx, 64, motivationY, 952, 170, 26); ctx.fill();
    ctx.fillStyle = '#203a56'; ctx.font = '700 25px Arial, sans-serif'; drawWrappedCanvasText(ctx, motivationalText, 94, motivationY + 58, 884, 34, 3);
    ctx.fillStyle = '#102a43'; ctx.font = '800 20px Arial, sans-serif'; ctx.fillText(`${db.branch || 'Filial não informada'}`, 64, branchY);
    ctx.fillStyle = '#748296'; ctx.font = '600 17px Arial, sans-serif'; ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`, 64, footerY);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    await shareOrDownloadImage(canvas, `${hasFollowUp ? 'resultado' : 'missao-diaria'}-${safeName || 'vendedor'}-${key}.png`, `${hasFollowUp ? analysis.periodLabel : 'Missão do dia'} - ${seller.name || 'Vendedor'}`);
  }
  function sellerFinancials(seller, source = db) {
    const [year, month] = String(source.month || db.month).split('-').map(Number), calendarDays = new Date(year, month, 0).getDate();
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const sourceCount = num(source.sellerCount) || (source.sellers || []).length;
    const individualGoal = num(seller.assignedGoal) || (sourceCount ? num(source.mercantileGoal) / sourceCount : 0), serviceGoal = individualGoal * 0.07;
    const mercantileRate = num(seller.commissionMercantileRate) / 100;
    const serviceRate = (Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5) / 100;
    const mercantileCommission = num(seller.general) * mercantileRate, serviceCommission = services * serviceRate;
    const commissionSubtotal = mercantileCommission + serviceCommission;
    const plannedDays = num(seller.plannedDays) || num(source.businessDays);
    const automaticRestDays = Math.max(0, calendarDays - plannedDays);
    const restDays = Object.prototype.hasOwnProperty.call(seller, 'restDays') && String(seller.restDays) !== '' ? num(seller.restDays) : automaticRestDays;
    const justifiedDays = num(seller.justifiedDays), paidDays = restDays + justifiedDays, workedDays = num(seller.days);
    const currentDailyCommission = workedDays ? commissionSubtotal / workedDays : 0;
    const dsr = currentDailyCommission * paidDays, total = commissionSubtotal + dsr;
    const projectedSubtotal = workedDays ? currentDailyCommission * plannedDays : 0;
    const projectedDsr = plannedDays ? projectedSubtotal / plannedDays * paidDays : 0, projectedTotal = projectedSubtotal + projectedDsr;
    const targetMercantileCommission = individualGoal * mercantileRate;
    const targetServiceCommission = serviceGoal * serviceRate;
    const targetSubtotal = targetMercantileCommission + targetServiceCommission;
    const targetPaid = plannedDays ? targetSubtotal / plannedDays * paidDays : 0, targetTotal = targetSubtotal + targetPaid;
    return { services, serviceCommission, mercantileCommission, commissionSubtotal, plannedDays, automaticRestDays, restDays, justifiedDays, paidDays, dsr, total, projectedSubtotal, projectedDsr, projectedTotal, mercantileRate, serviceRate, targetMercantileCommission, targetServiceCommission, targetSubtotal, targetPaid, targetTotal };
  }
  function sellerFinancialComparison(seller, period = sellerResultPeriod(seller)) {
    const financial = sellerFinancials(seller), isClosure = period === 'month';
    const current = isClosure ? financial.total : financial.projectedTotal;
    const gap = financial.targetTotal - current;
    return {
      ...financial, isClosure, current, gap,
      currentLabel: isClosure ? 'Ganho apurado no fechamento' : 'Projeção financeira atual',
      gapLabel: isClosure ? (gap > 0.005 ? 'Quanto deixou de ganhar' : 'Diferença no fechamento') : 'Diferença financeira projetada',
      gapNote: gap > 0.005 ? 'Abaixo do potencial das metas' : gap < -0.005 ? 'Acima do potencial das metas' : 'Projeção financeira atendida'
    };
  }
  function sellerProfileHistory(seller) {
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || '';
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    return Object.values(vault.records || {}).filter((record) => String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch).map((record) => {
      const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
      if (!match) return null;
      const financial = sellerFinancials(match, record), services = num(match.warranty) + num(match.other) + num(match.mixed);
      return { month: record.month, seller: match, financial, services, ticket: num(match.nfs) ? num(match.general) / num(match.nfs) : 0 };
    }).filter(Boolean).sort((a, b) => b.month.localeCompare(a.month));
  }
  function renderSellerProfile() {
    if (!activeSellerProfileId) return;
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId);
    if (!seller) { activeSellerProfileId = null; return; }
    const metrics = sellerMetrics(seller), financial = sellerFinancials(seller), history = sellerProfileHistory(seller), period = sellerPeriodAnalysis(seller, selectedSellerMissionDate()), financialComparison = sellerFinancialComparison(seller, period.period);
    const expectedTotal = financial.targetTotal;
    document.getElementById('sellerProfileTitle').textContent = seller.name || 'Vendedor sem nome';
    document.getElementById('sellerProfileSubtitle').textContent = `${db.branch || 'Filial não informada'} • ${monthLabel(db.month)} • ${financial.plannedDays} dias úteis + ${financial.restDays} descansos`;
    document.getElementById('sellerProfileKpis').innerHTML = [
      ['Venda mercantil total', brl.format(num(seller.general))], ['Venda elegível (base eficiência)', brl.format(num(seller.eligible))], ['Meta mercantil', brl.format(metrics.individualGoal)], ['Meta mercantil por dia planejado', brl.format(metrics.targetDailyAverage)], ['Atingimento mercantil', pct.format(metrics.rate)],
      ['Falta mercantil', brl.format(metrics.missing)], ['Média mercantil/dia', brl.format(metrics.dailyAverage)], ['Projeção mercantil', brl.format(metrics.projection)], ['Necessário/dia', brl.format(metrics.neededPerDay)],
      ['Serviços acumulados', brl.format(metrics.services)], ['Meta serviços (7%)', brl.format(metrics.serviceGoal)], ['Meta de serviços por dia planejado', brl.format(metrics.serviceTargetDailyAverage)], ['Atingimento serviços', pct.format(metrics.serviceRate)],
      ['Falta serviços', brl.format(metrics.serviceMissing)], ['Média serviços/dia', brl.format(metrics.serviceDailyAverage)], ['Projeção serviços', brl.format(metrics.serviceProjection)], ['Eficiência', metrics.hasEligible ? efficiencyPct.format(metrics.efficiency) : 'Não calculada'],
      ['Taxa de conversão', period.sales ? efficiencyPct.format(period.conversion) : 'Não calculada'], ['Meta fixa de conversão', '35,00%'], ['Período do resultado', period.periodLabel],
      ['Dias planejados', metrics.plannedDays], ['Dias trabalhados', num(seller.days)], ['Dias restantes', metrics.remainingDays]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderSellerMission(seller);
    document.getElementById('profileCommissionMercantileRate').value = num(seller.commissionMercantileRate) || '';
    document.getElementById('profileCommissionServiceRate').value = Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5;
    document.getElementById('profileRestDays').value = financial.restDays;
    document.getElementById('profileJustifiedDays').value = num(seller.justifiedDays) || '';
    document.getElementById('sellerFinanceResults').innerHTML = `<div class="metric"><span>COMISSÃO MERCANTIL • ${pct2.format(financial.mercantileRate)}</span><strong>${brl.format(financial.mercantileCommission)}</strong></div><div class="metric"><span>COMISSÃO SERVIÇOS • ${pct2.format(financial.serviceRate)}</span><strong>${brl.format(financial.serviceCommission)}</strong></div><div class="metric"><span>SUBTOTAL COMISSÕES</span><strong>${brl.format(financial.commissionSubtotal)}</strong></div><div class="metric"><span>REPOUSOS + ATESTADOS ESTIMADOS</span><strong>${brl.format(financial.dsr)}</strong><small>${financial.restDays} repouso(s) + ${financial.justifiedDays} atestado(s)</small></div><div class="metric financial-highlight"><span>GANHO APURADO / ESTIMADO</span><strong>${brl.format(financial.total)}</strong></div><div class="metric financial-highlight"><span>${financialComparison.currentLabel.toUpperCase()}</span><strong>${brl.format(financialComparison.current)}</strong></div><div class="metric financial-highlight"><span>GANHO SE BATER AS METAS</span><strong>${brl.format(financial.targetTotal)}</strong></div><div class="metric financial-highlight"><span>${financialComparison.gapLabel.toUpperCase()}</span><strong>${brl.format(Math.abs(financialComparison.gap))}</strong><small>${financialComparison.gapNote}</small></div><div class="metric"><span>COMISSÃO-ALVO MERCANTIL</span><strong>${brl.format(financial.targetMercantileCommission)}</strong></div><div class="metric"><span>COMISSÃO-ALVO SERVIÇOS</span><strong>${brl.format(financial.targetServiceCommission)}</strong></div>`;
    const projectionRate = expectedTotal ? financial.projectedTotal / expectedTotal : 0;
    document.getElementById('sellerProfileDirection').innerHTML = `<strong>Leitura para a reunião:</strong> ${!financial.mercantileRate && !financial.serviceRate ? 'informe as taxas de comissão para ativar as projeções financeiras.' : financial.projectedTotal >= expectedTotal && expectedTotal ? 'a projeção financeira está dentro ou acima do ganho previsto ao bater as metas.' : expectedTotal && financial.projectedTotal ? `a projeção atual está em ${pct.format(projectionRate)} do ganho previsto ao bater as metas.` : `ao atingir as metas cadastradas, a estimativa de ganho é ${brl.format(expectedTotal)}, incluindo repousos e atestados informados.`}`;
    const historyRow = (item) => `<tr><td>${esc(monthLabel(item.month))}</td><td>${brl.format(num(item.seller.general))}</td><td>${brl.format(item.services)}</td><td>${brl.format(item.ticket)}</td><td>${brl.format(item.financial.mercantileCommission)}</td><td>${brl.format(item.financial.serviceCommission)}</td><td>${brl.format(item.financial.dsr)}</td><td>${brl.format(item.financial.total)}</td><td>${pct2.format(item.financial.mercantileRate)}</td></tr>`;
    document.getElementById('sellerProfileHistoryBody').innerHTML = history.length ? history.map(historyRow).join('') : '<tr><td colspan="9">Nenhum histórico disponível.</td></tr>';
    document.getElementById('sellerProfileHistoryCards').innerHTML = history.length ? history.map((item) => `<article class="compiled-card"><header><strong>${esc(monthLabel(item.month))}</strong><span class="trend-badge stable">${pct2.format(item.financial.mercantileRate)}</span></header><div class="compiled-card-grid"><div class="metric"><span>VENDA</span><strong>${brl.format(num(item.seller.general))}</strong></div><div class="metric"><span>SERVIÇOS</span><strong>${brl.format(item.services)}</strong></div><div class="metric"><span>DSR</span><strong>${brl.format(item.financial.dsr)}</strong></div><div class="metric"><span>GANHO TOTAL</span><strong>${brl.format(item.financial.total)}</strong></div></div></article>`).join('') : '<div class="empty">Nenhum histórico disponível.</div>';
  }
  function syncSellerRow(row) {
    if (!row) return null;
    const index = Number(row.dataset.i), seller = db.sellers[index]; if (!seller) return null;
    const textFields = new Set(['name', 'notes', 'commitment', 'deadline', 'resultPeriod', 'resultStart', 'resultEnd']);
    const integerFields = new Set(['nfs', 'days', 'plannedDays', 'restDays', 'justifiedDays']);
    row.querySelectorAll('[data-f]').forEach((element) => {
      const field = element.dataset.f;
      seller[field] = textFields.has(field) ? element.value : integerFields.has(field) ? Math.round(num(element.value)) : num(element.value);
    });
    seller.updatedAt = new Date().toISOString();
    return { index, seller };
  }
  function renderSellers() {
    const branch = calculate(), sellerSales = db.sellers.reduce((sum, seller) => sum + num(seller.general), 0);
    const count = num(db.sellerCount) || db.sellers.length;
    const individualGoal = count ? num(db.mercantileGoal) / count : 0;
    const assignedTotal = db.sellers.reduce((sum, seller) => sum + sellerMetrics(seller).individualGoal, 0);
    const difference = branch.general - sellerSales;
    document.getElementById('sellerSummary').innerHTML = [
      ['Vendedores', db.sellers.length], ['Venda mercantil total informada', brl.format(sellerSales)],
      ['Metas individuais', count ? brl.format(assignedTotal) : 'Não calculadas'], ['Venda geral da filial', brl.format(branch.general)]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const list = document.getElementById('sellerList');
    renderSellerBackupPanel();
    if (!db.sellers.length) { list.innerHTML = '<div class="empty">Nenhum vendedor cadastrado. Toque em “+ Vendedor” para começar.</div>'; return; }
    const reconciliation = `<div class="reconcile ${Math.abs(difference) < 0.01 ? 'ok' : 'warn'}">${Math.abs(difference) < 0.01 ? '✓ A soma dos vendedores confere com a venda geral da filial.' : `Diferença entre filial e vendedores: ${brl.format(difference)}.`}</div>`;
    list.innerHTML = reconciliation + db.sellers.map((seller, index) => {
      const metrics = sellerMetrics(seller), financial = sellerFinancials(seller);
      const money = (field, label) => `<div class="seller-field"><label>${label}</label><input class="money-input" inputmode="decimal" data-f="${field}" value="${num(seller[field]) ? esc(brl.format(num(seller[field]))) : ''}"></div>`;
      const isOpen = openSellerIndex === index;
      const mercTrend = metrics.projectedGap <= 0 ? `Acima ${brl.format(Math.abs(metrics.projectedGap))}` : `Abaixo ${brl.format(metrics.projectedGap)}`;
      const serviceTrend = metrics.serviceProjectedGap <= 0 ? `Acima ${brl.format(Math.abs(metrics.serviceProjectedGap))}` : `Abaixo ${brl.format(metrics.serviceProjectedGap)}`;
      return `<article class="seller-row ${isOpen ? 'is-open' : ''}" data-i="${index}"><button class="seller-accordion-toggle" type="button" data-toggle-seller="${index}"><div class="seller-accordion-name"><strong>${esc(seller.name || `Vendedor ${index + 1}`)}</strong><span>${metrics.plannedDays} dias planejados • ${num(seller.days)} trabalhados • ${metrics.remainingDays} restantes</span></div><div class="seller-accordion-kpi"><span>Venda total</span><strong>${brl.format(num(seller.general))}</strong></div><div class="seller-accordion-kpi"><span>Serviços totais</span><strong>${brl.format(metrics.services)}</strong></div><span class="pill ${statusClass(metrics.rate)}">${pct.format(metrics.rate)}</span><span class="seller-accordion-chevron">⌄</span></button><div class="seller-card-content" ${isOpen ? '' : 'hidden'}><div class="seller-card-head"><input data-f="name" value="${esc(seller.name || '')}" placeholder="Nome do vendedor"><button class="btn danger small" data-remove="${index}">Excluir</button></div><div class="seller-fields">${money('assignedGoal', 'Meta mercantil mensal')}${money('general', 'Venda mercantil do período / acumulada')}${money('eligible', 'Venda elegível do período (base da eficiência)')}${money('warranty', 'Garantias do período')}${money('other', 'Outros serviços do período')}${money('mixed', 'Presta-mista do período')}<div class="seller-service-total"><span>SERVIÇOS TOTAIS AUTOMÁTICOS</span><strong>${brl.format(metrics.services)}</strong><small>Garantias + outros serviços + presta-mista • única base da meta de serviços 7%</small></div><div class="seller-field"><label>Notas fiscais do período</label><input inputmode="numeric" type="number" min="0" step="1" data-f="nfs" value="${num(seller.nfs) || ''}"></div><div class="seller-field"><label>Dias úteis planejados</label><input inputmode="numeric" type="number" min="1" max="31" step="1" data-f="plannedDays" value="${metrics.plannedDays || ''}"></div><div class="seller-field"><label>Dias já trabalhados / considerados</label><input inputmode="numeric" type="number" min="0" max="31" step="1" data-f="days" value="${num(seller.days) || ''}"></div><div class="seller-field"><label>Prazo do compromisso</label><input type="date" data-f="deadline" value="${esc(seller.deadline || '')}"></div><div class="seller-field wide"><label>Direcionamento da reunião</label><textarea data-f="notes" rows="2" placeholder="Pontos discutidos e direcionamento">${esc(seller.notes || '')}</textarea></div><div class="seller-field wide"><label>Compromisso do vendedor</label><textarea data-f="commitment" rows="2" placeholder="Ação, responsável e resultado esperado">${esc(seller.commitment || '')}</textarea></div></div><div class="seller-metrics"><div class="metric"><span>META MERCANTIL</span><strong>${count || num(seller.assignedGoal) ? brl.format(metrics.individualGoal) : '—'}</strong></div><div class="metric"><span>VENDA MERCANTIL TOTAL</span><strong>${brl.format(num(seller.general))}</strong></div><div class="metric"><span>VENDA ELEGÍVEL</span><strong>${brl.format(num(seller.eligible))}</strong></div><div class="metric"><span>SERVIÇOS TOTAIS</span><strong>${brl.format(metrics.services)}</strong></div><div class="metric"><span>META SERVIÇOS 7%</span><strong>${brl.format(metrics.serviceGoal)}</strong></div><div class="metric"><span>ATINGIMENTO MERCANTIL</span><strong class="${statusClass(metrics.rate)}">${pct.format(metrics.rate)}</strong></div><div class="metric"><span>ATINGIMENTO SERVIÇOS</span><strong class="${statusClass(metrics.serviceRate)}">${pct.format(metrics.serviceRate)}</strong></div><div class="metric"><span>FALTA MERCANTIL</span><strong>${brl.format(metrics.missing)}</strong></div><div class="metric"><span>FALTA SERVIÇOS</span><strong>${brl.format(metrics.serviceMissing)}</strong></div><div class="metric"><span>PROJEÇÃO MERCANTIL</span><strong>${brl.format(metrics.projection)}</strong><small>${mercTrend}</small></div><div class="metric"><span>PROJEÇÃO SERVIÇOS</span><strong>${brl.format(metrics.serviceProjection)}</strong><small>${serviceTrend}</small></div><div class="metric"><span>MÉDIA MERCANTIL/DIA</span><strong>${brl.format(metrics.dailyAverage)}</strong></div><div class="metric"><span>MÉDIA SERVIÇOS/DIA</span><strong>${brl.format(metrics.serviceDailyAverage)}</strong></div><div class="metric"><span>NECESSÁRIO MERCANTIL/DIA</span><strong>${brl.format(metrics.neededPerDay)}</strong></div><div class="metric"><span>NECESSÁRIO SERVIÇOS/DIA</span><strong>${brl.format(metrics.serviceNeededPerDay)}</strong></div><div class="metric"><span>DIAS RESTANTES</span><strong>${metrics.remainingDays}</strong></div><div class="metric"><span>EFICIÊNCIA • META 7%</span><strong>${metrics.hasEligible ? efficiencyPct.format(metrics.efficiency) : 'Não calculada'}</strong><small>${metrics.hasEligible ? 'Serviços ÷ elegível' : 'Informe venda elegível'}</small></div><div class="metric"><span>CONVERSÃO • META 35%</span><strong>${num(seller.general) ? efficiencyPct.format(num(seller.eligible) / num(seller.general)) : 'Não calculada'}</strong><small>Elegível ÷ mercantil total</small></div></div></div></article>`;
    }).join('');
    list.querySelectorAll('.seller-row').forEach((row) => {
      const index = Number(row.dataset.i), seller = db.sellers[index], head = row.querySelector('.seller-card-head'), fields = row.querySelector('.seller-fields');
      const financial = sellerFinancials(seller);
      const openButton = document.createElement('button'); openButton.type = 'button'; openButton.className = 'btn primary small seller-open'; openButton.dataset.openSeller = index; openButton.textContent = 'Abrir resultado completo'; head.insertBefore(openButton, head.querySelector('[data-remove]'));
      const extra = document.createElement('div'); extra.className = 'seller-finance-extra';
      extra.innerHTML = `<div class="seller-field"><label>Comissão mercantil (%)</label><input inputmode="decimal" type="number" min="0" max="100" step="0.01" data-f="commissionMercantileRate" value="${num(seller.commissionMercantileRate) || ''}" placeholder="Ex.: 1,5"></div><div class="seller-field"><label>Comissão sobre serviços (%)</label><input inputmode="decimal" type="number" min="0" max="100" step="0.01" data-f="commissionServiceRate" value="${Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5}"></div><div class="seller-field"><label>Dias de repouso remunerado</label><input inputmode="numeric" type="number" min="0" max="31" step="1" data-f="restDays" value="${financial.restDays}"></div><div class="seller-field"><label>Dias justificados / atestado</label><input inputmode="numeric" type="number" min="0" max="31" step="1" data-f="justifiedDays" value="${num(seller.justifiedDays) || ''}"></div>`;
      extra.style.display = 'contents'; fields.insertBefore(extra, fields.querySelector('.wide'));
      const periodBlock = document.createElement('section'); periodBlock.className = 'seller-period-block';
      periodBlock.innerHTML = `<h4>Período dos resultados informados</h4><p>Use “Meta do mês” no início da competência, sem percentual diário. Use “Meta do dia” para compartilhar a missão calculada pelo percentual informado pela empresa.</p><div class="seller-period-grid"><div class="seller-field"><label>Tipo de compartilhamento</label><select data-f="resultPeriod"><option value="goalMonth">Meta do mês, sem resultado</option><option value="none">Meta do dia, sem resultado</option><option value="day">Resultado do dia</option><option value="week">Resultado da semana</option><option value="fortnight">Resultado da quinzena</option><option value="accumulated">Acumulado até o momento</option><option value="month">Fechamento do mês</option><option value="custom">Período personalizado</option></select></div><div class="seller-field"><label>Data inicial</label><input type="date" data-f="resultStart" value="${esc(seller.resultStart || '')}"></div><div class="seller-field"><label>Data final</label><input type="date" data-f="resultEnd" value="${esc(seller.resultEnd || '')}"></div></div><div class="seller-fixed-targets"><span>Eficiência de serviços: 7%</span><span>Taxa de conversão: 35%</span><span>Conversão: elegível ÷ mercantil total</span></div>`;
      fields.insertBefore(periodBlock, fields.querySelector('.wide'));
      periodBlock.querySelector('[data-f="resultPeriod"]').value = sellerResultPeriod(seller);
      const financeSummary = document.createElement('div'), rowFinancial = sellerFinancials(seller);
      financeSummary.className = 'seller-metrics seller-finance-summary';
      const rowFinancialComparison = sellerFinancialComparison(seller);
      financeSummary.innerHTML = `<div class="metric"><span>COMISSÃO MERCANTIL</span><strong>${pct2.format(rowFinancial.mercantileRate)}</strong></div><div class="metric"><span>COMISSÃO SERVIÇOS</span><strong>${pct2.format(rowFinancial.serviceRate)}</strong></div><div class="metric"><span>${rowFinancialComparison.currentLabel.toUpperCase()}</span><strong>${brl.format(rowFinancialComparison.current)}</strong></div><div class="metric"><span>GANHO SE BATER AS METAS</span><strong>${brl.format(rowFinancial.targetTotal)}</strong><small>Inclui repousos e atestados</small></div><div class="metric"><span>${rowFinancialComparison.gapLabel.toUpperCase()}</span><strong>${brl.format(Math.abs(rowFinancialComparison.gap))}</strong><small>${rowFinancialComparison.gapNote}</small></div>`;
      row.querySelector('.seller-card-content').appendChild(financeSummary);
    });
    list.querySelectorAll('[data-toggle-seller]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.toggleSeller); openSellerIndex = openSellerIndex === index ? null : index; renderSellers();
    }));
    list.querySelectorAll('.money-input').forEach(bindMoneyBehavior);
    list.querySelectorAll('[data-f]').forEach((element) => element.addEventListener('change', (event) => {
      const field = event.target.dataset.f; syncSellerRow(event.target.closest('[data-i]'));
      persist(); renderSellers(); renderScopeSelector(); renderCompiled(); if (field === 'name') renderGoalsHistory(); if (activeScope !== 'branch') renderOverview();
    }));
    list.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      if (confirm('Excluir este vendedor da competência atual?')) { db.sellers.splice(Number(button.dataset.remove), 1); openSellerIndex = null; activeScope = 'branch'; persist(); renderSellers(); renderScopeSelector(); renderOverview(); }
    }));
    list.querySelectorAll('[data-open-seller]').forEach((button) => button.addEventListener('click', () => {
      const synced = syncSellerRow(button.closest('[data-i]')); if (!synced) return; persist(false);
      const { seller, index } = synced;
      activeSellerProfileId = sellerIdentity(seller, index); activeScope = `seller:${index}`;
      renderSellerProfile(); renderScopeSelector(); showView('sellerProfile');
    }));
  }

  const sellerResultFields = ['general', 'eligible', 'warranty', 'other', 'mixed', 'nfs', 'days', 'justifiedDays'];
  function renderSellerBackupPanel(message = '') {
    const select = document.getElementById('sellerBackupTarget'); if (!select) return;
    const previous = select.value || 'auto';
    select.innerHTML = '<option value="auto">Identificar automaticamente pelo arquivo</option>' + db.sellers.map((seller, index) => `<option value="${esc(sellerIdentity(seller, index))}">${esc(seller.name || `Vendedor ${index + 1}`)}</option>`).join('');
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    const result = document.getElementById('sellerBackupResult');
    if (message) result.innerHTML = `<div class="audit-item">${message}</div>`;
  }
  function selectedBackupSeller(requireSelection = true) {
    const selected = document.getElementById('sellerBackupTarget').value;
    if (selected !== 'auto') return db.sellers.find((seller, index) => sellerIdentity(seller, index) === selected) || null;
    if (activeScope.startsWith('seller:')) return db.sellers[Number(activeScope.split(':')[1])] || null;
    if (db.sellers.length === 1) return db.sellers[0];
    if (requireSelection) alert('Selecione um vendedor antes de continuar.');
    return null;
  }
  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 700);
  }
  function sellerBackupPayload(seller) {
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || 'Vendedor';
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const exportedAt = new Date().toISOString(), exportId = `seller-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const records = Object.values(vault.records || {}).filter((record) => String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch).map((record) => {
      const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
      return match ? { month: record.month, branch: record.branch, businessDays: record.businessDays, snapshotAt: match.updatedAt || record.updatedAt || exportedAt, seller: clone({ ...match, id }) } : null;
    }).filter(Boolean).sort((a, b) => a.month.localeCompare(b.month));
    return {
      kind: 'fs-seller-backup', version: 2, mode: 'snapshot-replace', exportId, exportedAt,
      seller: { id, name }, origin: { branch: db.branch || '', month: db.month },
      records, historyEntries: (vault.historyEntries || []).filter((entry) => sellerKey(entry.seller) === sellerKey(name)).map(clone)
    };
  }
  function recordForSellerImport(branch, month) {
    const key = recordKey(branch, month);
    if (vault.records[key]) return normalizeRecord(vault.records[key]);
    return normalizeRecord({ ...baseRecord(branch, month), businessDays: db.businessDays, weeks: db.weeks, mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal, servicesGoal: db.servicesGoal, efficiencyGoal: db.efficiencyGoal, warrantyGoal: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly, sellers: [] });
  }
  function importSellerPayload(payload, forcedSeller = null, filename = 'backup.json') {
    if (payload?.kind !== 'fs-seller-backup' || ![1, 2].includes(payload.version) || !payload.seller || !Array.isArray(payload.records)) throw new Error(`${filename}: arquivo não é um backup individual válido.`);
    const canonicalId = forcedSeller ? sellerIdentity(forcedSeller, db.sellers.indexOf(forcedSeller)) : String(payload.seller.id || sellerIdentity(payload.seller));
    const canonicalName = forcedSeller?.name || payload.seller.name || 'Vendedor importado';
    const destinationBranch = db.branch || payload.origin?.branch || 'SEM FILIAL';
    let updatedMonths = 0, unchangedMonths = 0, protectedMonths = 0;
    payload.records.forEach((incomingRecord) => {
      if (!/^\d{4}-\d{2}$/.test(incomingRecord.month || '') || !incomingRecord.seller) return;
      const record = recordForSellerImport(destinationBranch, incomingRecord.month);
      const index = record.sellers.findIndex((seller, sellerIndex) => sellerIdentity(seller, sellerIndex) === canonicalId || sellerKey(seller.name) === sellerKey(canonicalName));
      const current = index >= 0 ? record.sellers[index] : null;
      const incomingStamp = incomingRecord.snapshotAt || incomingRecord.seller.updatedAt || payload.exportedAt || new Date(0).toISOString();
      const currentStamp = current?._sync?.lastSnapshotAt || current?.updatedAt || new Date(0).toISOString();
      const sameExport = Boolean(current?._sync?.lastExportId && payload.exportId && current._sync.lastExportId === payload.exportId);
      const currentHasResults = Boolean(current && (sellerResultFields.some((field) => num(current[field]) > 0) || current.notes || current.commitment));
      if (currentHasResults && (sameExport || Date.parse(incomingStamp) === Date.parse(currentStamp))) { unchangedMonths += 1; return; }
      if (currentHasResults && Date.parse(incomingStamp) < Date.parse(currentStamp)) { protectedMonths += 1; return; }
      const merged = { ...(current || {}), ...clone(incomingRecord.seller), id: canonicalId, name: canonicalName, updatedAt: incomingStamp, _sync: { lastSnapshotAt: incomingStamp, lastExportId: payload.exportId || '', importedAt: new Date().toISOString(), source: 'backup-individual' } };
      if (num(current?.assignedGoal)) merged.assignedGoal = current.assignedGoal;
      if (index >= 0) record.sellers[index] = merged; else record.sellers.push(merged);
      vault.records[recordKey(destinationBranch, incomingRecord.month)] = normalizeRecord(record); updatedMonths += 1;
    });
    if (!vault.historyEntries) vault.historyEntries = [];
    (payload.historyEntries || []).forEach((entry) => {
      const normalized = { ...clone(entry), branch: destinationBranch, seller: canonicalName };
      const index = vault.historyEntries.findIndex((item) => String(item.branch).toLocaleUpperCase('pt-BR') === destinationBranch.toLocaleUpperCase('pt-BR') && sellerKey(item.seller) === sellerKey(canonicalName) && item.month === normalized.month);
      if (index >= 0) vault.historyEntries[index] = normalized; else vault.historyEntries.push(normalized);
    });
    if (!Array.isArray(vault.importLog)) vault.importLog = [];
    vault.importLog.push({ at: new Date().toISOString(), filename, sellerId: canonicalId, seller: canonicalName, months: updatedMonths, unchangedMonths, protectedMonths, exportId: payload.exportId || '' });
    vault.importLog = vault.importLog.slice(-100);
    return { seller: canonicalName, months: updatedMonths, unchangedMonths, protectedMonths };
  }
  const readJsonFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => { try { resolve(JSON.parse(reader.result)); } catch (error) { reject(new Error(`${file.name}: JSON inválido.`)); } }; reader.onerror = () => reject(new Error(`${file.name}: não foi possível ler o arquivo.`)); reader.readAsText(file);
  });

  const sellerKey = (name) => String(name || '').trim().toLocaleLowerCase('pt-BR');
  function previousMonth(month, offset = 1) {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(year, number - 1 - offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  const average = (values) => values.length ? values.reduce((sum, value) => sum + num(value), 0) / values.length : 0;
  const signedPct = (value) => `${value > 0 ? '+' : ''}${pct.format(value)}`;
  const trendClass = (value) => value > 0.025 ? 'up' : value < -0.025 ? 'down' : 'stable';
  const trendLabel = (value) => value > 0.025 ? 'Crescimento' : value < -0.025 ? 'Queda' : 'Estável';
  function branchResultFromRecord(record) {
    const days = Object.values(record.daily || {});
    const dailySales = days.reduce((sum, day) => sum + num(day.general), 0) + num(record.ecommerce);
    const sellerSales = (record.sellers || []).reduce((sum, seller) => sum + num(seller.general), 0);
    return Math.max(0, dailySales || sellerSales);
  }
  function relativeMonth(month, offset) {
    const [year, number] = String(month || db.month).split('-').map(Number);
    const date = new Date(year, number - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function recordForMonth(month) {
    if (month === db.month) return db;
    const direct = vault.records?.[recordKey(db.branch, month)];
    if (direct) return direct;
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    return Object.values(vault.records || {}).find((record) => record.month === month && String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch) || null;
  }
  function recordCalendar(record, month) {
    const [year, number] = month.split('-').map(Number), count = new Date(year, number, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(year, number - 1, index + 1), key = `${month}-${String(index + 1).padStart(2, '0')}`;
      const stored = record?.daily?.[key] || {};
      return { date, key, data: { status: date.getDay() === 0 ? 'off' : 'pending', ...stored } };
    });
  }
  function recordAggregate(items, record) {
    const days = items.map((item) => item.data || item), working = days.filter((day) => day.status !== 'off');
    const sales = days.reduce((sum, day) => sum + num(day.general), 0), eligible = days.reduce((sum, day) => sum + num(day.eligible), 0);
    const services = days.reduce((sum, day) => sum + num(day.warranty) + num(day.other) + num(day.mixed), 0);
    const nfs = days.reduce((sum, day) => sum + num(day.nfs), 0), worked = days.filter((day) => day.status === 'done').length;
    return { sales, eligible, services, nfs, worked, plannedDays: working.length, efficiency: eligible ? services / eligible : 0, ticket: nfs ? sales / nfs : 0, ecommerce: 0 };
  }
  function makePeriodPoint({ label, sublabel, stats, target, serviceTarget, sellerCount, hasData }) {
    const sales = Math.max(0, stats.sales + num(stats.ecommerce)), services = stats.services;
    const plannedDays = Math.max(1, stats.plannedDays), worked = stats.worked;
    const gap = Math.max(0, target - sales), serviceGap = Math.max(0, serviceTarget - services);
    return { label, sublabel, sales, services, target, serviceTarget, rate: target ? sales / target : 0, serviceRate: serviceTarget ? services / serviceTarget : 0, worked, plannedDays, averageDay: worked ? sales / worked : 0, targetDay: target / plannedDays, gap, gapDay: gap / plannedDays, gapSeller: gap / Math.max(1, sellerCount), serviceAverageDay: worked ? services / worked : 0, serviceTargetDay: serviceTarget / plannedDays, serviceGap, serviceGapDay: serviceGap / plannedDays, serviceGapSeller: serviceGap / Math.max(1, sellerCount), sellerCount, ticket: stats.ticket, nfs: stats.nfs, projection: worked ? (sales / worked) * plannedDays : 0, efficiency: stats.efficiency, hasData };
  }
  function compiledTemporalAnalysis() {
    const interval = document.getElementById('compiledPeriod')?.value || vault.compiledPreferences?.period || 'month';
    const reference = document.getElementById('compiledReference')?.value || vault.compiledPreferences?.reference || db.month;
    let points = [];
    if (interval === 'month') {
      const record = recordForMonth(reference), calendar = recordCalendar(record, reference), buckets = calendarWeekBuckets(calendar, record?.weekEnds), weekCount = buckets.length;
      const monthWorkingDays = calendar.filter((item) => item.data.status !== 'off').length;
      points = buckets.map((items, index) => {
        const stats = recordAggregate(items, record), working = items.filter((item) => item.data.status !== 'off');
        const configured = working.filter((item) => num(item.data.goalPercent) > 0), share = configured.reduce((sum, item) => sum + num(item.data.goalPercent), 0) / 100;
        const useDaily = working.length > 0 && configured.length === working.length;
        const plannedShare = monthWorkingDays ? working.length / monthWorkingDays : 1 / Math.max(1, weekCount);
        const target = num(record?.mercantileGoal) * (useDaily ? share : plannedShare);
        const serviceTarget = useDaily ? num(record?.mercantileGoal) * share * 0.07 : num(record?.servicesGoal) * plannedShare;
        const sellerCount = Math.max(1, num(record?.sellerCount), (record?.sellers || []).filter((seller) => seller.name?.trim()).length);
        const first = items[0].date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), last = items.at(-1).date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const pendingDays = items.filter((item) => item.data.status === 'pending').length;
        return { ...makePeriodPoint({ label: `${index + 1}ª semana`, sublabel: `${first} a ${last}`, stats, target, serviceTarget, sellerCount, hasData: Boolean(record && (stats.worked || stats.sales || stats.services)) }), phase: weekPhase(items, pendingDays), pendingDays };
      });
    } else {
      const length = interval === 'quarter' ? 3 : interval === 'semester' ? 6 : 12;
      const months = Array.from({ length }, (_, index) => relativeMonth(reference, index - length + 1));
      points = months.map((month) => {
        const record = recordForMonth(month), stats = recordAggregate(recordCalendar(record, month), record);
        stats.ecommerce = num(record?.ecommerce);
        const target = num(record?.mercantileGoal), serviceTarget = num(record?.servicesGoal) || target * 0.07;
        const sellerCount = Math.max(1, num(record?.sellerCount), (record?.sellers || []).filter((seller) => seller.name?.trim()).length);
        return makePeriodPoint({ label: monthLabel(month), sublabel: record ? `${stats.worked} dia(s) lançado(s)` : 'Sem dados armazenados', stats, target, serviceTarget, sellerCount, hasData: Boolean(record && (stats.worked || stats.sales || stats.services)) });
      });
    }
    const valid = points.filter((point) => point.hasData), ranked = [...valid].sort((a, b) => b.rate - a.rate);
    const totals = valid.reduce((sum, point) => ({ sales: sum.sales + point.sales, services: sum.services + point.services, target: sum.target + point.target, serviceTarget: sum.serviceTarget + point.serviceTarget, worked: sum.worked + point.worked, gap: sum.gap + point.gap, nfs: sum.nfs + point.nfs }), { sales: 0, services: 0, target: 0, serviceTarget: 0, worked: 0, gap: 0, nfs: 0 });
    return { interval, reference, points, valid, best: ranked[0] || null, worst: ranked.at(-1) || null, bestEfficiency: [...valid].sort((a, b) => b.efficiency - a.efficiency)[0] || null, totals };
  }
  function renderTemporalDashboard() {
    const data = compiledTemporalAnalysis(), totals = data.totals;
    const intervalName = data.interval === 'month' ? monthLabel(data.reference) : data.interval === 'quarter' ? 'trimestre móvel' : data.interval === 'semester' ? 'semestre móvel' : 'últimos 12 meses';
    document.getElementById('periodDashboardHint').textContent = data.interval === 'month' ? `${monthLabel(data.reference)} detalhado por semanas.` : `${intervalName} encerrado em ${monthLabel(data.reference)}, detalhado por meses.`;
    document.getElementById('periodSummary').innerHTML = [
      ['Venda no período', brl.format(totals.sales)], ['Atingimento mercantil', totals.target ? pct.format(totals.sales / totals.target) : 'Sem meta'],
      ['Média por dia lançado', brl.format(totals.worked ? totals.sales / totals.worked : 0)], ['Falta total', brl.format(totals.gap)]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('periodHighlights').innerHTML = data.valid.length ? [
      ['MELHOR PERÍODO', data.best.label, `${pct.format(data.best.rate)} da meta`], ['PERÍODO DE ATENÇÃO', data.worst.label, `${pct.format(data.worst.rate)} da meta`],
      ['MAIOR EFICIÊNCIA', data.bestEfficiency.label, efficiencyPct.format(data.bestEfficiency.efficiency)]
    ].map(([label, value, note]) => `<article class="period-highlight"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('') : '<div class="empty">Ainda não há lançamentos no intervalo escolhido.</div>';
    document.getElementById('periodChart').innerHTML = data.points.map((point) => `<article class="period-chart-row"><div class="period-chart-head"><strong>${esc(point.label)}</strong><span>${point.hasData ? `${brl.format(point.sales)} · ${pct.format(point.rate)}` : 'Sem dados'}</span></div><div class="bar-line"><label>Mercantil</label><div class="bar-track"><span class="bar-fill" style="width:${Math.min(100, point.rate * 100).toFixed(2)}%"></span></div><b>${pct.format(point.rate)}</b></div><div class="bar-line"><label>Serviços</label><div class="bar-track"><span class="bar-fill service" style="width:${Math.min(100, point.serviceRate * 100).toFixed(2)}%"></span></div><b>${pct.format(point.serviceRate)}</b></div></article>`).join('');
    document.getElementById('periodDetailGrid').innerHTML = data.points.map((point) => {
      const marker = point.phase === 'future' ? '' : point.phase === 'current' ? 'current' : point.phase === 'closed' ? (point.rate >= 1 ? 'achieved' : 'missed') : point.hasData ? (point.rate >= 1 ? 'achieved' : 'missed') : '';
      const efficiencyReached = num(db.efficiencyGoal) > 0 && point.efficiency >= num(db.efficiencyGoal);
      const mini = (label, value, className = '', boxClass = '') => `<div class="period-mini ${boxClass}"><span>${label}</span><strong class="${className}">${value}</strong></div>`;
      return `<article class="period-detail ${marker}"><header><div><strong>${esc(point.label)}</strong><small>${esc(point.sublabel)}</small></div><div class="period-rate ${statusClass(point.rate)}">${pct.format(point.rate)}</div></header><div class="period-detail-metrics">${mini('VENDA', brl.format(point.sales), '', point.hasData ? point.rate >= 1 ? 'status-pass' : 'status-fail' : '')}${mini('META', brl.format(point.target))}${mini('MÉDIA / DIA', brl.format(point.averageDay))}${mini('META / DIA', brl.format(point.targetDay))}${mini('FALTA TOTAL', brl.format(point.gap), point.gap ? 'negative' : 'positive')}${mini('FALTA / DIA', brl.format(point.gapDay), point.gap ? 'negative' : 'positive')}${mini('FALTA / VENDEDOR', brl.format(point.gapSeller), point.gap ? 'negative' : 'positive')}${mini('PROJEÇÃO', brl.format(point.projection))}${mini('TICKET MÉDIO', brl.format(point.ticket))}${mini('SERVIÇOS', brl.format(point.services))}${mini('SERVIÇOS / DIA', brl.format(point.serviceAverageDay))}${mini('SERVIÇOS: FALTA / DIA', brl.format(point.serviceGapDay), point.serviceGap ? 'negative' : 'positive')}${mini('SERVIÇOS: FALTA / VEND.', brl.format(point.serviceGapSeller), point.serviceGap ? 'negative' : 'positive')}${mini('EFICIÊNCIA', point.hasData && point.efficiency > 0 ? efficiencyPct.format(point.efficiency) : 'Não calculada', '', point.hasData && point.efficiency > 0 ? efficiencyReached ? 'status-pass' : 'status-fail' : '')}${mini('NOTAS FISCAIS', point.nfs)}</div></article>`;
    }).join('');
  }
  function compiledAnalysis() {
    const selectedPeriod = document.getElementById('compiledPeriod')?.value || vault.compiledPreferences?.period || 'month';
    const period = selectedPeriod === 'semester' ? 6 : selectedPeriod === 'year' ? 12 : 3;
    const months = Array.from({ length: period }, (_, index) => previousMonth(db.month, index + 1));
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const historicalRecords = months.map((month) => vault.records[recordKey(db.branch, month)]).filter((record) => record && String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch);
    const branchHistory = historicalRecords.map(branchResultFromRecord).filter((value) => value > 0);
    const branchCurrent = calculate(), branchProjection = branchCurrent.projection;
    const branchBaseline = average(branchHistory) || num(db.mercantileGoal), branchHasData = branchCurrent.worked > 0 || branchCurrent.revenue > 0;
    const branchTrend = branchHasData && branchBaseline ? branchProjection / branchBaseline - 1 : 0;
    const rows = db.sellers.filter((seller) => seller.name?.trim()).map((seller, sellerIndex) => {
      const id = sellerIdentity(seller, sellerIndex), name = seller.name.trim(), metrics = sellerMetrics(seller);
      const historyMap = new Map();
      historicalRecords.forEach((record) => {
        const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
        if (match) historyMap.set(record.month, num(match.general));
      });
      (vault.historyEntries || []).forEach((entry) => { if (String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') === branch && sellerKey(entry.seller) === sellerKey(name) && months.includes(entry.month)) historyMap.set(entry.month, num(entry.sales)); });
      const historyValues = [...historyMap.values()].filter((value) => value > 0), historicalAverage = average(historyValues);
      const baseline = historicalAverage || metrics.individualGoal, currentProjection = metrics.projection;
      const sellerTrend = baseline ? currentProjection / baseline - 1 : 0, goalRate = metrics.individualGoal ? currentProjection / metrics.individualGoal : 0;
      const trendGap = sellerTrend - branchTrend;
      const sellerHasData = num(seller.days) > 0 || num(seller.general) > 0;
      let diagnosis = sellerHasData ? 'Acompanhando a filial' : 'Aguardando lançamentos', diagnosisClass = 'stable';
      if (sellerHasData && goalRate >= 1 && trendGap >= -0.05) { diagnosis = 'Crescendo com a filial'; diagnosisClass = 'up'; }
      else if (sellerHasData && trendGap > 0.10) { diagnosis = 'Acima do ritmo da filial'; diagnosisClass = 'up'; }
      else if (sellerHasData && (trendGap < -0.10 || goalRate < 0.85)) { diagnosis = 'Abaixo do ritmo esperado'; diagnosisClass = 'down'; }
      const strengths = [], attentions = [], opportunities = [];
      if (goalRate >= 1) strengths.push('projeção acima da meta individual');
      if (metrics.efficiency >= num(db.efficiencyGoal)) strengths.push('eficiência dentro ou acima da meta');
      if (trendGap > 0.05) strengths.push('crescimento superior ao da filial');
      if (sellerHasData && goalRate < 0.85) attentions.push(`projeção em ${pct.format(goalRate)} da meta`);
      if (trendGap < -0.10) attentions.push('evolução abaixo do movimento da filial');
      if (metrics.efficiency < num(db.efficiencyGoal)) opportunities.push(`elevar eficiência para ${efficiencyPct.format(num(db.efficiencyGoal))}`);
      if (metrics.dailyAverage && metrics.individualGoal > currentProjection) opportunities.push(`buscar ${brl.format((metrics.individualGoal - num(seller.general)) / Math.max(1, metrics.plannedDays - num(seller.days)))} por dia restante`);
      return { id, name, metrics, currentProjection, historicalAverage, historyCount: historyValues.length, sellerTrend, branchTrend, trendGap, goalRate, diagnosis, diagnosisClass, strengths, attentions, opportunities };
    });
    return { period, months, branchCurrent, branchProjection, branchBaseline, branchTrend, branchHasData, branchHistoryCount: branchHistory.length, rows };
  }
  function renderCompiled() {
    const mode = document.getElementById('compiledMode'); if (!mode) return;
    const periodSelect = document.getElementById('compiledPeriod');
    const referenceInput = document.getElementById('compiledReference');
    if (!periodSelect.dataset.ready) {
      const savedPeriod = vault.compiledPreferences?.period;
      periodSelect.value = ['month', 'quarter', 'semester', 'year'].includes(savedPeriod) ? savedPeriod : savedPeriod === '6' ? 'semester' : savedPeriod === '12' ? 'year' : 'month';
      referenceInput.value = vault.compiledPreferences?.reference || db.month;
      periodSelect.dataset.ready = '1';
    }
    const previous = mode.value || vault.compiledPreferences?.mode || 'all';
    mode.innerHTML = '<option value="all">Filial × todos os vendedores</option>' + db.sellers.filter((seller) => seller.name?.trim()).map((seller, index) => `<option value="${esc(sellerIdentity(seller, index))}">Filial × ${esc(seller.name.trim())}</option>`).join('');
    if ([...mode.options].some((option) => option.value === previous)) mode.value = previous;
    renderTemporalDashboard();
    const data = compiledAnalysis(), visibleRows = mode.value === 'all' ? data.rows : data.rows.filter((row) => row.id === mode.value);
    const aligned = data.rows.filter((row) => row.diagnosisClass !== 'down').length, growing = data.rows.filter((row) => row.sellerTrend > 0.025).length, attention = data.rows.filter((row) => row.diagnosisClass === 'down').length;
    document.getElementById('compiledSummary').innerHTML = [
      ['Projeção da filial', brl.format(data.branchProjection)], ['Tendência da filial', signedPct(data.branchTrend)],
      ['Vendedores acompanhando', `${aligned} de ${data.rows.length}`], ['Precisam de atenção', attention]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('branchTrendPanel').innerHTML = `<div class="trend-hero"><span>Panorama da filial</span><div class="trend-value">${signedPct(data.branchTrend)}</div><div>${trendLabel(data.branchTrend)} na projeção atual</div><div class="muted">Comparação com ${data.branchHistoryCount ? `a média de ${data.branchHistoryCount} competência(s)` : 'a meta atual, pois ainda não há histórico suficiente'}.</div></div><div class="trend-details"><div class="metric"><span>PROJEÇÃO ATUAL</span><strong>${brl.format(data.branchProjection)}</strong></div><div class="metric"><span>BASE COMPARATIVA</span><strong>${brl.format(data.branchBaseline)}</strong></div><div class="metric"><span>VENDEDORES EM CRESCIMENTO</span><strong>${growing}</strong></div><div class="metric"><span>EFICIÊNCIA DA FILIAL</span><strong>${efficiencyPct.format(data.branchCurrent.efficiency)}</strong></div></div>`;
    const rowHtml = (row) => `<tr><td class="compiled-person"><strong>${esc(row.name)}</strong><span>${row.historyCount ? `${row.historyCount} mês(es) na base` : 'sem histórico; comparação pela meta'}</span></td><td>${brl.format(row.currentProjection)}</td><td>${row.historicalAverage ? brl.format(row.historicalAverage) : '—'}</td><td><span class="trend-badge ${trendClass(row.sellerTrend)}">${signedPct(row.sellerTrend)}</span></td><td><span class="trend-badge ${trendClass(row.branchTrend)}">${signedPct(row.branchTrend)}</span></td><td class="${statusClass(row.goalRate)}">${pct.format(row.goalRate)}</td><td>${efficiencyPct.format(row.metrics.efficiency)}</td><td><span class="trend-badge ${row.diagnosisClass}">${esc(row.diagnosis)}</span></td></tr>`;
    document.getElementById('compiledTableBody').innerHTML = visibleRows.length ? visibleRows.map(rowHtml).join('') : '<tr><td colspan="8">Cadastre vendedores e resultados para gerar o comparativo.</td></tr>';
    document.getElementById('compiledCards').innerHTML = visibleRows.length ? visibleRows.map((row) => `<article class="compiled-card"><header><div><strong>${esc(row.name)}</strong><div class="muted">${row.historyCount ? `${row.historyCount} mês(es) analisados` : 'Comparação pela meta'}</div></div><span class="trend-badge ${row.diagnosisClass}">${esc(row.diagnosis)}</span></header><div class="compiled-card-grid"><div class="metric"><span>PROJEÇÃO</span><strong>${brl.format(row.currentProjection)}</strong></div><div class="metric"><span>TENDÊNCIA</span><strong>${signedPct(row.sellerTrend)}</strong></div><div class="metric"><span>META</span><strong>${pct.format(row.goalRate)}</strong></div><div class="metric"><span>EFICIÊNCIA</span><strong>${efficiencyPct.format(row.metrics.efficiency)}</strong></div></div></article>`).join('') : '<div class="empty">Cadastre vendedores e resultados para gerar o comparativo.</div>';
    const names = (items) => items.map((row) => row.name).join(', ');
    const strongRows = visibleRows.filter((row) => row.strengths.length), attentionRows = visibleRows.filter((row) => row.attentions.length), opportunityRows = visibleRows.filter((row) => row.opportunities.length);
    const individual = visibleRows.length === 1 ? visibleRows[0] : null;
    document.getElementById('compiledInsights').innerHTML = `<article class="insight-card strength"><h3>Pontos fortes</h3><p>${individual ? (individual.strengths.join('; ') || 'Ainda não há destaque consolidado; acompanhe a evolução durante o mês.') : (strongRows.length ? `${esc(names(strongRows))}: apresentam indicadores positivos no período.` : 'Nenhum destaque consolidado ainda.')}</p></article><article class="insight-card attention"><h3>Pontos de atenção</h3><p>${individual ? (individual.attentions.join('; ') || 'Sem alerta crítico no momento.') : (attentionRows.length ? `${esc(names(attentionRows))}: estão abaixo do ritmo esperado e precisam de acompanhamento.` : 'Equipe acompanhando o ritmo esperado.')}</p></article><article class="insight-card opportunity"><h3>Oportunidade e direcionamento</h3><p>${individual ? (individual.opportunities.join('; ') || 'Manter o ritmo e reforçar as práticas que estão funcionando.') : (opportunityRows.length ? `Priorizar plano de ação com ${esc(names(opportunityRows))}, revisando necessidade diária, eficiência e serviços.` : 'Manter acompanhamento semanal e reconhecer a evolução da equipe.')}</p></article>`;
  }
  function selectedHistoryMonths(period = '3') {
    if (period === 'previousYear') {
      const year = Number(db.month.slice(0, 4)) - 1;
      return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    }
    return Array.from({ length: Math.max(1, Number(period) || 3) }, (_, index) => previousMonth(db.month, index + 1));
  }
  function allSellerHistory() {
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const merged = new Map();
    Object.values(vault.records || {}).forEach((record) => {
      if (String(record.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || !Array.isArray(record.sellers)) return;
      record.sellers.forEach((seller) => {
        if (!seller.name || !num(seller.general)) return;
        const entry = { branch: record.branch, seller: seller.name.trim(), month: record.month, sales: num(seller.general), days: num(seller.days), source: 'Resultado mensal da plataforma', manual: false };
        merged.set(`${sellerKey(entry.seller)}|${entry.month}`, entry);
      });
    });
    (vault.historyEntries || []).forEach((entry) => {
      if (String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || !entry.seller || !entry.month) return;
      merged.set(`${sellerKey(entry.seller)}|${entry.month}`, { ...entry, sales: num(entry.sales), days: num(entry.days), manual: true });
    });
    return [...merged.values()];
  }
  function goalSuggestions() {
    const period = document.getElementById('historyPeriod')?.value || vault.goalPreferences?.period || '3';
    const method = document.getElementById('goalMethod')?.value || vault.goalPreferences?.method || 'share';
    const monthSet = new Set(selectedHistoryMonths(period));
    const history = allSellerHistory().filter((entry) => monthSet.has(entry.month));
    const names = new Map();
    db.sellers.forEach((seller) => { if (seller.name?.trim()) names.set(sellerKey(seller.name), seller.name.trim()); });
    history.forEach((entry) => names.set(sellerKey(entry.seller), entry.seller.trim()));
    const count = names.size;
    const teamTotal = history.reduce((sum, entry) => sum + num(entry.sales), 0);
    const rows = [...names].map(([key, name]) => {
      const entries = history.filter((entry) => sellerKey(entry.seller) === key);
      const total = entries.reduce((sum, entry) => sum + num(entry.sales), 0);
      const days = entries.reduce((sum, entry) => sum + num(entry.days), 0);
      const months = new Set(entries.map((entry) => entry.month)).size;
      const monthlyAverage = months ? total / months : 0;
      const share = teamTotal ? total / teamTotal : count ? 1 / count : 0;
      let suggested = method === 'average' ? monthlyAverage : method === 'equal' ? num(db.mercantileGoal) / Math.max(1, count) : num(db.mercantileGoal) * share;
      if (!suggested && count) suggested = num(db.mercantileGoal) / count;
      const goalShare = num(db.mercantileGoal) ? suggested / num(db.mercantileGoal) : 0;
      return { key, name, entries, months, total, days, monthlyAverage, weeklyAverage: monthlyAverage / 4.33, dailyAverage: days ? total / days : 0, share, suggested, grossReference: num(db.grossProfitGoal) * goalShare };
    }).sort((a, b) => b.suggested - a.suggested || a.name.localeCompare(b.name, 'pt-BR'));
    return { period, method, history, rows, teamTotal, analyzedMonths: monthSet.size };
  }
  function renderGoalsHistory() {
    const period = document.getElementById('historyPeriod'), method = document.getElementById('goalMethod');
    if (!period || !method) return;
    period.value = vault.goalPreferences?.period || period.value || '3';
    method.value = vault.goalPreferences?.method || method.value || 'share';
    const data = goalSuggestions();
    const recommendedTotal = data.rows.reduce((sum, row) => sum + row.suggested, 0);
    const averageTeamMonth = data.history.length ? data.teamTotal / Math.max(1, new Set(data.history.map((entry) => entry.month)).size) : 0;
    document.getElementById('goalMethodNote').textContent = data.method === 'share'
      ? 'A meta da filial é distribuída conforme a participação de cada vendedor no período. A soma das metas individuais fecha com a meta mercantil da filial.'
      : data.method === 'average'
        ? 'Cada meta sugerida repete a média mensal real do vendedor. A soma pode ficar acima ou abaixo da meta da filial.'
        : 'A meta mercantil da filial é dividida igualmente entre os vendedores cadastrados ou encontrados no histórico.';
    document.getElementById('historySummary').innerHTML = [
      ['Período de referência', data.period === 'previousYear' ? 'Ano anterior' : `${data.analyzedMonths} meses`],
      ['Vendedores analisados', data.rows.length],
      ['Média mensal da equipe', brl.format(averageTeamMonth)],
      ['Total das metas sugeridas', brl.format(recommendedTotal)]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const emptyRow = '<tr><td colspan="9" class="empty">Cadastre vendedores e resultados históricos para calcular as médias.</td></tr>';
    document.getElementById('goalSuggestionBody').innerHTML = data.rows.length ? data.rows.map((row) => `<tr><td class="history-person"><strong>${esc(row.name)}</strong><span>${row.entries.length ? `${row.entries.length} registro(s)` : 'Sem histórico'}</span></td><td>${row.months}</td><td>${brl.format(row.total)}</td><td>${brl.format(row.monthlyAverage)}</td><td>${brl.format(row.weeklyAverage)}</td><td>${brl.format(row.dailyAverage)}</td><td>${pct.format(row.share)}</td><td><strong>${brl.format(row.suggested)}</strong></td><td>${brl.format(row.grossReference)}</td></tr>`).join('') : emptyRow;
    document.getElementById('goalSuggestionCards').innerHTML = data.rows.length ? data.rows.map((row) => `<article class="history-card"><h3>${esc(row.name)}</h3><div class="muted">${row.months} mês(es) com resultado • participação ${pct.format(row.share)}</div><div class="history-stats"><div class="metric"><span>MÉDIA/MÊS</span><strong>${brl.format(row.monthlyAverage)}</strong></div><div class="metric"><span>MÉDIA/DIA</span><strong>${brl.format(row.dailyAverage)}</strong></div><div class="metric"><span>MÉDIA/SEMANA</span><strong>${brl.format(row.weeklyAverage)}</strong></div><div class="metric"><span>LUCRO REFERÊNCIA</span><strong>${brl.format(row.grossReference)}</strong></div><div class="metric recommended"><span>META INDIVIDUAL SUGERIDA</span><strong>${brl.format(row.suggested)}</strong></div></div></article>`).join('') : '<div class="empty">Cadastre vendedores e resultados históricos para calcular as médias.</div>';
    const currentSeller = document.getElementById('historySeller').value;
    const sellerNames = [...new Set([...db.sellers.map((seller) => seller.name?.trim()), ...allSellerHistory().map((entry) => entry.seller?.trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    document.getElementById('historySeller').innerHTML = sellerNames.length ? sellerNames.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('') : '<option value="">Cadastre um vendedor primeiro</option>';
    if (sellerNames.includes(currentSeller)) document.getElementById('historySeller').value = currentSeller;
    const manual = (vault.historyEntries || []).filter((entry) => String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') === String(db.branch || '').trim().toLocaleUpperCase('pt-BR')).sort((a, b) => b.month.localeCompare(a.month));
    document.getElementById('manualHistoryList').innerHTML = manual.length ? manual.map((entry) => `<div class="history-entry"><span><strong>${esc(entry.seller)}</strong></span><span>${esc(monthLabel(entry.month))}</span><span>${brl.format(num(entry.sales))}</span><span>${num(entry.days)} dias</span><button class="btn danger small" data-history-remove="${esc(entry.id)}">Excluir</button></div>`).join('') : '<div class="empty">Nenhum resultado anterior informado manualmente.</div>';
    document.querySelectorAll('[data-history-remove]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Excluir este registro histórico?')) return;
      vault.historyEntries = vault.historyEntries.filter((entry) => entry.id !== button.dataset.historyRemove); persist(false); renderGoalsHistory();
    }));
    bindMoneyBehavior(document.getElementById('historySales'));
    if (!document.getElementById('historyMonth').value) document.getElementById('historyMonth').value = previousMonth(db.month, 1);
  }
  function saveHistoryEntry() {
    const seller = document.getElementById('historySeller').value.trim();
    const month = document.getElementById('historyMonth').value;
    const sales = num(document.getElementById('historySales').value);
    const days = Math.round(num(document.getElementById('historyDays').value));
    if (!db.branch.trim()) { alert('Informe a filial antes de registrar o histórico.'); return; }
    if (!seller || !month || !sales || !days) { alert('Informe vendedor, competência, venda mercantil e dias trabalhados.'); return; }
    const branch = db.branch.trim();
    if (!Array.isArray(vault.historyEntries)) vault.historyEntries = [];
    const existing = vault.historyEntries.find((entry) => String(entry.branch).toLocaleUpperCase('pt-BR') === branch.toLocaleUpperCase('pt-BR') && sellerKey(entry.seller) === sellerKey(seller) && entry.month === month);
    if (existing) Object.assign(existing, { sales, days, updatedAt: new Date().toISOString() });
    else vault.historyEntries.push({ id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, branch, seller, month, sales, days, createdAt: new Date().toISOString() });
    document.getElementById('historySales').value = ''; document.getElementById('historyDays').value = '';
    persist(false); renderGoalsHistory();
  }

  function fillSettings() {
    const plain = { branch: db.branch, month: db.month, businessDays: db.businessDays, weeks: db.weeks, sellerCount: db.sellerCount, efficiencyGoalInput: num(db.efficiencyGoal) * 100, auditOwner: db.auditOwner || '', auditSource: db.auditSource || '', auditNote: '' };
    const money = { mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal, servicesGoalInput: db.servicesGoal, warrantyGoalInput: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly };
    Object.entries(plain).forEach(([id, value]) => { document.getElementById(id).value = value; });
    Object.entries(money).forEach(([id, value]) => { const input = document.getElementById(id); input.value = brl.format(num(value)); bindMoneyBehavior(input); });
    document.getElementById('weekEndsInput').value = (db.weekEnds?.length ? db.weekEnds : automaticWeekEnds(db.month)).join(', ');
    document.getElementById('monthQuick').value = db.month;
    document.getElementById('grossProfitRateInput').value = pct2.format(grossProfitRate());
    const ecommerceInput = document.getElementById('ecommerce');
    ecommerceInput.value = brl.format(num(db.ecommerce)); bindMoneyBehavior(ecommerceInput);
    renderTierPreview(); renderAuditList();
  }
  function renderTierPreview(source = db) {
    document.getElementById('tierPreview').innerHTML = tierGoals(source).map((tier) => `<article class="rule-card"><h3>${tier.name}</h3><dl><dt>Regra mercantil</dt><dd>${pct.format(tier.mercPct)}</dd><dt>Meta mercantil</dt><dd>${brl.format(tier.mercantile)}</dd><dt>Regra lucro bruto</dt><dd>${pct.format(tier.grossPct)}</dd><dt>Meta lucro bruto</dt><dd>${brl.format(tier.grossProfit)}</dd></dl></article>`).join('');
  }
  function renderAuditList() {
    const list = document.getElementById('auditList'), history = [...db.configAudit].reverse().slice(0, 12);
    list.innerHTML = history.length ? history.map((entry, index) => `<article class="audit-item"><strong>${new Date(entry.at).toLocaleString('pt-BR')} • ${esc(entry.owner || 'Responsável não informado')}</strong><div>${esc(entry.source || 'Sem referência')} ${entry.note ? `• ${esc(entry.note)}` : ''}</div><div class="muted">Mercantil ${brl.format(num(entry.values?.mercantileGoal))} • Lucro bruto ${brl.format(num(entry.values?.grossProfitGoal))} • Serviços ${brl.format(num(entry.values?.servicesGoal))} • Eficiência ${pct2.format(num(entry.values?.efficiencyGoal))}</div>${index === 0 ? '<span class="goal-hit-badge">Configuração vigente</span>' : ''}</article>`).join('') : '<div class="empty">A primeira alteração desta competência criará o registro de auditoria.</div>';
  }
  function readSettings() {
    const selectedMonth = document.getElementById('month').value || monthDefault;
    const weekEnds = normalizeWeekEnds(selectedMonth, document.getElementById('weekEndsInput').value);
    const next = {
      branch: document.getElementById('branch').value.trim(), month: selectedMonth,
      businessDays: num(document.getElementById('businessDays').value) || 25, weeks: weekEnds.length || automaticWeeks(selectedMonth), weekEnds,
      mercantileGoal: num(document.getElementById('mercantileGoal').value), grossProfitGoal: num(document.getElementById('grossProfitGoal').value),
      eligibleGoal: 0, eligibleGoalConfirmed: false, servicesGoal: num(document.getElementById('servicesGoalInput').value),
      efficiencyGoal: num(document.getElementById('efficiencyGoalInput').value) / 100,
      warrantyGoal: num(document.getElementById('warrantyGoalInput').value), warrantyWeekly: num(document.getElementById('warrantyWeekly').value),
      sellerCount: Math.round(num(document.getElementById('sellerCount').value)),
      auditOwner: document.getElementById('auditOwner').value.trim(), auditSource: document.getElementById('auditSource').value.trim()
    };
    if (!next.branch) { document.getElementById('branch').classList.add('field-error'); alert('Informe a filial para salvar a configuração.'); return; }
    if ([next.mercantileGoal, next.grossProfitGoal, next.servicesGoal, next.efficiencyGoal].some((goal) => goal <= 0)) { alert('Informe as metas-base obrigatórias enviadas pela empresa.'); return; }
    if (!next.auditOwner) { document.getElementById('auditOwner').classList.add('field-error'); alert('Informe o responsável pela configuração para manter a auditoria.'); return; }
    const contextChanged = next.branch !== db.branch || next.month !== db.month;
    if (contextChanged) {
      persist(false); const key = recordKey(next.branch, next.month);
      db = vault.records[key] ? normalizeRecord(vault.records[key]) : carryRecord(next.branch, next.month);
    }
    const before = configSnapshot(db), note = document.getElementById('auditNote').value.trim();
    Object.assign(db, next);
    db.goals = tierGoals(db).map((tier) => tier.mercantile);
    const after = configSnapshot(db), changed = JSON.stringify(before) !== JSON.stringify(after) || contextChanged;
    if (changed || !db.configAudit.length) db.configAudit.push({ at: new Date().toISOString(), owner: next.auditOwner, source: next.auditSource, note, values: after });
    persist(); renderAll(); showView('overview');
  }

  function printHeader(title) {
    return `<header class="print-header"><div><h1>${esc(title)}</h1><p>Central Inteligente de Vendas • Filial: <strong>${esc(db.branch || 'Não informada')}</strong> • Competência: <strong>${esc(monthLabel(db.month))}</strong></p></div><p>Emitido em ${new Date().toLocaleString('pt-BR')}</p></header>`;
  }
  function renderPrint() {
    const result = calculate(), weeks = weekBuckets();
    const grossAvailable = hasCompleteGrossProfit();
    const goals = tierGoals().map((tier) => {
      const rates = tierRate(tier, result.revenue, result.grossProfit, grossAvailable);
      return `<article class="print-goal"><h3>${tier.name} — ${rates.passed ? 'ATINGIDA' : pct.format(rates.overall)}</h3><dl><dt>Mercantil (${pct.format(tier.mercPct)})</dt><dd>${brl.format(tier.mercantile)}</dd><dt>Mercantil realizado</dt><dd>${brl.format(result.revenue)} · ${pct.format(rates.mercRate)}</dd><dt>Lucro bruto (${pct.format(tier.grossPct)})</dt><dd>${brl.format(tier.grossProfit)}</dd><dt>Lucro bruto realizado</dt><dd>${grossAvailable ? `${brl.format(result.grossProfit)} · ${pct.format(rates.grossRate)}` : 'Não informado — percentual baseado no mercantil'}</dd></dl></article>`;
    }).join('');
    const weeklyRows = weeks.map((items, index) => {
      const stat = weekStats(items), targetContext = weekTargetContext(items), weekCount = Math.max(1, num(db.weeks));
      const weekGrossAvailable = hasCompleteGrossProfit(items);
      const goalCells = tierGoals().map((tier) => { const target = weeklyTierTarget(tier, targetContext, weekCount); const rate = tierRate(target, stat.general, stat.grossProfit, weekGrossAvailable); return `<td>${pct.format(rate.overall)}</td>`; }).join('');
      return `<tr><td>${index + 1}ª<br>${items[0].date.toLocaleDateString('pt-BR')}–${items.at(-1).date.toLocaleDateString('pt-BR')}</td><td>${brl.format(stat.general)}</td><td>${weekGrossAvailable ? brl.format(stat.grossProfit) : 'Não informado'}</td>${goalCells}<td>${brl.format(stat.services)}</td><td>${efficiencyPct.format(stat.efficiency)}</td><td>${stat.worked}</td></tr>`;
    }).join('');
    const dailyRows = allDays().map(({ date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed), efficiency = num(data.eligible) ? services / num(data.eligible) : 0, ticket = num(data.nfs) ? num(data.general) / num(data.nfs) : 0;
      return `<tr><td>${date.toLocaleDateString('pt-BR')}<br>${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</td><td>${data.status === 'done' ? '✓ Lançado' : data.status === 'off' ? 'Não trabalha' : 'Pendente'}${dayReachedPrimaryGoal(data) ? '<br>Meta dia ✓' : ''}</td><td>${brl.format(num(data.general))}</td><td>${brl.format(num(data.grossProfit))}</td><td>${brl.format(num(data.eligible))}</td><td>${brl.format(num(data.warranty))}</td><td>${brl.format(num(data.other))}</td><td>${brl.format(num(data.mixed))}</td><td>${brl.format(services)}</td><td>${efficiencyPct.format(efficiency)}</td><td>${num(data.nfs)}</td><td>${brl.format(ticket)}</td></tr>`;
    }).join('');
    const sellerPages = db.sellers.filter((seller, index) => !printSellerOnlyId || sellerIdentity(seller, index) === printSellerOnlyId).map((seller) => {
      const metrics = sellerMetrics(seller);
      return `<section class="print-page">${printHeader(`Resultado individual — ${seller.name || 'Vendedor'}`)}<div class="print-kpis"><div class="print-kpi"><span>Venda mercantil</span><strong>${brl.format(num(seller.general))}</strong></div><div class="print-kpi"><span>Meta individual</span><strong>${brl.format(metrics.individualGoal)}</strong></div><div class="print-kpi"><span>Atingimento</span><strong>${pct.format(metrics.rate)}</strong></div><div class="print-kpi"><span>Projeção</span><strong>${brl.format(metrics.projection)}</strong></div><div class="print-kpi"><span>Média diária</span><strong>${brl.format(metrics.dailyAverage)}</strong></div><div class="print-kpi"><span>Eficiência</span><strong>${efficiencyPct.format(metrics.efficiency)}</strong></div></div><table class="print-table"><thead><tr><th>Elegível</th><th>Garantia</th><th>Outros</th><th>Presta-mista</th><th>Serviços</th><th>NFs</th><th>Dias</th></tr></thead><tbody><tr><td>${brl.format(num(seller.eligible))}</td><td>${brl.format(num(seller.warranty))}</td><td>${brl.format(num(seller.other))}</td><td>${brl.format(num(seller.mixed))}</td><td>${brl.format(metrics.services)}</td><td>${num(seller.nfs)}</td><td>${num(seller.days)}</td></tr></tbody></table><h2 class="print-section-title">Direcionamento</h2><p>${esc(seller.notes || 'Sem registro.')}</p><h2 class="print-section-title">Compromisso</h2><p>${esc(seller.commitment || 'Sem registro.')} ${seller.deadline ? `Prazo: ${new Date(`${seller.deadline}T12:00:00`).toLocaleDateString('pt-BR')}.` : ''}</p><div class="print-signatures"><div>Gestor</div><div>Vendedor</div></div></section>`;
    }).join('');
    const sellerFinancialPages = db.sellers.filter((seller, index) => !printSellerOnlyId || sellerIdentity(seller, index) === printSellerOnlyId).map((seller) => {
      const metrics = sellerMetrics(seller), financial = sellerFinancials(seller);
      return `<section class="print-page">${printHeader(`Ganhos financeiros — ${seller.name || 'Vendedor'}`)}<div class="print-kpis"><div class="print-kpi"><span>Comissão mercantil (${pct2.format(financial.mercantileRate)})</span><strong>${brl.format(financial.mercantileCommission)}</strong></div><div class="print-kpi"><span>Comissão serviços (${pct2.format(financial.serviceRate)})</span><strong>${brl.format(financial.serviceCommission)}</strong></div><div class="print-kpi"><span>Subtotal</span><strong>${brl.format(financial.commissionSubtotal)}</strong></div><div class="print-kpi"><span>Repousos + atestados</span><strong>${brl.format(financial.dsr)}</strong></div><div class="print-kpi"><span>Projeção no ritmo</span><strong>${brl.format(financial.projectedTotal)}</strong></div><div class="print-kpi"><span>Ganho se bater metas</span><strong>${brl.format(financial.targetTotal)}</strong></div></div><table class="print-table"><thead><tr><th>Venda</th><th>Meta</th><th>Projeção venda</th><th>Dias trabalhados</th><th>Dias úteis</th><th>Repousos</th><th>Atestados</th><th>Taxa mercantil</th><th>Taxa serviços</th></tr></thead><tbody><tr><td>${brl.format(num(seller.general))}</td><td>${brl.format(metrics.individualGoal)}</td><td>${brl.format(metrics.projection)}</td><td>${num(seller.days)}</td><td>${financial.plannedDays}</td><td>${financial.restDays}</td><td>${financial.justifiedDays}</td><td>${pct2.format(financial.mercantileRate)}</td><td>${pct2.format(financial.serviceRate)}</td></tr></tbody></table><div class="print-signatures"><div>Gestor</div><div>Vendedor</div></div></section>`;
    }).join('');
    const historyData = goalSuggestions();
    const historyRows = historyData.rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${row.months}</td><td>${brl.format(row.monthlyAverage)}</td><td>${brl.format(row.weeklyAverage)}</td><td>${brl.format(row.dailyAverage)}</td><td>${pct.format(row.share)}</td><td>${brl.format(row.suggested)}</td><td>${brl.format(row.grossReference)}</td></tr>`).join('');
    const historyPage = `<section class="print-page">${printHeader('Metas e médias por vendedor')}<p>Período: ${historyData.period === 'previousYear' ? 'ano anterior completo' : `últimos ${historyData.analyzedMonths} meses`} • Método: ${historyData.method === 'share' ? 'participação histórica' : historyData.method === 'average' ? 'média histórica' : 'divisão igual'}.</p><table class="print-table"><thead><tr><th>Vendedor</th><th>Meses</th><th>Média/mês</th><th>Média/semana</th><th>Média/dia</th><th>Participação</th><th>Meta sugerida</th><th>Lucro referência</th></tr></thead><tbody>${historyRows || '<tr><td colspan="8">Sem histórico cadastrado.</td></tr>'}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section>`;
    const compiled = compiledAnalysis();
    const compiledRows = compiled.rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${brl.format(row.currentProjection)}</td><td>${row.historicalAverage ? brl.format(row.historicalAverage) : 'Sem histórico'}</td><td>${signedPct(row.sellerTrend)}</td><td>${signedPct(row.branchTrend)}</td><td>${pct.format(row.goalRate)}</td><td>${efficiencyPct.format(row.metrics.efficiency)}</td><td>${esc(row.diagnosis)}</td></tr>`).join('');
    const compiledPage = `<section class="print-page">${printHeader('Compilado inteligente — Filial × Vendedores')}<div class="print-kpis"><div class="print-kpi"><span>Projeção da filial</span><strong>${brl.format(compiled.branchProjection)}</strong></div><div class="print-kpi"><span>Base histórica</span><strong>${brl.format(compiled.branchBaseline)}</strong></div><div class="print-kpi"><span>Tendência filial</span><strong>${signedPct(compiled.branchTrend)}</strong></div><div class="print-kpi"><span>Período analisado</span><strong>${compiled.period} meses</strong></div></div><table class="print-table"><thead><tr><th>Vendedor</th><th>Projeção</th><th>Média histórica</th><th>Tendência vendedor</th><th>Tendência filial</th><th>Meta</th><th>Eficiência</th><th>Diagnóstico</th></tr></thead><tbody>${compiledRows || '<tr><td colspan="8">Sem vendedores cadastrados.</td></tr>'}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section>`;
    const audit = db.configAudit.at(-1);
    document.getElementById('printReport').innerHTML = `<section class="print-page">${printHeader('Gestão de Resultados — Resumo Executivo')}<div class="print-kpis"><div class="print-kpi"><span>Venda mercantil</span><strong>${brl.format(result.revenue)}</strong></div><div class="print-kpi"><span>Lucro bruto</span><strong>${grossAvailable ? brl.format(result.grossProfit) : 'Não informado'}</strong></div><div class="print-kpi"><span>Venda elegível (base da eficiência)</span><strong>${brl.format(result.eligible)}</strong></div><div class="print-kpi"><span>Serviços</span><strong>${brl.format(result.services)}</strong></div><div class="print-kpi"><span>Eficiência</span><strong>${efficiencyPct.format(result.efficiency)}</strong></div><div class="print-kpi"><span>Projeção mercantil</span><strong>${brl.format(result.projection)}</strong></div></div><div class="print-goals">${goals}</div><h2 class="print-section-title">Metas-base e auditoria</h2><div class="print-kpis"><div class="print-kpi"><span>Meta serviços</span><strong>${brl.format(num(db.servicesGoal))}</strong></div><div class="print-kpi"><span>Meta eficiência</span><strong>${efficiencyPct.format(num(db.efficiencyGoal))}</strong></div><div class="print-kpi"><span>Dias úteis</span><strong>${num(db.businessDays)}</strong></div><div class="print-kpi"><span>Responsável</span><strong>${esc(audit?.owner || db.auditOwner || 'Não informado')}</strong></div><div class="print-kpi"><span>Atualização</span><strong>${audit ? new Date(audit.at).toLocaleString('pt-BR') : 'Sem registro'}</strong></div></div><h2 class="print-section-title">Resultado semanal</h2><table class="print-table"><thead><tr><th>Semana</th><th>Mercantil</th><th>Lucro bruto</th><th>M1</th><th>M2</th><th>M3</th><th>Serviços</th><th>Eficiência</th><th>Dias</th></tr></thead><tbody>${weeklyRows}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section><section class="print-page">${printHeader('Lançamentos Diários')}<table class="print-table"><thead><tr><th>Dia</th><th>Situação</th><th>Venda mercantil</th><th>Lucro bruto</th><th>Elegível</th><th>Garantia</th><th>Outros</th><th>Presta-mista</th><th>Serviços</th><th>Eficiência</th><th>NFs</th><th>Ticket</th></tr></thead><tbody>${dailyRows}</tbody></table></section>${historyPage}${sellerPages}`;
    if (printSellerOnlyId) document.getElementById('printReport').innerHTML = sellerPages + sellerFinancialPages;
    else document.getElementById('printReport').insertAdjacentHTML('beforeend', compiledPage + sellerFinancialPages);
  }

  function renderAll() { fillSettings(); renderScopeSelector(); renderOverview(); renderDaily(); renderWeekly(); renderSellers(); renderGoalsHistory(); renderCompiled(); renderSellerProfile(); renderPrint(); }
  function showView(id) {
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === id));
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === id));
    if (id === 'goalsHistory') renderGoalsHistory();
    if (id === 'compiled') renderCompiled();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));
  document.getElementById('scopeQuick').addEventListener('change', (event) => {
    activeScope = event.target.value;
    if (activeScope.startsWith('seller:')) {
      const index = Number(activeScope.split(':')[1]), seller = db.sellers[index];
      activeSellerProfileId = seller ? sellerIdentity(seller, index) : null; renderSellerProfile(); showView('sellerProfile');
    } else { activeSellerProfileId = null; renderOverview(); showView('overview'); }
    renderPrint();
  });
  document.getElementById('monthQuick').addEventListener('change', (event) => switchContext(db.branch, event.target.value || monthDefault));
  document.getElementById('dailyGoalDate').addEventListener('change', renderDailyGoalPlanner);
  document.getElementById('dailyGoalPercent').addEventListener('input', previewDailyGoalFromPlanner);
  document.getElementById('dailyGoalPercent').addEventListener('change', saveDailyGoalFromPlanner);
  document.getElementById('downloadDailyGoal').addEventListener('click', () => exportDailyGoalImage(selectedDailyGoalDate()));
  document.getElementById('saveSettings').addEventListener('click', readSettings);
  const saveEcommerce = (event) => {
    const value = num(event.target.value); if (value === num(db.ecommerce)) return;
    db.ecommerce = value; persist(); renderAll();
  };
  document.getElementById('ecommerce').addEventListener('change', saveEcommerce);
  document.getElementById('ecommerce').addEventListener('blur', saveEcommerce);
  document.getElementById('month').addEventListener('change', (event) => {
    const month = event.target.value || monthDefault, ends = automaticWeekEnds(month);
    document.getElementById('weekEndsInput').value = ends.join(', '); document.getElementById('weeks').value = ends.length;
  });
  document.getElementById('weekEndsInput').addEventListener('input', (event) => {
    const month = document.getElementById('month').value || monthDefault, ends = normalizeWeekEnds(month, event.target.value);
    document.getElementById('weeks').value = ends.length || automaticWeeks(month);
  });
  ['mercantileGoal', 'grossProfitGoal'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    const source = { ...db, mercantileGoal: num(document.getElementById('mercantileGoal').value), grossProfitGoal: num(document.getElementById('grossProfitGoal').value) };
    renderTierPreview(source);
    document.getElementById('grossProfitRateInput').value = pct2.format(source.mercantileGoal ? source.grossProfitGoal / source.mercantileGoal : 0);
  }));
  ['historyPeriod', 'goalMethod'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    vault.goalPreferences = { period: document.getElementById('historyPeriod').value, method: document.getElementById('goalMethod').value };
    persist(false); renderGoalsHistory();
  }));
  document.getElementById('refreshGoals').addEventListener('click', renderGoalsHistory);
  ['compiledMode', 'compiledPeriod', 'compiledReference'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    vault.compiledPreferences = { mode: document.getElementById('compiledMode').value, period: document.getElementById('compiledPeriod').value, reference: document.getElementById('compiledReference').value || db.month };
    persist(false); renderCompiled();
  }));
  document.getElementById('refreshCompiled').addEventListener('click', renderCompiled);
  document.getElementById('sellerProfileBack').addEventListener('click', () => showView('sellers'));
  document.getElementById('sellerMissionDate').addEventListener('change', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) renderSellerMission(seller);
  });
  document.querySelectorAll('[data-mission-tone]').forEach((button) => button.addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (!seller) return;
    const key = selectedSellerMissionDate(); seller.missionTones = { ...(seller.missionTones || {}), [key]: button.dataset.missionTone };
    seller.updatedAt = new Date().toISOString(); persist(false); renderSellerMission(seller);
  }));
  document.getElementById('sellerMissionImage').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) exportSellerMissionImage(seller);
  });
  document.getElementById('saveSellerFinance').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (!seller) return;
    seller.commissionMercantileRate = num(document.getElementById('profileCommissionMercantileRate').value);
    seller.commissionServiceRate = num(document.getElementById('profileCommissionServiceRate').value);
    seller.restDays = Math.round(num(document.getElementById('profileRestDays').value));
    seller.justifiedDays = Math.round(num(document.getElementById('profileJustifiedDays').value)); seller.updatedAt = new Date().toISOString();
    persist(); renderSellers(); renderSellerProfile(); renderCompiled(); renderPrint();
  });
  document.getElementById('sellerProfilePrint').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) exportSellerMissionImage(seller);
  });
  document.getElementById('saveHistoryEntry').addEventListener('click', saveHistoryEntry);
  document.getElementById('applySuggestedGoals').addEventListener('click', () => {
    const suggestions = goalSuggestions();
    if (!db.sellers.some((seller) => seller.name?.trim())) { alert('Cadastre os vendedores antes de aplicar as metas.'); return; }
    db.sellers.forEach((seller) => {
      const match = suggestions.rows.find((row) => row.key === sellerKey(seller.name));
      if (match) seller.assignedGoal = match.suggested;
    });
    persist(); renderAll(); showView('sellers');
  });
  document.getElementById('addSeller').addEventListener('click', () => {
    const nextIndex = db.sellers.length;
    db.sellers.push({ id: `seller-${Date.now()}-${nextIndex + 1}`, name: '', assignedGoal: 0, plannedDays: num(db.businessDays), commissionMercantileRate: 0, commissionServiceRate: 5, general: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, nfs: 0, days: 0, justifiedDays: 0, notes: '', commitment: '', deadline: '', updatedAt: new Date().toISOString() });
    openSellerIndex = nextIndex; persist(); renderSellers(); renderGoalsHistory(); renderScopeSelector(); renderCompiled();
  });
  document.getElementById('exportSellerBackup').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    const payload = sellerBackupPayload(seller);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    downloadJson(payload, `backup-vendedor-${safeName || 'sem-nome'}-${db.month}.json`);
    renderSellerBackupPanel(`✓ Backup de <strong>${esc(seller.name || 'Vendedor')}</strong> gerado com ${payload.records.length} competência(s).`);
  });
  document.getElementById('importSellerBackup').addEventListener('click', () => document.getElementById('sellerBackupFiles').click());
  document.getElementById('sellerBackupFiles').addEventListener('change', async (event) => {
    const files = [...event.target.files]; if (!files.length) return;
    const selectedValue = document.getElementById('sellerBackupTarget').value;
    if (files.length > 1 && selectedValue !== 'auto') {
      alert('Para importar vários vendedores de uma vez, selecione “Identificar automaticamente pelo arquivo”.'); event.target.value = ''; return;
    }
    const forcedSeller = selectedValue === 'auto' ? null : selectedBackupSeller(false);
    const successes = [], errors = [];
    for (const file of files) {
      try { successes.push(importSellerPayload(await readJsonFile(file), forcedSeller, file.name)); }
      catch (error) { errors.push(error.message); }
    }
    const currentKey = recordKey(db.branch, db.month);
    db = normalizeRecord(vault.records[currentKey] || db); activeScope = 'branch'; persist(false); renderAll();
    const updated = successes.reduce((sum, item) => sum + item.months, 0);
    const unchanged = successes.reduce((sum, item) => sum + item.unchangedMonths, 0);
    const protectedCount = successes.reduce((sum, item) => sum + item.protectedMonths, 0);
    const people = [...new Set(successes.map((item) => item.seller))];
    const okText = successes.length ? `✓ ${people.length} vendedor(es): ${updated} competência(s) atualizadas por substituição, ${unchanged} já estavam iguais${protectedCount ? ` e ${protectedCount} foram preservadas por serem mais recentes` : ''}. Nenhum valor foi somado em duplicidade.` : '';
    const errorText = errors.length ? `<div class="backup-errors"><strong>${errors.length} arquivo(s) não importado(s):</strong><br>${errors.map(esc).join('<br>')}</div>` : '';
    renderSellerBackupPanel(`${okText}${errorText}`); event.target.value = '';
  });
  document.getElementById('resetSellerData').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    if (!confirm(`Zerar somente os resultados de ${seller.name || 'Vendedor'} em ${monthLabel(db.month)}? O cadastro, a meta e os outros meses serão mantidos.`)) return;
    sellerResultFields.forEach((field) => { seller[field] = 0; });
    seller.resultPeriod = 'none'; seller.resultStart = ''; seller.resultEnd = '';
    seller.notes = ''; seller.commitment = ''; seller.deadline = ''; seller.updatedAt = new Date().toISOString();
    persist(false); renderAll(); renderSellerBackupPanel(`✓ Resultados de <strong>${esc(seller.name || 'Vendedor')}</strong> zerados somente em ${esc(monthLabel(db.month))}.`);
  });
  document.getElementById('deleteSellerAll').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || 'Vendedor';
    if (!confirm(`Excluir ${name} de TODAS as competências desta filial, incluindo o histórico? Esta ação não pode ser desfeita.`)) return;
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR'); let removed = 0;
    Object.entries(vault.records || {}).forEach(([key, rawRecord]) => {
      if (String(rawRecord.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch) return;
      const record = normalizeRecord(rawRecord), before = record.sellers.length;
      record.sellers = record.sellers.filter((item, index) => sellerIdentity(item, index) !== id && sellerKey(item.name) !== sellerKey(name));
      removed += before - record.sellers.length; vault.records[key] = record;
    });
    vault.historyEntries = (vault.historyEntries || []).filter((entry) => String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || sellerKey(entry.seller) !== sellerKey(name));
    db = normalizeRecord(vault.records[recordKey(db.branch, db.month)] || db); activeScope = 'branch'; persist(false); renderAll();
    renderSellerBackupPanel(`✓ <strong>${esc(name)}</strong> foi excluído de ${removed} competência(s), junto com seu histórico.`);
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    const key = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (window.matchMedia('(max-width:760px)').matches && key.startsWith(`${db.month}-`)) { openDailyKey = key; renderDaily(); }
    const selector = window.matchMedia('(max-width:760px)').matches ? `.day-card[data-date="${key}"]` : `#dailyBody [data-date="${key}"]`;
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('printBtn').addEventListener('click', () => { printSellerOnlyId = null; renderPrint(); setTimeout(() => window.print(), 50); });
  window.addEventListener('beforeprint', renderPrint);
  window.addEventListener('afterprint', () => { printSellerOnlyId = null; renderPrint(); });
  document.getElementById('exportBtn').addEventListener('click', async () => {
    persist(false);
    const content = JSON.stringify(vault, null, 2), filename = `gestao-resultados-${(db.branch || 'filial').replace(/\s+/g, '-')}-${db.month}.json`;
    const file = new File([content], filename, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup da Gestão de Resultados' }); return; }
    } catch (error) { if (error.name === 'AbortError') return; }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(file); anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  });
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (imported.records) vault = imported;
        else { const record = normalizeRecord(imported); const key = recordKey(record.branch, record.month); vault = { version: 2, currentKey: key, records: { [key]: record } }; }
        db = normalizeRecord(vault.records[vault.currentKey] || Object.values(vault.records)[0]); persist(); renderAll(); alert('Backup importado com sucesso.');
      } catch (error) { alert('Não foi possível importar este arquivo.'); }
    };
    reader.readAsText(file);
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm(`Limpar os resultados de ${monthLabel(db.month)}? As metas e os nomes dos vendedores serão mantidos.`)) return;
    db.daily = {};
    db.ecommerce = 0;
    db.sellers = db.sellers.map((seller) => ({ ...seller, general: 0, grossProfit: 0, eligible: 0, warranty: 0, other: 0, mixed: 0, nfs: 0, days: 0, notes: '', commitment: '', deadline: '' }));
    persist(); renderAll();
  });

  renderAll();
})();
