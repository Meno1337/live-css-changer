const editor = CodeMirror(document.getElementById("editor-container"), {
  mode: "css",
  lineNumbers: true,
  theme: "default",
  extraKeys: { "Ctrl-Space": "autocomplete" }
});

editor.on("inputRead", (cm, change) => {
  if (change.origin !== "+delete") {
    CodeMirror.showHint(cm, CodeMirror.hint.css, { completeSingle: false });
  }
});

const USER_PRESETS_KEY = "userPresets";

let themeToggle;

function applyTheme(isLight) {
  if (!themeToggle) return;
  if (isLight) {
    document.body.classList.add('light-theme');
    themeToggle.textContent = '🌙';
    themeToggle.title = 'Включить тёмную тему';
  } else {
    document.body.classList.remove('light-theme');
    themeToggle.textContent = '☀️';
    themeToggle.title = 'Включить светлую тему';
  }
}

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'elementSelected') {
    showElementSelectionDialog(request.data);
  }
  sendResponse({ received: true });
  return true;
});

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["editorText"], (res) => {
    if (res.editorText) editor.setValue(res.editorText);
  });

  updateSiteLabel();
  loadCssForSite();
  initUserPresets();
  initTabs();

  chrome.storage.session.get(['pendingElement'], (res) => {
    if (res.pendingElement) {
      showElementSelectionDialog(res.pendingElement);
      chrome.storage.session.remove('pendingElement');
    }
  });

  // Инициализация кнопки смены темы
  themeToggle = document.getElementById('theme-toggle');
  
  if (themeToggle) {
    chrome.storage.local.get(['popupTheme'], (res) => {
      const savedTheme = res.popupTheme || 'dark'; // ← по умолчанию тёмная
      applyTheme(savedTheme === 'light');
    });

    themeToggle.addEventListener('click', () => {
      const isLight = document.body.classList.contains('light-theme');
      const newTheme = isLight ? 'dark' : 'light';
      chrome.storage.local.set({ popupTheme: newTheme });
      applyTheme(!isLight);
    });
  }
}); // ← ПРАВИЛЬНОЕ ЗАКРЫТИЕ DOMContentLoaded

editor.on("change", () => {
  chrome.storage.local.set({ editorText: editor.getValue() });
});

// === Управление вкладками ===
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

async function getCurrentTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  try {
    const url = new URL(tab.url);
    return { hostname: url.hostname, tabId: tab.id };
  } catch { return null; }
}

async function updateSiteLabel() {
  const label = document.getElementById("site-label");
  if (!label) return;
  const info = await getCurrentTabInfo();
  label.textContent = info ? info.hostname : "Нет активной вкладки";
}

async function loadCssForSite() {
  const info = await getCurrentTabInfo();
  if (!info) return;
  const domain = info.hostname;
  chrome.storage.local.get([domain], (res) => {
    const saved = res[domain];
    if (!saved) return;
    const css = typeof saved === "string" ? saved : saved.css || "";
    if (css) applyCss(css);
  });
}

async function applyCss(cssCode) {
  const info = await getCurrentTabInfo();
  if (!info) return;
  chrome.scripting.executeScript({
    target: { tabId: info.tabId },
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

document.getElementById("apply-btn").addEventListener("click", async () => {
  const cssCode = editor.getValue();
  const info = await getCurrentTabInfo();
  if (!info) return;
  const domain = info.hostname;
  chrome.storage.local.set({ [domain]: { css: cssCode } });
  applyCss(cssCode);
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  const info = await getCurrentTabInfo();
  if (!info) return;
  const domain = info.hostname;
  chrome.storage.local.remove(domain);
  chrome.scripting.executeScript({
    target: { tabId: info.tabId },
    func: () => {
      const style = document.getElementById("my-live-styles");
      if (style) style.remove();
    }
  });
});

document.getElementById("clear-editor-btn")?.addEventListener("click", () => {
  if (!editor.getValue().trim()) return;

  const confirmClear = confirm("Вы уверены, что хотите полностью очистить код?");
  if (!confirmClear) return;

  editor.setValue("");
  chrome.storage.local.remove("editorText");
});

const bgColorInput = document.getElementById("bg-color-input");
const fontSizeInput = document.getElementById("font-size-input");
const fontFamilySelect = document.getElementById("font-family-select");

document.getElementById("preset-bg-btn").addEventListener("click", () => {
  const color = bgColorInput?.value || "#ffffff";
  editor.setValue(`* {
  background-color: ${color} !important;
}`);
});

function registerPreset(id, css) {
  document.getElementById(id)?.addEventListener("click", () => {
    applyPreset(css);
  });
}

registerPreset("preset-bigcursor-btn", `* {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="black"/><circle cx="16" cy="16" r="8" fill="white"/></svg>') 16 16, auto !important;
}`);

registerPreset("preset-noanimation-btn", `*, *::before, *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}`);

registerPreset("preset-underlinelinks-btn", `a {
  text-decoration: underline !important;
  text-decoration-thickness: 2px !important;
}`);

registerPreset("preset-invert-btn", `html {
  filter: invert(100%) hue-rotate(180deg) !important;
}

img,
video,
picture,
canvas {
  filter: invert(100%) hue-rotate(180deg) !important;
}`);

registerPreset("preset-yellowblack-btn", `* {
  background-color: #000 !important;
  color: #ffff00 !important;
}

a {
  color: #00ff00 !important;
}`);

registerPreset("preset-nobg-btn", `* {
  background-image: none !important;
}`);

registerPreset("preset-contrast-btn", `html {
  filter: contrast(150%) !important;
}`);

registerPreset("preset-focus-btn", `*:focus {
  outline: 3px solid #ff0 !important;
  outline-offset: 2px !important;
}

a:focus,
button:focus,
input:focus,
select:focus,
textarea:focus {
  box-shadow: 0 0 0 4px rgba(255,255,0,.5) !important;
}`);

registerPreset("preset-clickarea-btn", `a,
button,
input,
select,
textarea {
  min-height: 44px !important;
  min-width: 44px !important;
}`);

registerPreset("preset-protanopia-btn", `html {
  filter:
    contrast(1.2)
    saturate(0.8)
    hue-rotate(20deg) !important;
}`);

registerPreset("preset-deuteranopia-btn", `html {
  filter:
    contrast(1.1)
    saturate(0.9)
    hue-rotate(-10deg) !important;
}`);

registerPreset("preset-tritanopia-btn", `html {
  filter:
    contrast(1.15)
    saturate(0.85)
    hue-rotate(90deg) !important;
}`);

registerPreset("preset-reader-btn", `body * {
  max-width: 800px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

* {
  font-family: Georgia, "Times New Roman", serif !important;
  line-height: 1.8 !important;
  font-size: 18px !important;
}`);

registerPreset("preset-dyslexia-btn", `* {
  font-family: "OpenDyslexic","Comic Sans MS",Arial !important;
  letter-spacing: .05em !important;
  word-spacing: .1em !important;
  line-height: 1.8 !important;
}`);

registerPreset("preset-sepia-btn", `html {
  filter: sepia(80%) !important;
}`);

registerPreset("preset-nightmode-btn", `html {
  filter: brightness(.9) contrast(1.1) sepia(20%) !important;
}

* {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`);

registerPreset("preset-headers-btn", `h1,
h2,
h3,
h4,
h5,
h6 {
  background-color: #ffeb3b !important;
  color: #000 !important;
  padding: 8px !important;
  border-left: 5px solid #f44336 !important;
  font-weight: bold !important;
}`);

registerPreset("preset-bigbuttons-btn", `button,
[role="button"],
.btn,
a.button,
input[type="button"],
input[type="submit"] {
  font-size: 22px !important;
  padding: 16px 28px !important;
  min-width: 56px !important;
  min-height: 56px !important;
}`);

registerPreset("preset-hideimg-btn", `img,
picture,
video {
  display: none !important;
}`);

registerPreset("preset-grayscale-btn", `html {
  filter: grayscale(100%) !important;
}`);

function upsertGlobalStyle(property, value) {
  let css = editor.getValue();
  const ruleRegex = /\*\s*\{([\s\S]*?)\}/m;

  if (ruleRegex.test(css)) {
    css = css.replace(ruleRegex, (match, content) => {
      const propRegex = new RegExp(`${property}\\s*:[^;]+;?`, "m");

      if (propRegex.test(content)) {
        content = content.replace(propRegex, `${property}: ${value} !important;`);
      } else {
        content += `\n  ${property}: ${value} !important;`;
      }

      return `* {\n${content.trim()}\n}`;
    });
  } else {
    css += `\n* {\n  ${property}: ${value} !important;\n}\n`;
  }

  editor.setValue(css);
}

document.getElementById("preset-fontsize-btn").addEventListener("click", () => {
  const raw = fontSizeInput?.value ? parseInt(fontSizeInput.value, 10) : 18;
  const size = Number.isNaN(raw) ? 18 : Math.min(72, Math.max(8, raw));
  upsertGlobalStyle("font-size", `${size}px`);
});

document.getElementById("preset-fontfamily-btn").addEventListener("click", () => {
  const family = fontFamilySelect?.value || 
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  upsertGlobalStyle("font-family", family);
});

// ===============================
// ДОБАВЛЕННЫЕ БЫСТРЫЕ ПРЕСЕТЫ
// ===============================

// Цвет текста
document.getElementById("preset-textcolor-btn")?.addEventListener("click", () => {
  const color = document.getElementById("text-color-input")?.value || "#000000";
  editor.setValue(`* {\n  color: ${color} !important;\n}`);
});

// Межстрочный интервал
document.getElementById("preset-lineheight-btn")?.addEventListener("click", () => {
  const raw = parseFloat(document.getElementById("line-height-input")?.value);
  const value = isNaN(raw) ? 1.5 : Math.min(3, Math.max(1, raw));
  editor.replaceSelection(`* {\n  line-height: ${value} !important;\n}`);
});

// Скругление углов
document.getElementById("preset-radius-btn")?.addEventListener("click", () => {
  const raw = parseInt(document.getElementById("radius-input")?.value, 10);
  const value = isNaN(raw) ? 8 : Math.min(50, Math.max(0, raw));
  editor.replaceSelection(`* {\n  border-radius: ${value}px !important;\n}`);
});

// Крупные кнопки
document.getElementById("preset-bigbuttons-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`button,[role="button"],a.button,.btn,input[type="button"],input[type="submit"] {
  font-size: 18px !important;
  padding: 12px 20px !important;
  min-height: 44px !important;
  min-width: 44px !important;
}`);
});

// Скрыть изображения
document.getElementById("preset-hideimg-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`img, picture, video {
  display: none !important;
}`);
});

// Ч/Б режим
document.getElementById("preset-grayscale-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter: grayscale(100%) !important;
}`);
});

// Большой курсор
document.getElementById("preset-bigcursor-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`* {
  cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="black"/><circle cx="16" cy="16" r="8" fill="white"/></svg>') 16 16, auto !important;
}`);
});

// Без анимаций
document.getElementById("preset-noanimation-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`*, *::before, *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}`);
});

// Подчеркнуть ссылки
document.getElementById("preset-underlinelinks-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`a {
  text-decoration: underline !important;
  text-decoration-thickness: 2px !important;
}`);
});

// Межбуквенный интервал
document.getElementById("preset-letterspacing-btn")?.addEventListener("click", () => {
  const raw = parseFloat(document.getElementById("letter-spacing-input")?.value);
  const value = isNaN(raw) ? 0.05 : Math.min(0.3, Math.max(0, raw));

  editor.replaceSelection(`* {
  letter-spacing: ${value}em !important;
}`);
});

// Инверсия цветов
document.getElementById("preset-invert-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter: invert(100%) hue-rotate(180deg) !important;
}

img,
video,
picture,
canvas {
  filter: invert(100%) hue-rotate(180deg) !important;
}`);
});

// Желтый на черном
document.getElementById("preset-yellowblack-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`* {
  background-color: #000 !important;
  color: #ffff00 !important;
}

a {
  color: #00ff00 !important;
}`);
});

// Удалить фоновые изображения
document.getElementById("preset-nobg-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`* {
  background-image: none !important;
}`);
});

// Повышенный контраст
document.getElementById("preset-contrast-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter: contrast(150%) !important;
}`);
});

// Видимый фокус
document.getElementById("preset-focus-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`*:focus {
  outline: 3px solid #ff0 !important;
  outline-offset: 2px !important;
}

a:focus,
button:focus,
input:focus,
select:focus,
textarea:focus {
  box-shadow: 0 0 0 4px rgba(255,255,0,.5) !important;
}`);
});

// Увеличить интерактивные элементы
document.getElementById("preset-clickarea-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`a,
button,
input,
select,
textarea {
  min-height: 44px !important;
  min-width: 44px !important;
}`);
});

// Protanopia
document.getElementById("preset-protanopia-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter:
    contrast(1.2)
    saturate(0.8)
    hue-rotate(20deg) !important;
}`);
});

// Магнитный курсор
document.getElementById("preset-magneticcursor-btn")
?.addEventListener("click", () => {
  applyPreset(`a,
button,
[role="button"],
.btn,
input[type="button"],
input[type="submit"] {
  transition: transform .15s ease !important;
}

a:hover,
button:hover,
[role="button"]:hover,
.btn:hover,
input[type="button"]:hover,
input[type="submit"]:hover {
  transform: scale(1.15) !important;
  position: relative !important;
  z-index: 9999 !important;
}`);
});

// Deuteranopia
document.getElementById("preset-deuteranopia-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter:
    contrast(1.1)
    saturate(0.9)
    hue-rotate(-10deg) !important;
}`);
});

// Tritanopia
document.getElementById("preset-tritanopia-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter:
    contrast(1.15)
    saturate(0.85)
    hue-rotate(90deg) !important;
}`);
});

// Режим чтения
document.getElementById("preset-reader-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`body * {
  max-width: 800px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

* {
  font-family: Georgia, "Times New Roman", serif !important;
  line-height: 1.8 !important;
  font-size: 18px !important;
}

img,
video {
  max-width: 100% !important;
  height: auto !important;
}`);
});

// Для дислексии
document.getElementById("preset-dyslexia-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`* {
  font-family: "OpenDyslexic","Comic Sans MS",Arial !important;
  letter-spacing: 0.05em !important;
  word-spacing: 0.1em !important;
  line-height: 1.8 !important;
}`);
});

// Сепия
document.getElementById("preset-sepia-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter: sepia(80%) !important;
}`);
});

// Ночной режим
document.getElementById("preset-nightmode-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`html {
  filter: brightness(0.9) contrast(1.1) sepia(20%) !important;
}

* {
  background-color: #1a1a1a !important;
  color: #e0e0e0 !important;
}`);
});

// Выделение заголовков
document.getElementById("preset-headers-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`h1,
h2,
h3,
h4,
h5,
h6 {
  background-color: #ffeb3b !important;
  color: #000 !important;
  padding: 8px !important;
  border-left: 5px solid #f44336 !important;
  font-weight: bold !important;
}`);
});

// Дополнительный межстрочный интервал
document.getElementById("preset-extra-lineheight-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`* {
  line-height: 2 !important;
}`);
});

// Ограничение длины строки
document.getElementById("preset-readablewidth-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`body {
  max-width: 70ch !important;
  margin: auto !important;
}`);
});

// Подсветка интерактивных элементов
document.getElementById("preset-highlightinteractive-btn")?.addEventListener("click", () => {
  editor.replaceSelection(`a,
button,
input,
select,
textarea {
  border: 2px solid currentColor !important;
}`);
});

async function applyPreset(css) {
  editor.setValue(css);

  setTimeout(() => {
    editor.refresh();
    editor.focus();
  }, 0);

  document.querySelector('[data-tab="editor"]')?.classList.add("active");
  document.getElementById("tab-editor")?.classList.add("active");

  chrome.storage.local.set({ editorText: css });

  const info = await getCurrentTabInfo();

  if (info) {
    chrome.storage.local.set({
      [info.hostname]: { css }
    });
  }

  await applyCss(css);

  const editorContainer =
    document.getElementById("editor-container");

  editorContainer?.animate(
    [
      {
        boxShadow: "0 0 0 rgba(59,130,246,0)"
      },
      {
        boxShadow: "0 0 18px rgba(59,130,246,.9)"
      },
      {
        boxShadow: "0 0 0 rgba(59,130,246,0)"
      }
    ],
    {
      duration: 500
    }
  );
}

function initUserPresets() {
  const saveBtn = document.getElementById("save-preset-btn");
  const nameInput = document.getElementById("preset-name");
  const listContainer = document.getElementById("presets-list");

  if (!saveBtn || !nameInput || !listContainer) return;

  function renderPresets(presets) {
    listContainer.innerHTML = "";

    if (Object.keys(presets).length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "20px";
      empty.style.textAlign = "center";
      empty.style.color = "#9ca3af";
      empty.style.fontSize = "13px";
      empty.textContent = "Пока нет сохранённых пресетов";
      listContainer.appendChild(empty);
      return;
    }

    Object.keys(presets).forEach(name => {
      const item = document.createElement("div");
      item.className = "preset-item";

      item.innerHTML = `
        <span class="preset-name" title="${name}">${name}</span>
        <div class="preset-actions">
          <button class="preset-apply-btn">Применить</button>
          <button class="preset-delete-btn">🗑</button>
        </div>
      `;

      // Клик по всей строке (кроме кнопок) — применить
      item.addEventListener("click", (e) => {
        if (!e.target.closest("button")) {
          applyPreset(presets[name]);
        }
      });

      // Кнопка Применить
      item.querySelector(".preset-apply-btn")
      .addEventListener("click", () => {
      applyPreset(presets[name]);
      });

      // Кнопка Удалить
      item.querySelector(".preset-delete-btn").addEventListener("click", (e) => {
        e.stopImmediatePropagation();
        if (confirm(`Удалить пресет "${name}"?`)) {
          delete presets[name];
          chrome.storage.local.set({ [USER_PRESETS_KEY]: presets }, () => {
            renderPresets(presets);
          });
        }
      setTimeout(() => {
        editor.refresh();
        editor.focus();
      }, 0);
      });

      listContainer.appendChild(item);
    });
  }

  // Загрузка пресетов при открытии
  chrome.storage.local.get([USER_PRESETS_KEY], (res) => {
    const presets = res[USER_PRESETS_KEY] || {};
    renderPresets(presets);
  });

  // Сохранение нового пресета
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) {
      alert("Введите название пресета");
      return;
    }

    const css = editor.getValue().trim();
    if (!css) {
      alert("Редактор пустой");
      return;
    }

    chrome.storage.local.get([USER_PRESETS_KEY], (res) => {
      const presets = res[USER_PRESETS_KEY] || {};
      presets[name] = css;

      chrome.storage.local.set({ [USER_PRESETS_KEY]: presets }, () => {
        renderPresets(presets);
        nameInput.value = "";
      });
    });
  });
}

// Генератор тем
const themeGenerators = {
  dark: () => `* {
  background-color: #0f172a !important;
  color: #e2e8f0 !important;
  border-color: #334155 !important;
}
a { color: #60a5fa !important; }
img, video, picture { filter: brightness(0.9) contrast(1.05) !important; }`,

  light: () => `* {
  background-color: #f8fafc !important;
  color: #0f172a !important;
  border-color: #cbd5e1 !important;
}
a { color: #2563eb !important; }`,

  highcontrast: () => `* {
  background-color: #000000 !important;
  color: #ffffff !important;
  border-color: #ffd700 !important;
  font-size: 17px !important;
  line-height: 1.5 !important;
}
a { color: #00ff00 !important; text-decoration: underline !important; }
button, input, select, textarea {
  border: 3px solid #ffff00 !important;
  background: #000 !important;
  color: #fff !important;
}`
};

['dark','light','highcontrast'].forEach(theme => {
  const btn = document.getElementById(`theme-${theme}`);
  if (btn) btn.addEventListener('click', () => {
    applyPreset(themeGenerators[theme]());
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-editor').classList.add('active');
    document.querySelector('[data-tab="editor"]').classList.add('active');
  });
});