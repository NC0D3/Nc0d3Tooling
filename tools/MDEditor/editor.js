const editor=document.getElementById("document"),toolbar=document.getElementById("toolbar"),fileInput=document.getElementById("fileInput"),loadButton=document.getElementById("loadButton"),saveButton=document.getElementById("saveButton"),formatStatus=document.getElementById("formatStatus"),wordStatus=document.getElementById("wordStatus"),charStatus=document.getElementById("charStatus"),inlineCodeButton=document.getElementById("inlineCodeButton"),codeBlockButton=document.getElementById("codeBlockButton"),clearFormatButton=document.getElementById("clearFormatButton");
let savedRange=null,exporting=false,exportCancelRequested=false,exportWritable=null,loading=false;

function saveSelection(){
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    const range=selection.getRangeAt(0);
    if(editor.contains(range.commonAncestorContainer))savedRange=range.cloneRange();
}
function restoreSelection(){
    if(!savedRange)return false;
    try{
        const selection=window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
        return true;
    }catch(error){
        savedRange=null;
        return false;
    }
}
editor.addEventListener("mouseup",()=>{if(loading)return;saveSelection();updateToolbarState();});
editor.addEventListener("keyup",()=>{if(exporting||loading)return;saveSelection();updateToolbarState();updateStatus();});
document.addEventListener("selectionchange",()=>{
    if(exporting||loading)return;
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    const range=selection.getRangeAt(0);
    if(editor.contains(range.commonAncestorContainer)){
        savedRange=range.cloneRange();
        updateToolbarState();
    }
});
function getCurrentNode(){
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return null;
    let node=selection.anchorNode;
    if(!node)return null;
    if(node.nodeType===Node.TEXT_NODE)node=node.parentElement;
    return node;
}
function closestElement(selector){
    const node=getCurrentNode();
    if(!node)return null;
    if(node.nodeType===Node.ELEMENT_NODE)return node.closest(selector);
    return node.parentElement?.closest(selector)||null;
}
const EXCLUSIVE_INLINE_SELECTOR="strong,b,em,i,u,s,strike,del,code.inline-code";
function isExclusiveInlineElement(element){
    if(!element||element.nodeType!==Node.ELEMENT_NODE)return false;
    const tag=element.tagName.toLowerCase();
    if(tag==="strong"||tag==="b"||tag==="em"||tag==="i"||tag==="u"||tag==="s"||tag==="strike"||tag==="del")return true;
    return tag==="code"&&element.classList.contains("inline-code");
}
function unwrapInlineElement(element){
    if(!element||!element.parentNode)return;
    const parent=element.parentNode;
    while(element.firstChild)parent.insertBefore(element.firstChild,element);
    element.remove();
}
function unwrapExclusiveFormats(root){
    if(!root)return;
    [...root.querySelectorAll(EXCLUSIVE_INLINE_SELECTOR)].forEach(unwrapInlineElement);
}
function hasMeaningfulInlineContent(node){
    if(!node)return false;
    if(node.nodeType===Node.TEXT_NODE)return node.nodeValue.replace(/\u200B/g,"").replace(/\u00A0/g," ").trim().length>0;
    if(node.nodeType!==Node.ELEMENT_NODE)return false;
    if(node.tagName.toLowerCase()==="br")return false;
    for(const child of node.childNodes)if(hasMeaningfulInlineContent(child))return true;
    return false;
}
function fragmentHasMeaningfulContent(fragment){
    if(!fragment)return false;
    for(const child of fragment.childNodes)if(hasMeaningfulInlineContent(child))return true;
    return false;
}
function splitExclusiveAncestorsAtRange(range){
    let node=range.startContainer;
    if(node.nodeType===Node.TEXT_NODE)node=node.parentElement;
    while(node&&node!==editor){
        if(isExclusiveInlineElement(node)){
            const parent=node.parentNode;
            if(!parent)break;
            const after=node.cloneNode(false),tailRange=document.createRange();
            try{
                tailRange.setStart(range.startContainer,range.startOffset);
                tailRange.setEndAfter(node);
                const tail=tailRange.extractContents();
                if(fragmentHasMeaningfulContent(tail)){
                    after.appendChild(tail);
                    parent.insertBefore(after,node.nextSibling);
                }
                range.setStartAfter(node);
                range.collapse(true);
                node=parent;
            }catch(error){break;}
            continue;
        }
        node=node.parentElement;
    }
}
function getExclusiveAncestorAtRange(range,selector){
    if(!range)return null;
    let node=range.startContainer;
    if(node.nodeType===Node.TEXT_NODE)node=node.parentElement;
    if(!node||node.nodeType!==Node.ELEMENT_NODE)return null;
    return node.closest(selector);
}
function isInlineElementVisuallyEmpty(element){
    if(!element)return false;
    const clone=element.cloneNode(true);
    clone.querySelectorAll("br").forEach(br=>br.remove());
    return clone.textContent.replace(/\u200B/g,"").replace(/\u00A0/g,"").trim().length===0;
}
function deactivateExclusiveFormatAtCaret(range,selector){
    if(!range||!range.collapsed)return false;
    const activeElement=getExclusiveAncestorAtRange(range,selector);
    if(!activeElement)return false;
    const parent=activeElement.parentNode;
    if(!parent)return false;
    if(isInlineElementVisuallyEmpty(activeElement)){
        const marker=document.createTextNode("\u200B");
        parent.insertBefore(marker,activeElement);
        activeElement.remove();
        const plainRange=document.createRange();
        plainRange.setStart(marker,1);
        plainRange.collapse(true);
        const selection=window.getSelection();
        selection.removeAllRanges();
        selection.addRange(plainRange);
        return true;
    }
    const after=activeElement.cloneNode(false),tailRange=document.createRange();
    try{
        tailRange.setStart(range.startContainer,range.startOffset);
        tailRange.setEndAfter(activeElement);
        const tail=tailRange.extractContents();
        if(fragmentHasMeaningfulContent(tail))after.appendChild(tail);
    }catch(error){return false;}
    const hasTail=after.hasChildNodes()&&hasMeaningfulInlineContent(after);
    if(hasTail)parent.insertBefore(after,activeElement.nextSibling);
    const marker=document.createTextNode("\u200B");
    parent.insertBefore(marker,hasTail?after:activeElement.nextSibling);
    const plainRange=document.createRange();
    plainRange.setStart(marker,1);
    plainRange.collapse(true);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(plainRange);
    return true;
}
function selectionFullyInside(selector,range){
    if(!range)return false;
    if(range.collapsed){
        const node=range.startContainer;
        if(node.nodeType===Node.TEXT_NODE)return !!node.parentElement?.closest(selector);
        if(node.nodeType===Node.ELEMENT_NODE)return !!node.closest(selector);
        return false;
    }
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    let foundText=false,valid=true,node;
    while((node=walker.nextNode())){
        if(!node.nodeValue||!range.intersectsNode(node))continue;
        const meaningfulText=node.nodeValue.replace(/\u200B/g,"").length;
        if(!meaningfulText)continue;
        foundText=true;
        if(!node.parentElement?.closest(selector)){
            valid=false;
            break;
        }
    }
    if(!foundText)return closestElement(selector)!==null;
    return valid;
}
function createExclusiveElement(tagName){
    const element=document.createElement(tagName);
    if(tagName==="code")element.className="inline-code";
    return element;
}
function isBlockVisuallyEmpty(block){
    if(!block)return false;
    const clone=block.cloneNode(true);
    clone.querySelectorAll("br").forEach(br=>br.remove());
    return clone.textContent.replace(/\u200B/g,"").replace(/\u00A0/g," ").trim().length===0;
}
function removeEmptyBlockBreak(block){
    if(!block||!isBlockVisuallyEmpty(block))return;
    block.querySelectorAll("br").forEach(br=>br.remove());
}
function getCurrentEditableBlock(){
    const node=getCurrentNode();
    if(!node)return null;
    return node.closest("p,h1,h2,h3,h4,h5,h6,blockquote,li");
}
function editorHasMeaningfulContent(){
    for(const node of editor.childNodes){
        if(node.nodeType===Node.TEXT_NODE){
            if(node.nodeValue.replace(/\u200B/g,"").replace(/\u00A0/g," ").trim())return true;
            continue;
        }
        if(node.nodeType!==Node.ELEMENT_NODE)continue;
        if(node.matches("p,h1,h2,h3,h4,h5,h6,blockquote,li")){
            if(!isBlockVisuallyEmpty(node))return true;
            continue;
        }
        if(node.matches("pre,hr,img,p.md-image"))return true;
        if(hasMeaningfulInlineContent(node))return true;
    }
    return false;
}
editor.addEventListener("keydown",event=>{
    if(exporting||loading)return;
    if(event.key!=="Backspace"&&event.key!=="Delete")return;
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount||!selection.isCollapsed)return;
    const range=selection.getRangeAt(0),block=getCurrentEditableBlock();
    if(!block||!editor.contains(block)||!isBlockVisuallyEmpty(block)||editorHasMeaningfulContent())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    placeCaretAtStart(block);
    saveSelection();
    updateToolbarState();
    updateStatus();
},true);
function toggleExclusiveInlineFormat(tagName){
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    let range=selection.getRangeAt(0);
    const selector=tagName==="code"?"code.inline-code":tagName;
    if(range.collapsed){
        const currentBlock=getCurrentNode()?.closest("p,h1,h2,h3,h4,h5,h6,blockquote,li");
        if(currentBlock&&isBlockVisuallyEmpty(currentBlock)){
            removeEmptyBlockBreak(currentBlock);
            placeCaretAtStart(currentBlock);
            const newSelection=window.getSelection();
            if(newSelection&&newSelection.rangeCount)range=newSelection.getRangeAt(0);
        }
        if(selectionFullyInside(selector,range)){
            if(deactivateExclusiveFormatAtCaret(range,selector)){
                saveSelection();
                normalizeEditor();
                updateToolbarState();
                updateStatus();
                return;
            }
        }
        splitExclusiveAncestorsAtRange(range);
        const element=createExclusiveElement(tagName);
        element.textContent="\u200B";
        range.insertNode(element);
        const newRange=document.createRange();
        newRange.selectNodeContents(element);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);
        saveSelection();
        normalizeEditor();
        updateToolbarState();
        updateStatus();
        return;
    }
    const alreadyActive=selectionFullyInside(selector,range);
    const fragment=range.extractContents();
    unwrapExclusiveFormats(fragment);
    splitExclusiveAncestorsAtRange(range);
    if(alreadyActive)range.insertNode(fragment);
    else{
        const element=createExclusiveElement(tagName);
        element.appendChild(fragment);
        range.insertNode(element);
    }
    try{
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }catch(error){placeCaretAtEnd(editor);}
    saveSelection();
    normalizeEditor();
    updateToolbarState();
    updateStatus();
}
function exec(command,value=null){
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    document.execCommand(command,false,value);
    saveSelection();
    normalizeEditor();
    updateToolbarState();
    updateStatus();
}
function formatBlock(tag){
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const current=getCurrentNode(),bq=current?.closest("blockquote"),currentBlock=current?.closest("p,h1,h2,h3,h4,h5,h6,blockquote");
    if(currentBlock&&/^H[1-6]$/.test(currentBlock.tagName)&&currentBlock.tagName.toLowerCase()===tag)document.execCommand("formatBlock",false,"p");
    else if(bq&&tag==="p"){
        const p=document.createElement("p");
        p.innerHTML=bq.innerHTML;
        bq.replaceWith(p);
        placeCaretAtEnd(p);
    }else if(bq&&tag==="blockquote"){
        formatBlock("p");
        return;
    }else document.execCommand("formatBlock",false,tag);
    saveSelection();
    normalizeEditor();
    updateToolbarState();
    updateStatus();
}
toolbar.addEventListener("mousedown",event=>{
    if(exporting||loading){event.preventDefault();return;}
    const button=event.target.closest(".tool");
    if(button)event.preventDefault();
});
toolbar.addEventListener("click",event=>{
    if(exporting||loading)return;
    const button=event.target.closest(".tool");
    if(!button)return;
    const command=button.dataset.command,action=button.dataset.action,format=button.dataset.format;
    if(format){toggleExclusiveInlineFormat(format);return;}
    if(command){exec(command);return;}
    if(!action)return;
    switch(action){
        case "paragraph":formatBlock("p");break;
        case "h1":formatBlock("h1");break;
        case "h2":formatBlock("h2");break;
        case "h3":formatBlock("h3");break;
        case "h4":formatBlock("h4");break;
        case "h5":formatBlock("h5");break;
        case "h6":formatBlock("h6");break;
        case "unorderedList":exec("insertUnorderedList");break;
        case "orderedList":exec("insertOrderedList");break;
        case "blockquote":formatBlock("blockquote");break;
        case "horizontalRule":exec("insertHorizontalRule");break;
    }
});
function getInlineCode(){return closestElement("code.inline-code");}
function unwrapInlineCode(code){unwrapInlineElement(code);}
function toggleInlineCode(){toggleExclusiveInlineFormat("code");}
inlineCodeButton.addEventListener("click",toggleInlineCode);
function getCodeBlock(){return closestElement("pre.code-block");}
function getCodeElement(){return closestElement("pre.code-block code");}
function removeCodeBlock(pre){
    if(!pre)return;
    const code=pre.querySelector("code"),content=code?code.textContent:pre.textContent,lines=content.split("\n"),fragment=document.createDocumentFragment();
    lines.forEach(line=>{
        const p=document.createElement("p");
        if(line.trim().length===0)p.innerHTML="<br>";
        else p.textContent=line;
        fragment.appendChild(p);
    });
    const firstP=fragment.firstChild;
    pre.replaceWith(fragment);
    if(firstP)placeCaretAtStart(firstP);
    saveSelection();
    updateToolbarState();
    updateStatus();
}
function enterCodeBlock(){
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    const current=getCurrentNode();
    let block=current?.closest("p,div,h1,h2,h3,h4,h5,h6,blockquote");
    if(!block||!editor.contains(block)){
        block=document.createElement("p");
        block.innerHTML="<br>";
        editor.appendChild(block);
    }
    const pre=document.createElement("pre"),code=document.createElement("code");
    pre.className="code-block";
    code.textContent=block.textContent||"";
    pre.appendChild(code);
    block.replaceWith(pre);
    placeCaretAtEnd(code);
    saveSelection();
    updateToolbarState();
    updateStatus();
}
function toggleCodeBlock(){
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const existing=getCodeBlock();
    if(existing){removeCodeBlock(existing);return;}
    enterCodeBlock();
}
codeBlockButton.addEventListener("click",toggleCodeBlock);
editor.addEventListener("keydown",event=>{
    if(exporting||loading||event.key!=="Enter")return;
    const code=getCodeElement();
    if(!code)return;
    event.preventDefault();
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    const range=selection.getRangeAt(0);
    range.deleteContents();
    const newline=document.createTextNode("\n");
    range.insertNode(newline);
    range.setStartAfter(newline);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveSelection();
    updateToolbarState();
    updateStatus();
});
function clearInlineFormattingFromBlock(block){
    if(!block||!editor.contains(block))return;
    [...block.querySelectorAll(EXCLUSIVE_INLINE_SELECTOR)].forEach(unwrapInlineElement);
}
editor.addEventListener("keydown",event=>{
    if(exporting||loading||event.key!=="Enter"||event.shiftKey)return;
    if(getCurrentNode()?.closest("pre.code-block"))return;
    const current=getCurrentNode(),heading=current?.closest("h1,h2,h3,h4,h5,h6");
    if(!heading||!editor.contains(heading))return;
    event.preventDefault();
    const paragraph=document.createElement("p");
    paragraph.innerHTML="<br>";
    heading.after(paragraph);
    placeCaretAtStart(paragraph);
    saveSelection();
    updateToolbarState();
    updateStatus();
});
editor.addEventListener("keydown",event=>{
    if(exporting||loading||event.key!=="Enter"||event.shiftKey||event.defaultPrevented)return;
    const current=getCurrentNode();
    if(current?.closest("pre.code-block"))return;
    const oldBlock=current?.closest("p,blockquote,li");
    if(!oldBlock)return;
    requestAnimationFrame(()=>{
        if(loading)return;
        const newCurrent=getCurrentNode(),newBlock=newCurrent?.closest("p,blockquote,li");
        if(!newBlock||!editor.contains(newBlock)||newBlock===oldBlock)return;
        clearInlineFormattingFromBlock(newBlock);
        saveSelection();
        normalizeEditor();
        updateToolbarState();
        updateStatus();
    });
});
clearFormatButton.addEventListener("click",()=>{
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    document.execCommand("removeFormat",false,null);
    const range=selection.getRangeAt(0);
    editor.querySelectorAll("code.inline-code").forEach(code=>{
        if(range.intersectsNode(code))unwrapInlineCode(code);
    });
    saveSelection();
    normalizeEditor();
    updateToolbarState();
    updateStatus();
});
const linkModal=document.getElementById("linkModal"),linkUrl=document.getElementById("linkUrl"),linkText=document.getElementById("linkText"),cancelLink=document.getElementById("cancelLink"),applyLink=document.getElementById("applyLink"),linkButton=document.getElementById("linkButton"),unlinkButton=document.getElementById("unlinkButton");
function openLinkModal(){
    if(exporting||loading)return;
    saveSelection();
    const selection=window.getSelection();
    linkText.value=selection?.toString()||"";
    linkUrl.value="";
    linkModal.classList.add("open");
    setTimeout(()=>linkUrl.focus(),50);
}
function closeLinkModal(){linkModal.classList.remove("open");}
linkButton.addEventListener("click",openLinkModal);
cancelLink.addEventListener("click",closeLinkModal);
applyLink.addEventListener("click",()=>{
    if(exporting||loading)return;
    restoreSelection();
    editor.focus();
    const url=linkUrl.value.trim();
    if(!url)return;
    const text=linkText.value.trim(),selection=window.getSelection();
    if(!selection||!selection.rangeCount)return;
    const range=selection.getRangeAt(0),anchor=document.createElement("a");
    anchor.href=url;
    anchor.target="_blank";
    anchor.rel="noopener noreferrer";
    if(range.collapsed){
        anchor.textContent=text||url;
        range.insertNode(anchor);
    }else{
        const selected=range.extractContents();
        anchor.appendChild(selected);
        range.insertNode(anchor);
    }
    placeCaretAtEnd(anchor);
    saveSelection();
    closeLinkModal();
    updateToolbarState();
    updateStatus();
});
unlinkButton.addEventListener("click",()=>{if(!exporting&&!loading)exec("unlink");});
let selectedImage=null;
function nextImageId(){
    const images=editor.querySelectorAll("p.md-image img");
    let max=0;
    images.forEach(image=>{
        const match=(image.id||"").match(/^evidencia_(\d+)$/);
        if(match)max=Math.max(max,Number(match[1]));
    });
    return `evidencia_${String(max+1).padStart(3,"0")}`;
}
function insertImageFile(file){
    if(exporting||loading||!file||!file.type.startsWith("image/"))return;
    const reader=new FileReader();
    reader.onload=event=>{
        if(exporting||loading)return;
        const id=nextImageId(),wrapper=document.createElement("p");
        wrapper.className="md-image";
        wrapper.id=id;
        wrapper.setAttribute("align","center");
        const image=document.createElement("img");
        image.id=id;
        image.alt="";
        image.src=event.target.result;
        image.style.width="80%";
        wrapper.appendChild(image);
        restoreSelection();
        editor.focus();
        const selection=window.getSelection();
        if(selection&&selection.rangeCount){
            const range=selection.getRangeAt(0);
            range.collapse(false);
            range.insertNode(wrapper);
            const paragraph=document.createElement("p");
            paragraph.innerHTML="<br>";
            wrapper.after(paragraph);
            placeCaretAtStart(paragraph);
        }else editor.appendChild(wrapper);
        saveSelection();
        updateStatus();
    };
    reader.readAsDataURL(file);
}
editor.addEventListener("paste",event=>{
    if(exporting||loading)return;
    const clipboard=event.clipboardData;
    if(!clipboard)return;
    const images=[...clipboard.items].filter(item=>item.kind==="file"&&item.type.startsWith("image/"));
    if(!images.length)return;
    event.preventDefault();
    images.forEach(item=>{
        const file=item.getAsFile();
        if(file)insertImageFile(file);
    });
},true);
editor.addEventListener("dragover",event=>{
    if(exporting||loading)return;
    const files=[...event.dataTransfer.files];
    if(files.some(file=>file.type.startsWith("image/")))event.preventDefault();
});
editor.addEventListener("drop",event=>{
    if(exporting||loading)return;
    const files=[...event.dataTransfer.files],images=files.filter(file=>file.type.startsWith("image/"));
    if(!images.length)return;
    event.preventDefault();
    images.forEach(insertImageFile);
});
editor.addEventListener("click",event=>{
    if(exporting||loading||event.target.tagName!=="IMG")return;
    const image=event.target;
    if(!image.closest("p.md-image"))return;
    openImageModal(image);
});
const imageModal=document.getElementById("imageModal"),imageSizeMode=document.getElementById("imageSizeMode"),imageSizeValue=document.getElementById("imageSizeValue"),imageSizeValueContainer=document.getElementById("imageSizeValueContainer"),imageAlt=document.getElementById("imageAlt"),applyImage=document.getElementById("applyImage"),cancelImage=document.getElementById("cancelImage"),removeImage=document.getElementById("removeImage");
function openImageModal(image){
    if(exporting||loading)return;
    selectedImage=image;
    image.classList.add("selected-image");
    const width=image.style.width;
    if(!width||width==="auto")imageSizeMode.value="auto";
    else if(width.endsWith("%")){
        imageSizeMode.value="percent";
        imageSizeValue.value=parseFloat(width);
    }else if(width.endsWith("px")){
        imageSizeMode.value="px";
        imageSizeValue.value=parseFloat(width);
    }
    imageAlt.value=image.alt||"";
    updateImageSizeInput();
    imageModal.classList.add("open");
}
function closeImageModal(){
    if(selectedImage)selectedImage.classList.remove("selected-image");
    selectedImage=null;
    imageModal.classList.remove("open");
}
function updateImageSizeInput(){
    if(imageSizeMode.value==="auto"){
        imageSizeValueContainer.style.display="none";
        return;
    }
    imageSizeValueContainer.style.display="block";
    if(imageSizeMode.value==="percent"){
        imageSizeValue.min=10;
        imageSizeValue.max=100;
    }else{
        imageSizeValue.min=50;
        imageSizeValue.max=3000;
    }
}
imageSizeMode.addEventListener("change",updateImageSizeInput);
cancelImage.addEventListener("click",closeImageModal);
applyImage.addEventListener("click",()=>{
    if(!selectedImage||exporting||loading)return;
    const mode=imageSizeMode.value,value=parseFloat(imageSizeValue.value);
    if(mode==="auto")selectedImage.style.width="auto";
    else if(mode==="percent"&&Number.isFinite(value))selectedImage.style.width=`${Math.min(100,Math.max(10,value))}%`;
    else if(mode==="px"&&Number.isFinite(value))selectedImage.style.width=`${Math.max(50,value)}px`;
    selectedImage.alt=imageAlt.value;
    closeImageModal();
    updateStatus();
});
removeImage.addEventListener("click",()=>{
    if(selectedImage){
        const wrapper=selectedImage.closest("p.md-image");
        wrapper?.remove();
    }
    closeImageModal();
    synchronizeImageIds();
    updateStatus();
});
function synchronizeImageIds(){
    const wrappers=editor.querySelectorAll("p.md-image");
    wrappers.forEach((wrapper,index)=>{
        const id=`evidencia_${String(index+1).padStart(3,"0")}`,image=wrapper.querySelector("img");
        if(!image)return;
        wrapper.id=id;
        image.id=id;
        if(!image.style.width)image.style.width="80%";
    });
}
function updateToolbarState(){
    if(exporting||loading)return;
    const selection=window.getSelection();
    const range=selection&&selection.rangeCount?selection.getRangeAt(0):null;
    toolbar.querySelectorAll(".tool[data-format]").forEach(button=>{
        const format=button.dataset.format;
        button.classList.toggle("active",!!(range&&selectionFullyInside(format,range)));
    });
    inlineCodeButton.classList.toggle("active",!!(range&&selectionFullyInside("code.inline-code",range)));
    codeBlockButton.classList.toggle("active",!!getCodeBlock());
    const node=getCurrentNode();
    if(!node)return;
    const block=node.closest("h1,h2,h3,h4,h5,h6,blockquote,p,pre,li");
    toolbar.querySelectorAll("[data-action]").forEach(button=>{
        const action=button.dataset.action;
        let active=false;
        if(block){
            switch(action){
                case "paragraph":active=block.tagName==="P";break;
                case "h1":active=block.tagName==="H1";break;
                case "h2":active=block.tagName==="H2";break;
                case "h3":active=block.tagName==="H3";break;
                case "h4":active=block.tagName==="H4";break;
                case "h5":active=block.tagName==="H5";break;
                case "h6":active=block.tagName==="H6";break;
                case "blockquote":active=block.tagName==="BLOCKQUOTE";break;
                case "unorderedList":active=!!block.closest("ul:not(.task-list)");break;
                case "orderedList":active=!!block.closest("ol");break;
            }
        }
        button.classList.toggle("active",active);
    });
}
function updateStatus(){
    if(exporting||loading)return;
    const text=editor.innerText.replace(/\s+/g," ").trim(),words=text?text.split(/\s+/).length:0;
    wordStatus.textContent=`${words}${words===1?" palabra":" palabras"}`;
    charStatus.textContent=`${text.length}${text.length===1?" carácter":" caracteres"}`;
    const node=getCurrentNode();
    if(!node){
        formatStatus.textContent="Normal";
        return;
    }
    if(getCodeBlock()){
        formatStatus.textContent="Código";
        return;
    }
    const block=node.closest("h1,h2,h3,h4,h5,h6,blockquote,pre,p,li");
    formatStatus.textContent=block?(block.tagName==="BLOCKQUOTE"?"Cita":block.tagName):"Normal";
}
function placeCaretAtEnd(element){
    if(!element)return;
    const range=document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
}
function placeCaretAtStart(element){
    if(!element)return;
    const range=document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection=window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
}
function normalizeExclusiveFormatting(){
    [...editor.querySelectorAll(EXCLUSIVE_INLINE_SELECTOR)].forEach(element=>{
        let parent=element.parentElement;
        while(parent&&parent!==editor){
            if(isExclusiveInlineElement(parent)){
                unwrapInlineElement(element);
                break;
            }
            parent=parent.parentElement;
        }
    });
}
function normalizeEditor(){
    editor.querySelectorAll(":scope > div").forEach(div=>{
        if(!div.className){
            const p=document.createElement("p");
            p.innerHTML=div.innerHTML;
            div.replaceWith(p);
        }
    });
    normalizeExclusiveFormatting();
    synchronizeImageIds();
}
function escapeAttribute(value){
    return String(value).replace(/&/g,"&amp;").replace(/'/g,"&#39;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escapeMarkdownText(value){
    return String(value).replace(/\\/g,"\\\\").replace(/([\\`\*\_#[\]{}()+\-.!>])/g,"\\$1");
}
function childrenToMarkdown(node){
    if(!node)return "";
    return [...node.childNodes].map(inlineToMarkdown).join("");
}
function inlineToMarkdown(node){
    if(node.nodeType===Node.TEXT_NODE)return escapeMarkdownText(node.nodeValue.replace(/\u200B/g,"").replace(/\u00a0/g," "));
    if(node.nodeType!==Node.ELEMENT_NODE)return "";
    const tag=node.tagName.toLowerCase();
    if(tag==="br")return "\n";
    if(tag==="strong"||tag==="b")return `**${childrenToMarkdown(node)}**`;
    if(tag==="em"||tag==="i")return `*${childrenToMarkdown(node)}*`;
    if(tag==="u")return `<u>${childrenToMarkdown(node)}</u>`;
    if(tag==="s"||tag==="strike"||tag==="del")return `~~${childrenToMarkdown(node)}~~`;
    if(tag==="code"&&node.classList.contains("inline-code"))return `\`${node.textContent.replace(/\u200B/g,"")}\``;
    if(tag==="a")return `[${childrenToMarkdown(node)}](${node.getAttribute("href")||""})`;
    if(tag==="span"||tag==="font")return childrenToMarkdown(node);
    return childrenToMarkdown(node);
}
function isMarkdownBlockElement(node){
    if(!node||node.nodeType!==Node.ELEMENT_NODE)return false;
    const tag=node.tagName.toLowerCase();
    return /^h[1-6]$/.test(tag)||tag==="p"||tag==="div"||tag==="blockquote"||tag==="ul"||tag==="ol"||tag==="li"||tag==="pre"||tag==="hr";
}
function serializeMixedChildren(node){
    if(!node)return "";
    const output=[];
    for(const child of node.childNodes){
        if(child.nodeType===Node.TEXT_NODE){
            output.push(escapeMarkdownText(child.nodeValue.replace(/\u200B/g,"").replace(/\u00a0/g," ")));
            continue;
        }
        if(child.nodeType!==Node.ELEMENT_NODE)continue;
        const tag=child.tagName.toLowerCase();
        if(tag==="ul"||tag==="ol"||tag==="blockquote"||tag==="pre"||tag==="hr"||/^h[1-6]$/.test(tag)||tag==="p"||tag==="div")output.push(blockToMarkdown(child));
        else output.push(inlineToMarkdown(child));
    }
    return output.join("");
}
function listItemInlineMarkdown(li){
    if(!li)return "";
    const output=[];
    for(const child of li.childNodes){
        if(child.nodeType===Node.TEXT_NODE){
            output.push(escapeMarkdownText(child.nodeValue.replace(/\u200B/g,"").replace(/\u00a0/g," ")));
            continue;
        }
        if(child.nodeType!==Node.ELEMENT_NODE)continue;
        const tag=child.tagName.toLowerCase();
        if(tag==="ul"||tag==="ol")continue;
        if(tag==="p"||tag==="div")output.push(serializeMixedChildren(child).trim());
        else output.push(inlineToMarkdown(child));
    }
    return output.join("").trim();
}
function serializeNestedList(list,indent="    "){
    const markdown=blockToMarkdown(list).trimEnd();
    return markdown.split("\n").map(line=>line?indent+line:"").join("\n");
}
function blockToMarkdown(node){
    if(!node)return "";
    if(node.nodeType===Node.TEXT_NODE)return escapeMarkdownText(node.nodeValue.replace(/\u200B/g,""));
    if(node.nodeType!==Node.ELEMENT_NODE)return "";
    const tag=node.tagName.toLowerCase();
    if(tag==="p"&&node.classList.contains("md-image")){
        const image=node.querySelector("img");
        if(!image)return "";
        const id=image.id||node.id||"evidencia_001",alt=escapeAttribute(image.alt||""),src=image.getAttribute("src")||"";
        return `<p align='center' id='${id}'>
    <img
        id='${id}'
        alt='${alt}'
        src='${src}'>
</p>
`;
    }
    if(/^h[1-6]$/.test(tag)){
        const content=serializeMixedChildren(node).trim();
        return `${"#".repeat(Number(tag.substring(1)))} ${content}\n\n`;
    }
    if(tag==="p"){
        const content=serializeMixedChildren(node).trim();
        return content?`${content}\n\n`:"\n";
    }
    if(tag==="blockquote"){
        const content=serializeMixedChildren(node).trim();
        if(!content)return ">\n\n";
        return content.split("\n").map(line=>line.length?`> ${line}`:">").join("\n")+"\n\n";
    }
    if(tag==="hr")return "---\n\n";
    if(tag==="pre"&&node.classList.contains("code-block")){
        const content=node.textContent.replace(/\u200B/g,"").replace(/\n$/,"");
        return `\`\`\`\n${content}\n\`\`\`\n`;
    }
    if(tag==="ul"||tag==="ol"){
        const ordered=tag==="ol",items=[...node.children].filter(child=>child.tagName.toLowerCase()==="li");
        if(!items.length)return "";
        const lines=[];
        items.forEach((li,index)=>{
            const content=listItemInlineMarkdown(li);
            lines.push(ordered?`${index+1}. ${content}`:`- ${content}`);
            [...li.children].filter(child=>{
                const childTag=child.tagName.toLowerCase();
                return childTag==="ul"||childTag==="ol";
            }).forEach(nested=>lines.push(serializeNestedList(nested)));
        });
        return lines.join("\n")+"\n\n";
    }
    if(tag==="li")return listItemInlineMarkdown(node)+"\n\n";
    if(tag==="pre"){
        const content=node.textContent.replace(/\u200B/g,"").replace(/\n$/,"");
        return `\`\`\`\n${content}\n\`\`\`\n`;
    }
    return serializeMixedChildren(node);
}
function utf8Length(text){
    let bytes=0;
    for(let i=0;i<text.length;i++){
        const code=text.charCodeAt(i);
        if(code>=0xD800&&code<=0xDBFF&&i+1<text.length){
            const next=text.charCodeAt(++i);
            if(next>=0xDC00&&next<=0xDFFF){bytes+=4;continue;}
        }
        bytes+=code<=0x7F?1:code<=0x7FF?2:3;
    }
    return bytes;
}
function escapedMarkdownByteLength(text){
    let bytes=0;
    const escaped=new Set(["\\","`","*","_","#","[","]","{","}","(",")","+","-",".","!"]);
    for(let i=0;i<text.length;i++){
        const char=text[i];
        if(char==="\u200B")continue;
        if(char==="\u00A0"){
            bytes++;
            continue;
        }
        if(escaped.has(char))bytes++;
        const code=text.charCodeAt(i);
        if(code>=0xD800&&code<=0xDBFF&&i+1<text.length){
            const next=text.charCodeAt(++i);
            if(next>=0xDC00&&next<=0xDFFF){bytes+=4;continue;}
        }
        bytes+=code<=0x7F?1:code<=0x7FF?2:3;
    }
    return bytes;
}
function estimateInlineBytes(node){
    if(!node)return 0;
    if(node.nodeType===Node.TEXT_NODE)return escapedMarkdownByteLength(node.nodeValue);
    if(node.nodeType!==Node.ELEMENT_NODE)return 0;
    const tag=node.tagName.toLowerCase();
    if(tag==="br")return 1;
    let content=0;
    for(const child of node.childNodes)content+=estimateInlineBytes(child);
    if(tag==="strong"||tag==="b")return 4+content;
    if(tag==="em"||tag==="i")return 2+content;
    if(tag==="u")return 7+content;
    if(tag==="s"||tag==="strike"||tag==="del")return 4+content;
    if(tag==="code"&&node.classList.contains("inline-code"))return 2+utf8Length(node.textContent.replace(/\u200B/g,""));
    if(tag==="a")return 4+utf8Length(node.getAttribute("href")||"")+content;
    return content;
}
function estimateBlockBytes(node){
    if(!node)return 0;
    if(node.nodeType===Node.TEXT_NODE)return escapedMarkdownByteLength(node.nodeValue);
    if(node.nodeType!==Node.ELEMENT_NODE)return 0;
    const tag=node.tagName.toLowerCase();
    if(tag==="p"&&node.classList.contains("md-image")){
        const image=node.querySelector("img");
        if(!image)return 0;
        const id=image.id||node.id||"evidencia_001",alt=escapeAttribute(image.alt||""),src=image.getAttribute("src")||"";
        return utf8Length(`<p align='center' id='${id}'>
    <img
        id='${id}'
        alt='${alt}'
        src=''>${src}
</p>
`);
    }
    if(/^h[1-6]$/.test(tag))return Number(tag.substring(1))+1+estimateInlineBytes(node)+2;
    if(tag==="p"){
        const content=estimateInlineBytes(node);
        return content?content+2:1;
    }
    if(tag==="blockquote"){
        const content=estimateInlineBytes(node);
        return content?content+4:3;
    }
    if(tag==="hr")return 4;
    if(tag==="pre")return 8+utf8Length(node.textContent.replace(/\u200B/g,"").replace(/\n$/,""));
    if(tag==="ul"||tag==="ol"){
        let total=0,index=1;
        for(const li of [...node.children].filter(child=>child.tagName.toLowerCase()==="li")){
            const content=estimateInlineBytes(li);
            total+=(tag==="ol"?String(index++).length+2:2)+content+1;
            for(const nested of [...li.children].filter(child=>{
                const nestedTag=child.tagName.toLowerCase();
                return nestedTag==="ul"||nestedTag==="ol";
            }))total+=estimateBlockBytes(nested)+4;
        }
        return total+1;
    }
    if(tag==="li")return estimateInlineBytes(node)+2;
    return estimateInlineBytes(node);
}
function estimateMarkdownBytes(){
    synchronizeImageIds();
    let total=0;
    for(const node of editor.childNodes){
        if(node.nodeType===Node.TEXT_NODE){
            const text=node.nodeValue.replace(/\u200B/g,"").trim();
            if(text)total+=escapedMarkdownByteLength(text)+2;
        }else if(node.nodeType===Node.ELEMENT_NODE)total+=estimateBlockBytes(node);
    }
    return Math.max(total,1);
}
function normalizeMarkdownChunk(text,state,final=false){
    if(!text)return "";
    const combined=state.tail+text;
    state.tail="";
    let output=combined.replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n");
    if(!final){
        const keep=Math.min(2,output.length);
        state.tail=output.slice(-keep);
        output=output.slice(0,-keep);
    }
    return output;
}
async function* markdownChunks(){
    synchronizeImageIds();
    const state={tail:""};
    for(const node of editor.childNodes){
        let chunk="";
        if(node.nodeType===Node.TEXT_NODE){
            const text=node.nodeValue.replace(/\u200B/g,"").trim();
            if(text)chunk=`${escapeMarkdownText(text)}\n\n`;
        }else if(node.nodeType===Node.ELEMENT_NODE)chunk=blockToMarkdown(node);
        if(!chunk)continue;
        const normalized=normalizeMarkdownChunk(chunk,state,false);
        if(normalized)yield normalized;
        await new Promise(resolve=>setTimeout(resolve,0));
    }
    let finalChunk=normalizeMarkdownChunk("",state,true);
    finalChunk=finalChunk.replace(/\n{3,}/g,"\n\n").trim();
    if(finalChunk)yield `${finalChunk}\n`;
}
async function htmlToMarkdown(){
    let result="";
    for await(const chunk of markdownChunks())result+=chunk;
    return result;
}
function createExportOverlay(){
    if(document.getElementById("markdownExportOverlay"))return;
    const style=document.createElement("style");
    style.id="markdownExportOverlayStyle";
    style.textContent=`
#markdownExportOverlay{position:fixed;inset:0;z-index:999999;background:rgba(8,10,14,.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .18s ease}
#markdownExportOverlay.open{opacity:1;pointer-events:all}
#markdownExportPanel{width:min(520px,calc(100vw - 40px));box-sizing:border-box;background:#151820;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:30px;box-shadow:0 25px 80px rgba(0,0,0,.45);font-family:inherit;color:#fff}
#markdownExportTitle{font-size:21px;font-weight:700;margin:0 0 8px}
#markdownExportStatus{font-size:13px;opacity:.65;margin-bottom:24px}
#markdownExportPercent{font-size:38px;font-weight:700;text-align:center;margin-bottom:18px;letter-spacing:-1px}
#markdownExportTrack{height:10px;background:rgba(255,255,255,.09);border-radius:99px;overflow:hidden}
#markdownExportBar{height:100%;width:0%;background:currentColor;border-radius:99px;transition:width .08s linear}
#markdownExportInfo{display:flex;justify-content:space-between;gap:15px;margin-top:12px;font-size:12px;opacity:.65}
#markdownExportCancel{display:block;width:100%;margin-top:24px;padding:11px 16px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.05);color:inherit;cursor:pointer;font:inherit}
#markdownExportCancel:hover{background:rgba(255,255,255,.1)}
#markdownExportCancel:disabled{opacity:.45;cursor:not-allowed}
`;
    document.head.appendChild(style);
    const overlay=document.createElement("div");
    overlay.id="markdownExportOverlay";
    overlay.innerHTML=`
<div id="markdownExportPanel" role="dialog" aria-modal="true">
    <div id="markdownExportTitle">Exportando documento</div>
    <div id="markdownExportStatus">Preparando archivo...</div>
    <div id="markdownExportPercent">0%</div>
    <div id="markdownExportTrack"><div id="markdownExportBar"></div></div>
    <div id="markdownExportInfo"><span id="markdownExportWritten">0 B</span><span id="markdownExportTotal">Calculando...</span></div>
    <button id="markdownExportCancel" type="button">Cancelar exportación</button>
</div>`;
    document.body.appendChild(overlay);
    document.getElementById("markdownExportCancel").addEventListener("click",cancelMarkdownExport);
}
function showExportOverlay(totalBytes){
    createExportOverlay();
    exportCancelRequested=false;
    const overlay=document.getElementById("markdownExportOverlay");
    const percent=document.getElementById("markdownExportPercent"),bar=document.getElementById("markdownExportBar"),written=document.getElementById("markdownExportWritten"),total=document.getElementById("markdownExportTotal"),status=document.getElementById("markdownExportStatus"),cancel=document.getElementById("markdownExportCancel");
    status.textContent="Escribiendo archivo por partes...";
    percent.textContent="0%";
    bar.style.width="0%";
    written.textContent="0 B";
    total.textContent=formatBytes(totalBytes);
    cancel.disabled=false;
    cancel.textContent="Cancelar exportación";
    overlay.classList.add("open");
}
function updateExportProgress(writtenBytes,totalBytes){
    const percent=Math.min(100,totalBytes>0?(writtenBytes/totalBytes)*100:0),rounded=percent>=99.95?100:Math.floor(percent*100)/100;
    const bar=document.getElementById("markdownExportBar"),percentElement=document.getElementById("markdownExportPercent"),written=document.getElementById("markdownExportWritten");
    if(bar)bar.style.width=`${percent}%`;
    if(percentElement)percentElement.textContent=`${rounded.toFixed(rounded<10?1:0)}%`;
    if(written)written.textContent=formatBytes(writtenBytes);
}
function setExportStatus(text){
    const element=document.getElementById("markdownExportStatus");
    if(element)element.textContent=text;
}
function hideExportOverlay(){
    const overlay=document.getElementById("markdownExportOverlay");
    if(overlay)overlay.classList.remove("open");
}
function setExportFinished(){
    const percent=document.getElementById("markdownExportPercent"),bar=document.getElementById("markdownExportBar"),cancel=document.getElementById("markdownExportCancel");
    if(percent)percent.textContent="100%";
    if(bar)bar.style.width="100%";
    if(cancel){
        cancel.disabled=true;
        cancel.textContent="Exportación completada";
    }
    setExportStatus("Archivo guardado correctamente");
}
function setExportCancelled(){
    const cancel=document.getElementById("markdownExportCancel");
    if(cancel){
        cancel.disabled=true;
        cancel.textContent="Exportación cancelada";
    }
    setExportStatus("Exportación cancelada");
}
function setExportError(){
    const cancel=document.getElementById("markdownExportCancel");
    if(cancel){
        cancel.disabled=true;
        cancel.textContent="Cerrar";
    }
    setExportStatus("Ocurrió un error al guardar el archivo");
}
function cancelMarkdownExport(){
    if(!exporting)return;
    exportCancelRequested=true;
    const cancel=document.getElementById("markdownExportCancel");
    if(cancel){
        cancel.disabled=true;
        cancel.textContent="Cancelando...";
    }
}
function formatBytes(bytes){
    if(!Number.isFinite(bytes)||bytes<=0)return"0 B";
    const units=["B","KB","MB","GB","TB"],index=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1),value=bytes/Math.pow(1024,index);
    return `${value>=100?value.toFixed(0):value>=10?value.toFixed(1):value.toFixed(2)} ${units[index]}`;
}
function lockEditorForExport(){
    editor.setAttribute("contenteditable","false");
    toolbar.setAttribute("aria-disabled","true");
    if(saveButton)saveButton.setAttribute("aria-disabled","true");
    if(loadButton)loadButton.setAttribute("aria-disabled","true");
    if(inlineCodeButton)inlineCodeButton.setAttribute("aria-disabled","true");
    if(codeBlockButton)codeBlockButton.setAttribute("aria-disabled","true");
    if(clearFormatButton)clearFormatButton.setAttribute("aria-disabled","true");
}
function unlockEditorAfterExport(){
    editor.setAttribute("contenteditable","true");
    toolbar.removeAttribute("aria-disabled");
    if(saveButton)saveButton.removeAttribute("aria-disabled");
    if(loadButton)loadButton.removeAttribute("aria-disabled");
    if(inlineCodeButton)inlineCodeButton.removeAttribute("aria-disabled");
    if(codeBlockButton)codeBlockButton.removeAttribute("aria-disabled");
    updateToolbarState();
    updateStatus();
}
function createLoadOverlay(){
    if(document.getElementById("markdownLoadOverlay"))return;
    const style=document.createElement("style");
    style.id="markdownLoadOverlayStyle";
    style.textContent=`
#markdownLoadOverlay{position:fixed;inset:0;z-index:1000000;background:rgba(8,10,14,.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .18s ease}
#markdownLoadOverlay.open{opacity:1;pointer-events:all}
#markdownLoadPanel{width:min(420px,calc(100vw - 40px));box-sizing:border-box;background:#151820;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:30px;box-shadow:0 25px 80px rgba(0,0,0,.45);font-family:inherit;color:#fff;text-align:center}
#markdownLoadTitle{font-size:21px;font-weight:700;margin-bottom:8px}
#markdownLoadStatus{font-size:13px;opacity:.65;margin-bottom:24px}
#markdownLoadSpinner{width:42px;height:42px;margin:0 auto;border:4px solid rgba(255,255,255,.12);border-top-color:currentColor;border-radius:50%;animation:markdownLoadSpin .75s linear infinite}
@keyframes markdownLoadSpin{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(style);
    const overlay=document.createElement("div");
    overlay.id="markdownLoadOverlay";
    overlay.innerHTML=`
<div id="markdownLoadPanel" role="dialog" aria-modal="true">
    <div id="markdownLoadTitle">Cargando documento</div>
    <div id="markdownLoadStatus">Procesando Markdown...</div>
    <div id="markdownLoadSpinner"></div>
</div>`;
    document.body.appendChild(overlay);
}
function showLoadOverlay(){
    createLoadOverlay();
    const overlay=document.getElementById("markdownLoadOverlay"),status=document.getElementById("markdownLoadStatus");
    if(status)status.textContent="Procesando Markdown...";
    overlay.classList.add("open");
}
function setLoadStatus(text){
    const status=document.getElementById("markdownLoadStatus");
    if(status)status.textContent=text;
}
function hideLoadOverlay(){
    const overlay=document.getElementById("markdownLoadOverlay");
    if(overlay)overlay.classList.remove("open");
}
function lockEditorForLoad(){
    editor.setAttribute("contenteditable","false");
    editor.setAttribute("aria-busy","true");
    toolbar.setAttribute("aria-disabled","true");
    if(saveButton)saveButton.setAttribute("aria-disabled","true");
    if(loadButton)loadButton.setAttribute("aria-disabled","true");
    if(inlineCodeButton)inlineCodeButton.setAttribute("aria-disabled","true");
    if(codeBlockButton)codeBlockButton.setAttribute("aria-disabled","true");
    if(clearFormatButton)clearFormatButton.setAttribute("aria-disabled","true");
    document.body.classList.add("markdown-loading");
}
function unlockEditorAfterLoad(){
    editor.setAttribute("contenteditable","true");
    editor.removeAttribute("aria-busy");
    toolbar.removeAttribute("aria-disabled");
    if(saveButton)saveButton.removeAttribute("aria-disabled");
    if(loadButton)loadButton.removeAttribute("aria-disabled");
    if(inlineCodeButton)inlineCodeButton.removeAttribute("aria-disabled");
    if(codeBlockButton)codeBlockButton.removeAttribute("aria-disabled");
    if(clearFormatButton)clearFormatButton.removeAttribute("aria-disabled");
    document.body.classList.remove("markdown-loading");
}
function nextFrame(){
    return new Promise(resolve=>requestAnimationFrame(()=>resolve()));
}
function escapeHTML(text){
    const div=document.createElement("div");
    div.textContent=text;
    return div.innerHTML;
}
function markdownInlineToHTML(text){
    let result=escapeHTML(text);
    result=result.replace(/\\([\\`\*\_#[\]{}()+\-.!>])/g,"$1");
    result=result.replace(/\\`([^\\`]+)\\`/g,'<code class="inline-code">$1</code>');
    result=result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    result=result.replace(/\*\*([^\*]+)\*\*/g,"<strong>$1</strong>");
    result=result.replace(/~~([^\~]+)~~/g,"<s>$1</s>");
    result=result.replace(/(?<!\*)\*([^\*\n]+)\*(?!\*)/g,"<em>$1</em>");
    result=result.replace(/<u>([\s\S]*?)<\/u>/gi,"<u>$1</u>");
    return result;
}
function markdownToHTML(markdown){
    const imageBlocks=[];
    markdown=markdown.replace(/<p\s+align=['"]center['"]\s+id=['"]([^'"]+)['"]>\s*<img\s+id=['"]([^'"]+)['"]\s+alt=['"]([^'"]*)['"]\s+src=['"]([^'"]+)['"]\s*>\s*<\/p>/gi,(_,wrapperId,imageId,alt,src)=>{
        const token=`___IMAGE_BLOCK_${imageBlocks.length}___`;
        imageBlocks.push({wrapperId,imageId,alt,src});
        return token;
    });
    const lines=markdown.split(/\r?\n/),html=[];
    let i=0;
    while(i<lines.length){
        const line=lines[i],imageToken=line.match(/^___IMAGE_BLOCK_(\d+)___$/);
        if(imageToken){
            const data=imageBlocks[Number(imageToken[1])];
            html.push(`<p class="md-image" align="center" id="${escapeAttribute(data.wrapperId)}"><img id="${escapeAttribute(data.imageId)}" alt="${escapeAttribute(data.alt)}" src="${data.src}" style="width:80%"></p>`);
            i++;
            continue;
        }
        if(line.trim().startsWith("```")){
            const codeLines=[];
            i++;
            while(i<lines.length&&!lines[i].trim().startsWith("```")){
                codeLines.push(lines[i]);
                i++;
            }
            if(i<lines.length)i++;
            html.push(`<pre class="code-block"><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
            continue;
        }
        if(!line.trim()){
            i++;
            continue;
        }
        const heading=line.match(/^(#{1,6})\s+(.+)$/);
        if(heading){
            html.push(`<h${heading[1].length}>${markdownInlineToHTML(heading[2])}</h${heading[1].length}>`);
            i++;
            continue;
        }
        if(/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())){
            html.push("<hr>");
            i++;
            continue;
        }
        if(line.trim().startsWith(">")){
            const quoteLines=[];
            while(i<lines.length&&lines[i].trim().startsWith(">")){
                quoteLines.push(lines[i].replace(/^>\s?/,""));
                i++;
            }
            html.push(`<blockquote>${quoteLines.map(markdownInlineToHTML).join("<br>")}</blockquote>`);
            continue;
        }
        if(/^[-\*+]\s+/.test(line)){
            const items=[];
            while(i<lines.length&&/^[-\*+]\s+/.test(lines[i])){
                items.push(`<li>${markdownInlineToHTML(lines[i].replace(/^[-\*+]\s+/,""))}</li>`);
                i++;
            }
            html.push(`<ul>${items.join("")}</ul>`);
            continue;
        }
        if(/^\d+\.\s+/.test(line)){
            const items=[];
            while(i<lines.length&&/^\d+\.\s+/.test(lines[i])){
                items.push(`<li>${markdownInlineToHTML(lines[i].replace(/^\d+\.\s+/,""))}</li>`);
                i++;
            }
            html.push(`<ol>${items.join("")}</ol>`);
            continue;
        }
        const paragraphLines=[line];
        i++;
        while(i<lines.length&&lines[i].trim()&&!/^#{1,6}\s+/.test(lines[i])&&!/^```/.test(lines[i])&&!/^[-\*+]\s+/.test(lines[i])&&!/^\d+\.\s+/.test(lines[i])&&!/^>/.test(lines[i])&&!/^___IMAGE_BLOCK_\d+___$/.test(lines[i])){
            paragraphLines.push(lines[i]);
            i++;
        }
        html.push(`<p>${paragraphLines.map(markdownInlineToHTML).join("<br>")}</p>`);
    }
    return html.join("\n");
}
loadButton.addEventListener("click",()=>{
    if(exporting||loading)return;
    fileInput.click();
});
fileInput.addEventListener("change",async()=>{
    if(exporting||loading)return;
    const file=fileInput.files?.[0];
    if(!file)return;
    loading=true;
    lockEditorForLoad();
    showLoadOverlay();
    await nextFrame();
    try{
        setLoadStatus(`Leyendo ${formatBytes(file.size)}...`);
        await nextFrame();
        const markdown=await file.text();
        setLoadStatus("Construyendo documento...");
        await nextFrame();
        editor.innerHTML=markdownToHTML(markdown);
        setLoadStatus("Aplicando formato...");
        await nextFrame();
        normalizeEditor();
        setLoadStatus("Finalizando...");
        await nextFrame();
        editor.focus();
        updateToolbarState();
        updateStatus();
        savedRange=null;
        await nextFrame();
    }catch(error){
        console.error("Error cargando Markdown:",error);
    }finally{
        fileInput.value="";
        hideLoadOverlay();
        loading=false;
        unlockEditorAfterLoad();
        updateToolbarState();
        updateStatus();
    }
});
async function saveMarkdown(){
    if(exporting||loading)return;
    exporting=true;
    exportCancelRequested=false;
    lockEditorForExport();
    await nextFrame();
    let totalBytes=0;
    try{
        totalBytes=estimateMarkdownBytes();
        showExportOverlay(totalBytes);
        await nextFrame();
        if("showSaveFilePicker" in window){
            let handle=null;
            try{
                handle=await window.showSaveFilePicker({
                    suggestedName:"Markdown.md",
                    types:[{description:"Archivo Markdown",accept:{"text/markdown":[".md"]}}]
                });
            }catch(error){
                if(error.name==="AbortError"){
                    exporting=false;
                    unlockEditorAfterExport();
                    hideExportOverlay();
                    return;
                }
                throw error;
            }
            const writable=await handle.createWritable();
            exportWritable=writable;
            let writtenBytes=0;
            for await(const chunk of markdownChunks()){
                if(exportCancelRequested){
                    try{await writable.abort();}catch(error){}
                    exportWritable=null;
                    setExportCancelled();
                    await new Promise(resolve=>setTimeout(resolve,500));
                    hideExportOverlay();
                    exporting=false;
                    unlockEditorAfterExport();
                    return;
                }
                await writable.write(chunk);
                writtenBytes+=utf8Length(chunk);
                updateExportProgress(writtenBytes,totalBytes);
                await new Promise(resolve=>setTimeout(resolve,0));
            }
            if(exportCancelRequested){
                try{await writable.abort();}catch(error){}
                exportWritable=null;
                setExportCancelled();
                await new Promise(resolve=>setTimeout(resolve,500));
                hideExportOverlay();
                exporting=false;
                unlockEditorAfterExport();
                return;
            }
            await writable.close();
            exportWritable=null;
            updateExportProgress(totalBytes,totalBytes);
            setExportFinished();
            await new Promise(resolve=>setTimeout(resolve,650));
            hideExportOverlay();
            exporting=false;
            unlockEditorAfterExport();
            return;
        }
        setExportStatus("Este navegador no permite escritura directa. Generando descarga...");
        const markdown=await htmlToMarkdown();
        if(exportCancelRequested){
            setExportCancelled();
            await new Promise(resolve=>setTimeout(resolve,500));
            hideExportOverlay();
            exporting=false;
            unlockEditorAfterExport();
            return;
        }
        const blob=new Blob([markdown],{type:"text/markdown;charset=utf-8"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
        anchor.href=url;
        anchor.download="Markdown.md";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        updateExportProgress(blob.size,blob.size);
        setExportFinished();
        await new Promise(resolve=>setTimeout(resolve,650));
        hideExportOverlay();
    }catch(error){
        console.error("Error guardando Markdown:",error);
        if(exportWritable){
            try{await exportWritable.abort();}catch(abortError){}
        }
        exportWritable=null;
        if(error.name!=="AbortError"){
            setExportError();
            await new Promise(resolve=>setTimeout(resolve,1000));
        }
        hideExportOverlay();
    }finally{
        exporting=false;
        exportCancelRequested=false;
        exportWritable=null;
        unlockEditorAfterExport();
    }
}
saveButton.addEventListener("click",saveMarkdown);
document.addEventListener("keydown",event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){
        event.preventDefault();
        if(!exporting&&!loading)saveMarkdown();
        return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        if(!exporting&&!loading)openLinkModal();
    }
});
linkModal.addEventListener("click",event=>{
    if(event.target===linkModal)closeLinkModal();
});
imageModal.addEventListener("click",event=>{
    if(event.target===imageModal)closeImageModal();
});
function initialize(){
    createExportOverlay();
    createLoadOverlay();
    normalizeEditor();
    updateToolbarState();
    updateStatus();
}
initialize();