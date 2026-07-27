(function(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  var VERSION = '13';
  var refreshing = false;

  function createPrompt(registration){
    if(document.getElementById('fsMandatoryUpdate')) return;
    var box = document.createElement('div');
    box.id = 'fsMandatoryUpdate';
    box.setAttribute('role','alert');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;background:#111827;color:#fff;border-radius:18px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 18px 46px rgba(15,23,42,.42);font-family:Arial,sans-serif';
    box.innerHTML = '<div style="flex:1;min-width:0"><strong style="display:block;font-size:15px;margin-bottom:3px">Nova versão disponível</strong><span style="font-size:12px;opacity:.88">Atualize para carregar os arquivos, imagens e correções mais recentes.</span></div><button type="button" style="border:0;border-radius:12px;padding:11px 15px;background:#4f8cff;color:#fff;font-weight:800;font-size:13px">Atualizar agora</button>';
    box.querySelector('button').onclick = function(){
      this.disabled = true;
      this.textContent = 'Atualizando…';
      sessionStorage.setItem('fs_update_requested', VERSION);
      if(registration.waiting){
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      }else{
        registration.update().finally(function(){ location.reload(); });
      }
    };
    document.body.appendChild(box);
  }

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(refreshing) return;
    if(sessionStorage.getItem('fs_update_requested')){
      refreshing = true;
      sessionStorage.removeItem('fs_update_requested');
      location.reload();
    }
  });

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js?v=' + VERSION, {scope:'./', updateViaCache:'none'}).then(function(registration){
      if(registration.waiting && navigator.serviceWorker.controller) createPrompt(registration);
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
      setInterval(function(){ registration.update().catch(function(){}); }, 300000);
    }).catch(function(error){
      console.warn('[FS] Atualização automática indisponível:', error);
    });
  });
})();
