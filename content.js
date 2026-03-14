function applySavedCss() {
  const domain = window.location.hostname;

  chrome.storage.local.get([domain], (res) => {
    const saved = res[domain];
    if (!saved) return;

    let css = "";
    if (typeof saved === "string") {
      css = saved;
    } else if (typeof saved === "object" && typeof saved.css === "string") {
      css = saved.css;
    } else {
      return;
    }

    if (!css.trim()) return;

    let style = document.getElementById("my-live-styles");

    if (!style) {
      style = document.createElement("style");
      style.id = "my-live-styles";
      document.documentElement.appendChild(style);
    }

    style.textContent = css;
  });
}

applySavedCss();

