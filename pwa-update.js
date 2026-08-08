(function(){
  'use strict';

  var VERSION = '31';

  function isQuotaError(error){
    return !!error && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  (function installStorageGuard(){
    if(typeof Storage === 'undefined' || !Storage.prototype || Storage.prototype.__fsQuotaGuardV31) return;

    var nativeSetItem = Storage.prototype.setItem;
    var nativeRemoveItem = Storage.prototype.removeItem;

    var ESSENTIAL = new Set([
      'fs_filial','fs_nome','fs_cargo','fs_whatsapp','fs_genero','fs_access_token',
      'fs_pode_compartilhar','fsAuthGlobal','fs_access_persisted','fs_device_id',
      'fs_access_data_v1','fs_access_data_v1_enabled','fs_sw_applied',
      'nomeVendedor','nomeVendedorLogado','vendedor_nome'
    ]);

    function bytes(value){
      try { return new Blob([String(value == null ? '' : value)]).size; }
      catch(e){ return String(value == null ? '' : value).length * 2; }
    }

    function canWrite(storage){
      var probe = '__fs_storage_probe__';
      try{
        nativeSetItem.call(storage, probe, '1');
        nativeRemoveItem.call(storage, probe);
        return true;
      }catch(e){
        try { nativeRemoveItem.call(storage, probe); } catch(_e){}
        return false;
      }
    }

    function cleanupLocalStorage(currentKey){
      if(typeof localStorage === 'undefined') return false;

      var optionalKeys = [
        'fs_profile_photo',
        'fs_pdf_preview',
        'fs_pdf_cache',
        'fs_last_pdf',
        'fs_share_preview',
        'fs_temp_image',
        'fs_temp_pdf'
      ];

      optionalKeys.forEach(function(key){
        if(key !== currentKey){
          try { nativeRemoveItem.call(localStorage, key); } catch(e){}
        }
      });
      if(canWrite(localStorage)) return true;

      var candidates = [];
      try{
        for(var i = 0; i < localStorage.length; i++){
          var key = localStorage.key(i);
          if(!key || key === currentKey || ESSENTIAL.has(key)) continue;
          var value = localStorage.getItem(key) || '';
          candidates.push({key:key, size:bytes(value)});
        }
      }catch(e){}

      candidates.sort(function(a,b){ return b.size - a.size; });

      for(var c = 0; c < candidates.length; c++){
        if(candidates[c].size < 64 * 1024 && c === 0) break;
        try { nativeRemoveItem.call(localStorage, candidates[c].key); } catch(e){}
        if(canWrite(localStorage)) return true;
      }

      try{
        var keys = [];
        for(var j = 0; j < localStorage.length; j++) keys.push(localStorage.key(j));
        keys.forEach(function(key){
          if(!key || key === currentKey || ESSENTIAL.has(key)) return;
          if(/cache|temp|preview|draft_blob|image_blob|pdf_blob|snapshot/i.test(key)){
            try { nativeRemoveItem.call(localStorage, key); } catch(e){}
          }
        });
      }catch(e){}

      return canWrite(localStorage);
    }

    Storage.prototype.setItem = function(key, value){
      try{
        return nativeSetItem.call(this, key, value);
      }catch(error){
        if(!isQuotaError(error) || this !== localStorage) throw error;

        if(cleanupLocalStorage(String(key))){
          try { return nativeSetItem.call(this, key, value); }
          catch(retryError){
            if(!isQuotaError(retryError)) throw retryError;
          }
        }

        if(!ESSENTIAL.has(String(key))){
          console.warn('[FS] Armazenamento cheio; gravação opcional ignorada:', key);
          return;
        }

        console.error('[FS] Não foi possível liberar espaço para dado essencial:', key);
        throw error;
      }
    };

    try{
      Object.defineProperty(Storage.prototype, '__fsQuotaGuardV31', {
        value:true,
        configurable:false
      });
    }catch(e){
      Storage.prototype.__fsQuotaGuardV31 = true;
    }

    try{
      if(!canWrite(localStorage)) cleanupLocalStorage('');
    }catch(e){}
  })();

  (function installAccessClickGuard(){
    var autoLocked = false;
    var unlockTimer = null;

    function unlock(){
      autoLocked = false;
      if(unlockTimer){
        clearTimeout(unlockTimer);
        unlockTimer = null;
      }
    }

    document.addEventListener('click', function(event){
      var target = event.target && event.target.closest
        ? event.target.closest('#fsAccessOk')
        : null;

      if(!target) return;

      if(event.isTrusted){
        unlock();
        return;
      }

      if(autoLocked){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      autoLocked = true;
      unlockTimer = setTimeout(unlock, 12000);
    }, true);

    document.addEventListener('DOMContentLoaded', function(){
      var modal = document.getElementById('fsAccessModal');
      if(!modal) return;

      var observer = new MutationObserver(function(){
        if(!modal.classList.contains('open')) unlock();
      });
      observer.observe(modal, {
        attributes:true,
        attributeFilter:['class']
      });
    });
  })();

  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  var path = location.pathname.replace(/\/+$/, '/');
  var isCentral = path === '/' || /\/index\.html$/i.test(location.pathname);
  if(!isCentral) return;

  var refreshing = false;
  var promptOpen = false;

  function safeSet(storage, key, value){
    try{
      storage.setItem(key, value);
      return true;
    }catch(e){
      console.warn('[FS] Falha ao salvar', key, e);
      return false;
    }
  }

  function closePrompt(){
    var current = document.getElementById('fsMandatoryUpdate');
    if(current) current.remove();
    promptOpen = false;
  }

  function createPrompt(registration){
    if(promptOpen || document.getElementById('fsMandatoryUpdate')) return;
    if(localStorage.getItem('fs_sw_applied') === VERSION && !registration.waiting) return;

    promptOpen = true;

    var box = document.createElement('div');
    box.id = 'fsMandatoryUpdate';
    box.setAttribute('role','status');
    box.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));' +
      'z-index:2147483647;background:#111827;color:#fff;border-radius:18px;padding:14px;' +
      'display:flex;align-items:center;gap:12px;box-shadow:0 18px 46px rgba(15,23,42,.42);' +
      'font-family:Arial,sans-serif';

    box.innerHTML =
      '<div style="flex:1;min-width:0">' +
      '<strong style="display:block;font-size:15px;margin-bottom:3px">Nova versão disponível</strong>' +
      '<span style="font-size:12px;opacity:.88">Atualize uma única vez pela Central para carregar as correções mais recentes.</span>' +
      '</div>' +
      '<button type="button" style="border:0;border-radius:12px;padding:11px 15px;background:#4f8cff;color:#fff;font-weight:800;font-size:13px">Atualizar agora</button>';

    box.querySelector('button').onclick = function(){
      var button = this;
      button.disabled = true;
      button.textContent = 'Atualizando…';

      safeSet(sessionStorage, 'fs_update_requested', VERSION);

      if(registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }else{
        registration.update()
          .catch(function(){})
          .finally(function(){ closePrompt(); });
      }

      setTimeout(function(){
        if(document.getElementById('fsMandatoryUpdate')) location.reload();
      }, 4000);
    };

    document.body.appendChild(box);
  }

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(refreshing) return;
    refreshing = true;

    safeSet(localStorage, 'fs_sw_applied', VERSION);
    try { sessionStorage.removeItem('fs_update_requested'); } catch(e){}

    closePrompt();
    location.reload();
  });

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js', {
      scope:'/',
      updateViaCache:'none'
    }).then(function(registration){
      if(registration.waiting && navigator.serviceWorker.controller){
        createPrompt(registration);
      }

      registration.addEventListener('updatefound', function(){
        var worker = registration.installing;
        if(!worker) return;

        worker.addEventListener('statechange', function(){
          if(worker.state === 'installed' && navigator.serviceWorker.controller){
            createPrompt(registration);
          }
        });
      });

      registration.update().catch(function(){});
    }).catch(function(error){
      console.warn('[FS] Atualização automática indisponível:', error);
    });
  });
})();
