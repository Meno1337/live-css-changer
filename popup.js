const editor = CodeMirror(document.getElementById("editor-container"), {
  mode: "css",
  lineNumbers: true,
  theme: "default",
  extraKeys: { "Ctrl-Space": "autocomplete" }
});

editor.on("inputRead", (cm, change) => {
  if (change.origin !== "+delete") {
    CodeMirror.showHint(cm, CodeMirror.hint.css, {
      completeSingle: false
    });
  }
});

const USER_PRESETS_KEY = "userPresets";

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Popup received message:", request.type);
  if (request.type === 'elementSelected') {
    console.log("Showing dialog for element:", request.data);
    showElementSelectionDialog(request.data);
  }
  sendResponse({ received: true });
  return true; // Необходимо для асинхронных sendResponse
});

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["editorText"], (res) => {
    if (res.editorText) {
      editor.setValue(res.editorText);
    }
  });

  updateSiteLabel();
  loadCssForSite();
  initUserPresets();
  
  // Проверяем, есть ли сохраненная информация об элементе (если popup был закрыт при клике на меню)
  chrome.storage.session.get(['pendingElement'], (res) => {
    if (res.pendingElement) {
      console.log("Found pending element in storage:", res.pendingElement);
      showElementSelectionDialog(res.pendingElement);
      chrome.storage.session.remove('pendingElement');
    }
  });
});

editor.on("change", () => {
  const text = editor.getValue();
  chrome.storage.local.set({ editorText: text });
});

async function getCurrentTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;

  try {
    const url = new URL(tab.url);
    return { hostname: url.hostname, tabId: tab.id };
  } catch {
    return null;
  }
}

async function updateSiteLabel() {
  const label = document.getElementById("site-label");
  if (!label) return;

  const info = await getCurrentTabInfo();
  if (!info) {
    label.textContent = "Нет активной вкладки";
    return;
  }

  label.textContent = info.hostname;
}

async function loadCssForSite() {
  const info = await getCurrentTabInfo();
  if (!info) return;

  const domain = info.hostname;

  chrome.storage.local.get([domain], (res) => {
    const saved = res[domain];
    if (!saved) return;

    let css = "";
    if (typeof saved === "string") {
      css = saved;
    } else if (typeof saved === "object" && typeof saved.css === "string") {
      css = saved.css;
    }

    if (!css) return;
    applyCss(css);
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

  chrome.storage.local.set({
    [domain]: { css: cssCode }
  });

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

// быстрые пресеты
const bgColorInput = document.getElementById("bg-color-input");
const fontSizeInput = document.getElementById("font-size-input");
const fontFamilySelect = document.getElementById("font-family-select");

document.getElementById("preset-bg-btn").addEventListener("click", () => {
  const color = bgColorInput && bgColorInput.value ? bgColorInput.value : "#ffffff";

  editor.replaceSelection(`* {
  background-color: ${color} !important;
}`);
});

document.getElementById("preset-fontsize-btn").addEventListener("click", () => {
  const raw = fontSizeInput && fontSizeInput.value ? parseInt(fontSizeInput.value, 10) : 18;
  const size = Number.isNaN(raw) ? 18 : Math.min(72, Math.max(8, raw));

  editor.replaceSelection(`* {
  font-size: ${size}px !important;
}`);
});

document.getElementById("preset-fontfamily-btn").addEventListener("click", () => {
  const family =
    (fontFamilySelect && fontFamilySelect.value) ||
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  editor.replaceSelection(`* {
  font-family: ${family} !important;
}`);
});

// пользовательские пресеты
function initUserPresets() {
  const saveBtn = document.getElementById("save-preset-btn");
  const applyBtn = document.getElementById("apply-user-preset-btn");
  const deleteBtn = document.getElementById("delete-user-preset-btn");

  if (!saveBtn || !applyBtn || !deleteBtn) return;

  renderUserPresets();

  saveBtn.addEventListener("click", saveCurrentAsPreset);
  applyBtn.addEventListener("click", applySelectedPreset);
  deleteBtn.addEventListener("click", deleteSelectedPreset);
}

function getPresetsFromStorage(callback) {
  chrome.storage.local.get([USER_PRESETS_KEY], (res) => {
    const presets = Array.isArray(res[USER_PRESETS_KEY]) ? res[USER_PRESETS_KEY] : [];
    callback(presets);
  });
}

function setPresetsToStorage(presets, callback) {
  chrome.storage.local.set({ [USER_PRESETS_KEY]: presets }, callback);
}

function renderUserPresets() {
  const select = document.getElementById("user-presets-select");
  if (!select) return;

  getPresetsFromStorage((presets) => {
    select.innerHTML = "";

    if (!presets.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Нет сохранённых пресетов";
      select.appendChild(opt);
      return;
    }

    presets.forEach((preset, index) => {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = preset.name || `Пресет ${index + 1}`;
      select.appendChild(opt);
    });
  });
}

function saveCurrentAsPreset() {
  const nameInput = document.getElementById("preset-name");
  if (!nameInput) return;

  const name = nameInput.value.trim() || "Без названия";
  const css = editor.getValue();

  if (!css.trim()) return;

  getPresetsFromStorage((presets) => {
    const newPreset = {
      id: Date.now(),
      name,
      css
    };

    setPresetsToStorage([...presets, newPreset], () => {
      nameInput.value = "";
      renderUserPresets();
    });
  });
}

function getSelectedPresetIndex() {
  const select = document.getElementById("user-presets-select");
  if (!select) return -1;

  const value = select.value;
  if (value === "") return -1;

  return parseInt(value, 10);
}

function applySelectedPreset() {
  const index = getSelectedPresetIndex();
  if (index < 0) return;

  getPresetsFromStorage((presets) => {
    const preset = presets[index];
    if (!preset) return;

    editor.setValue(preset.css || "");
  });
}

function deleteSelectedPreset() {
  const index = getSelectedPresetIndex();
  if (index < 0) return;

  getPresetsFromStorage((presets) => {
    if (!presets[index]) return;

    presets.splice(index, 1);
    setPresetsToStorage(presets, () => {
      renderUserPresets();
    });
  });
}

// Функция для показа диалога выбора селектора
function showElementSelectionDialog(elementData) {
  // Создаём модальное окно
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #111827;
    border-radius: 8px;
    padding: 16px;
    border: 1px solid #1f2937;
    min-width: 300px;
    color: #e5e7eb;
  `;
  
  const title = document.createElement('h3');
  title.textContent = 'Выбор селектора';
  title.style.cssText = 'margin: 0 0 12px; font-size: 16px;';
  
  const content = document.createElement('div');
  content.style.cssText = 'margin-bottom: 12px; font-size: 12px;';
  content.innerHTML = `
    <p style="margin: 0 0 8px; color: #9ca3af;">
      Выбранный элемент: <strong>${elementData.tagName}</strong>
    </p>
    <p style="margin: 0 0 8px; color: #9ca3af;">
      Выберите что добавить:
    </p>
  `;
  
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 8px;';
  
  // Кнопка для добавления селектора по типу элемента
  const btnType = document.createElement('button');
  btnType.textContent = `Тип (${elementData.selector})`;
  btnType.style.cssText = `
    flex: 1;
    padding: 8px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  `;
  btnType.onclick = () => {
    insertSelector(elementData.selector);
    removeModal();
  };
  
  // Кнопка для добавления уникального селектора
  const btnUnique = document.createElement('button');
  btnUnique.textContent = 'Уникальный';
  btnUnique.style.cssText = `
    flex: 1;
    padding: 8px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  `;
  btnUnique.onclick = () => {
    insertSelector(elementData.uniqueSelector);
    removeModal();
  };
  
  // Кнопка отмены
  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Отмена';
  btnCancel.style.cssText = `
    flex: 1;
    padding: 8px;
    background: #374151;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  btnCancel.onclick = removeModal;
  
  buttonContainer.appendChild(btnType);
  buttonContainer.appendChild(btnUnique);
  buttonContainer.appendChild(btnCancel);
  
  dialog.appendChild(title);
  dialog.appendChild(content);
  dialog.appendChild(buttonContainer);
  
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  
  function removeModal() {
    modal.remove();
  }
  
  // Закрытие по клику на фон
  modal.onclick = (e) => {
    if (e.target === modal) {
      removeModal();
    }
  };
}

// Функция для вставки селектора в редактор
function insertSelector(selector) {
  const selectedText = editor.getSelection();
  
  // Если есть выделённый текст, используем его как CSS код
  if (selectedText) {
    editor.replaceSelection(`${selector} {
  ${selectedText}
}`);
  } else {
    // Иначе добавляем селектор с заготовкой
    editor.replaceSelection(`${selector} {
  
}`);
    // Позиционируем курсор внутри блока
    const lastLine = editor.lastLine();
    editor.setCursor(lastLine, 2);
  }
}

