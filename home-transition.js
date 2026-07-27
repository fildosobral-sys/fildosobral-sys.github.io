(function () {
  "use strict";
  var navigating = false;
  function ensureOverlay() {
    var overlay = document.getElementById("fsHomeTransition");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "fsHomeTransition";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = '<div class="fs-home-transition-card"><img src="./icon-192.png" alt="" aria-hidden="true"><strong>FS Soluções</strong><span>Voltando à Central…</span><i aria-hidden="true"></i></div>';
    document.body.appendChild(overlay);
    return overlay;
  }
  window.fsVoltarCentral = function () {
    if (navigating) return false;
    navigating = true;
    var overlay = ensureOverlay();
    try { sessionStorage.setItem("fs_returning_home", "1"); } catch (e) {}
    requestAnimationFrame(function () { overlay.classList.add("is-visible"); });
    window.setTimeout(function () { window.location.replace("./index.html"); }, 720);
    return false;
  };
  document.addEventListener("click", function (event) {
    var home = event.target.closest("#btnVoltarInicio,.fs-back-home");
    if (!home) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.fsVoltarCentral();
  }, true);
  var style = document.createElement("style");
  style.textContent =
    "#fsHomeTransition{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(145deg,#111b69,#3133a2);opacity:0;visibility:hidden;transition:opacity .16s ease,visibility .16s ease}" +
    "#fsHomeTransition.is-visible{opacity:1;visibility:visible}" +
    ".fs-home-transition-card{display:flex;flex-direction:column;align-items:center;min-width:210px;padding:26px 28px 24px;border:1px solid rgba(255,255,255,.2);border-radius:24px;background:rgba(255,255,255,.11);color:#fff;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.26);backdrop-filter:blur(10px)}" +
    ".fs-home-transition-card img{width:72px;height:72px;border-radius:18px;object-fit:cover;box-shadow:0 12px 28px rgba(0,0,0,.25);margin-bottom:13px}" +
    ".fs-home-transition-card strong{font:800 20px/1.2 system-ui,-apple-system,sans-serif}" +
    ".fs-home-transition-card span{margin-top:6px;font:500 14px/1.3 system-ui,-apple-system,sans-serif;opacity:.86}" +
    ".fs-home-transition-card i{display:block;width:42px;height:4px;margin-top:18px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.25)}" +
    ".fs-home-transition-card i:after{content:'';display:block;width:45%;height:100%;border-radius:inherit;background:#fff;animation:fsHomeLoad .65s ease-in-out infinite alternate}" +
    "@keyframes fsHomeLoad{from{transform:translateX(0)}to{transform:translateX(122%)}}" +
    "@media(prefers-reduced-motion:reduce){#fsHomeTransition{transition:none}.fs-home-transition-card i:after{animation:none;width:100%}}";
  document.head.appendChild(style);
})();
