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
  // =========================
  // ИНИЦИАЛИЗАЦИЯ БЫСТРЫХ ПРЕСЕТОВ
  // =========================
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
  editor.replaceSelection(`button, input[type="button"], input[type="submit"] {
  font-size: 18px !important;
  padding: 12px 20px !important;
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
          editor.setValue(presets[name]);
          document.querySelector('[data-tab="editor"]').click();
        }
      });

      // Кнопка Применить
      item.querySelector(".preset-apply-btn").addEventListener("click", () => {
        editor.setValue(presets[name]);
        document.querySelector('[data-tab="editor"]').click();
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
    editor.setValue(themeGenerators[theme]());
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-editor').classList.add('active');
    document.querySelector('[data-tab="editor"]').classList.add('active');
  });
});