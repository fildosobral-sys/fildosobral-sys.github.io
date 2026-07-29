(function () {
  'use strict';

  if (window.__pdfRepairV53Loaded) return;
  window.__pdfRepairV53Loaded = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function cleanName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  function documentName(extension) {
    const text = document.body.innerText || '';
    const simulation = (text.match(/\bFS\d{3,}\b/i) || ['SIMULACAO'])[0];
    const clientMatch = text.match(/(?:Cliente|Simulação para)\s*:\s*([^\n]+)/i);
    const client = cleanName(clientMatch ? clientMatch[1] : 'CLIENTE') || 'CLIENTE';
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
      String(now.getMilliseconds()).padStart(3, '0')
    ].join('');
    return `PLANOS_E_COTACOES_${client}_${cleanName(simulation)}_${stamp}.${extension}`;
  }

  function findPdfModal(element) {
    let node = element;
    while (node && node !== document.body) {
      if ((node.innerText || '').includes('PDF A4 pronto')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function previewImage(modal) {
    return Array.from(modal.querySelectorAll('img'))
      .filter((img) => img.src && !img.src.startsWith('about:'))
      .sort((a, b) => {
        const areaA = (a.naturalWidth || a.width || 0) * (a.naturalHeight || a.height || 0);
        const areaB = (b.naturalWidth || b.width || 0) * (b.naturalHeight || b.height || 0);
        return areaB - areaA;
      })[0] || null;
  }

  async function imageBlob(img) {
    if (!img) throw new Error('Pré-visualização não encontrada.');
    if (!img.complete) {
      await Promise.race([
        new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', reject, { once: true });
        }),
        sleep(10000).then(() => { throw new Error('Tempo excedido ao carregar a imagem.'); })
      ]);
    }
    const response = await fetch(img.currentSrc || img.src);
    if (!response.ok) throw new Error('Não foi possível preparar a imagem.');
    return response.blob();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.position = 'fixed';
    anchor.style.left = '-9999px';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  }

  function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function pdfBlobFromImage(blob, img) {
    const JsPDF = window.jspdf && window.jspdf.jsPDF
      ? window.jspdf.jsPDF
      : window.jsPDF;
    if (!JsPDF) throw new Error('Gerador de PDF indisponível.');

    const landscape = (img.naturalWidth || img.width) > (img.naturalHeight || img.height);
    const pdf = new JsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 3;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;
    const dataUrl = await readAsDataURL(blob);
    pdf.addImage(dataUrl, 'PNG', x, y, width, height, undefined, 'FAST');
    return pdf.output('blob');
  }

  async function sharePdf(blob, filename) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        files: [file],
        title: 'Planos e Cotações',
        text: 'Segue a proposta em PDF.'
      });
      return;
    }
    downloadBlob(blob, filename);
  }

  async function runAction(button, modal, action) {
    if (button.dataset.v53Busy === '1') return;
    button.dataset.v53Busy = '1';
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '⏳ Preparando…';

    const watchdog = setTimeout(() => {
      if (button.dataset.v53Busy === '1') {
        button.dataset.v53Busy = '0';
        button.disabled = false;
        button.innerHTML = original;
      }
    }, 15000);

    try {
      const img = previewImage(modal);
      const pngBlob = await imageBlob(img);
      if (action === 'png') {
        downloadBlob(pngBlob, documentName('png'));
      } else {
        const pdfBlob = await pdfBlobFromImage(pngBlob, img);
        const filename = documentName('pdf');
        if (action === 'share') await sharePdf(pdfBlob, filename);
        else downloadBlob(pdfBlob, filename);
      }
    } catch (error) {
      console.error('[download-v53]', error);
      alert(`Não foi possível concluir o arquivo. ${error && error.message ? error.message : 'Tente novamente.'}`);
    } finally {
      clearTimeout(watchdog);
      button.dataset.v53Busy = '0';
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, a');
    if (!button) return;
    const modal = findPdfModal(button);
    if (!modal) return;
    const label = (button.innerText || button.textContent || '').trim();
    let action = null;
    if (/Baixar PDF/i.test(label)) action = 'pdf';
    else if (/Compartilhar PDF/i.test(label)) action = 'share';
    else if (/Salvar PNG/i.test(label)) action = 'png';
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    runAction(button, modal, action);
  }, true);

  setInterval(() => {
    document.querySelectorAll('button[disabled], a[aria-disabled="true"]').forEach((button) => {
      const label = (button.innerText || '').trim();
      if (!/Preparando|Montando imagem/i.test(label)) return;
      if (!findPdfModal(button)) return;
      if (button.dataset.v53Busy === '1') return;
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.innerHTML = /PDF/i.test(button.dataset.originalLabel || '')
        ? '⬇️ Baixar PDF'
        : '⬇️ Baixar PDF';
    });
  }, 3000);
})();
