/* =========================================================
   FS SOLUÇÕES — CARD CENTRAL DA FILIAL
   Adicione este arquivo à página inicial após os demais scripts.
   Ele cria o bloco antes de "Navegue por categorias".
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

    // Tenta localizar o bloco/seção que contém o título.
    return heading.closest("section") ||
           heading.closest(".section") ||
           heading.closest("[class*='section']") ||
           heading.parentElement;
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

      <a class="fs-filial-card"
         href="${LINK_FILIAL}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="Abrir Central da Filial">
        <div class="fs-filial-visual">
          <div class="fs-filial-orb fs-orb-1"></div>
          <div class="fs-filial-orb fs-orb-2"></div>

          <div class="fs-filial-icon">🔗</div>

          <div class="fs-filial-copy">
            <span class="fs-filial-kicker">LINK RÁPIDO DA LOJA</span>
            <strong>Central da Filial</strong>
            <small>Contatos • Ofertas • Serviços • Localização</small>
          </div>

          <div class="fs-filial-arrow" aria-hidden="true">›</div>
        </div>

        <div class="fs-filial-footer">
          <span>Compartilhe com o cliente em poucos segundos</span>
          <b>Acessar</b>
        </div>
      </a>
    `;

    return section;
  }

  function addStyles() {
    if (document.getElementById("fs-central-filial-style")) return;

    const style = document.createElement("style");
    style.id = "fs-central-filial-style";
    style.textContent = `
      #${ID}{
        width:min(100% - 32px, 1180px);
        margin:32px auto 34px;
        box-sizing:border-box;
      }

      #${ID} .fs-filial-title{
        display:flex;
        align-items:center;
        gap:14px;
        margin:0 8px 18px;
      }

      #${ID} .fs-filial-mark{
        width:8px;
        height:34px;
        border-radius:99px;
        background:linear-gradient(180deg,#6f63ff,#829cff);
        box-shadow:0 5px 14px rgba(98,91,255,.24);
        flex:0 0 auto;
      }

      #${ID} .fs-filial-title h2{
        margin:0;
        color:#20242c;
        font:800 clamp(23px,4vw,31px)/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        letter-spacing:-.6px;
      }

      #${ID} .fs-filial-card{
        display:block;
        overflow:hidden;
        text-decoration:none;
        color:inherit;
        border-radius:30px;
        border:1px solid rgba(109,104,225,.22);
        background:#fff;
        box-shadow:0 17px 38px rgba(38,49,93,.12);
        -webkit-tap-highlight-color:transparent;
        transition:transform .18s ease,box-shadow .18s ease;
      }

      #${ID} .fs-filial-card:active{
        transform:scale(.985);
      }

      #${ID} .fs-filial-visual{
        position:relative;
        min-height:190px;
        padding:27px 25px;
        display:flex;
        align-items:center;
        gap:20px;
        overflow:hidden;
        color:#fff;
        background:
          radial-gradient(circle at 78% 18%,rgba(77,194,255,.32),transparent 30%),
          linear-gradient(125deg,#10266f 0%,#245acb 54%,#6949d7 100%);
      }

      #${ID} .fs-filial-visual:after{
        content:"";
        position:absolute;
        inset:auto -10% -65% 25%;
        height:150px;
        background:rgba(84,222,255,.17);
        filter:blur(35px);
        transform:rotate(-8deg);
      }

      #${ID} .fs-filial-orb{
        position:absolute;
        border-radius:50%;
        border:1px solid rgba(255,255,255,.14);
      }

      #${ID} .fs-orb-1{
        width:180px;height:180px;
        right:-70px;top:-75px;
      }

      #${ID} .fs-orb-2{
        width:105px;height:105px;
        right:70px;bottom:-60px;
      }

      #${ID} .fs-filial-icon{
        position:relative;
        z-index:2;
        width:78px;
        height:78px;
        flex:0 0 78px;
        display:grid;
        place-items:center;
        border-radius:24px;
        font-size:39px;
        background:linear-gradient(145deg,rgba(255,255,255,.25),rgba(255,255,255,.10));
        border:1px solid rgba(255,255,255,.28);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 15px 30px rgba(3,17,62,.22);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      }

      #${ID} .fs-filial-copy{
        position:relative;
        z-index:2;
        min-width:0;
        display:flex;
        flex-direction:column;
      }

      #${ID} .fs-filial-kicker{
        margin-bottom:6px;
        color:#cfe6ff;
        font:800 11px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        letter-spacing:1.1px;
      }

      #${ID} .fs-filial-copy strong{
        color:#fff;
        font:900 clamp(27px,5vw,40px)/1.03 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        letter-spacing:-1px;
      }

      #${ID} .fs-filial-copy small{
        margin-top:10px;
        color:rgba(255,255,255,.88);
        font:600 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }

      #${ID} .fs-filial-arrow{
        position:relative;
        z-index:2;
        margin-left:auto;
        width:45px;height:45px;
        flex:0 0 45px;
        display:grid;
        place-items:center;
        border-radius:50%;
        color:#fff;
        background:rgba(255,255,255,.16);
        border:1px solid rgba(255,255,255,.22);
        font:300 40px/1 Arial,sans-serif;
      }

      #${ID} .fs-filial-footer{
        min-height:67px;
        padding:14px 23px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        background:linear-gradient(180deg,#fff,#f8f9ff);
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }

      #${ID} .fs-filial-footer span{
        color:#657080;
        font-size:13px;
        font-weight:600;
      }

      #${ID} .fs-filial-footer b{
        white-space:nowrap;
        padding:9px 14px;
        border-radius:13px;
        color:#315bd4;
        background:#edf2ff;
        font-size:13px;
      }

      @media(max-width:640px){
        #${ID}{
          width:calc(100% - 32px);
          margin-top:28px;
          margin-bottom:30px;
        }

        #${ID} .fs-filial-visual{
          min-height:165px;
          padding:23px 20px;
          gap:15px;
        }

        #${ID} .fs-filial-icon{
          width:65px;height:65px;
          flex-basis:65px;
          border-radius:20px;
          font-size:31px;
        }

        #${ID} .fs-filial-copy strong{
          font-size:27px;
        }

        #${ID} .fs-filial-copy small{
          font-size:12px;
          margin-top:7px;
        }

        #${ID} .fs-filial-arrow{
          width:38px;height:38px;
          flex-basis:38px;
          font-size:33px;
        }

        #${ID} .fs-filial-footer{
          min-height:62px;
          padding:12px 18px;
        }

        #${ID} .fs-filial-footer span{
          font-size:11.5px;
          max-width:68%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (document.getElementById(ID)) return true;

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
})();
