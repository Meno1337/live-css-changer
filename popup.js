const editor = CodeMirror(document.getElementById('editor-container'), {
  mode: 'css',
  lineNumbers: true,
  theme: 'default',
  extraKeys: { "Ctrl-Space": "autocomplete" }
});

editor.on("inputRead", function(cm, change) {

  if (change.origin !== "+delete") {

    CodeMirror.showHint(cm, CodeMirror.hint.css, {
      completeSingle: false
    });

  }

});

// ---------------------
// загрузка текста редактора
// ---------------------

document.addEventListener("DOMContentLoaded", () => {

  chrome.storage.local.get(["editorText"], (res) => {
    if (res.editorText) {
      editor.setValue(res.editorText);
    }
  });

  loadCssForSite();
});


// ---------------------
// автосохранение текста
// ---------------------

editor.on("change", () => {

  const text = editor.getValue();

  chrome.storage.local.set({
    editorText: text
  });

});


// ---------------------
// получить домен сайта
// ---------------------

async function getCurrentDomain() {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab) return null;

  const url = new URL(tab.url);

  return url.hostname;
}


// ---------------------
// загрузка CSS сайта
// ---------------------

async function loadCssForSite() {

  const domain = await getCurrentDomain();

  if (!domain) return;

  chrome.storage.local.get([domain], (res) => {

    if (res[domain]) {
      applyCss(res[domain]);
    }

  });

}


// ---------------------
// применение CSS
// ---------------------

async function applyCss(cssCode) {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab) return;

  chrome.scripting.executeScript({

    target: { tabId: tab.id },

    func: (css) => {

      let style = document.getElementById("my-live-styles");

      if (!style) {

        style = document.createElement("style");

        style.id = "my-live-styles";

        document.documentElement.appendChild(style);

      }

      style.textContent = css;

    },

    args: [cssCode]

  });

}


// ---------------------
// кнопка ПРИМЕНИТЬ
// ---------------------

document.getElementById("apply-btn").addEventListener("click", async () => {

  const cssCode = editor.getValue();

  const domain = await getCurrentDomain();

  if (!domain) return;

  chrome.storage.local.set({
    [domain]: cssCode
  });

  applyCss(cssCode);

});


// ---------------------
// кнопка СБРОСИТЬ
// ---------------------

document.getElementById("reset-btn").addEventListener("click", async () => {

  const domain = await getCurrentDomain();

  if (domain) {
    chrome.storage.local.remove(domain);
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {

      const style = document.getElementById("my-live-styles");

      if (style) style.remove();

    }
  });

});


// ---------------------
// пресеты
// ---------------------

// ПРЕСЕТ: фон страницы
document.getElementById("preset-bg").onclick = () => {

editor.replaceSelection(`* {
  background-color: #ffffff !important;
}`);

};


// ПРЕСЕТ: размер шрифта
document.getElementById("preset-fontsize").onclick = () => {

editor.replaceSelection(`* {
  font-size: 18px !important;
}`);

};


// ПРЕСЕТ: шрифт
document.getElementById("preset-fontfamily").onclick = () => {

editor.replaceSelection(`* {
  font-family: Arial !important;
}`);

};