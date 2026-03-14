function applySavedCss() {
  const domain = window.location.hostname;

  chrome.storage.local.get([domain], (res) => {
    const css = res[domain];
    if (!css) return;

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