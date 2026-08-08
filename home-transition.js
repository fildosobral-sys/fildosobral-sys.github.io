(function(){
  'use strict';
  var armed = false;
  var navigating = false;
  var timer = 0;
  var btn = null;

  function removeLegacyHomes(){
    document.querySelectorAll('#btnVoltarInicio,.fs-back-home,#fsUniversalHomeButton').forEach(function(el){
      if(el.id !== 'fsUniversalHomeButton') el.remove();
    });
  }

  function ensureButton(){
    btn = document.getElementById('fsUniversalHomeButton');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'fsUniversalHomeButton';
      btn.type = 'button';
      btn.textContent = '🏠';
      btn.setAttribute('aria-label','Ativar retorno à Central');
      btn.setAttribute('title','Voltar à Central');
      document.body.appendChild(btn);
    }
    return btn;
  }

  function paint(){
    var b = ensureButton();
    b.classList.toggle('fs-home-armed', armed);
    b.setAttribute('aria-label', armed ? 'Toque novamente para voltar à Central' : 'Ativar retorno à Central');
    b.setAttribute('title', armed ? 'Toque novamente para voltar à Central' : 'Voltar à Central');
  }

  function disarm(){
    armed = false;
    clearTimeout(timer);
    paint();
  }

  function cleanupModuleUi(){
    try{
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open','no-scroll','overflow-hidden');
      document.documentElement.classList.remove('modal-open','no-scroll','overflow-hidden');
      document.querySelectorAll('.fs-fullscreen-overlay.open,.modal-overlay.open,.modal-backdrop.open').forEach(function(el){
        if(!el.closest('#fsAccessModal')) el.classList.remove('open');
      });
    }catch(e){}
  }

  function goHome(){
    if(navigating) return;
    navigating = true;
    clearTimeout(timer);
    cleanupModuleUi();
    try{
      sessionStorage.setItem('fs_returning_home','1');
      sessionStorage.removeItem('fs_module_from_index');
    }catch(e){}
    window.location.replace('./index.html');
  }

  function init(){
    removeLegacyHomes();
    ensureButton();
    paint();
    cleanupModuleUi();
  }

  document.addEventListener('click', function(event){
    var b = event.target && event.target.closest ? event.target.closest('#fsUniversalHomeButton') : null;
    if(!b) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(navigating) return;
    if(!armed){
      armed = true;
      paint();
      clearTimeout(timer);
      timer = setTimeout(disarm, 2800);
      return;
    }
    goHome();
  }, true);

  window.addEventListener('pageshow', function(){
    navigating = false;
    cleanupModuleUi();
    disarm();
  });
  window.addEventListener('focus', cleanupModuleUi);

  var style = document.createElement('style');
  style.id = 'fs-universal-home-style-v39';
  style.textContent = `
    #fsUniversalHomeButton{
      position:fixed!important;
      right:max(14px,env(safe-area-inset-right))!important;
      bottom:max(14px,env(safe-area-inset-bottom))!important;
      left:auto!important;
      width:58px!important;min-width:58px!important;max-width:58px!important;
      height:58px!important;min-height:58px!important;max-height:58px!important;
      padding:0!important;margin:0!important;
      border:1px solid rgba(255,255,255,.38)!important;
      border-radius:50%!important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      background:rgba(30,41,59,.16)!important;
      color:#fff!important;
      font:400 27px/1 system-ui,-apple-system,"Segoe UI Emoji",sans-serif!important;
      text-decoration:none!important;
      box-shadow:0 5px 16px rgba(15,23,42,.08)!important;
      opacity:.22!important;
      backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important;
      transform:scale(1)!important;
      transition:opacity .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease!important;
      z-index:2147483000!important;
      appearance:none!important;-webkit-appearance:none!important;
    }
    #fsUniversalHomeButton.fs-home-armed{
      opacity:1!important;
      background:rgba(30,41,59,.96)!important;
      transform:scale(1.08)!important;
      box-shadow:0 0 0 6px rgba(59,130,246,.18),0 13px 30px rgba(37,99,235,.42)!important;
    }
    @media(max-width:640px){
      #fsUniversalHomeButton{right:max(12px,env(safe-area-inset-right))!important;bottom:max(12px,env(safe-area-inset-bottom))!important;}
    }
  `;
  document.head.appendChild(style);

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
