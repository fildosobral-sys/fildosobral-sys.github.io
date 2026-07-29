(function () {
  'use strict';

  if (window.__fsDownloadRepeatFixV53) return;
  window.__fsDownloadRepeatFixV53 = true;

  var nativeCreateObjectURL = URL.createObjectURL.bind(URL);
  var nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  var nativeAnchorClick = HTMLAnchorElement.prototype.click;
  var buttonStates = new WeakMap();

  /*
   * Alguns navegadores Android/PWA entregam o blob ao gerenciador de
   * downloads de forma assíncrona. Revogar a URL imediatamente interrompe
   * esse processo. Mantemos cada URL ativa tempo suficiente para o sistema
   * concluir o salvamento.
   */
  URL.createObjectURL = function (blob) {
    return nativeCreateObjectURL(blob);
  };

  URL.revokeObjectURL = function (url) {
    window.setTimeout(function () {
      try {
        nativeRevokeObjectURL(url);
      } catch (error) {
        console.warn('[FS Download] Não foi possível liberar a URL:', error);
      }
    }, 120000);
  };

  function addUniqueSuffix(filename) {
    if (!filename || !/\.(pdf|png)$/i.test(filename)) return filename;

    var timestamp = new Date()
      .toISOString()
      .replace(/\D/g, '')
      .slice(0, 17);

    return filename.replace(/\.(pdf|png)$/i, '_' + timestamp + '.$1');
  }

  /*
   * Um link temporariamente anexado ao DOM é mais confiável no Chrome
   * Android, WebView e PWA instalado. O nome exclusivo também evita que o
   * segundo download seja tratado como repetição bloqueada.
   */
  HTMLAnchorElement.prototype.click = function () {
    var isBlobDownload =
      Boolean(this.download) && /^blob:/i.test(this.href || '');

    if (isBlobDownload) {
      this.download = addUniqueSuffix(this.download);
    }

    if (isBlobDownload && !this.isConnected && document.body) {
      document.body.appendChild(this);

      try {
        return nativeAnchorClick.call(this);
      } finally {
        var anchor = this;
        window.setTimeout(function () {
          if (anchor.parentNode === document.body) anchor.remove();
        }, 3000);
      }
    }

    return nativeAnchorClick.call(this);
  };

  function isDownloadControl(element) {
    var label = (element && element.textContent) || '';
    return /baixar\s*(pdf|a4)|salvar\s*(png|imagem)|compartilhar\s*pdf|preparando|montando imagem|gerando pdf/i.test(
      label
    );
  }

  function isBusyLabel(label) {
    return /preparando|montando imagem|gerando pdf|processando/i.test(
      label || ''
    );
  }

  function rememberButton(button) {
    if (!buttonStates.has(button) && !isBusyLabel(button.textContent)) {
      buttonStates.set(button, {
        html: button.innerHTML,
        disabled: button.disabled
      });
    }

    window.clearTimeout(button.__fsDownloadResetTimer);
    button.__fsDownloadResetTimer = window.setTimeout(function () {
      restoreButton(button);
    }, 30000);
  }

  function restoreButton(button) {
    if (!button) return;

    var state = buttonStates.get(button);
    var stillBusy =
      isBusyLabel(button.textContent) ||
      button.disabled ||
      button.getAttribute('aria-busy') === 'true';

    if (!stillBusy) return;

    button.disabled = state ? state.disabled : false;
    button.removeAttribute('disabled');
    button.removeAttribute('aria-busy');
    button.classList.remove('loading', 'is-loading', 'busy', 'processing');

    ['busy', 'loading', 'processing', 'downloading'].forEach(function (key) {
      if (button.dataset) delete button.dataset[key];
    });

    if (state && state.html) {
      button.innerHTML = state.html;
    } else if (/png/i.test(button.textContent || '')) {
      button.innerHTML = '🖼️ Salvar PNG';
    } else {
      button.innerHTML = '⬇️ Baixar PDF';
    }
  }

  function recoverStuckButtons() {
    document.querySelectorAll('button, a').forEach(function (button) {
      if (isDownloadControl(button) && isBusyLabel(button.textContent)) {
        restoreButton(button);
      }
    });
  }

  /*
   * A captura acontece antes do manipulador original trocar o texto para
   * "Preparando...", preservando o rótulo correto para a recuperação.
   */
  document.addEventListener(
    'click',
    function (event) {
      var button = event.target.closest('button, a');
      if (!button || !isDownloadControl(button)) return;
      rememberButton(button);
    },
    true
  );

  window.addEventListener('pageshow', recoverStuckButtons);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) recoverStuckButtons();
  });

  window.setInterval(recoverStuckButtons, 15000);
})();
