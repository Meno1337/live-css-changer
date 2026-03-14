// Логируем загрузку сразу
console.log("[Content Script] Loaded on:", window.location.href);

// Переменная для сохранения последнего кликнутого элемента при ПКМ
let lastContextMenuElement = null;

// Функция для получения селектора элемента
function getElementSelector(element) {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).join('.');
  
  if (classes) {
    return `${tagName}.${classes}`;
  }
  return tagName;
}

// Функция для получения уникального селектора элемента
function getUniqueSelector(element) {
  const parts = [];
  let current = element;
  
  while (current && current !== document.body && current !== document.documentElement) {
    const tagName = current.tagName.toLowerCase();
    let selector = tagName;
    
    if (current.id) {
      selector += '#' + current.id;
      parts.unshift(selector);
      break;
    }
    
    const classString = Array.from(current.classList).join('.');
    if (classString) {
      selector += '.' + classString;
    }
    
    const siblings = Array.from(current.parentElement.children).filter(el => el.tagName === current.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }
    
    parts.unshift(selector);
    current = current.parentElement;
  }
  
  return parts.join(' > ');
}

// Слушаем контекстное меню (ПКМ)
document.addEventListener('contextmenu', function(e) {
  lastContextMenuElement = e.target;
  console.log("[Content Script] Context menu on element:", e.target.tagName, e.target.className);
}, true);

console.log("[Content Script] Context menu listener attached");

// Обрабатываем сообщения от background.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("[Content Script] Received message:", request.type);
  
  if (request.type === 'getElementInfo') {
    if (lastContextMenuElement) {
      const selector = getElementSelector(lastContextMenuElement);
      const uniqueSelector = getUniqueSelector(lastContextMenuElement);
      
      const elementData = {
        selector: selector,
        uniqueSelector: uniqueSelector,
        tagName: lastContextMenuElement.tagName.toLowerCase()
      };
      
      console.log("[Content Script] Sending element data:", elementData);
      
      chrome.runtime.sendMessage({
        type: 'elementSelected',
        data: elementData
      });
      
      sendResponse({ success: true });
    } else {
      console.log("[Content Script] No element found in context menu");
      sendResponse({ success: false });
    }
  }
  
  return true;
});

console.log("[Content Script] Message listener attached");

// Применение сохраненного CSS
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
    console.log("[Content Script] Applied saved CSS");
  });
}

applySavedCss();


