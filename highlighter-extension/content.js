console.log("🟢 HIGHLIGHTER EXTENSION IS RUNNING!");

// 1. Run restoration logic as soon as the page loads
window.addEventListener('load', restoreHighlights);

// 2. Listen for users selecting text (Upgraded)
document.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);

        try {
            // We now run the visual highlight BEFORE saving.
            highlightRange(range);
            
            
            // NOTE: The save logic is temporarily disabled (see below)
            saveHighlight(range); 
            
            selection.removeAllRanges(); 
        } catch (e) {
            console.error("Highlighting failed:", e);
        }
    }
});

// 3. Draw the highlight (V2: Cross-Element Support)
function highlightRange(range) {
    // 1. Get all text nodes that fall inside the user's selection
    const textNodes = [];
    const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Only accept text nodes that actually intersect with our selection
                return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        }
    );

    let node;
    while ((node = walker.nextNode())) {
        // Ignore invisible whitespace nodes
        if (node.nodeValue.trim() !== '') {
            textNodes.push(node);
        }
    }

    // 2. Wrap each text node individually in a <mark> tag
    // We loop backwards! If we loop forwards, adding <mark> tags changes the DOM structure 
    // and messes up the positions for the remaining nodes.
    for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(textNode);
        
        // If this is the very first node in the selection, start the highlight where the mouse started
        if (i === 0 && textNode === range.startContainer) {
            nodeRange.setStart(textNode, range.startOffset);
        }
        
        // If this is the very last node in the selection, end the highlight where the mouse ended
        if (i === textNodes.length - 1 && textNode === range.endContainer) {
            nodeRange.setEnd(textNode, range.endOffset);
        }
        
        // Wrap this specific piece of text
        const mark = document.createElement('mark');
        mark.className = 'mvp-highlight';
        nodeRange.surroundContents(mark);
    }
}

/// 4. Save the highlight to Chrome's local storage (V2: Boundary Support)
function saveHighlight(range) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    const highlightData = {
        url: window.location.href.split('#')[0].split('?')[0],
        
        // Save the START boundary
        startPath: getXPath(startNode.parentElement),
        startTextIndex: getTextNodeIndex(startNode.parentElement, startNode),
        startOffset: range.startOffset,
        
        // Save the END boundary
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

// 5. Restore highlights from Chrome's local storage (V2: Boundary Support)
function restoreHighlights() {
    const currentUrl = window.location.href.split('#')[0].split('?')[0];
    
    chrome.storage.local.get({ highlights: [] }, (data) => {
        const pageHighlights = data.highlights.filter(h => h.url === currentUrl);
        
        pageHighlights.forEach(h => {
            try {
                // Find the start and end parents
                const startElement = getElementByXPath(h.startPath);
                const endElement = getElementByXPath(h.endPath);
                
                if (startElement && endElement) {
                    // Find the exact text nodes inside those parents
                    const startNode = startElement.childNodes[h.startTextIndex];
                    const endNode = endElement.childNodes[h.endTextIndex];
                    
                    if (startNode && endNode) {
                        // Reconstruct the invisible boundary box
                        const range = document.createRange();
                        range.setStart(startNode, h.startOffset);
                        range.setEnd(endNode, h.endOffset);
                        
                        // Feed it to our TreeWalker!
                        highlightRange(range);
                    }
                }
            } catch(e) {
                console.error("Failed to restore a highlight", e);
            }
        });
    });
}
// --- HELPER FUNCTIONS ---

// Generates a unique path to the HTML element
function getXPath(element) {
    if (!element) return null;
    if (element.id !== '') return 'id("' + element.id + '")';
    if (element === document.body) return element.tagName;

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

// Finds an HTML element based on its unique path
function getElementByXPath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

// --- NEW HELPER FUNCTION ---
// Finds the exact index of a text node inside its parent
function getTextNodeIndex(parentElement, textNode) {
    for (let i = 0; i < parentElement.childNodes.length; i++) {
        if (parentElement.childNodes[i] === textNode) {
            return i;
        }
    }
    return 0;
}