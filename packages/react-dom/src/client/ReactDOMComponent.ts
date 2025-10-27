import { listenToNonDelegatedEvent, mediaEventTypes } from "../events/DOMPluginEventSystem";
import { registrationNameDependencies } from "../events/EventRegistry";
import assertValidProps from "../shared/assertValidProps"
import { getIntrinsicNamespace, HTML_NAMESPACE } from "../shared/DOMNamespaces"
import { DOCUMENT_NODE } from "../shared/HTMLNodeType"
import { isCustomComponent } from "../shared/isCustomComponent"
import { setValueForStyles } from "./CSSPropertyOperations";
import { setValueForProperty } from "./DOMPropertyOperations";
import setInnerHTML from "./setInnerHTML";
import setTextContent from "./setTextContent";
import { 
    getHostProps as ReactDOMInputGetHostProps, 
    updateWrapper as ReactDOMInputUpdateWrapper,
} from "./ReactDOMInput";

import {
    getHostProps as ReactDOMSelectGetHostProps,
    postUpdateWrapper as ReactDOMSelectPostUpdateWrapper,
} from "./ReactDOMSelect";

import {
    getHostProps as ReactDOMTextareaGetHostProps,
    updateWrapper as ReactDOMTextareaUpdateWrapper,
} from "./ReactDOMTextarea";

const DANGEROUSLY_SET_INNER_HTML = 'dangerouslySetInnerHTML';
const SUPPRESS_CONTENT_EDITABLE_WARNING = 'suppressContentEditableWarning';
const SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning';
const AUTOFOCUS = 'autoFocus';
const CHILDREN = 'children';
const STYLE = 'style';
const HTML = '__html';

function noop() {}

export function trapClickOnNonInteractiveElement(node: HTMLElement) {
    node.onclick = noop
}

function getOwnerDocumentFromRootContainer(
    rootContainerElement: Element | Document | DocumentFragment
): Document {
    return rootContainerElement.nodeType === DOCUMENT_NODE ? rootContainerElement as Document : (rootContainerElement as any).ownerDocument
}

/**
 * createElement 是 React 在浏览器环境中创建真实 DOM 元素的底层函数，负责根据元素类型、属性和上下文信息生成对应的原生 DOM 节点。它处理了不同命名空间（如 HTML、SVG）、特殊元素（如 <script>、<select>）和自定义组件的创建逻辑，是虚拟 DOM 映射到真实 DOM 的关键步骤。
 * 核心背景：DOM 元素创建的复杂性
    浏览器中创建 DOM 元素并非简单调用 document.createElement 即可，需考虑：
    命名空间：SVG、MathML 等元素需要在特定命名空间下创建（如 <svg> 需 http://www.w3.org/2000/svg 命名空间）。
    特殊元素行为：如 <script> 元素直接创建可能导致意外执行，<select> 的 multiple 和 size 属性需在子元素插入前设置。
    自定义元素：Web Components 可能需要通过 is 属性指定扩展类型。
    开发环境校验：如提示错误的标签大小写、未知标签等问题。
 * */ 

export function createElement(
    type: string,  // 元素类型（如 'div'、'svg'、'my-component'）
    props: any, // 元素属性（如 className、is 等）
    rootContainerElement: Element | Document | DocumentFragment, // 根容器
    parentNamespace: string // 父元素的命名空间（如 HTML 或 SVG 命名空间）
): Element {
    // 1. 确定文档对象（用于创建元素）
    const ownerDocument: Document = getOwnerDocumentFromRootContainer(rootContainerElement)
    let domElement: Element
    // 2. 确定元素的命名空间（处理 HTML 与 SVG 等特殊命名空间）
    let namespaceURI = parentNamespace === HTML_NAMESPACE ? getIntrinsicNamespace(type) : parentNamespace
    // 3. 根据命名空间创建元素
    if (namespaceURI === HTML_NAMESPACE) {
        // 3.1.1 特殊处理 <script> 元素（避免创建时自动执行）
        if (type === 'script') { // question: 这个骚操作没太清楚
            const div = ownerDocument.createElement('div')
            div.innerHTML = '<script><' + '/script>'; // 拆分闭合标签避免解析错误
            const firstChild: any = div.firstChild  // 获取创建的 <script> 元素
            domElement = div.removeChild(firstChild) // 从 div 中移除并返回
        } else if (typeof props.is === 'string') {
            // 3.1.2 处理带 is 属性的自定义元素（Web Components）
            domElement = ownerDocument.createElement(type, { is: (props as any).is })
        } else {
            // 3.1.3 普通 HTML 元素（如 <div>、<select>）
            domElement = ownerDocument.createElement(type)
            // 特殊处理 <select> 的 multiple 和 size 属性（需在子元素插入前设置）
            if (type === 'select') {
                const node: any = domElement
                if (props.multiple) {
                    node.multiple = true
                } else if (props.size) {
                    node.size = props.size
                }
            }
        }
    } else {
        domElement = ownerDocument.createElementNS(namespaceURI, type)
    }

    return domElement
}

function setInitialDOMProperties(
    tag: string,
    domElement: Element,
    rootContainerElement: Element | Document | DocumentFragment,
    nextProps: Object,
    isCustomComponentTag: boolean
) {
    // 遍历的所有的 props 键
    for (const propKey in nextProps) {
        if (!nextProps.hasOwnProperty(propKey)) continue  // 跳过继承属性
        const nextProp = nextProps[propKey]  // 当前属性值

        // 1. 处理 style 属性（样式）
        if (propKey === STYLE) {
            setValueForStyles(domElement, nextProp)
        } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {  // 2. 处理 dangerouslySetInnerHTML（危险 HTML 内容）
            const nextHtml = nextProp ? nextProp[HTML] : undefined
            if (nextHtml !== null) {
                setInnerHTML(domElement, nextHtml) // 设置元素的 innerHTML
            }
        } else if (propKey === CHILDREN){ // 3. 处理 children（文本子节点）
            if (typeof nextProp === 'string') {
                // 特殊处理 textarea：避免空文本导致 placeholder 不显示
                const canSetTextContent = tag !== 'textarea' || nextProp !== ''
                if (canSetTextContent) {
                    setTextContent(domElement, nextProp) // 设置文本内容
                }
            } else if (typeof nextProp === 'number') {
                setTextContent(domElement, '' + nextProp)  // 数字转换为字符串
            }
        } else if ([SUPPRESS_CONTENT_EDITABLE_WARNING, SUPPRESS_HYDRATION_WARNING].includes(propKey)) { // 4. 忽略 suppression 相关属性（仅用于开发环境警告控制）
            
        } else if (propKey === AUTOFOCUS) { //  5. 忽略 autofocus（在 commit 阶段单独处理）

        } else if (registrationNameDependencies.hasOwnProperty(propKey)) { // 6. 处理事件属性（如 onClick、onScroll）
            if (nextProp !== null) {
                if (propKey === 'onScroll') {
                    listenToNonDelegatedEvent('scroll', domElement)
                }
            }
        } else if (nextProp !== null) {
            setValueForProperty(domElement, propKey, nextProp, isCustomComponentTag)  // 7. 处理普通属性（如 id、className、自定义属性等）
        }
    }
}

export function setInitialProperties(
    domElement: Element,  // 目标 DOM 元素
    tag: string,          // 元素标签名（如 'input'、'video'）
    rawProps: Object,     // 原始 props（未处理的属性）
    rootContainerElement: Element | Document | DocumentFragment // 根容器
) {
    // 1. 判断是否为自定义组件
    const isCustomComponentTag = isCustomComponent(tag, rawProps)
    let props: any
    // 3. 针对不同标签执行特殊初始化（事件监听、属性处理）
    switch (tag) {
        case 'dialog': {
            // 为 dialog 绑定 cancel、close 事件（非委托事件）
            listenToNonDelegatedEvent('cancel', domElement)
            listenToNonDelegatedEvent('close', domElement)
            props = rawProps
            break
        }
        case 'iframe':
        case 'object':
        case 'embed': {
            // 绑定 load 事件
            listenToNonDelegatedEvent('load', domElement)
            props = rawProps
            break
        }
        case 'video':
        case 'audio': {
            // 为媒体元素绑定所有媒体事件（如 play、pause 等）
            for (let i = 0; i < mediaEventTypes.length; i++) {
                listenToNonDelegatedEvent(mediaEventTypes[i], domElement)
            }
            props = rawProps
            break
        }
        case 'source': {
            listenToNonDelegatedEvent('error', domElement)
            props = rawProps
            break
        }
        case 'img':
        case 'image':
        case 'link': {
            listenToNonDelegatedEvent('error', domElement)
            listenToNonDelegatedEvent('load', domElement)
            props = rawProps
            break
        }
        case 'details': {
            listenToNonDelegatedEvent('toggle', domElement)
            props = rawProps
            break
        }
        case 'input': {
            debugger
        }
        case 'option': {
            debugger
        }
        case 'select': {
            debugger
        }
        case 'textarea': {
            debugger
        }
        default: {
            props = rawProps
        }
    }

    assertValidProps(tag, props)
    setInitialDOMProperties(tag, domElement, rootContainerElement, props, isCustomComponentTag)

    switch(tag) {
        case 'input': {
            debugger
        }
        case 'textarea': {
            debugger
        }
        case 'option': {
            debugger
        }
        case 'select': {
            debugger
        }
        default: {
            if (typeof props.onClick === 'function') {
                trapClickOnNonInteractiveElement(domElement as any)
            }
            break
        }
    }
}

export function diffProperties(
    domElement: Element,
    tag: string,
    lastRawProps: Object,
    nextRawProps: Object,
    rootContainerInstance: Element | Document | DocumentFragment
) {
    let updatePayload: any | Array<any> = null
    let lastProps: Object = {}
    let nextProps: Object = {}
    switch (tag) {
        case 'input': {
            lastProps = ReactDOMInputGetHostProps(domElement, lastRawProps)
            nextProps = ReactDOMInputGetHostProps(domElement, nextRawProps)
            updatePayload = []
            break
        }
        case 'select': {
            lastProps = ReactDOMSelectGetHostProps(domElement, lastRawProps)
            nextProps = ReactDOMSelectGetHostProps(domElement, nextRawProps)
            updatePayload = []
            break
        }
        case 'textarea': {
            lastProps = ReactDOMTextareaGetHostProps(domElement, lastRawProps)
            nextProps = ReactDOMTextareaGetHostProps(domElement, nextRawProps)
            updatePayload = []
            break
        }
        default: {
            lastProps = lastRawProps
            nextProps = nextRawProps
            if (
                typeof (lastProps as any).onClick !== 'function' && 
                typeof (nextProps as any).onClick === 'function'
            ) {
                trapClickOnNonInteractiveElement(domElement as any)
            }
            break
        }
    }

    assertValidProps(tag, nextProps)

    let propKey
    let styleName
    let styleUpdates: any | null = null
    for (propKey in lastProps) {
        if (
            nextProps.hasOwnProperty(propKey) ||
            !lastProps.hasOwnProperty(propKey) ||
            lastProps[propKey] === null
        ) {
            continue
        }
        if (propKey === STYLE) {
            const lastStyle = lastProps[propKey]
            for (styleName in lastStyle) {
                if (lastStyle.hasOwnProperty(styleName)) {
                    if (!styleUpdates) {
                        styleUpdates = {}
                    }
                    styleUpdates[styleName] = ''
                }
            }
        } else if (propKey === DANGEROUSLY_SET_INNER_HTML || propKey === CHILDREN) {

        } else if (
            propKey === SUPPRESS_CONTENT_EDITABLE_WARNING ||
            propKey === SUPPRESS_HYDRATION_WARNING
        ) {

        } else if (propKey === AUTOFOCUS) {

        } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
            if (!updatePayload) {
                updatePayload = []
            }
        } else {
            (updatePayload = updatePayload || []).push(propKey, null)
        }
    }
    for (propKey in nextProps) {
        const nextProp = nextProps[propKey]
        const lastProp = lastProps != null ? lastProps[propKey] : undefined
        if (
            !nextProps.hasOwnProperty(propKey) || 
            nextProp === lastProp ||
            (nextProp === null && lastProp === null)
        ) {
            continue
        }
        if (propKey === STYLE) {
            if (lastProp) {
                for (styleName in lastProp) {
                    if (lastProp.hasOwnProperty(styleName) && (!nextProp || !nextProp.hasOwnProperty(styleName))) {
                        if (!styleUpdates) {
                            styleUpdates = {}
                        }
                        styleUpdates[styleName] = ''
                    }
                }
                for (styleName in nextProp) {
                    if (nextProp.hasOwnProperty(styleName) && (!lastProp || !lastProp.hasOwnProperty(styleName))) {
                        if (!styleUpdates) {
                            styleUpdates = {}
                        }
                        styleUpdates[styleName] = nextProp[styleName]
                    }
                }
            } else {
                if (!styleUpdates) {
                    if (!updatePayload) {
                        updatePayload = []
                    }
                    updatePayload.push(propKey, styleUpdates)
                }
                styleUpdates = nextProp
            }
        } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
            const nextHtml = nextProp ? nextProp[HTML] : undefined
            const lastHtml = lastProp ? lastProp[HTML] : undefined
            if (nextHtml != null) { 
                if (lastHtml !== nextHtml) {
                    (updatePayload = updatePayload || []).push(propKey, nextHtml)
                }
            } else {

            }
        } else if (propKey === CHILDREN) {
            if (typeof nextProp === 'string' || typeof nextProp === 'number') {
                (updatePayload = updatePayload || []).push(propKey, '' + nextProp)
            }
        } else if (
            propKey === SUPPRESS_CONTENT_EDITABLE_WARNING ||
            propKey === SUPPRESS_HYDRATION_WARNING
        ) {

        } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
            if (nextProp != null) {
                if (propKey === 'onScroll') {
                    listenToNonDelegatedEvent('scroll', domElement)
                }
            }
            if (!updatePayload && lastProp !== nextProp) {
                updatePayload = []
            }
        } else {
            (updatePayload = updatePayload || []).push(propKey, nextProp)
        }
    }

    if (styleUpdates) {
        (updatePayload = updatePayload || []).push(STYLE, styleUpdates)
    }
    return updatePayload
}

function updateDOMProperties (
    domElement: Element,
    updatePayload: Array<any>,
    wasCustomComponentTag: boolean,
    isCustomComponentTag: boolean
) {
    for (let i = 0; i < updatePayload.length; i += 2) {
        const propKey = updatePayload[i]
        const propValue = updatePayload[i + 1]
        if (propKey === STYLE) {
            setValueForStyles(domElement, propValue)
        } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
            setInnerHTML(domElement, propValue)
        } else if (propKey === CHILDREN) {
            setTextContent(domElement, propValue)
        } else {
            setValueForProperty(domElement, propKey, propValue, isCustomComponentTag)
        }
    }
}

export function updateProperties(
    domElement: Element,
    updatePayload: Array<any>,
    tag: string,
    lastRawProps: Object,
    nextRawProps: Object
) {
    if (
        tag === 'input' &&
        (nextRawProps as any).type === 'radio' &&
        (nextRawProps as any).name != null
    ) {
        debugger
    }
    const wasCustomComponentTag = isCustomComponent(tag, lastRawProps)
    const isCustomComponentTag = isCustomComponent(tag, nextRawProps)
    updateDOMProperties(domElement, updatePayload, wasCustomComponentTag, isCustomComponentTag)

    switch (tag) {
        case 'input': 
            ReactDOMInputUpdateWrapper(domElement, nextRawProps)
            break
        case 'textarea':
            ReactDOMTextareaUpdateWrapper(domElement, nextRawProps)
            break
        case 'select':
            ReactDOMSelectPostUpdateWrapper(domElement, nextRawProps)
            break
    }
}