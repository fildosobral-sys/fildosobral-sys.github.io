(function () {
  "use strict";

  if (window.__pdfDownloadFixV54Loaded) return;
  window.__pdfDownloadFixV54Loaded = true;

  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const uniqueName = (prefix, extension) => {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
      String(now.getMilliseconds()).padStart(3, "0"),
    ].join("");
    return `${prefix}_${stamp}.${extension}`;
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 15000);
  };

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const getPreviewImage = (modal) => {
    const images = Array.from(modal.querySelectorAll("img")).filter(
      (img) => img.src && !img.src.startsWith("data:image/svg")
    );
    return images.sort(
      (a, b) =>
        (b.naturalWidth || b.width) * (b.naturalHeight || b.height) -
        (a.naturalWidth || a.width) * (a.naturalHeight || a.height)
    )[0];
  };

  const getImageBlob = async (image) => {
    if (!image || !image.src) throw new Error("Prévia da imagem não encontrada.");
    const response = await fetch(image.src);
    if (!response.ok) throw new Error("Não foi possível preparar a imagem.");
    return response.blob();
  };

  const createPdfBlob = async (imageBlob, image) => {
    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPDF) throw new Error("Gerador de PDF indisponível.");

    const landscape =
      (image.naturalWidth || image.width) > (image.naturalHeight || image.height);
    const pdf = new JsPDF({
      orientation: landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 4;
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    const scale = Math.min(
      (pageWidth - margin * 2) / sourceWidth,
      (pageHeight - margin * 2) / sourceHeight
    );
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;
    const dataUrl = await blobToDataUrl(imageBlob);
    pdf.addImage(dataUrl, "PNG", x, y, width, height, undefined, "FAST");
    return pdf.output("blob");
  };

  const setBusy = (button, busy) => {
    if (busy) {
      button.dataset.v54OriginalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = "⏳ Preparando...";
    } else {
      button.disabled = false;
      if (button.dataset.v54OriginalHtml) {
        button.innerHTML = button.dataset.v54OriginalHtml;
        delete button.dataset.v54OriginalHtml;
      }
    }
  };

  document.addEventListener(
    "click",
    async (event) => {
      const button = event.target.closest("button, a");
      if (!button) return;
      const modal = button.closest('[role="dialog"], .modal, .popup, .overlay');
      if (!modal || !normalize(modal.textContent).includes("pdf a4 pronto")) return;

      const action = normalize(button.textContent);
      const isPdf = action.includes("baixar pdf");
      const isShare = action.includes("compartilhar pdf");
      const isPng = action.includes("salvar png");
      if (!isPdf && !isShare && !isPng) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.dataset.v54Busy === "1") return;

      button.dataset.v54Busy = "1";
      setBusy(button, true);
      const watchdog = window.setTimeout(() => {
        button.dataset.v54Busy = "0";
        setBusy(button, false);
      }, 20000);

      try {
        const preview = getPreviewImage(modal);
        const imageBlob = await getImageBlob(preview);

        if (isPng) {
          downloadBlob(imageBlob, uniqueName("PROPOSTA_COMERCIAL", "png"));
          return;
        }

        const pdfBlob = await createPdfBlob(imageBlob, preview);
        const filename = uniqueName("PROPOSTA_COMERCIAL", "pdf");

        if (isShare && navigator.share && window.File) {
          const file = new File([pdfBlob], filename, { type: "application/pdf" });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "Proposta comercial",
              text: "Segue a proposta comercial em PDF.",
            });
            return;
          }
        }
        downloadBlob(pdfBlob, filename);
      } catch (error) {
        console.error("[PDF download v54]", error);
        alert(
          "Não foi possível baixar o arquivo. Tente novamente ou use “Abrir imagem” como alternativa."
        );
      } finally {
        window.clearTimeout(watchdog);
        button.dataset.v54Busy = "0";
        setBusy(button, false);
      }
    },
    true
  );
})();
