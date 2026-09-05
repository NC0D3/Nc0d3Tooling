/* ============================================================
   REFERENCES
   ============================================================ */

const editor = document.getElementById("document");
const toolbar = document.getElementById("toolbar");
const fileInput = document.getElementById("fileInput");
const loadButton = document.getElementById("loadButton");
const saveButton = document.getElementById("saveButton");
const formatStatus = document.getElementById("formatStatus");
const wordStatus = document.getElementById("wordStatus");
const charStatus = document.getElementById("charStatus");
const inlineCodeButton = document.getElementById("inlineCodeButton");
const codeBlockButton = document.getElementById("codeBlockButton");
const clearFormatButton = document.getElementById("clearFormatButton");


/* ============================================================
   SELECTION
   ============================================================ */

let savedRange = null;

function saveSelection() {

    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) {
        return;
    }

    const range = selection.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
    }
}

function restoreSelection() {

    if (!savedRange) {
        return false;
    }

    try {

        const selection = window.getSelection();

        selection.removeAllRanges();
        selection.addRange(savedRange);

        return true;

    } catch (error) {

        savedRange = null;

        return false;
    }
}

editor.addEventListener("mouseup", () => {

    saveSelection();
    updateToolbarState();

});

editor.addEventListener("keyup", () => {

    saveSelection();
    updateToolbarState();
    updateStatus();

});

document.addEventListener("selectionchange", () => {

    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) {
        return;
    }

    const range = selection.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {

        savedRange = range.cloneRange();

        updateToolbarState();
    }
});


/* ============================================================
   CURRENT NODE
   ============================================================ */

function getCurrentNode() {

    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) {
        return null;
    }

    let node = selection.anchorNode;

    if (!node) {
        return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    return node;
}

function closestElement(selector) {

    const node = getCurrentNode();

    if (!node) {
        return null;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
        return node.closest(selector);
    }

    return node.parentElement?.closest(selector) || null;
}


/* ============================================================
   MUTUALLY EXCLUSIVE INLINE FORMATS
   ============================================================ */

const EXCLUSIVE_INLINE_SELECTOR =
    "strong,b,em,i,u,s,strike,del,code.inline-code";

function isExclusiveInlineElement(element) {

    if (
        !element ||
        element.nodeType !== Node.ELEMENT_NODE
    ) {
        return false;
    }

    const tag = element.tagName.toLowerCase();

    if (
        tag === "strong" ||
        tag === "b" ||
        tag === "em" ||
        tag === "i" ||
        tag === "u" ||
        tag === "s" ||
        tag === "strike" ||
        tag === "del"
    ) {
        return true;
    }

    return (
        tag === "code" &&
        element.classList.contains("inline-code")
    );
}

function unwrapInlineElement(element) {

    if (!element || !element.parentNode) {
        return;
    }

    const parent = element.parentNode;

    while (element.firstChild) {

        parent.insertBefore(
            element.firstChild,
            element
        );
    }

    element.remove();
}

function unwrapExclusiveFormats(root) {

    if (!root) {
        return;
    }

    const elements = [
        ...root.querySelectorAll(
            EXCLUSIVE_INLINE_SELECTOR
        )
    ];

    elements.forEach(unwrapInlineElement);
}


/* ============================================================
   VISUAL CONTENT TEST
   ============================================================ */

function hasMeaningfulInlineContent(node) {

    if (!node) {
        return false;
    }

    if (node.nodeType === Node.TEXT_NODE) {

        return node.nodeValue
            .replace(/\u200B/g, "")
            .replace(/\u00A0/g, "")
            .trim()
            .length > 0;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    if (
        node.tagName.toLowerCase() === "br"
    ) {
        return false;
    }

    for (const child of node.childNodes) {

        if (hasMeaningfulInlineContent(child)) {
            return true;
        }
    }

    return false;
}

function fragmentHasMeaningfulContent(fragment) {

    if (!fragment) {
        return false;
    }

    for (const child of fragment.childNodes) {

        if (hasMeaningfulInlineContent(child)) {
            return true;
        }
    }

    return false;
}


/* ============================================================
   SPLIT EXCLUSIVE ANCESTORS AT RANGE
   ============================================================ */

/*
 * IMPORTANT:
 *
 * Esta función era la causa principal del bug.
 *
 * Antes:
 *
 *     <code>texto|</code>
 *
 * terminaba pudiendo convertirse en:
 *
 *     <code>texto</code>
 *     <code></code>
 *     <strong>nuevo</strong>
 *
 * porque se insertaba el clon aunque no hubiera
 * contenido después del cursor.
 *
 * Ahora solamente creamos la segunda mitad
 * cuando realmente existe contenido significativo.
 */

function splitExclusiveAncestorsAtRange(range) {

    let node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    while (node && node !== editor) {

        if (isExclusiveInlineElement(node)) {

            const parent = node.parentNode;

            if (!parent) {
                break;
            }

            const after =
                node.cloneNode(false);

            const tailRange =
                document.createRange();

            try {

                tailRange.setStart(
                    range.startContainer,
                    range.startOffset
                );

                tailRange.setEndAfter(
                    node
                );

                const tail =
                    tailRange.extractContents();

                /*
                 * SOLUCIÓN:
                 *
                 * No insertamos el clon simplemente
                 * porque tenga childNodes.
                 *
                 * Primero verificamos que realmente
                 * tenga contenido visible.
                 */
                if (
                    fragmentHasMeaningfulContent(
                        tail
                    )
                ) {

                    after.appendChild(
                        tail
                    );

                    parent.insertBefore(
                        after,
                        node.nextSibling
                    );
                }

                /*
                 * El cursor siempre queda después
                 * de la primera mitad.
                 */
                range.setStartAfter(
                    node
                );

                range.collapse(true);

                node = parent;

            } catch (error) {

                break;
            }

            continue;
        }

        node = node.parentElement;
    }
}


/* ============================================================
   EXCLUSIVE FORMAT HELPERS
   ============================================================ */

function getExclusiveAncestorAtRange(
    range,
    selector
) {

    if (!range) {
        return null;
    }

    let node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    if (
        !node ||
        node.nodeType !== Node.ELEMENT_NODE
    ) {
        return null;
    }

    return node.closest(selector);
}

function isInlineElementVisuallyEmpty(element) {

    if (!element) {
        return false;
    }

    const clone =
        element.cloneNode(true);

    clone
        .querySelectorAll("br")
        .forEach(br => br.remove());

    return (
        clone.textContent
            .replace(/\u200B/g, "")
            .replace(/\u00A0/g, "")
            .trim()
            .length === 0
    );
}


/* ============================================================
   DESACTIVAR FORMATO EN EL CURSOR
   ============================================================ */

function deactivateExclusiveFormatAtCaret(
    range,
    selector
) {

    if (
        !range ||
        !range.collapsed
    ) {
        return false;
    }

    const activeElement =
        getExclusiveAncestorAtRange(
            range,
            selector
        );

    if (!activeElement) {
        return false;
    }

    const parent =
        activeElement.parentNode;

    if (!parent) {
        return false;
    }


    /* --------------------------------------------------------
       CASO 1: FORMATO COMPLETAMENTE VACÍO
       -------------------------------------------------------- */

    if (
        isInlineElementVisuallyEmpty(
            activeElement
        )
    ) {

        const marker =
            document.createTextNode(
                "\u200B"
            );

        parent.insertBefore(
            marker,
            activeElement
        );

        activeElement.remove();

        const plainRange =
            document.createRange();

        plainRange.setStart(
            marker,
            1
        );

        plainRange.collapse(true);

        const selection =
            window.getSelection();

        selection.removeAllRanges();
        selection.addRange(
            plainRange
        );

        return true;
    }


    /* --------------------------------------------------------
       CASO 2: PARTIR EL FORMATO
       -------------------------------------------------------- */

    const after =
        activeElement.cloneNode(false);

    const tailRange =
        document.createRange();

    try {

        tailRange.setStart(
            range.startContainer,
            range.startOffset
        );

        tailRange.setEndAfter(
            activeElement
        );

        const tail =
            tailRange.extractContents();

        if (
            fragmentHasMeaningfulContent(
                tail
            )
        ) {
            after.appendChild(
                tail
            );
        }

    } catch (error) {

        return false;
    }


    /*
     * Solo insertamos la segunda mitad si
     * contiene contenido real.
     */
    const hasTail =
        after.hasChildNodes() &&
        hasMeaningfulInlineContent(
            after
        );

    if (hasTail) {

        parent.insertBefore(
            after,
            activeElement.nextSibling
        );
    }


    /*
     * Marcador fuera del formato.
     */
    const marker =
        document.createTextNode(
            "\u200B"
        );

    parent.insertBefore(
        marker,
        hasTail
            ? after
            : activeElement.nextSibling
    );


    /*
     * Cursor fuera del elemento formateado.
     */
    const plainRange =
        document.createRange();

    plainRange.setStart(
        marker,
        1
    );

    plainRange.collapse(true);

    const selection =
        window.getSelection();

    selection.removeAllRanges();
    selection.addRange(
        plainRange
    );

    return true;
}


/* ============================================================
   SELECTION FULLY INSIDE FORMAT
   ============================================================ */

function selectionFullyInside(
    selector,
    range
) {

    if (!range) {
        return false;
    }

    if (range.collapsed) {

        const node =
            range.startContainer;

        if (
            node.nodeType ===
            Node.TEXT_NODE
        ) {

            return !!node.parentElement
                ?.closest(selector);
        }

        if (
            node.nodeType ===
            Node.ELEMENT_NODE
        ) {

            return !!node.closest(
                selector
            );
        }

        return false;
    }

    const walker =
        document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT
        );

    let foundText = false;
    let valid = true;
    let node;

    while (
        (node = walker.nextNode())
    ) {

        if (!node.nodeValue) {
            continue;
        }

        if (!range.intersectsNode(node)) {
            continue;
        }

        const meaningfulText =
            node.nodeValue
                .replace(/\u200B/g, "")
                .length;

        if (!meaningfulText) {
            continue;
        }

        foundText = true;

        if (
            !node.parentElement
                ?.closest(selector)
        ) {

            valid = false;
            break;
        }
    }

    if (!foundText) {
        return closestElement(selector) !== null;
    }

    return valid;
}

function createExclusiveElement(tagName) {

    const element =
        document.createElement(
            tagName
        );

    if (tagName === "code") {
        element.className =
            "inline-code";
    }

    return element;
}


/* ============================================================
   EMPTY BLOCK HELPER
   ============================================================ */

function isBlockVisuallyEmpty(block) {

    if (!block) {
        return false;
    }

    const clone =
        block.cloneNode(true);

    clone
        .querySelectorAll("br")
        .forEach(br => br.remove());

    const text =
        clone.textContent
            .replace(/\u200B/g, "")
            .replace(/\u00A0/g, "")
            .trim();

    return text.length === 0;
}

function removeEmptyBlockBreak(block) {

    if (!block) {
        return;
    }

    if (!isBlockVisuallyEmpty(block)) {
        return;
    }

    block
        .querySelectorAll("br")
        .forEach(br => br.remove());
}


/* ============================================================
   EMPTY BLOCK DELETE PROTECTION
   ============================================================ */

function getCurrentEditableBlock() {

    const node =
        getCurrentNode();

    if (!node) {
        return null;
    }

    return node.closest(
        "p,h1,h2,h3,h4,h5,h6,blockquote,li"
    );
}

function isCaretAtBlockStart(
    range,
    block
) {

    if (
        !range ||
        !range.collapsed ||
        !block
    ) {
        return false;
    }

    const testRange =
        document.createRange();

    try {

        testRange.selectNodeContents(
            block
        );

        testRange.setEnd(
            range.startContainer,
            range.startOffset
        );

        return (
            testRange
                .toString()
                .replace(/\u200B/g, "")
                .trim()
                .length === 0
        );

    } catch (error) {

        return false;
    }
}

function isCaretAtBlockEnd(
    range,
    block
) {

    if (
        !range ||
        !range.collapsed ||
        !block
    ) {
        return false;
    }

    const testRange =
        document.createRange();

    try {

        testRange.selectNodeContents(
            block
        );

        testRange.setStart(
            range.startContainer,
            range.startOffset
        );

        return (
            testRange
                .toString()
                .replace(/\u200B/g, "")
                .trim()
                .length === 0
        );

    } catch (error) {

        return false;
    }
}


/* ============================================================
   EMPTY BLOCK DELETE PROTECTION
   ============================================================ */

editor.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Backspace" &&
            event.key !== "Delete"
        ) {
            return;
        }

        const selection =
            window.getSelection();

        if (
            !selection ||
            !selection.rangeCount
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        if (!range.collapsed) {
            return;
        }

        const block =
            getCurrentEditableBlock();

        if (
            !block ||
            !editor.contains(block)
        ) {
            return;
        }

        if (
            !isBlockVisuallyEmpty(block)
        ) {
            return;
        }

        if (
            event.key === "Backspace" &&
            isCaretAtBlockStart(
                range,
                block
            )
        ) {

            event.preventDefault();
            event.stopPropagation();

            placeCaretAtStart(
                block
            );

            saveSelection();

            updateToolbarState();
            updateStatus();

            return;
        }

        if (
            event.key === "Delete" &&
            isCaretAtBlockEnd(
                range,
                block
            )
        ) {

            event.preventDefault();
            event.stopPropagation();

            placeCaretAtStart(
                block
            );

            saveSelection();

            updateToolbarState();
            updateStatus();

            return;
        }
    },
    true
);


/* ============================================================
   TOGGLE EXCLUSIVE INLINE FORMAT
   ============================================================ */

function toggleExclusiveInlineFormat(
    tagName
) {

    restoreSelection();

    editor.focus();

    const selection =
        window.getSelection();

    if (
        !selection ||
        !selection.rangeCount
    ) {
        return;
    }

    let range =
        selection.getRangeAt(0);

    const selector =
        tagName === "code"
            ? "code.inline-code"
            : tagName;


    /* --------------------------------------------------------
       CURSOR SIN SELECCIÓN
       -------------------------------------------------------- */

    if (range.collapsed) {

        const currentBlock =
            getCurrentNode()?.closest(
                "p,h1,h2,h3,h4,h5,h6,blockquote,li"
            );

        if (
            currentBlock &&
            isBlockVisuallyEmpty(
                currentBlock
            )
        ) {

            removeEmptyBlockBreak(
                currentBlock
            );

            placeCaretAtStart(
                currentBlock
            );

            const newSelection =
                window.getSelection();

            if (
                newSelection &&
                newSelection.rangeCount
            ) {

                range =
                    newSelection.getRangeAt(0);
            }
        }


        const alreadyActive =
            selectionFullyInside(
                selector,
                range
            );


        if (alreadyActive) {

            const deactivated =
                deactivateExclusiveFormatAtCaret(
                    range,
                    selector
                );

            if (deactivated) {

                saveSelection();

                normalizeEditor();

                updateToolbarState();
                updateStatus();

                return;
            }
        }


        /*
         * AQUÍ está la parte importante:
         *
         * Si el cursor está dentro de code y
         * vamos a cambiar a otro formato,
         * primero dividimos el formato actual.
         *
         * La función corregida ya no genera
         * un segundo elemento vacío.
         */
        splitExclusiveAncestorsAtRange(
            range
        );


        const element =
            createExclusiveElement(
                tagName
            );

        element.textContent =
            "\u200B";

        range.insertNode(
            element
        );


        const newRange =
            document.createRange();

        newRange.selectNodeContents(
            element
        );

        newRange.collapse(false);

        selection.removeAllRanges();

        selection.addRange(
            newRange
        );

        saveSelection();

        normalizeEditor();

        updateToolbarState();
        updateStatus();

        return;
    }


    /* --------------------------------------------------------
       SELECCIÓN DE TEXTO
       -------------------------------------------------------- */

    const alreadyActive =
        selectionFullyInside(
            selector,
            range
        );

    const fragment =
        range.extractContents();

    unwrapExclusiveFormats(
        fragment
    );

    splitExclusiveAncestorsAtRange(
        range
    );

    if (alreadyActive) {

        range.insertNode(
            fragment
        );

    } else {

        const element =
            createExclusiveElement(
                tagName
            );

        element.appendChild(
            fragment
        );

        range.insertNode(
            element
        );
    }


    try {

        range.collapse(false);

        selection.removeAllRanges();

        selection.addRange(
            range
        );

    } catch (error) {

        placeCaretAtEnd(
            editor
        );
    }

    saveSelection();

    normalizeEditor();

    updateToolbarState();
    updateStatus();
}


/* ============================================================
   BASIC EXEC
   ============================================================ */

function exec(
    command,
    value = null
) {

    restoreSelection();

    editor.focus();

    document.execCommand(
        command,
        false,
        value
    );

    saveSelection();

    normalizeEditor();

    updateToolbarState();
    updateStatus();
}


/* ============================================================
   FORMAT BLOCK
   ============================================================ */

function formatBlock(tag) {

    restoreSelection();

    editor.focus();

    const current =
        getCurrentNode();

    const bq =
        current?.closest(
            "blockquote"
        );

    const currentBlock =
        current?.closest(
            "p,h1,h2,h3,h4,h5,h6,blockquote"
        );

    if (
        currentBlock &&
        /^H[1-6]$/.test(
            currentBlock.tagName
        ) &&
        currentBlock.tagName.toLowerCase() === tag
    ) {

        document.execCommand(
            "formatBlock",
            false,
            "p"
        );

    } else if (
        bq &&
        tag === "p"
    ) {

        const p =
            document.createElement(
                "p"
            );

        p.innerHTML =
            bq.innerHTML;

        bq.replaceWith(
            p
        );

        placeCaretAtEnd(
            p
        );

    } else if (
        bq &&
        tag === "blockquote"
    ) {

        formatBlock("p");

        return;

    } else {

        document.execCommand(
            "formatBlock",
            false,
            tag
        );
    }

    saveSelection();

    normalizeEditor();

    updateToolbarState();
    updateStatus();
}


/* ============================================================
   TOOLBAR
   ============================================================ */

toolbar.addEventListener(
    "mousedown",
    event => {

        const button =
            event.target.closest(
                ".tool"
            );

        if (button) {
            event.preventDefault();
        }
    }
);

toolbar.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".tool"
            );

        if (!button) {
            return;
        }

        const command =
            button.dataset.command;

        const action =
            button.dataset.action;

        const format =
            button.dataset.format;


        if (format) {

            toggleExclusiveInlineFormat(
                format
            );

            return;
        }


        if (command) {

            exec(command);

            return;
        }


        if (!action) {
            return;
        }


        switch (action) {

            case "paragraph":
                formatBlock("p");
                break;

            case "h1":
                formatBlock("h1");
                break;

            case "h2":
                formatBlock("h2");
                break;

            case "h3":
                formatBlock("h3");
                break;

            case "h4":
                formatBlock("h4");
                break;

            case "h5":
                formatBlock("h5");
                break;

            case "h6":
                formatBlock("h6");
                break;

            case "unorderedList":
                exec("insertUnorderedList");
                break;

            case "orderedList":
                exec("insertOrderedList");
                break;

            case "blockquote":
                formatBlock("blockquote");
                break;

            case "horizontalRule":
                exec("insertHorizontalRule");
                break;
        }
    }
);


/* ============================================================
   INLINE CODE
   ============================================================ */

function getInlineCode() {

    return closestElement(
        "code.inline-code"
    );
}

function unwrapInlineCode(code) {

    unwrapInlineElement(
        code
    );
}

function toggleInlineCode() {

    toggleExclusiveInlineFormat(
        "code"
    );
}

inlineCodeButton.addEventListener(
    "click",
    toggleInlineCode
);


/* ============================================================
   CODE BLOCK
   ============================================================ */

function getCodeBlock() {

    return closestElement(
        "pre.code-block"
    );
}

function getCodeElement() {

    return closestElement(
        "pre.code-block code"
    );
}

function removeCodeBlock(pre) {

    if (!pre) {
        return;
    }

    const code =
        pre.querySelector("code");

    const content =
        code
            ? code.textContent
            : pre.textContent;

    const lines =
        content.split("\n");

    const fragment =
        document.createDocumentFragment();

    lines.forEach(line => {

        const p =
            document.createElement(
                "p"
            );

        if (line.trim().length === 0) {

            p.innerHTML =
                "<br>";

        } else {

            p.textContent =
                line;
        }

        fragment.appendChild(
            p
        );
    });

    const firstP =
        fragment.firstChild;

    pre.replaceWith(
        fragment
    );

    if (firstP) {

        placeCaretAtStart(
            firstP
        );
    }

    saveSelection();

    updateToolbarState();
    updateStatus();
}

function enterCodeBlock() {

    restoreSelection();

    editor.focus();

    const selection =
        window.getSelection();

    if (
        !selection ||
        !selection.rangeCount
    ) {
        return;
    }

    const current =
        getCurrentNode();

    let block =
        current?.closest(
            "p,div,h1,h2,h3,h4,h5,h6,blockquote"
        );

    if (
        !block ||
        !editor.contains(block)
    ) {

        block =
            document.createElement(
                "p"
            );

        block.innerHTML =
            "<br>";

        editor.appendChild(
            block
        );
    }

    const pre =
        document.createElement(
            "pre"
        );

    pre.className =
        "code-block";

    const code =
        document.createElement(
            "code"
        );

    code.textContent =
        block.textContent || "";

    pre.appendChild(
        code
    );

    block.replaceWith(
        pre
    );

    placeCaretAtEnd(
        code
    );

    saveSelection();

    updateToolbarState();
    updateStatus();
}

function toggleCodeBlock() {

    restoreSelection();

    editor.focus();

    const existing =
        getCodeBlock();

    if (existing) {

        removeCodeBlock(
            existing
        );

        return;
    }

    enterCodeBlock();
}

codeBlockButton.addEventListener(
    "click",
    toggleCodeBlock
);


/* ============================================================
   CODE BLOCK KEYBOARD
   ============================================================ */

editor.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Enter") {
            return;
        }

        const code =
            getCodeElement();

        if (!code) {
            return;
        }

        event.preventDefault();

        const selection =
            window.getSelection();

        if (
            !selection ||
            !selection.rangeCount
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        range.deleteContents();

        const newline =
            document.createTextNode(
                "\n"
            );

        range.insertNode(
            newline
        );

        range.setStartAfter(
            newline
        );

        range.collapse(true);

        selection.removeAllRanges();

        selection.addRange(
            range
        );

        saveSelection();

        updateToolbarState();
        updateStatus();
    }
);


/* ============================================================
   ENTER -> NORMAL PARAGRAPH
   ============================================================ */

function clearInlineFormattingFromBlock(block) {

    if (
        !block ||
        !editor.contains(block)
    ) {
        return;
    }

    const inlineElements =
        block.querySelectorAll(
            EXCLUSIVE_INLINE_SELECTOR
        );

    [
        ...inlineElements
    ].forEach(
        unwrapInlineElement
    );
}

editor.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Enter" ||
            event.shiftKey
        ) {
            return;
        }

        if (
            getCurrentNode()?.closest(
                "pre.code-block"
            )
        ) {
            return;
        }

        const current =
            getCurrentNode();

        const heading =
            current?.closest(
                "h1,h2,h3,h4,h5,h6"
            );

        if (
            !heading ||
            !editor.contains(heading)
        ) {
            return;
        }

        event.preventDefault();

        const paragraph =
            document.createElement(
                "p"
            );

        paragraph.innerHTML =
            "<br>";

        heading.after(
            paragraph
        );

        placeCaretAtStart(
            paragraph
        );

        saveSelection();

        updateToolbarState();
        updateStatus();
    }
);


editor.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.defaultPrevented
        ) {
            return;
        }

        const current =
            getCurrentNode();

        if (
            current?.closest(
                "pre.code-block"
            )
        ) {
            return;
        }

        const oldBlock =
            current?.closest(
                "p,blockquote,li"
            );

        if (!oldBlock) {
            return;
        }

        requestAnimationFrame(() => {

            const newCurrent =
                getCurrentNode();

            const newBlock =
                newCurrent?.closest(
                    "p,blockquote,li"
                );

            if (
                !newBlock ||
                !editor.contains(newBlock)
            ) {
                return;
            }

            if (
                newBlock === oldBlock
            ) {
                return;
            }

            clearInlineFormattingFromBlock(
                newBlock
            );

            saveSelection();

            normalizeEditor();

            updateToolbarState();
            updateStatus();
        });
    }
);


/* ============================================================
   CLEAR FORMAT
   ============================================================ */

clearFormatButton.addEventListener(
    "click",
    () => {

        restoreSelection();

        editor.focus();

        const selection =
            window.getSelection();

        if (
            !selection ||
            !selection.rangeCount
        ) {
            return;
        }

        document.execCommand(
            "removeFormat",
            false,
            null
        );

        const range =
            selection.getRangeAt(0);

        const codes =
            editor.querySelectorAll(
                "code.inline-code"
            );

        codes.forEach(code => {

            if (
                range.intersectsNode(
                    code
                )
            ) {

                unwrapInlineCode(
                    code
                );
            }
        });

        saveSelection();

        normalizeEditor();

        updateToolbarState();
        updateStatus();
    }
);


/* ============================================================
   LINKS
   ============================================================ */

const linkModal =
    document.getElementById(
        "linkModal"
    );

const linkUrl =
    document.getElementById(
        "linkUrl"
    );

const linkText =
    document.getElementById(
        "linkText"
    );

const cancelLink =
    document.getElementById(
        "cancelLink"
    );

const applyLink =
    document.getElementById(
        "applyLink"
    );

const linkButton =
    document.getElementById(
        "linkButton"
    );

const unlinkButton =
    document.getElementById(
        "unlinkButton"
    );

function openLinkModal() {

    saveSelection();

    const selection =
        window.getSelection();

    linkText.value =
        selection?.toString() || "";

    linkUrl.value = "";

    linkModal.classList.add(
        "open"
    );

    setTimeout(
        () => linkUrl.focus(),
        50
    );
}

function closeLinkModal() {

    linkModal.classList.remove(
        "open"
    );
}

linkButton.addEventListener(
    "click",
    openLinkModal
);

cancelLink.addEventListener(
    "click",
    closeLinkModal
);

applyLink.addEventListener(
    "click",
    () => {

        restoreSelection();

        editor.focus();

        const url =
            linkUrl.value.trim();

        if (!url) {
            return;
        }

        const text =
            linkText.value.trim();

        const selection =
            window.getSelection();

        if (
            !selection ||
            !selection.rangeCount
        ) {
            return;
        }

        const range =
            selection.getRangeAt(0);

        const anchor =
            document.createElement(
                "a"
            );

        anchor.href =
            url;

        anchor.target =
            "_blank";

        anchor.rel =
            "noopener noreferrer";

        if (range.collapsed) {

            anchor.textContent =
                text || url;

            range.insertNode(
                anchor
            );

        } else {

            const selected =
                range.extractContents();

            anchor.appendChild(
                selected
            );

            range.insertNode(
                anchor
            );
        }

        placeCaretAtEnd(
            anchor
        );

        saveSelection();

        closeLinkModal();

        updateToolbarState();
        updateStatus();
    }
);

unlinkButton.addEventListener(
    "click",
    () => {

        exec(
            "unlink"
        );
    }
);


/* ============================================================
   IMAGE SYSTEM
   ============================================================ */

let selectedImage = null;

function nextImageId() {

    const images =
        editor.querySelectorAll(
            "p.md-image img"
        );

    return `evidencia_${String(
        images.length + 1
    ).padStart(
        3,
        "0"
    )}`;
}

function insertImageFile(file) {

    if (
        !file ||
        !file.type.startsWith(
            "image/"
        )
    ) {
        return;
    }

    const reader =
        new FileReader();

    reader.onload = event => {

        const id =
            nextImageId();

        const wrapper =
            document.createElement(
                "p"
            );

        wrapper.className =
            "md-image";

        wrapper.id =
            id;

        wrapper.setAttribute(
            "align",
            "center"
        );

        const image =
            document.createElement(
                "img"
            );

        image.id =
            id;

        image.alt = "";

        image.src =
            event.target.result;

        image.style.width =
            "80%";

        wrapper.appendChild(
            image
        );

        restoreSelection();

        editor.focus();

        const selection =
            window.getSelection();

        if (
            selection &&
            selection.rangeCount
        ) {

            const range =
                selection.getRangeAt(0);

            range.collapse(false);

            range.insertNode(
                wrapper
            );

            const paragraph =
                document.createElement(
                    "p"
                );

            paragraph.innerHTML =
                "<br>";

            wrapper.after(
                paragraph
            );

            placeCaretAtStart(
                paragraph
            );

        } else {

            editor.appendChild(
                wrapper
            );
        }

        saveSelection();

        updateStatus();
    };

    reader.readAsDataURL(
        file
    );
}


/* ============================================================
   IMAGE PASTE
   ============================================================ */

editor.addEventListener(
    "paste",
    event => {

        const clipboard =
            event.clipboardData;

        if (!clipboard) {
            return;
        }

        const images =
            [
                ...clipboard.items
            ].filter(
                item =>
                    item.kind === "file" &&
                    item.type.startsWith(
                        "image/"
                    )
            );

        if (!images.length) {
            return;
        }

        event.preventDefault();

        images.forEach(
            item => {

                const file =
                    item.getAsFile();

                if (file) {

                    insertImageFile(
                        file
                    );
                }
            }
        );
    },
    true
);


/* ============================================================
   IMAGE DRAG DROP
   ============================================================ */

editor.addEventListener(
    "dragover",
    event => {

        const files =
            [
                ...event.dataTransfer.files
            ];

        if (
            files.some(
                file =>
                    file.type.startsWith(
                        "image/"
                    )
            )
        ) {

            event.preventDefault();
        }
    }
);

editor.addEventListener(
    "drop",
    event => {

        const files =
            [
                ...event.dataTransfer.files
            ];

        const images =
            files.filter(
                file =>
                    file.type.startsWith(
                        "image/"
                    )
            );

        if (!images.length) {
            return;
        }

        event.preventDefault();

        images.forEach(
            insertImageFile
        );
    }
);


/* ============================================================
   IMAGE CLICK
   ============================================================ */

editor.addEventListener(
    "click",
    event => {

        if (
            event.target.tagName !==
            "IMG"
        ) {
            return;
        }

        const image =
            event.target;

        if (
            !image.closest(
                "p.md-image"
            )
        ) {
            return;
        }

        openImageModal(
            image
        );
    }
);


/* ============================================================
   IMAGE MODAL
   ============================================================ */

const imageModal =
    document.getElementById(
        "imageModal"
    );

const imageSizeMode =
    document.getElementById(
        "imageSizeMode"
    );

const imageSizeValue =
    document.getElementById(
        "imageSizeValue"
    );

const imageSizeValueContainer =
    document.getElementById(
        "imageSizeValueContainer"
    );

const imageAlt =
    document.getElementById(
        "imageAlt"
    );

const applyImage =
    document.getElementById(
        "applyImage"
    );

const cancelImage =
    document.getElementById(
        "cancelImage"
    );

const removeImage =
    document.getElementById(
        "removeImage"
    );

function openImageModal(image) {

    selectedImage =
        image;

    image.classList.add(
        "selected-image"
    );

    const width =
        image.style.width;

    if (
        !width ||
        width === "auto"
    ) {

        imageSizeMode.value =
            "auto";

    } else if (
        width.endsWith("%")
    ) {

        imageSizeMode.value =
            "percent";

        imageSizeValue.value =
            parseFloat(
                width
            );

    } else if (
        width.endsWith("px")
    ) {

        imageSizeMode.value =
            "px";

        imageSizeValue.value =
            parseFloat(
                width
            );
    }

    imageAlt.value =
        image.alt || "";

    updateImageSizeInput();

    imageModal.classList.add(
        "open"
    );
}

function closeImageModal() {

    if (selectedImage) {

        selectedImage.classList.remove(
            "selected-image"
        );
    }

    selectedImage =
        null;

    imageModal.classList.remove(
        "open"
    );
}

function updateImageSizeInput() {

    if (
        imageSizeMode.value ===
        "auto"
    ) {

        imageSizeValueContainer.style.display =
            "none";

        return;
    }

    imageSizeValueContainer.style.display =
        "block";

    if (
        imageSizeMode.value ===
        "percent"
    ) {

        imageSizeValue.min =
            10;

        imageSizeValue.max =
            100;

    } else {

        imageSizeValue.min =
            50;

        imageSizeValue.max =
            3000;
    }
}

imageSizeMode.addEventListener(
    "change",
    updateImageSizeInput
);

cancelImage.addEventListener(
    "click",
    closeImageModal
);

applyImage.addEventListener(
    "click",
    () => {

        if (!selectedImage) {
            return;
        }

        const mode =
            imageSizeMode.value;

        const value =
            parseFloat(
                imageSizeValue.value
            );

        if (
            mode === "auto"
        ) {

            selectedImage.style.width =
                "auto";

        } else if (
            mode === "percent" &&
            Number.isFinite(value)
        ) {

            selectedImage.style.width =
                `${Math.min(
                    100,
                    Math.max(
                        10,
                        value
                    )
                )}%`;

        } else if (
            mode === "px" &&
            Number.isFinite(value)
        ) {

            selectedImage.style.width =
                `${Math.max(
                    50,
                    value
                )}px`;
        }

        selectedImage.alt =
            imageAlt.value;

        closeImageModal();

        updateStatus();
    }
);

removeImage.addEventListener(
    "click",
    () => {

        if (selectedImage) {

            const wrapper =
                selectedImage.closest(
                    "p.md-image"
                );

            wrapper?.remove();
        }

        closeImageModal();

        synchronizeImageIds();

        updateStatus();
    }
);


/* ============================================================
   IMAGE IDS
   ============================================================ */

function synchronizeImageIds() {

    const wrappers =
        editor.querySelectorAll(
            "p.md-image"
        );

    wrappers.forEach(
        (wrapper, index) => {

            const id =
                `evidencia_${String(
                    index + 1
                ).padStart(
                    3,
                    "0"
                )}`;

            const image =
                wrapper.querySelector(
                    "img"
                );

            if (!image) {
                return;
            }

            wrapper.id =
                id;

            image.id =
                id;

            if (!image.style.width) {

                image.style.width =
                    "80%";
            }
        }
    );
}


/* ============================================================
   TOOLBAR STATE
   ============================================================ */

function updateToolbarState() {

    const selection =
        window.getSelection();

    let range = null;

    if (
        selection &&
        selection.rangeCount
    ) {

        range =
            selection.getRangeAt(0);
    }

    toolbar
        .querySelectorAll(
            ".tool[data-format]"
        )
        .forEach(button => {

            const format =
                button.dataset.format;

            const active =
                range &&
                selectionFullyInside(
                    format,
                    range
                );

            button.classList.toggle(
                "active",
                !!active
            );
        });

    const inlineCodeActive =
        range &&
        selectionFullyInside(
            "code.inline-code",
            range
        );

    inlineCodeButton.classList.toggle(
        "active",
        !!inlineCodeActive
    );

    codeBlockButton.classList.toggle(
        "active",
        !!getCodeBlock()
    );


    const left =
        toolbar.querySelector(
            '[data-command="justifyLeft"]'
        );

    const center =
        toolbar.querySelector(
            '[data-command="justifyCenter"]'
        );

    const right =
        toolbar.querySelector(
            '[data-command="justifyRight"]'
        );


    if (left) {

        left.classList.toggle(
            "active",
            document.queryCommandState(
                "justifyLeft"
            )
        );
    }

    if (center) {

        center.classList.toggle(
            "active",
            document.queryCommandState(
                "justifyCenter"
            )
        );
    }

    if (right) {

        right.classList.toggle(
            "active",
            document.queryCommandState(
                "justifyRight"
            )
        );
    }


    const node =
        getCurrentNode();

    if (!node) {
        return;
    }

    const block =
        node.closest(
            "h1,h2,h3,h4,h5,h6,blockquote,p,pre,li"
        );


    toolbar
        .querySelectorAll(
            "[data-action]"
        )
        .forEach(button => {

            const action =
                button.dataset.action;

            let active = false;

            if (block) {

                switch (action) {

                    case "paragraph":
                        active =
                            block.tagName === "P";
                        break;

                    case "h1":
                        active =
                            block.tagName === "H1";
                        break;

                    case "h2":
                        active =
                            block.tagName === "H2";
                        break;

                    case "h3":
                        active =
                            block.tagName === "H3";
                        break;

                    case "h4":
                        active =
                            block.tagName === "H4";
                        break;

                    case "h5":
                        active =
                            block.tagName === "H5";
                        break;

                    case "h6":
                        active =
                            block.tagName === "H6";
                        break;

                    case "blockquote":
                        active =
                            block.tagName ===
                            "BLOCKQUOTE";
                        break;

                    case "unorderedList":
                        active =
                            !!block.closest(
                                "ul:not(.task-list)"
                            );
                        break;

                    case "orderedList":
                        active =
                            !!block.closest(
                                "ol"
                            );
                        break;
                }
            }

            button.classList.toggle(
                "active",
                active
            );
        });
}


/* ============================================================
   STATUS
   ============================================================ */

function updateStatus() {

    const text =
        editor.innerText
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const words =
        text
            ? text.split(/\s+/).length
            : 0;

    wordStatus.textContent =
        `${words}${
            words === 1
                ? " palabra"
                : " palabras"
        }`;

    charStatus.textContent =
        `${text.length}${
            text.length === 1
                ? " carácter"
                : " caracteres"
        }`;


    const node =
        getCurrentNode();

    if (!node) {

        formatStatus.textContent =
            "Normal";

        return;
    }


    if (getCodeBlock()) {

        formatStatus.textContent =
            "Código";

        return;
    }


    const block =
        node.closest(
            "h1,h2,h3,h4,h5,h6,blockquote,pre,p,li"
        );

    if (!block) {

        formatStatus.textContent =
            "Normal";

        return;
    }


    formatStatus.textContent =
        block.tagName ===
            "BLOCKQUOTE"
            ? "Cita"
            : block.tagName;
}


/* ============================================================
   CARET
   ============================================================ */

function placeCaretAtEnd(element) {

    if (!element) {
        return;
    }

    const range =
        document.createRange();

    range.selectNodeContents(
        element
    );

    range.collapse(false);

    const selection =
        window.getSelection();

    selection.removeAllRanges();

    selection.addRange(
        range
    );

    editor.focus();
}

function placeCaretAtStart(element) {

    if (!element) {
        return;
    }

    const range =
        document.createRange();

    range.selectNodeContents(
        element
    );

    range.collapse(true);

    const selection =
        window.getSelection();

    selection.removeAllRanges();

    selection.addRange(
        range
    );

    editor.focus();
}


/* ============================================================
   NORMALIZE
   ============================================================ */

function normalizeExclusiveFormatting() {

    const elements = [
        ...editor.querySelectorAll(
            EXCLUSIVE_INLINE_SELECTOR
        )
    ];

    elements.forEach(element => {

        let parent =
            element.parentElement;

        while (
            parent &&
            parent !== editor
        ) {

            if (
                isExclusiveInlineElement(
                    parent
                )
            ) {

                unwrapInlineElement(
                    element
                );

                break;
            }

            parent =
                parent.parentElement;
        }
    });
}

function normalizeEditor() {

    editor
        .querySelectorAll(
            ":scope > div"
        )
        .forEach(div => {

            if (!div.className) {

                const p =
                    document.createElement(
                        "p"
                    );

                p.innerHTML =
                    div.innerHTML;

                div.replaceWith(
                    p
                );
            }
        });

    normalizeExclusiveFormatting();

    synchronizeImageIds();
}


/* ============================================================
   MARKDOWN SERIALIZATION
   ============================================================ */

function escapeAttribute(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /'/g,
            "&#39;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        );
}

function childrenToMarkdown(node) {

    return [
        ...node.childNodes
    ]
        .map(
            inlineToMarkdown
        )
        .join("");
}

function inlineToMarkdown(node) {

    if (
        node.nodeType ===
        Node.TEXT_NODE
    ) {

        return node.nodeValue
            .replace(
                /\u200B/g,
                ""
            )
            .replace(
                /\u00a0/g,
                " "
            );
    }

    if (
        node.nodeType !==
        Node.ELEMENT_NODE
    ) {
        return "";
    }

    const tag =
        node.tagName.toLowerCase();

    if (tag === "br") {
        return "\n";
    }

    if (
        tag === "strong" ||
        tag === "b"
    ) {

        return `**${childrenToMarkdown(
            node
        )}**`;
    }

    if (
        tag === "em" ||
        tag === "i"
    ) {

        return `*${childrenToMarkdown(
            node
        )}*`;
    }

    if (tag === "u") {

        return `<u>${childrenToMarkdown(
            node
        )}</u>`;
    }

    if (
        tag === "s" ||
        tag === "strike" ||
        tag === "del"
    ) {

        return `~~${childrenToMarkdown(
            node
        )}~~`;
    }

    if (
        tag === "code" &&
        node.classList.contains(
            "inline-code"
        )
    ) {

        return `\`${node.textContent.replace(
            /\u200B/g,
            ""
        )}\``;
    }

    if (tag === "a") {

        return `[${childrenToMarkdown(
            node
        )}](${node.getAttribute(
            "href"
        ) || ""})`;
    }

    if (tag === "span") {

        return childrenToMarkdown(
            node
        );
    }

    if (tag === "font") {

        return childrenToMarkdown(
            node
        );
    }

    return childrenToMarkdown(
        node
    );
}

function blockToMarkdown(node) {

    if (
        node.nodeType ===
        Node.TEXT_NODE
    ) {

        return node.nodeValue
            .replace(
                /\u200B/g,
                ""
            );
    }

    if (
        node.nodeType !==
        Node.ELEMENT_NODE
    ) {
        return "";
    }

    const tag =
        node.tagName.toLowerCase();

    if (
        tag === "p" &&
        node.classList.contains(
            "md-image"
        )
    ) {

        const image =
            node.querySelector(
                "img"
            );

        if (!image) {
            return "";
        }

        const id =
            image.id ||
            node.id ||
            "evidencia_001";

        const alt =
            escapeAttribute(
                image.alt || ""
            );

        const src =
            image.getAttribute(
                "src"
            ) || "";

        return `<p align='center' id='${id}'>
    <img
        id='${id}'
        alt='${alt}'
        src='${src}'>
</p>
`;
    }

    if (
        /^h[1-6]$/.test(tag)
    ) {

        const level =
            Number(
                tag.substring(1)
            );

        return `${"#".repeat(
            level
        )} ${childrenToMarkdown(
            node
        ).trim()}\n\n`;
    }

    if (tag === "p") {

        return `${childrenToMarkdown(
            node
        ).trim()}\n\n`;
    }

    if (tag === "blockquote") {

        return childrenToMarkdown(
            node
        )
            .trim()
            .split("\n")
            .map(
                line =>
                    `> ${line}`
            )
            .join("\n")
            + "\n\n";
    }

    if (tag === "hr") {
        return "---\n\n";
    }

    if (
        tag === "pre" &&
        node.classList.contains(
            "code-block"
        )
    ) {

        return `\`\`\`
${node.textContent.replace(
            /\n$/,
            ""
        )}
\`\`\`
`;
    }

    if (tag === "ul") {

        return [
            ...node.children
        ]
            .map(
                li =>
                    `- ${childrenToMarkdown(
                        li
                    ).trim()}`
            )
            .join("\n")
            + "\n\n";
    }

    if (tag === "ol") {

        return [
            ...node.children
        ]
            .map(
                (li, index) =>
                    `${index + 1}. ${childrenToMarkdown(
                        li
                    ).trim()}`
            )
            .join("\n")
            + "\n\n";
    }

    return childrenToMarkdown(
        node
    );
}

function htmlToMarkdown() {

    synchronizeImageIds();

    return [
        ...editor.childNodes
    ]
        .map(
            blockToMarkdown
        )
        .join("")
        .replace(
            /\n{3,}/g,
            "\n\n"
        )
        .trim()
        + "\n";
}


/* ============================================================
   MARKDOWN LOADER
   ============================================================ */

function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        text;

    return div.innerHTML;
}

function markdownInlineToHTML(text) {

    let result =
        escapeHTML(
            text
        );

    result = result.replace(
        /`([^`]+)`/g,
        '<code class="inline-code">$1</code>'
    );

    result = result.replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    result = result.replace(
        /\*\*([^\*]+)\*\*/g,
        "<strong>$1</strong>"
    );

    result = result.replace(
        /~~([^\~]+)~~/g,
        "<s>$1</s>"
    );

    result = result.replace(
        /(?<!\*)\*([^\*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );

    result = result.replace(
        /&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi,
        "<u>$1</u>"
    );

    return result;
}

function markdownToHTML(markdown) {

    const imageBlocks = [];

    markdown =
        markdown.replace(
            /<p\s+align=['"]center['"]\s+id=['"]([^'"]+)['"]>\s*<img\s+id=['"]([^'"]+)['"]\s+alt=['"]([^'"]*)['"]\s+src=['"]([^'"]+)['"]\s*>\s*<\/p>/gi,
            (
                _,
                wrapperId,
                imageId,
                alt,
                src
            ) => {

                const token =
                    `___IMAGE_BLOCK_${imageBlocks.length}___`;

                imageBlocks.push({
                    wrapperId,
                    imageId,
                    alt,
                    src
                });

                return token;
            }
        );

    const lines =
        markdown.split(
            /\r?\n/
        );

    const html = [];

    let i = 0;

    while (
        i < lines.length
    ) {

        const line =
            lines[i];

        const imageToken =
            line.match(
                /^___IMAGE_BLOCK_(\d+)___$/
            );

        if (imageToken) {

            const data =
                imageBlocks[
                    Number(
                        imageToken[1]
                    )
                ];

            html.push(`
<p class="md-image" align="center" id="${escapeAttribute(data.wrapperId)}">
    <img
        id="${escapeAttribute(data.imageId)}"
        alt="${escapeAttribute(data.alt)}"
        src="${data.src}"
        style="width:80%">
</p>`);

            i++;

            continue;
        }

        if (
            line.trim().startsWith(
                "```"
            )
        ) {

            const codeLines = [];

            i++;

            while (
                i < lines.length &&
                !lines[i]
                    .trim()
                    .startsWith(
                        "```"
                    )
            ) {

                codeLines.push(
                    lines[i]
                );

                i++;
            }

            i++;

            html.push(
                `<pre class="code-block"><code>${escapeHTML(
                    codeLines.join(
                        "\n"
                    )
                )}</code></pre>`
            );

            continue;
        }

        if (!line.trim()) {

            i++;

            continue;
        }

        const heading =
            line.match(
                /^(#{1,6})\s+(.+)$/
            );

        if (heading) {

            const level =
                heading[1].length;

            html.push(
                `<h${level}>${markdownInlineToHTML(
                    heading[2]
                )}</h${level}>`
            );

            i++;

            continue;
        }

        if (
            /^(\*{3,}|-{3,}|_{3,})$/.test(
                line.trim()
            )
        ) {

            html.push(
                "<hr>"
            );

            i++;

            continue;
        }

        if (
            line.trim().startsWith(
                ">"
            )
        ) {

            const quoteLines = [];

            while (
                i < lines.length &&
                lines[i]
                    .trim()
                    .startsWith(
                        ">"
                    )
            ) {

                quoteLines.push(
                    lines[i].replace(
                        /^>\s?/,
                        ""
                    )
                );

                i++;
            }

            html.push(
                `<blockquote>${quoteLines
                    .map(
                        markdownInlineToHTML
                    )
                    .join(
                        "<br>"
                    )}</blockquote>`
            );

            continue;
        }

        if (
            /^[-*+]\s+/.test(
                line
            )
        ) {

            const items = [];

            while (
                i < lines.length &&
                /^[-*+]\s+/.test(
                    lines[i]
                )
            ) {

                items.push(
                    `<li>${markdownInlineToHTML(
                        lines[i].replace(
                            /^[-*+]\s+/,
                            ""
                        )
                    )}</li>`
                );

                i++;
            }

            html.push(
                `<ul>${items.join(
                    ""
                )}</ul>`
            );

            continue;
        }

        if (
            /^\d+\.\s+/.test(
                line
            )
        ) {

            const items = [];

            while (
                i < lines.length &&
                /^\d+\.\s+/.test(
                    lines[i]
                )
            ) {

                items.push(
                    `<li>${markdownInlineToHTML(
                        lines[i].replace(
                            /^\d+\.\s+/,
                            ""
                        )
                    )}</li>`
                );

                i++;
            }

            html.push(
                `<ol>${items.join(
                    ""
                )}</ol>`
            );

            continue;
        }

        const paragraphLines =
            [line];

        i++;

        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^#{1,6}\s+/.test(
                lines[i]
            ) &&
            !/^```/.test(
                lines[i]
            ) &&
            !/^[-*+]\s+/.test(
                lines[i]
            ) &&
            !/^\d+\.\s+/.test(
                lines[i]
            ) &&
            !/^>/.test(
                lines[i]
            ) &&
            !/^___IMAGE_BLOCK_\d+___$/.test(
                lines[i]
            )
        ) {

            paragraphLines.push(
                lines[i]
            );

            i++;
        }

        html.push(
            `<p>${paragraphLines
                .map(
                    markdownInlineToHTML
                )
                .join(
                    "<br>"
                )}</p>`
        );
    }

    return html.join(
        "\n"
    );
}


/* ============================================================
   LOAD
   ============================================================ */

loadButton.addEventListener(
    "click",
    () => {

        fileInput.click();
    }
);

fileInput.addEventListener(
    "change",
    async () => {

        const file =
            fileInput.files?.[0];

        if (!file) {
            return;
        }

        try {

            const markdown =
                await file.text();

            editor.innerHTML =
                markdownToHTML(
                    markdown
                );

            normalizeEditor();

            editor.focus();

            updateToolbarState();
            updateStatus();

        } catch (error) {

            console.error(
                "Error cargando Markdown:",
                error
            );
        }

        fileInput.value =
            "";
    }
);


/* ============================================================
   SAVE
   ============================================================ */

async function saveMarkdown() {

    const markdown =
        htmlToMarkdown();

    if (
        "showSaveFilePicker" in
        window
    ) {

        try {

            const handle =
                await window.showSaveFilePicker(
                    {
                        suggestedName:
                            "Markdown.md",

                        types: [
                            {
                                description:
                                    "Archivo Markdown",

                                accept: {
                                    "text/markdown":
                                        [".md"]
                                }
                            }
                        ]
                    }
                );

            const writable =
                await handle.createWritable();

            await writable.write(
                markdown
            );

            await writable.close();

            return;

        } catch (error) {

            if (
                error.name ===
                "AbortError"
            ) {
                return;
            }
        }
    }

    const blob =
        new Blob(
            [markdown],
            {
                type:
                    "text/markdown;charset=utf-8"
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const anchor =
        document.createElement(
            "a"
        );

    anchor.href =
        url;

    anchor.download =
        "Markdown.md";

    document.body.appendChild(
        anchor
    );

    anchor.click();

    anchor.remove();

    setTimeout(
        () => {

            URL.revokeObjectURL(
                url
            );

        },
        1000
    );
}

saveButton.addEventListener(
    "click",
    saveMarkdown
);


/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */

document.addEventListener(
    "keydown",
    event => {

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            event.key.toLowerCase() ===
            "s"
        ) {

            event.preventDefault();

            saveMarkdown();

            return;
        }

        if (
            (
                event.ctrlKey ||
                event.metaKey
            ) &&
            event.key.toLowerCase() ===
            "k"
        ) {

            event.preventDefault();

            openLinkModal();
        }
    }
);


/* ============================================================
   MODAL BACKDROPS
   ============================================================ */

linkModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            linkModal
        ) {

            closeLinkModal();
        }
    }
);

imageModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            imageModal
        ) {

            closeImageModal();
        }
    }
);


/* ============================================================
   INITIALIZATION
   ============================================================ */

function initialize() {

    normalizeEditor();

    updateToolbarState();

    updateStatus();
}

initialize();
