(function(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  var VERSION = '38';
  var path = location.pathname.replace(/\/+$/, '/');
  var isCentral = path === '/' || /\/index\.html$/i.test(location.pathname);
  if(!isCentral) return;

  var refreshing = false;
  var promptOpen = false;
  var reloadKey = 'fs_sw_reload_' + VERSION;

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
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;background:#111827;color:#fff;border-radius:18px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 18px 46px rgba(15,23,42,.42);font-family:Arial,sans-serif';
    box.innerHTML = '<div style="flex:1;min-width:0"><strong style="display:block;font-size:15px;margin-bottom:3px">Nova versão disponível</strong><span style="font-size:12px;opacity:.88">Atualize uma única vez pela Central para carregar as correções mais recentes.</span></div><button type="button" style="border:0;border-radius:12px;padding:11px 15px;background:#4f8cff;color:#fff;font-weight:800;font-size:13px">Atualizar agora</button>';

    box.querySelector('button').onclick = function(){
      var button = this;
      button.disabled = true;
      button.textContent = 'Atualizando…';
      sessionStorage.setItem('fs_update_requested', VERSION);

      if(registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }else{
        registration.update().catch(function(){}).finally(function(){
          closePrompt();
        });
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
    localStorage.setItem('fs_sw_applied', VERSION);
    sessionStorage.removeItem('fs_update_requested');
    closePrompt();
    if(!sessionStorage.getItem(reloadKey)){
      sessionStorage.setItem(reloadKey,'1');
      location.replace(location.pathname + '?v=' + VERSION);
    }
  });

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js?v=' + VERSION, {
      scope:'/',
      updateViaCache:'none'
    }).then(function(registration){
      if(registration.waiting && navigator.serviceWorker.controller){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }

      registration.addEventListener('updatefound', function(){
        var worker = registration.installing;
        if(!worker) return;
        worker.addEventListener('statechange', function(){
          if(worker.state === 'installed' && navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'});
          }
        });
      });

      registration.update().catch(function(){});
      if(!navigator.serviceWorker.controller){
        localStorage.setItem('fs_sw_applied', VERSION);
      }
    }).catch(function(error){
      console.warn('[FS] Atualização automática indisponível:', error);
    });
  });
})();
