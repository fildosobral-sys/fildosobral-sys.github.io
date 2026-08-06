(function () {
  'use strict';

  const ORIGINAL_LABEL = new WeakMap();
  const BUSY_TEXT = /montando|preparando|gerando/i;

  function clean(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  function timestamp() {
    const d = new Date();
    const pad = (n, size = 2) => String(n).padStart(size, '0');
    return [
      d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()),
      pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds()), pad(d.getMilliseconds(), 3)
    ].join('');
  }

  function simulationData() {
    const text = document.body.innerText || '';
    const client =
      document.querySelector('[name*="cliente" i], #nomeCliente, #cliente')?.value ||
      text.match(/Cliente\s*:?\s*([^\n]+)/i)?.[1] || 'CLIENTE';
    const code = text.match(/\bFS\d{3,}\b/i)?.[0] || 'SIMULACAO';
    return { client: clean(client) || 'CLIENTE', code: clean(code) || 'SIMULACAO' };
  }

  function modalFor(element) {
    let node = element;
    while (node && node !== document.body) {
      if (/PDF A4 pronto/i.test(node.innerText || '') && node.querySelector('img')) return node;
      node = node.parentElement;
    }
    return Array.from(document.querySelectorAll('div, section, dialog')).find(
      (item) => /PDF A4 pronto/i.test(item.innerText || '') && item.querySelector('img')
    );
  }

  function previewImage(modal) {
    return Array.from(modal.querySelectorAll('img'))
      .filter((img) => img.src && !/logo|icon|avatar/i.test(img.className || ''))
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
  }

  async function imageReady(img) {
    if (!img.complete || !img.naturalWidth) {
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
      });
    }
    if (img.decode) {
      try { await img.decode(); } catch (_) {}
    }
  }

  async function imageBlob(img) {
    await imageReady(img);
    if (/^blob:/.test(img.src)) {
      const response = await fetch(img.src);
      return response.blob();
    }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fffdf0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao montar PNG.')), 'image/png', 1);
    });
  }

  async function pdfBlob(img) {
    await imageReady(img);
    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPDF) throw new Error('Gerador de PDF indisponível.');

    const landscape = img.naturalWidth > img.naturalHeight;
    const pdf = new JsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;
    const ratio = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);
    const width = img.naturalWidth * ratio;
    const height = img.naturalHeight * ratio;
    const x = (pageWidth - width) / 2;
    const y = margin;
    pdf.setFillColor(255, 253, 240);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.addImage(img, 'PNG', x, y, width, height, undefined, 'FAST');
    return pdf.output('blob');
  }

  function uniqueName(prefix, extension) {
    const data = simulationData();
    return `${prefix}_${data.client}_${data.code}_${timestamp()}.${extension}`;
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function share(blob, filename) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        files: [file],
        title: 'Proposta comercial',
        text: 'Segue a proposta comercial em PDF.'
      });
      return;
    }
    download(blob, filename);
    alert('O navegador não permitiu anexar o PDF diretamente. O arquivo foi salvo para você anexar no WhatsApp.');
  }

  function setBusy(button, text) {
    if (!ORIGINAL_LABEL.has(button)) ORIGINAL_LABEL.set(button, button.innerHTML);
    button.disabled = true;
    button.innerHTML = text;
  }

  function release(button) {
    button.disabled = false;
    button.innerHTML = ORIGINAL_LABEL.get(button) || button.innerHTML.replace(/⏳.*$/s, 'Baixar PDF');
  }

  async function handle(button, action) {
    const modal = modalFor(button);
    const img = modal && previewImage(modal);
    if (!img) {
      alert('A pré-visualização ainda não ficou pronta. Aguarde um instante e tente novamente.');
      return;
    }
    setBusy(button, '⏳ Preparando...');
    try {
      if (action === 'png') {
        const blob = await imageBlob(img);
        download(blob, uniqueName('PLANOS_E_COTACOES', 'png'));
      } else {
        const blob = await pdfBlob(img);
        const name = uniqueName('PLANOS_E_COTACOES', 'pdf');
        if (action === 'share') await share(blob, name);
        else download(blob, name);
      }
    } catch (error) {
      console.error('[PDF repair]', error);
      alert(`Não foi possível concluir o arquivo: ${error.message || 'erro inesperado'}`);
    } finally {
      release(button);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, a');
    if (!button) return;
    const label = (button.innerText || '').trim();
    let action = null;
    if (/baixar PDF/i.test(label)) action = 'pdf';
    else if (/compartilhar PDF/i.test(label)) action = 'share';
    else if (/salvar PNG/i.test(label) && modalFor(button)) action = 'png';
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handle(button, action);
  }, true);

  function normalizeModal(modal) {
    modal.classList.add('fs-pdf-modal-fixed');
    modal.querySelectorAll('button').forEach((button) => {
      if (BUSY_TEXT.test(button.innerText || '') && button.disabled) {
        setTimeout(() => release(button), 15000);
      }
    });
    document.querySelectorAll('button').forEach((button) => {
      if (BUSY_TEXT.test(button.innerText || '') && !modal.contains(button)) {
        button.disabled = false;
        button.innerHTML = ORIGINAL_LABEL.get(button) || '⬇️ Baixar A4 - Planos e Cotações';
      }
    });
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll('div, section, dialog').forEach((node) => {
      if (/PDF A4 pronto/i.test(node.innerText || '') && node.querySelector('img')) normalizeModal(node);
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const style = document.createElement('style');
  style.textContent = `
    .fs-pdf-modal-fixed img {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-height: 54vh !important;
      object-fit: contain !important;
      object-position: center top !important;
    }
    .fs-pdf-modal-fixed {
      max-width: min(92vw, 680px) !important;
      overflow-x: hidden !important;
    }
    .fs-pdf-modal-fixed button {
      touch-action: manipulation;
    }
  `;
  document.head.appendChild(style);
})();
