import { ELEMENT_NODE, TEXT_NODE } from "../shared/HTMLNodeType"
import getActiveElement from "./getActiveElement"
import { getOffsets } from "./ReactDOMSelection"

/**
 * 判断当前页面与 iframe 框架是否属于同源（Same Origin） 的工具函数。
 *  若 iframe 与父页面不同源，父页面访问 iframe.contentWindow、iframe.contentDocument 等属性时，浏览器会抛出 SecurityError 异常
 *  isSameOriginFrame 的作用就是通过安全的方式检测这种同源关系，避免直接访问跨域 iframe 时触发异常。
 * 通过访问 iframe.contentWindow.location.href 判断同源性：
    同源情况：contentWindow.location.href 会返回 iframe 页面的完整 URL（字符串类型），因此 typeof 结果为 'string'，函数返回 true。
    跨域情况：浏览器会因同源策略禁止访问，抛出 SecurityError 异常，此时函数进入 catch 块，返回 false。
 * */ 
function isSameOriginFrame(iframe) {
    try {
        // 尝试访问 iframe 内部 window 的 location.href
        return typeof iframe.contentWindow.location.href === 'string'
    } catch (err) {
        // 若访问失败（抛出异常），则判定为不同源
        return false
    }
}

/**
 * 用于深度获取当前页面中真正获得焦点的元素的函数，支持跨 iframe 嵌套场景。它会递归检查焦点是否在嵌套的同源 iframe 内部，最终返回最深层的焦点元素（可能是主页面元素，也可能是嵌套 iframe 中的元素）。
 * 
*/
function getActiveElementDeep() {
    // 初始化为当前窗口和主页面的焦点元素
    let win: any = window
    let element: any = getActiveElement()
    // 循环检查：若当前焦点元素是 iframe，且同源，则继续深入查找
    while(element instanceof win.HTMLIFrameElement) {
        if (isSameOriginFrame(element)) {
            // 同源 iframe：更新窗口为 iframe 内部窗口，继续查找其焦点元素
            win = element.contentWindow
        } else {
            // 非同源 iframe：无法访问内部，返回当前 iframe 作为焦点元素
            return element
        }
        // 获取 iframe 内部文档的焦点元素，继续循环
        element = getActiveElement(win.document)
    }
    // 循环结束：当前元素不是 iframe，返回它（最深层焦点元素）
    return element
}

// hasSelectionCapabilities 是 React 内部用于判断一个 DOM 元素是否具备文本选择（光标定位、文本选中）能力的工具函数
export function hasSelectionCapabilities(elem) {
    const nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase()
    return nodeName && ((nodeName === 'input' && ['text', 'search', 'tel', 'url', 'password'].includes(elem.type)) || nodeName === 'textarea' || elem.contentEditable === 'true')
}

/**
 * 用于获取聚焦元素（如输入框、文本域或可编辑元素）的文本选择范围的工具函数，返回选中内容的起始位置（start）和结束位置（end），为处理文本选择相关的交互（如光标定位、选中文本操作）提供基础数据。
 * 在用户与文本输入类元素交互时（如输入框选中文本、光标定位），React 可能需要获取当前选择范围的信息，例如：
    表单控件同步选中状态；
    实现自定义光标或选择行为；
    处理剪切、复制、粘贴等操作。
*/
export function getSelection(input) {
    let selection;
    // 情况1：现代浏览器的 input 或 textarea（支持 selectionStart/selectionEnd 属性）
    if ('selectionStart' in input) {
        selection = {
            start: input.selectionStart,
            end: input.selectionEnd
        }
    } else {
        // 情况2：可编辑元素（contentEditable）或旧版 IE 的 textarea
        selection = getOffsets(input)
    }
    // 兜底：若获取失败，返回默认范围（0, 0）
    return selection || { start: 0, end: 0 }
}

export function setSelection(input, offsets) {
    const start = offsets.start
    let end = offsets.end
    if (end === undefined) {
        end = start
    }
    if ('selectionStart' in input) {
        input.selectionStart = start
        input.selectionEnd = Math.min(end, input.value.length)
    } else {
        setOffsets(input, offsets)
    }
}

/**
 * 用于收集当前页面的焦点元素及其文本选择范围信息的综合工具函数。它整合了之前提到的 getActiveElementDeep、hasSelectionCapabilities 和 getSelection 等函数的功能，为 React 在提交阶段（commit phase）保存和恢复用户选择状态提供完整的数据支持。
*/
export function getSelectionInformation() {
    // 1. 获取最深层的焦点元素（支持跨同源 iframe 嵌套）
    const focusedElem = getActiveElementDeep()
    // 2. 构建并返回包含焦点元素和选择范围的信息对象
    return {
        focusedElem: focusedElem, // 当前获得焦点的元素
        selectionRange: hasSelectionCapabilities(focusedElem) ? getSelection(focusedElem) : null // // 若焦点元素具备选择能力，则获取其选择范围；否则为 null
    }
}

/**
 * restoreSelection 是 React 提交阶段（commit phase）中用于恢复用户交互状态的关键函数。在 DOM 更新完成后，它会根据更新前保存的焦点元素和选择范围信息（priorSelectionInformation），将用户的焦点位置和文本选择状态还原到更新前的状态，确保用户体验的连续性（例如输入框更新后光标位置不变）。
 * 
*/
export function restoreSelection(priorSelectionInformation) {
    // 1. 获取当前的焦点元素（更新后的焦点状态）
    const curFocusedElem = getActiveElementDeep()
    // 2. 从保存的信息中获取更新前的焦点元素和选择范围
    const priorFocusedElem = priorSelectionInformation.focusedElem
    const priorSelectionRange = priorSelectionInformation.selectionRange

    // 3. 若当前焦点元素与更新前不同，且更新前的焦点元素仍在文档中
    if (curFocusedElem !== priorFocusedElem && isInDocument(priorFocusedElem)) {
        // 3.1 若更新前有选择范围，且元素支持选择，恢复选择范围
        if (
            priorSelectionRange !== null &&
            hasSelectionCapabilities(priorFocusedElem)
        ) {
            setSelection(priorFocusedElem, priorSelectionRange)
        }

        // 3.2 保存更新前焦点元素的所有祖先节点的滚动位置（避免聚焦时滚动位置变化）
        const ancestors: any = []
        let ancestor = priorFocusedElem
        while ((ancestor === ancestor.parentNode)) {
            if (ancestor.nodeType === ELEMENT_NODE) {
                ancestors.push({
                    element: ancestor,
                    left: ancestor.scrollLeft,  // 水平滚动位置
                    top: ancestor.scrollTop,   // 垂直滚动位置
                })
            }
        }

        // 3.3 恢复焦点到更新前的元素
        if (typeof priorFocusedElem.focus === 'function') {
            priorFocusedElem.focus()
        }

        // 3.4 还原所有祖先节点的滚动位置（避免聚焦导致的滚动偏移）
        for (let i = 0; i < ancestors.length; i++) {
            const info = ancestors[i]
            info.element.scrollLeft = info.left
            info.element.scrollTop = info.top
        }
    }
}

function isTextNode(node) {
    return node && node.nodeType === TEXT_NODE
}

// containsNode 是 React 内部用于判断一个节点（outerNode）是否包含另一个节点（innerNode） 的工具函数，用于处理 DOM 节点层级关系的检查。它支持不同类型的节点（如元素节点、文本节点），并兼容不同浏览器的 DOM API 差异，确保层级判断的准确性。
function containsNode(outerNode, innerNode) {
    if (!outerNode || !innerNode) { // 1. 若任一节点不存在，直接返回 false
        return false
    } else if (outerNode === innerNode) { // 2. 若两个节点是同一个，返回 true
        return true
    } else if (isTextNode(outerNode)) {  // 3. 若外层节点是文本节点，无法包含其他节点（文本节点没有子节点）
        return false
    } else if (isTextNode(innerNode)) {  // 4. 若内层节点是文本节点，递归检查其 parentNode 是否被 outerNode 包含
        return containsNode(outerNode, innerNode.parentNode)
    } else if ('contains' in outerNode) { // 5. 若外层节点支持 contains 方法（大多数现代浏览器），直接调用
        return outerNode.contains(innerNode)
    } else if (outerNode.compareDocumentPosition) {  // 6. 若浏览器支持 compareDocumentPosition 方法（如旧版 Firefox），用位运算判断
        // 16 表示 innerNode 是 outerNode 的后代节点
        return !!(outerNode.compareDocumentPosition(innerNode) & 16)
    } else {  // 7. 其他情况，返回 false
        false
    }
}

// isInDocument 是 React 内部用于判断一个 DOM 节点是否存在于当前文档（document）中的工具函数
function isInDocument(node) {
    return (node && node.ownerDocument && containsNode(node.ownerDocument.documentElement, node))
}