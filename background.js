// Создаем контекстное меню при установке расширения
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-selector",
    title: "Добавить селектор в редактор",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  });
  console.log("[Background] Context menu created");
});

// Обрабатываем клик на пункт контекстного меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-selector") {
    console.log("[Background] Menu item clicked on tab:", tab.id, "URL:", tab.url);
    // Отправляем сообщение в content script активной вкладки
    chrome.tabs.sendMessage(tab.id, {
      type: "getElementInfo"
    }).then(response => {
      console.log("[Background] Got response from content script:", response);
    }).catch(err => {
      console.error("[Background] Failed to send message to tab:", err.message);
      console.error("[Background] This usually means content script is not loaded on this page");
    });
  }
});

// Слушаем сообщения от content.js с информацией об элементе
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Background] Received message:", request.type, "from:", sender.tab?.url);
  if (request.type === 'elementSelected') {
    console.log("[Background] Forwarding element info to popup, data:", request.data);
    // Находим окно popup и отправляем сообщение
    chrome.runtime.sendMessage({
      type: 'elementSelected',
      data: request.data
    }).then(response => {
      console.log("[Background] Successfully sent to popup:", response);
    }).catch(err => {
      console.log("[Background] Popup not open, saving to storage. Error:", err.message);
      // Если popup закрыт, сохраняем в storage
      chrome.storage.session.set({ pendingElement: request.data });
    });
  }
  // Всегда возвращаем правду, чтобы сигнализировать что сообщение обработано
  sendResponse({ success: true });
});

