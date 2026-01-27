import { DefaultEventPriority } from "react-reconciler/src/ReactEventPriorities";
import { FiberRoot } from "react-reconciler/src/ReactInternalTypes";
import {
    getEventPriority,
    isEnabled as ReactBrowserEventEmitterIsEnabled,
    setEnabled as ReactBrowserEventEmitterSetEnabled,
} from "../events/ReactDOMEventListener";
import type { DOMEventName } from "../events/DOMEventNames";
import { COMMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_NODE, ELEMENT_NODE } from "../shared/HTMLNodeType";
import { getChildNamespace } from "../shared/DOMNamespaces";
import { getSelectionInformation, restoreSelection } from "./ReactInputSelection";
import { enableCreateEventHandleAPI } from "shared/ReactFeatureFlags";
import { getClosestInstanceFromNode, precacheFiberNode, updateFiberProps } from "./ReactDOMComponentTree";
import setTextContent from "./setTextContent";
import { createElement, createTextNode, diffProperties, setInitialProperties, trapClickOnNonInteractiveElement, updateProperties } from "./ReactDOMComponent";
import dangerousStyleValue from "../shared/dangerousStyleValue";
import { listenToAllSupportedEvents } from "../events/DOMPluginEventSystem";

export { detachDeletedInstance } from "./ReactDOMComponentTree";
export type Type = string
export type Props = {
    autoFocus?: boolean,
    children?: any,
    disabled?: boolean,
    hidden?: boolean,
    suppressHydrationWarning?: boolean,
    dangerouslySetInnerHTML?: any,
    style?: { display?: string }
    bottom?: null | number,
    left?: null | number,
    right?: null | number,
    top?: null | number,
}

export type EventTargetChildElement = {
    type: string,
    props: null | {
        style?: {
            position?: string,
            zIndex?: number,
            bottom?: string,
            left?: string,
            right?: string,
            top?: string,
        }
    },
}

export type Container =
    | (Element & { _reactRootContainer?: FiberRoot, [key: string]: any })
    | (Document & { _reactRootContainer?: FiberRoot, [key: string]: any })
    | (DocumentFragment & { _reactRootContainer?: FiberRoot, [key: string]: any })

export type Instance = Element
export type TextInstance = Text
export type SuspenseInstance = Comment & { __reactRetry?: () => void }
export type HydratableInstance = Instance | TextInstance | SuspenseInstance
export type PublicInstance = Element | Text
type HostContextDev = {
    namespace: string,
    ancestorInfo: unknown,
}
type TimeoutID = number
type HostContextProd = string
export type HostContext = HostContextDev | HostContextProd
export type UpdatePayload = Array<any>
export type ChildSet = void
export type TimeoutHandle = TimeoutID
export type NoTimeout = -1
export type RendererInspectionConfig = Readonly<any>

type SelectionInformation = {
    focusedElem: null | HTMLElement;
    selectionRange: any
}

let eventsEnabled: boolean | null = null // 用于标识 React 事件系统是否启用。初始为 null，可能在初始化阶段根据环境或配置（如测试环境、特殊渲染模式）设置为 true 或 false，控制事件委托、合成事件等机制的开关
let selectionInformation: null | SelectionInformation = null // 存储与用户选择（如文本选中）相关的信息（如选择范围、选中内容）。在需要处理选区的场景（如输入框光标位置、文本高亮）中使用，确保 React 能正确感知和同步用户的选择状态

const SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning'
const SUSPENSE_START_DATA = '$';
const SUSPENSE_END_DATA = '/$';
const SUSPENSE_PENDING_START_DATA = '$?';
const SUSPENSE_FALLBACK_START_DATA = '$!';

const STYLE = 'style';

export const noTimeout = -1; // noTimeout = -1：表示 “无超时” 状态（如 Suspense 不设置超时，无限期等待内容加载）

export const scheduleTimeout: any = typeof setTimeout === 'function' ? setTimeout : (undefined as any)
export const cancelTimeout: any = typeof clearTimeout === 'function' ? clearTimeout : (undefined as any)
export const localPromise = typeof Promise === 'function' ? Promise : undefined

// 宿主环境模式
export const supportsHydration = true  // 表示当前环境支持 hydration（服务端渲染的内容与客户端虚拟 DOM 对齐），常见于浏览器环境。
export const supportsMutation = true   // 直接修改现有 DOM 树（如浏览器环境常用的 appendChild、setAttribute 等），适合客户端动态更新。
export const supportsPersistence = false // 不直接修改现有 DOM，而是创建新的 DOM 片段替换旧内容（如某些静态站点生成或特殊渲染场景），避免直接操作现有节点

export const isPrimaryRenderer = true

export const supportsMicrotasks = true
export const scheduleMicrotask = typeof queueMicrotask === 'function' ? queueMicrotask : typeof localPromise !== 'undefined' ? callback => localPromise.resolve(null).then(callback).catch(handleErrorInNextTick) : scheduleTimeout
function handleErrorInNextTick(error) {
    setTimeout(() => {
        throw error
    })
}

export function getCurrentEventPriority() {
    const currentEvent = window.event
    if (currentEvent === undefined) {
        return DefaultEventPriority
    }
    return getEventPriority(currentEvent.type as DOMEventName)
}

export function getPublicInstance(instance: Instance) {
    return instance
}

export function isSuspenseInstancePending(instance: SuspenseInstance) {
    return instance.data === SUSPENSE_PENDING_START_DATA
}

export function isSuspenseInstanceFallback(instance: SuspenseInstance) {
    return instance.data === SUSPENSE_FALLBACK_START_DATA
}

/**
 * 在 React 中，“宿主环境” 通常指 DOM 环境（浏览器）。当 React 渲染组件时，需要知道根容器的类型（如普通 DOM 元素、文档片段、文档节点等）和命名空间（如 HTML、SVG 等），才能正确创建和挂载元素。
 * HostContext 包含了这些关键信息，确保 React 在生成 DOM 节点时使用正确的命名空间和渲染规则（例如 SVG 元素需要在 SVG 命名空间下创建）。
 * 
*/
export function getRootHostContext(rootContainerInstance: Container): HostContext {
    let type // 根容器的类型标识
    let namespace  // 根容器的命名空间
    const nodeType = rootContainerInstance.nodeType // 根容器的节点类型（DOM 节点类型常量）
    switch (nodeType) {
        case DOCUMENT_NODE:  // 9：文档节点（如 document）
        case DOCUMENT_FRAGMENT_NODE: // 11：文档片段节点（如 document.createDocumentFragment()）
            type = nodeType === DOCUMENT_NODE ? '#document' : '#fragment' // 类型标识：文档节点为 '#document'，文档片段为 '#fragment'
            const root = rootContainerInstance.documentElement // 获取文档的根元素（如 <html> 标签）
            namespace = root ? root.namespaceURI : getChildNamespace(null, '') // 确定命名空间：若存在根元素，使用其命名空间；否则默认使用空类型的子命名空间（实际为 HTML 命名空间）
            break
        default: {
            // 特殊处理注释节点：若根容器是注释节点，取其父节点作为实际容器
            const container: any = nodeType === COMMENT_NODE ? rootContainerInstance.parentNode : rootContainerInstance
            const ownNamespace = container.namespaceURI || null // 获取容器自身的命名空间（若没有则为 null）
            type = container.tagName // 容器类型为其标签名（如 'DIV'、'SVG' 等）
            namespace = getChildNamespace(ownNamespace, type) // 根据容器自身命名空间和标签名，确定最终命名空间
            break
        }
    }
    return namespace
}

/**
 * getParentSuspenseInstance 是 React 中用于查找目标节点所在的父级 Suspense 组件实例的工具函数。它通过遍历目标节点前的兄弟节点，识别 React 为 Suspense 组件插入的特殊注释节点标记，定位最外层的 Suspense 边界，为未完成 hydration（服务端渲染场景）或延迟加载的 Suspense 组件提供实例引用，确保事件处理、更新等逻辑能正确关联到对应的 Suspense 组件。
 * 核心背景：Suspense 组件的 DOM 标记机制
React 的 Suspense 组件用于实现 “延迟加载”（如异步组件、代码分割），在未完成加载或 hydration 时，会在 DOM 中插入特殊注释节点作为边界标记，例如：
    开始标记：<!-- Suspense start -->（对应 SUSPENSE_START_DATA 等常量）
    结束标记：<!-- Suspense end -->（对应 SUSPENSE_END_DATA）
这些注释节点用于标识 Suspense 组件的范围，尤其是在嵌套 Suspense 场景中（一个 Suspense 内部包含另一个 Suspense），需要通过标记的嵌套深度来定位最外层的父级 Suspense 边界。
*/
export function getParentSuspenseInstance(
    targetInstance: Node // 目标 DOM 节点（需查找其所属的 Suspense 边界）
): null | SuspenseInstance {
    // 1. 从目标节点的前一个兄弟节点开始遍历（Suspense 标记在目标节点之前）
    let node: any = targetInstance.previousSibling
    // 跟踪嵌套深度：处理嵌套的 Suspense 组件（如 Suspense 内部包含另一个 Suspense）
    let depth = 0
    while (node) {
        // 2. 只处理注释节点（Suspense 标记通过注释节点实现）
        if (node.nodeType === COMMENT_NODE) {
            const data = node.data  // 注释节点的内容（如 "Suspense start"）

            // 3. 识别 Suspense 开始标记
            if (
                data === SUSPENSE_START_DATA ||  // 普通 Suspense 开始
                data === SUSPENSE_FALLBACK_START_DATA || // Suspense  fallback 开始
                data === SUSPENSE_PENDING_START_DATA   // Suspense  pending 状态开始
            ) {
                // 若深度为 0，说明找到最外层的父级 Suspense 开始标记
                if (depth === 0) {
                    return node as SuspenseInstance  // 返回该注释节点作为 Suspense 实例
                } else {
                    // 若深度 > 0，说明是嵌套的内层 Suspense，减少深度（向外层靠近）
                    depth--
                }
                // 4. 识别 Suspense 结束标记（增加嵌套深度）
            } else if (data === SUSPENSE_END_DATA) {
                depth++  // 遇到结束标记，说明进入更深层的嵌套
            }
        }
        // 继续遍历前一个兄弟节点
        node = node.previousSibling
    }
    // 遍历完所有前序节点仍未找到，返回 null（目标节点不在任何 Suspense 边界内）
    return null
}

/**
 * prepareForCommit 是 React 中提交阶段（commit phase）的关键准备函数，作用是在 React 将虚拟 DOM 变更应用到真实 DOM 之前，完成一系列前置操作 —— 包括保存事件状态、记录用户选择信息、关联 React 实例以及暂停事件监听，为后续的 DOM 操作创造安全稳定的环境。
 * React 的工作流程分为「渲染阶段」（计算需要更新的 DOM 变更）和「提交阶段」（实际执行 DOM 操作）。提交阶段直接操作真实 DOM，此时需要：
    1. 避免用户交互事件（如点击、输入）干扰 DOM 操作（防止事件触发时机错乱）；
    2. 保存当前用户的焦点位置和文本选择状态，以便操作后恢复（保证用户体验连贯）；
    3. 关联 DOM 元素与对应的 React 组件实例，为后续组件级操作提供依据。
    prepareForCommit 正是为这些需求设计的「前置保护与状态保存」函数。
*/
export function prepareForCommit(containerInfo: Container): Object | null {
    // 保存当前事件监听状态
    // ReactBrowserEventEmitterIsEnabled：检查 React 事件发射器（负责管理所有 React 绑定的 DOM 事件，如 onClick、onChange）是否处于启用状态。
    // eventsEnabled：全局变量，临时存储事件发射器的启用状态（用于提交阶段结束后恢复事件监听）。
    eventsEnabled = ReactBrowserEventEmitterIsEnabled()
    // 保存用户选择与焦点信息
    // getSelectionInformation：收集当前页面的关键交互状态，返回一个对象包含：
    // focusedElem：当前获得焦点的 DOM 元素（支持穿透同源 iframe 嵌套）；
    // selectionRange：若焦点元素支持文本选择（如输入框），则包含其选中范围（{start, end}），否则为 null。
    // selectionInformation：全局变量，保存这些状态，确保 DOM 操作后能恢复用户的焦点和选择范围（例如输入框提交后不丢失光标位置）。
    selectionInformation = getSelectionInformation()
    let activeInstance: any = null
    if (enableCreateEventHandleAPI) {  // 若启用事件句柄 API
        const focusedElem = selectionInformation.focusedElem // 从保存的状态中获取焦点元素
        if (focusedElem !== null) {
            // 查找焦点元素对应的 React 组件实例（Fiber 节点）
            activeInstance = getClosestInstanceFromNode(focusedElem)
        }
    }
    ReactBrowserEventEmitterSetEnabled(false)
    return activeInstance
}

export function resetAfterCommit(containerInfo: Container) {
    restoreSelection(selectionInformation)
    ReactBrowserEventEmitterSetEnabled(eventsEnabled as any)
    eventsEnabled = null
    selectionInformation = null
}

/**
 * createInstance 是 React 中为宿主组件（如 <div>、<span> 等原生 DOM 元素）创建真实 DOM 实例的核心函数。它负责根据元素类型和属性生成对应的 DOM 节点，建立 Fiber 节点与 DOM 节点的关联，并为后续操作（如属性更新、事件绑定）奠定基础。
 * 
*/
export function createInstance(
    type: string,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext,
    internalInstanceHandle: Object // Fiber 节点的引用（用于关联 DOM 与 Fiber）
): Instance {
    // 命名空间（如 SVG 元素需 'http://www.w3.org/2000/svg'）
    const parentNamespace: string = hostContext as string
    // 1. 创建 DOM 元素实例（核心步骤）
    const domElement: Instance = createElement(type, props, rootContainerInstance, parentNamespace)
    // 2. 缓存 Fiber 节点与 DOM 节点的关联（通过内部属性 __reactFiber$ ）
    precacheFiberNode(internalInstanceHandle as any, domElement)
    // 3. 将 props 缓存到 DOM 节点（通过内部属性 __reactProps$ ）
    updateFiberProps(domElement, props)
    return domElement
}

export function clearContainer(container: Container) {
    if (container.nodeType === ELEMENT_NODE) {
        Object.assign(container, { textContent: '' })
    } else if (container.nodeType === DOCUMENT_NODE) {
        if (container.documentElement) {
            container.removeChild(container.documentElement)
        }
    }
}

export function resetTextContent(domElement: Instance) {
    setTextContent(domElement, '')
}

export function insertInContainerBefore(
    container: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance | SuspenseInstance
) {
    if (container.nodeType === COMMENT_NODE) {
        container.parentNode?.insertBefore(child, beforeChild)
    } else {
        container.insertBefore(child, beforeChild)
    }
}

/**
 * appendChildToContainer 是 React 中将子节点（DOM 元素或文本节点）添加到容器节点的核心函数，负责处理不同类型容器（如普通 DOM 元素、注释节点）的子节点挂载逻辑，并解决特定浏览器（如 Mobile Safari）的事件冒泡兼容问题。
 * 
*/
export function appendChildToContainer(
    container: Container,
    child: Instance | TextInstance
) {
    let parentNode
    // 1. 处理容器是注释节点的情况
    if (container.nodeType === COMMENT_NODE) {
        // 注释节点本身不能作为父节点，需获取其父节点
        parentNode = container.parentNode
        // 将子节点插入到注释节点之前（注释节点作为挂载标记）
        parentNode.insertBefore(child, container)
    } else {
        // 2. 普通容器节点（如 div），直接作为父节点
        parentNode = container
        // 将子节点添加到容器末尾
        parentNode.appendChild(child)
    }
    // 解决 Mobile Safari 事件冒泡问题
    const reactRootContainer = container._reactRootContainer
    if (
        (reactRootContainer === null || reactRootContainer === undefined) &&
        parentNode.onclick === null
    ) {
        // 为非 React 根容器的父节点绑定空的 click 处理，确保事件能冒泡
        trapClickOnNonInteractiveElement(parentNode)
    }
}

/**
 * shouldSetTextContent 是 React 中用于判断宿主组件（如 <div>、<textarea> 等原生 DOM 元素）是否应该直接设置文本内容的工具函数,它决定了组件的子节点是作为文本直接赋值给 DOM 元素（如通过 textContent），还是需要创建单独的子 Fiber 节点（如处理嵌套元素），是优化文本渲染性能的重要判断依据
*/
export function shouldSetTextContent(type: string, props: Props): boolean {
    return (
        // 1. 特殊元素：textarea 和 noscript 始终直接处理文本内容
        type === 'textarea' ||
        type === 'noscript' ||
        // 2. 子节点是字符串或数字（纯文本）
        typeof props.children === 'string' ||
        typeof props.children === 'number' ||
        // 3. 使用了 dangerouslySetInnerHTML 且 __html 不为 null/undefined
        (typeof props.dangerouslySetInnerHTML === 'object' && props.dangerouslySetInnerHTML !== null && props.dangerouslySetInnerHTML.__html !== null)
    )
}

/**
 * finalizeInitialChildren 是 React 处理宿主组件（如原生 DOM 元素）初始化阶段收尾工作的核心函数。它主要负责在 DOM 元素首次创建后设置初始属性，并判断是否需要在提交阶段（Commit）执行额外的初始化操作（如自动聚焦、图片加载处理等），是连接 DOM 实例创建与后续副作用执行的关键环节。
    核心背景：DOM 初始化的特殊需求
        当 React 创建原生 DOM 元素（如 <input>、<img>）时，除了设置 className、style 等基础属性外，部分元素还需要特殊的初始化处理：
            表单元素（如 <input autoFocus />）需要在挂载后自动获取焦点。
            <img> 元素需要处理加载状态或错误回调。
这些操作无法在 DOM 实例创建时同步完成（需等待元素挂载到文档后执行），因此 finalizeInitialChildren 会标记此类需求，告知 React 在提交阶段执行对应的副作用。
*/
export function finalizeInitialChildren(
    domElement: Instance,
    type: string,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext
): boolean {
    // 1. 为 DOM 元素设置初始属性（如 className、style、事件监听等）
    setInitialProperties(domElement, type, props, rootContainerInstance)
    // 2. 根据元素类型判断是否需要提交阶段的额外处理
    switch (type) {
        case 'button':
        case 'input':
        case 'select':
        case 'textarea':
            // 表单元素：若有 autoFocus 属性，返回 true（需要自动聚焦）
            return !!props.autoFocus
        case 'img':
            // 图片元素：始终返回 true（可能需要处理加载/错误事件）
            return true
        default:
            // 其他元素：无需额外处理，返回 false
            return false
    }
}

export function appendInitialChild(
    parentInstance: Instance,
    child: Instance | TextInstance
) {
    parentInstance.appendChild(child)
}

export function getChildHostContext(
    parentHostContext: HostContext,
    type: string,
    rootContainerInstance: Container
): HostContext {
    const parentNamespace = parentHostContext as string
    return getChildNamespace(parentNamespace, type)
}

export function prepareUpdate(
    domElement: Instance,
    type: string,
    oldProps: Props,
    newProps: Props,
    rootContainerInstance: Container,
    hostContext: HostContext
) {
    return diffProperties(domElement, type, oldProps, newProps, rootContainerInstance)
}

export function commitUpdate(
    domElement: Instance,
    updatePayload: Array<any>,
    type: string,
    oldProps: Props,
    newProps: Props,
    internalInstanceHandle: Object
) {
    updateProperties(domElement, updatePayload, type, oldProps, newProps)
    updateFiberProps(domElement, newProps)
}

export function removeChild(
    parentInstance: Instance,
    child: Instance | TextInstance | SuspenseInstance
) {
    parentInstance.removeChild(child)
}

export function removeChildFromContainer(
    container: Container,
    child: Instance | TextInstance | SuspenseInstance
) {
    if (container.nodeType === COMMENT_NODE) {
        container.parentNode?.removeChild(child)
    } else {
        container.removeChild(child)
    }
}

export function insertBefore(
    parentInstance: Instance,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance | SuspenseInstance
) {
    parentInstance.insertBefore(child, beforeChild)
}

export function appendChild(
    parentInstance: Instance,
    child: Instance | TextInstance
) {
    parentInstance.appendChild(child)
}

export function createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: HostContext,
    internalInstanceHandle: Object
): TextInstance {
    const textNode: TextInstance = createTextNode(text, rootContainerInstance)
    precacheFiberNode(internalInstanceHandle as any, textNode)
    return textNode
}

export function hideInstance(instance: Instance) {
    const style = (instance as HTMLElement).style
    if (typeof style.setProperty === 'function') {
        style.setProperty('display', 'none', 'important')
    } else {
        style.display = 'none'
    }
}

export function unhideInstance(instance: Instance, props: Props) {
    const styleProp = props[STYLE]
    const display = styleProp !== undefined && styleProp !== null && styleProp.hasOwnProperty('display') ? styleProp.display : null;
    (instance as HTMLElement).style.display = dangerousStyleValue('display', display, false)
}

export function hideTextInstance(textInstance: TextInstance) {
    textInstance.nodeValue = ''
}

export function unhideTextInstance(textInstance: TextInstance, text: string) {
    textInstance.nodeValue = text
}

export function preparePortalMount(portalInstance: Instance) {
    listenToAllSupportedEvents(portalInstance)
}