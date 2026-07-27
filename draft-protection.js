(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var roots = {
    'vendas-mobile.html': '#editorView',
    'orcamentos.html': '#discountForm',
    'simulador.html': '#mainApp'
  };
  var rootSelector = roots[page];
  if (!rootSelector) return;

  var storageKey = 'fs_rascunho_seguro_v17_' + page;
  var restoring = false;
  var suppressSaveUntil = 0;
  var timer = 0;

  function isEditableField(field) {
    if (!field || !field.id || field.disabled || field.readOnly) return false;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) return false;
    var type = String(field.type || '').toLowerCase();
    if (/^(hidden|button|submit|reset|file|password|search)$/.test(type)) return false;
    if (/busca|buscar|filtro|pesquisa|login|senha|codigoSimulacao/i.test(field.id)) return false;
    return true;
  }

  function root() {
    return document.querySelector(rootSelector) || document.body;
  }

  function saveNow() {
    if (restoring || Date.now() < suppressSaveUntil) return;
    var values = {};
    root().querySelectorAll('input[id],textarea[id],select[id]').forEach(function (field) {
      if (!isEditableField(field)) return;
      values[field.id] = {
        type: String(field.type || field.tagName).toLowerCase(),
        value: field.value,
        checked: !!field.checked
      };
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        page: page,
        savedAt: Date.now(),
        values: values
      }));
    } catch (error) {
      console.warn('Não foi possível proteger o rascunho local.', error);
    }
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 180);
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(storageKey); } catch (error) { return; }
    if (!raw) return;

    var state;
    try { state = JSON.parse(raw); } catch (error) { return; }
    if (!state || !state.values) return;

    restoring = true;
    Object.keys(state.values).forEach(function (id) {
      var field = document.getElementById(id);
      var saved = state.values[id];
      if (!isEditableField(field) || !saved) return;
      if (/^(checkbox|radio)$/.test(saved.type)) field.checked = !!saved.checked;
      else field.value = saved.value == null ? '' : String(saved.value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    restoring = false;
  }

  function clearProtectedDraft() {
    suppressSaveUntil = Date.now() + 1200;
    clearTimeout(timer);
    try { localStorage.removeItem(storageKey); } catch (error) {}
    setTimeout(function () {
      try { localStorage.removeItem(storageKey); } catch (error) {}
    }, 700);
  }

  window.fsClearProtectedDraft = clearProtectedDraft;
  document.addEventListener('input', function (event) {
    if (root().contains(event.target) && isEditableField(event.target)) scheduleSave();
  }, true);
  document.addEventListener('change', function (event) {
    if (root().contains(event.target) && isEditableField(event.target)) scheduleSave();
  }, true);
  document.addEventListener('click', function (event) {
    var clearAction = event.target.closest(
      '#btnLimparValores,#btnNovaProposta,[onclick*="limparFormulario"],[data-fs-clear-draft]'
    );
    var menuAction = event.target.closest('.menu-item');
    if (!clearAction && menuAction && /limpar tudo/i.test(menuAction.textContent || '')) {
      clearAction = menuAction;
    }
    if (clearAction) clearProtectedDraft();
  }, true);
  document.addEventListener('reset', clearProtectedDraft, true);
  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveNow();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(restore, 120);
      setTimeout(restore, 850);
    }, { once: true });
  } else {
    setTimeout(restore, 120);
    setTimeout(restore, 850);
  }
})();
