// Create the right-click menu item when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "export-highlights",
        title: "Copy all highlights to Clipboard",
        contexts: ["all"] // "all" means it shows up everywhere you right-click
    });
});

// Listen for when the user clicks our new menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "export-highlights") {
        // Send a message to content.js on the current tab
        chrome.tabs.sendMessage(tab.id, { action: "copyHighlights" });
    }
});