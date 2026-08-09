/* =========================================================
   FS SOLUÇÕES — CENTRAL DA FILIAL v2
   Card iOS-style com duas ações:
   1) Acessar Central
   2) Copiar link
   ========================================================= */
(function () {
  "use strict";

  const LINK_FILIAL = "https://linktr.ee/Zenir_Ao_Lado_do_Bradesco";
  const ID = "fs-central-filial-section";

  function findCategoriesHeading() {
    const nodes = Array.from(document.querySelectorAll("h1,h2,h3,h4,div,span,p"));
    return nodes.find(el =>
      (el.textContent || "").trim().toLowerCase() === "navegue por categorias"
    );
  }

  function findSectionAnchor() {
    const heading = findCategoriesHeading();
    if (!heading) return null;
    return heading.closest("section") ||
           heading.closest(".section") ||
           heading.closest("[class*='section']") ||
           heading.parentElement;
  }

  async function copyLink(button) {
    const original = button.innerHTML;
    let copied = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(LINK_FILIAL);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = LINK_FILIAL;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        copied = document.execCommand("copy");
        ta.remove();
      } catch (_) {}
    }

    button.classList.remove("is-error", "is-success");
    button.classList.add(copied ? "is-success" : "is-error");
    button.innerHTML = copied
      ? '<span class="fs-action-icon">✓</span><span><b>Link copiado!</b><small>Pronto para compartilhar</small></span>'
      : '<span class="fs-action-icon">!</span><span><b>Não foi possível copiar</b><small>Toque e segure o link</small></span>';

    setTimeout(() => {
      button.classList.remove("is-error", "is-success");
      button.innerHTML = original;
    }, 1800);
  }

  function buildSection() {
    const section = document.createElement("section");
    section.id = ID;
    section.className = "fs-filial-hub";

    section.innerHTML = `
      <div class="fs-filial-title">
        <span class="fs-filial-mark"></span>
        <h2>Atendimento &amp; Divulgação</h2>
      </div>

      <div class="fs-filial-card" role="group" aria-label="Central da Filial">
        <div class="fs-filial-hero">
          <div class="fs-filial-copy">
            <span class="fs-filial-kicker">🔗 LINK RÁPIDO DA LOJA</span>
            <strong>Central da Filial</strong>
            <p>Tudo que você precisa,<br><em>em um só lugar!</em></p>

            <div class="fs-feature-row" aria-label="Conteúdos disponíveis">
              <div><span>💬</span><b>Contatos</b></div>
              <div><span>🏷️</span><b>Ofertas</b></div>
              <div><span>🚚</span><b>Serviços</b></div>
              <div><span>📍</span><b>Localização</b></div>
            </div>

            <div class="fs-official-note">
              <span>🛡️</span>
              <div>
                <b>Informações oficiais da sua filial</b>
                <small>Ofertas, contatos dos vendedores, serviços, regulamentos e muito mais.</small>
              </div>
            </div>
          </div>

          <div class="fs-phone-wrap" aria-hidden="true">
            <span class="fs-float fs-float-whats">💬</span>
            <span class="fs-float fs-float-offer">%</span>
            <span class="fs-float fs-float-pin">📍</span>
            <div class="fs-phone">
              <div class="fs-phone-camera"></div>
              <div class="fs-phone-screen">
                <div class="fs-phone-logo">Zenir</div>
                <b>Zenir Móveis Iguatu</b>
                <small>Iguatu 3, Ao lado do Bradesco 📍</small>
                <div class="fs-phone-link">PROMOCIONAL DO MÊS</div>
                <div class="fs-phone-link">Flávio Chagas</div>
                <div class="fs-phone-link">Darlan</div>
                <div class="fs-phone-link">Crediário • Suporte</div>
                <div class="fs-phone-link">Venha até nós • GPS</div>
              </div>
            </div>
          </div>
        </div>

        <div class="fs-filial-actions">
          <button class="fs-filial-action fs-open-central" type="button" aria-label="Acessar Central da Filial">
            <span class="fs-action-icon">↗</span>
            <span><b>Acessar Central</b><small>Abrir Linktree da Filial</small></span>
          </button>

          <button class="fs-filial-action fs-copy-link" type="button" aria-label="Copiar link da Central da Filial">
            <span class="fs-action-icon">🔗</span>
            <span><b>Copiar link</b><small>Copiar para compartilhar</small></span>
          </button>
        </div>

        <div class="fs-filial-safe">🛡️ Link oficial e seguro da sua filial</div>
      </div>
    `;

    section.querySelector(".fs-open-central").addEventListener("click", () => {
      window.open(LINK_FILIAL, "_blank", "noopener,noreferrer");
    });

    const copyButton = section.querySelector(".fs-copy-link");
    copyButton.addEventListener("click", () => copyLink(copyButton));

    return section;
  }

  function addStyles() {
    if (document.getElementById("fs-central-filial-style-v2")) return;

    const style = document.createElement("style");
    style.id = "fs-central-filial-style-v2";
    style.textContent = `
      #${ID}{
        width:min(100% - 32px,1180px);
        margin:32px auto 36px;
        box-sizing:border-box;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,"Segoe UI",Roboto,Arial,sans-serif;
      }
      #${ID} *{box-sizing:border-box}
      #${ID} .fs-filial-title{display:flex;align-items:center;gap:14px;margin:0 8px 18px}
      #${ID} .fs-filial-mark{width:8px;height:34px;border-radius:99px;background:linear-gradient(180deg,#6f63ff,#829cff);box-shadow:0 5px 14px rgba(98,91,255,.24);flex:0 0 auto}
      #${ID} .fs-filial-title h2{margin:0;color:#20242c;font-weight:850;font-size:clamp(23px,4vw,31px);line-height:1.1;letter-spacing:-.65px}

      #${ID} .fs-filial-card{
        overflow:hidden;border-radius:30px;border:1px solid rgba(87,95,148,.14);background:rgba(255,255,255,.94);
        box-shadow:0 20px 50px rgba(35,46,90,.14),inset 0 1px 0 rgba(255,255,255,.9);
      }
      #${ID} .fs-filial-hero{
        position:relative;min-height:330px;padding:34px 34px 30px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(240px,.85fr);gap:26px;overflow:hidden;color:white;
        background:
          radial-gradient(circle at 82% 18%,rgba(109,211,255,.30),transparent 28%),
          radial-gradient(circle at 86% 80%,rgba(150,94,255,.26),transparent 34%),
          linear-gradient(125deg,#071b54 0%,#0f2f78 42%,#344fe0 72%,#6d4de0 100%);
      }
      #${ID} .fs-filial-hero:before{content:"";position:absolute;inset:auto -10% -38% 26%;height:220px;border-radius:50%;background:rgba(84,222,255,.16);filter:blur(42px);transform:rotate(-8deg)}
      #${ID} .fs-filial-hero:after{content:"";position:absolute;width:260px;height:260px;border:1px solid rgba(255,255,255,.10);border-radius:50%;right:-105px;top:-80px;box-shadow:0 0 0 70px rgba(255,255,255,.025)}
      #${ID} .fs-filial-copy{position:relative;z-index:2;min-width:0}
      #${ID} .fs-filial-kicker{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:9px;background:rgba(79,107,255,.44);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:800;letter-spacing:1.3px;color:#e5efff}
      #${ID} .fs-filial-copy>strong{display:block;margin-top:13px;font-weight:900;font-size:clamp(32px,5vw,48px);line-height:.98;letter-spacing:-1.5px;text-shadow:0 4px 16px rgba(0,0,0,.24)}
      #${ID} .fs-filial-copy>p{margin:15px 0 22px;font-size:19px;font-weight:720;line-height:1.25;color:#f3f7ff}
      #${ID} .fs-filial-copy>p em{font-style:normal;color:#33def2}

      #${ID} .fs-feature-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;max-width:520px}
      #${ID} .fs-feature-row div{text-align:center;min-width:0}
      #${ID} .fs-feature-row span{width:50px;height:50px;margin:0 auto 7px;display:grid;place-items:center;border-radius:50%;background:linear-gradient(145deg,rgba(255,255,255,.19),rgba(68,127,255,.24));border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.26),0 9px 20px rgba(1,14,52,.20);font-size:24px}
      #${ID} .fs-feature-row b{display:block;font-size:11.5px;color:#f3f6ff;white-space:nowrap}

      #${ID} .fs-official-note{margin-top:24px;max-width:540px;padding:13px 14px;display:flex;gap:11px;align-items:flex-start;border:1px solid rgba(255,255,255,.13);border-radius:14px;background:rgba(25,66,154,.34);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
      #${ID} .fs-official-note>span{font-size:21px;line-height:1}
      #${ID} .fs-official-note b{display:block;font-size:13px;margin-bottom:4px}
      #${ID} .fs-official-note small{display:block;color:rgba(255,255,255,.78);font-size:11.5px;line-height:1.35}

      #${ID} .fs-phone-wrap{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;min-height:270px}
      #${ID} .fs-phone{width:190px;height:310px;padding:8px;border-radius:31px;background:linear-gradient(145deg,#263142,#070b11 72%);box-shadow:0 22px 50px rgba(0,0,0,.42),inset 0 0 0 1px rgba(255,255,255,.12);transform:rotate(5deg);position:relative}
      #${ID} .fs-phone-camera{position:absolute;z-index:3;left:50%;top:13px;transform:translateX(-50%);width:10px;height:10px;border-radius:50%;background:#0d1117}
      #${ID} .fs-phone-screen{height:100%;padding:27px 12px 14px;border-radius:24px;background:#f9fbff;color:#182238;text-align:center;overflow:hidden}
      #${ID} .fs-phone-logo{font-weight:950;font-size:20px;font-style:italic;color:#233f98;margin-bottom:8px}
      #${ID} .fs-phone-screen>b{display:block;font-size:10.5px}
      #${ID} .fs-phone-screen>small{display:block;margin:3px 0 10px;font-size:7px;color:#606b7a}
      #${ID} .fs-phone-link{margin:6px 0;padding:8px 6px;border-radius:7px;background:linear-gradient(90deg,#2e68d8,#275dca);color:#fff;font-size:7.5px;font-weight:700;text-align:left;box-shadow:0 3px 8px rgba(28,70,160,.16)}
      #${ID} .fs-float{position:absolute;z-index:4;display:grid;place-items:center;box-shadow:0 12px 24px rgba(4,17,56,.28)}
      #${ID} .fs-float-whats{left:10%;top:20%;width:47px;height:47px;border-radius:14px;background:#27d366;font-size:25px;transform:rotate(-10deg)}
      #${ID} .fs-float-offer{right:8%;top:32%;width:43px;height:43px;border-radius:12px;background:#ff4c55;color:#fff;font-size:24px;font-weight:900;transform:rotate(13deg)}
      #${ID} .fs-float-pin{left:7%;bottom:16%;width:42px;height:42px;border-radius:12px;background:#eff5ff;font-size:24px;transform:rotate(8deg)}

      #${ID} .fs-filial-actions{display:grid;grid-template-columns:1fr 1fr;background:#fff;border-top:1px solid #edf0f6}
      #${ID} .fs-filial-action{appearance:none;border:0;background:#fff;min-height:94px;padding:18px 24px;display:flex;align-items:center;gap:15px;text-align:left;cursor:pointer;color:#1f2734;transition:background .15s ease,transform .15s ease;-webkit-tap-highlight-color:transparent}
      #${ID} .fs-filial-action+ .fs-filial-action{border-left:1px solid #edf0f6}
      #${ID} .fs-filial-action:active{background:#f5f7ff;transform:scale(.988)}
      #${ID} .fs-action-icon{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#5a68ff,#4d9bff);color:white;font-size:22px;font-weight:900;box-shadow:0 9px 18px rgba(70,93,230,.19)}
      #${ID} .fs-copy-link .fs-action-icon{background:#f0edff;color:#5d4fee;box-shadow:none}
      #${ID} .fs-filial-action b{display:block;font-size:18px;line-height:1.15;letter-spacing:-.3px}
      #${ID} .fs-filial-action small{display:block;margin-top:3px;color:#7d8796;font-size:12px;line-height:1.25}
      #${ID} .fs-filial-action.is-success{background:#f0fbf4}
      #${ID} .fs-filial-action.is-success .fs-action-icon{background:#28b668;color:#fff}
      #${ID} .fs-filial-action.is-error{background:#fff6f6}
      #${ID} .fs-filial-action.is-error .fs-action-icon{background:#df4b55;color:#fff}
      #${ID} .fs-filial-safe{min-height:46px;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 15px;border-top:1px solid #edf0f6;background:linear-gradient(180deg,#fff,#fafbfe);color:#8a93a2;font-size:12px;font-weight:600}

      @media(max-width:720px){
        #${ID}{width:calc(100% - 32px);margin-top:28px;margin-bottom:32px}
        #${ID} .fs-filial-title{margin-left:3px}
        #${ID} .fs-filial-card{border-radius:25px}
        #${ID} .fs-filial-hero{min-height:300px;padding:26px 21px 23px;grid-template-columns:minmax(0,1.15fr) minmax(135px,.85fr);gap:9px}
        #${ID} .fs-filial-copy>strong{font-size:34px;letter-spacing:-1.1px}
        #${ID} .fs-filial-copy>p{font-size:15px;margin:12px 0 18px}
        #${ID} .fs-filial-kicker{font-size:10px;padding:6px 8px;letter-spacing:1px}
        #${ID} .fs-feature-row{gap:6px}
        #${ID} .fs-feature-row span{width:39px;height:39px;font-size:19px}
        #${ID} .fs-feature-row b{font-size:9px}
        #${ID} .fs-official-note{margin-top:18px;padding:10px}
        #${ID} .fs-official-note b{font-size:11px}
        #${ID} .fs-official-note small{font-size:9.5px}
        #${ID} .fs-phone{width:128px;height:220px;border-radius:22px;padding:6px}
        #${ID} .fs-phone-screen{padding:22px 8px 8px;border-radius:17px}
        #${ID} .fs-phone-logo{font-size:14px}
        #${ID} .fs-phone-screen>b{font-size:7px}
        #${ID} .fs-phone-screen>small{font-size:5.2px;margin-bottom:6px}
        #${ID} .fs-phone-link{margin:4px 0;padding:5px 4px;font-size:5.2px;border-radius:5px}
        #${ID} .fs-float-whats{width:36px;height:36px;font-size:19px;left:2%;top:19%}
        #${ID} .fs-float-offer{width:34px;height:34px;font-size:18px;right:0;top:34%}
        #${ID} .fs-float-pin{width:33px;height:33px;font-size:18px;left:0;bottom:18%}
        #${ID} .fs-filial-actions{grid-template-columns:1fr 1fr}
        #${ID} .fs-filial-action{min-height:82px;padding:14px 13px;gap:10px}
        #${ID} .fs-action-icon{width:39px;height:39px;flex-basis:39px;border-radius:11px;font-size:18px}
        #${ID} .fs-filial-action b{font-size:14px}
        #${ID} .fs-filial-action small{font-size:9.5px}
        #${ID} .fs-filial-safe{font-size:10px;min-height:41px}
      }

      @media(max-width:420px){
        #${ID} .fs-filial-hero{grid-template-columns:minmax(0,1fr) 118px;padding-left:18px;padding-right:14px}
        #${ID} .fs-filial-copy>strong{font-size:29px}
        #${ID} .fs-feature-row span{width:34px;height:34px;font-size:16px}
        #${ID} .fs-feature-row b{font-size:8px}
        #${ID} .fs-phone{width:112px;height:196px}
        #${ID} .fs-official-note{display:none}
        #${ID} .fs-filial-action{padding-left:10px;padding-right:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    const old = document.getElementById(ID);
    if (old) old.remove();
    const oldStyle = document.getElementById("fs-central-filial-style");
    if (oldStyle) oldStyle.remove();

    const anchor = findSectionAnchor();
    if (!anchor || !anchor.parentNode) return false;
    addStyles();
    anchor.parentNode.insertBefore(buildSection(), anchor);
    return true;
  }

  function boot() {
    if (install()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (install() || tries >= 30) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  } else {
    boot();
  }

  window.addEventListener("pageshow", () => setTimeout(boot, 0));
})();
