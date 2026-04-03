let currentRange = null;

// 1. Initialize Extension on Load
window.addEventListener('load', () => {
    injectMenuUI();
    restoreHighlights();
});

// --- UI LOGIC (THE RAINBOW MENU) ---

function injectMenuUI() {
    const menu = document.createElement('div');
    menu.id = 'mvp-highlighter-menu';
    
    // Create the four color buttons
    const colors = [
        { name: 'yellow', hex: '#ffd54f' },
        { name: 'green', hex: '#81c784' },
        { name: 'pink', hex: '#f48fb1' },
        { name: 'blue', hex: '#64b5f6' }
    ];

    colors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'color-btn';
        btn.style.backgroundColor = color.hex;
        
        // When a color is clicked:
        btn.addEventListener('click', () => {
            const uniqueId = Date.now().toString(); // Create unique ID based on exact time
            const colorClass = `highlight-${color.name}`;
            
            highlightRange(currentRange, uniqueId, colorClass);
            saveHighlight(currentRange, uniqueId, colorClass);
            
            window.getSelection().removeAllRanges();
            menu.style.display = 'none'; // Hide menu
        });
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
}

// 2. Listen for users selecting text (Shows the menu)
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const menu = document.getElementById('mvp-highlighter-menu');

    // If clicking inside the menu, do nothing
    if (menu.contains(e.target)) return;

    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        currentRange = selection.getRangeAt(0);
        
        // Find exactly where on the screen the text is selected
        const rect = currentRange.getBoundingClientRect();
        
        // Position the menu slightly above the selected text
        menu.style.left = `${rect.left + window.scrollX}px`;
        menu.style.top = `${rect.top + window.scrollY - 40}px`; 
        menu.style.display = 'flex'; // Show menu
    } else {
        menu.style.display = 'none'; // Hide menu if clicking elsewhere
    }
});

// --- ERASER LOGIC ---

// Listen for clicks on existing highlights
document.addEventListener('click', (e) => {
    // Check if the user clicked on a <mark> tag
    if (e.target.tagName.toLowerCase() === 'mark' && e.target.className.includes('highlight-')) {
        const highlightId = e.target.dataset.id;
        
        // 1. Remove from Database
        chrome.storage.local.get({ highlights: [] }, (data) => {
            const updated = data.highlights.filter(h => h.id !== highlightId);
            chrome.storage.local.set({ highlights: updated });
        });

        // 2. Remove visually from the page (Unwrap all text nodes sharing this ID)
        const allMarks = document.querySelectorAll(`mark[data-id="${highlightId}"]`);
        allMarks.forEach(mark => {
            // Replace the <mark> element with just its text contents
            mark.replaceWith(...mark.childNodes); 
        });
    }
});

// --- HIGHLIGHTING LOGIC ---

function highlightRange(range, id, colorClass) {
    const textNodes = [];
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.trim() !== '') {
            textNodes.push(node);
        }
    }

    if (range.startContainer.nodeType === Node.TEXT_NODE && !textNodes.includes(range.startContainer)) {
        textNodes.unshift(range.startContainer);
    }
    if (range.endContainer.nodeType === Node.TEXT_NODE && !textNodes.includes(range.endContainer)) {
        textNodes.push(range.endContainer);
    }

    for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];
        if (textNode.parentElement.tagName.toLowerCase() === 'mark') {
            continue;
        }
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(textNode);
        
        if (i === 0 && textNode === range.startContainer) {
            nodeRange.setStart(textNode, range.startOffset);
        }
        if (i === textNodes.length - 1 && textNode === range.endContainer) {
            nodeRange.setEnd(textNode, range.endOffset);
        }
        
        const mark = document.createElement('mark');
        mark.className = colorClass;
        mark.dataset.id = id; // Attach the Unique ID to the HTML element
        nodeRange.surroundContents(mark);
    }
}

// --- DATABASE LOGIC ---

function saveHighlight(range, id, colorClass) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    const highlightData = {
        id: id,
        colorClass: colorClass,
        url: window.location.href.split('#')[0].split('?')[0],
        startPath: getXPath(startNode.parentElement),
        startTextIndex: getTextNodeIndex(startNode.parentElement, startNode),
        startOffset: range.startOffset,
        endPath: getXPath(endNode.parentElement),
        endTextIndex: getTextNodeIndex(endNode.parentElement, endNode),
        endOffset: range.endOffset,
        text: range.toString()
    };

    chrome.storage.local.get({ highlights: [] }, (data) => {
        const updated = [...data.highlights, highlightData];
        chrome.storage.local.set({ highlights: updated });
    });
}

function restoreHighlights() {
    const currentUrl = window.location.href.split('#')[0].split('?')[0];
    
    chrome.storage.local.get({ highlights: [] }, (data) => {
        const pageHighlights = data.highlights.filter(h => h.url === currentUrl);
        
        pageHighlights.forEach(h => {
            try {
                const startElement = getElementByXPath(h.startPath);
                const endElement = getElementByXPath(h.endPath);
                
                if (startElement && endElement) {
                    const startNode = startElement.childNodes[h.startTextIndex];
                    const endNode = endElement.childNodes[h.endTextIndex];
                    
                    if (startNode && endNode) {
                        const range = document.createRange();
                        range.setStart(startNode, h.startOffset);
                        range.setEnd(endNode, h.endOffset);
                        
                        // Pass the saved ID and Color back into the highlighter
                        highlightRange(range, h.id, h.colorClass);
                    }
                }
            } catch(e) {
                console.error("Failed to restore a highlight", e);
            }
        });
    });
}

// --- HELPER FUNCTIONS ---

function getTextNodeIndex(parentElement, textNode) {
    for (let i = 0; i < parentElement.childNodes.length; i++) {
        if (parentElement.childNodes[i] === textNode) return i;
    }
    return 0;
}

function getXPath(element) {
    if (!element) return null;
    if (element === document.body) return element.tagName;

    // We DELETED the line that looks for element.id
    // This forces the script to map the actual skeleton of the website

    let ix = 0;
    let siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
        let sibling = siblings[i];
        if (sibling === element) {
            return getXPath(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
        }
    }
}

function getElementByXPath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

// --- NEW: RIGHT-CLICK EXPORT LOGIC ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "copyHighlights") {
        const currentUrl = window.location.href.split('#')[0].split('?')[0];
        
        chrome.storage.local.get({ highlights: [] }, (data) => {
            const pageHighlights = data.highlights.filter(h => h.url === currentUrl);
            
            if (pageHighlights.length === 0) {
                // NEW: Custom Error Notification
                showNotification("No highlights to copy on this page.", "error");
                return;
            }

            const markdownText = pageHighlights.map(h => `> ${h.text}`).join('\n\n');
            
            navigator.clipboard.writeText(markdownText).then(() => {
                // NEW: Custom Success Notification
                showNotification(`✅ Copied ${pageHighlights.length} highlights to clipboard!`, "success");
            }).catch(err => {
                console.error("Clipboard copy failed: ", err);
                // NEW: Custom Error Notification
                showNotification("❌ Failed to copy highlights.", "error");
            });
        });
    }
});

// --- NOTIFICATION HELPER ---
function showNotification(message, type = 'success') {
    // 1. Clean up any existing notification so they don't stack
    const existing = document.getElementById('mvp-toast-msg');
    if (existing) existing.remove();

    // 2. Create the new toast
    const toast = document.createElement('div');
    toast.id = 'mvp-toast-msg';
    toast.className = `mvp-toast ${type}`;
    toast.innerText = message;

    // 3. Add to the page
    document.body.appendChild(toast);

    // 4. Trigger the slide-in animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 5. Remove it gracefully after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); // Wait for fade-out to finish
    }, 3000);
}