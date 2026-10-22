/* dsh-model-price landing page — progressive enhancement only.
   No modules, no dependencies, no network requests. */
(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("nav-ready");

  /* ---------- Mobile navigation ---------- */

  var toggle = document.querySelector(".nav-toggle");
  var panel = document.getElementById("site-nav");

  function setNav(open) {
    doc.classList.toggle("nav-open", open);
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    var label = open ? toggle.getAttribute("data-close-label") : toggle.getAttribute("data-open-label");
    if (label) toggle.setAttribute("aria-label", label);
  }

  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      setNav(!doc.classList.contains("nav-open"));
    });

    panel.addEventListener("click", function (event) {
      var link = event.target.closest ? event.target.closest("a") : null;
      if (link) setNav(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && doc.classList.contains("nav-open")) {
        setNav(false);
        toggle.focus();
      }
    });

    var desktop = window.matchMedia("(min-width: 1001px)");
    var onBreakpoint = function (event) {
      if (event.matches) setNav(false);
    };
    if (desktop.addEventListener) desktop.addEventListener("change", onBreakpoint);
    else if (desktop.addListener) desktop.addListener(onBreakpoint);
  }

  /* ---------- Copy the install command ---------- */

  var copyBtn = document.querySelector("[data-copy]");
  var copyTarget = copyBtn ? document.getElementById(copyBtn.getAttribute("data-copy")) : null;
  var copyStatus = document.querySelector(".copy-status");
  var copyText = copyBtn ? copyBtn.querySelector(".copy-text") : null;
  var copyTimer = 0;

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function selectCommand() {
    if (!copyTarget || !window.getSelection) return;
    var range = document.createRange();
    range.selectNodeContents(copyTarget);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function setCopyText(text) {
    if (copyText) copyText.textContent = text;
  }

  function finishCopy(ok) {
    if (!copyBtn) return;
    window.clearTimeout(copyTimer);
    if (ok) {
      copyBtn.classList.add("is-copied");
      setCopyText(copyBtn.getAttribute("data-copied-label") || "Copied");
      if (copyStatus) copyStatus.textContent = copyBtn.getAttribute("data-copied-label") || "Copied";
      copyTimer = window.setTimeout(function () {
        copyBtn.classList.remove("is-copied");
        setCopyText(copyBtn.getAttribute("data-copy-label") || "Copy");
        if (copyStatus) copyStatus.textContent = "";
      }, 2000);
    } else {
      selectCommand();
      if (copyStatus) {
        copyStatus.textContent = copyBtn.getAttribute("data-copy-failed-label") || "Select the command and copy it manually.";
      }
    }
  }

  if (copyBtn && copyTarget) {
    copyBtn.addEventListener("click", function () {
      var text = (copyTarget.textContent || "").trim();
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            finishCopy(true);
          },
          function () {
            finishCopy(legacyCopy(text));
          }
        );
      } else {
        finishCopy(legacyCopy(text));
      }
    });
  }

  /* ---------- Reveal on scroll (motion allowed only) ---------- */

  var reveals = document.querySelectorAll(".reveal");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (reveals.length && !reducedMotion.matches && "IntersectionObserver" in window) {
    doc.classList.add("reveal-ready");

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );

    Array.prototype.forEach.call(reveals, function (element) {
      observer.observe(element);
    });
  }
})();
