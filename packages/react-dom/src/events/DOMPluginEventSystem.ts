import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { ReactSyntheticEvent } from "./ReactSyntheticEventType"

import { enableCreateEventHandleAPI, enableLegacyFBSupport, enableScopeAPI } from "shared/ReactFeatureFlags"
import { COMMENT_NODE, DOCUMENT_NODE } from "../shared/HTMLNodeType"
import { passiveBrowserEventsSupported } from "./checkPassiveEvents"
import { DOMEventName } from "./DOMEventNames"
import { allNativeEvents } from "./EventRegistry"
import { EventSystemFlags, IS_CAPTURE_PHASE, IS_EVENT_HANDLE_NON_MANAGED_NODE, IS_NON_DELEGATED, SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE, SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS } from "./EventSystemFlags"
import { createEventListenerWrapperWithPriority } from "./ReactDOMEventListener"
import { addEventBubbleListener, addEventCaptureListener } from "./EventListener"
import { AnyNativeEvent } from "./PluginModuleType"
import { isReplayingEvent } from "./CurrentReplayingEvent"
import { HostComponent, HostPortal, HostRoot, ScopeComponent } from "react-reconciler/src/ReactWorkTags"
import { batchedUpdates } from "./ReactDOMUpdateBatching"
import getEventTarget from "./getEventTarget"
import { getEventHandlerListeners } from "../client/ReactDOMComponentTree"
import { getListener } from "./getListener"
import { invokeGuardedCallbackAndCatchFirstError, rethrowCaughtError } from "shared/ReactErrorUtils"
import * as SimpleEventPlugin from './plugins/SimpleEventPlugin'
import * as EnterLeaveEventPlugin from './plugins/EnterLeaveEventPlugin'
import * as ChangeEventPlugin from './plugins/ChangeEventPlugin'
import * as SelectEventPlugin from './plugins/SelectEventPlugin'
import * as BeforeInputEventPlugin from './plugins/BeforeInputEventPlugin'

type DispatchListener = {
    instance: null | Fiber;
    listener: Function;
    currentTarget: EventTarget;
};
  
type DispatchEntry = {
    event: ReactSyntheticEvent;
    listeners: Array<DispatchListener>;
};

export type DispatchQueue = Array<DispatchEntry>

// 事件注册
SimpleEventPlugin.registerEvents()

function extractEvents(
    dispatchQueue: DispatchQueue, // 输出：事件分发队列（存储“事件-回调”对）
    domEventName: DOMEventName,   // 原生事件名（如 'click'、'input'）
    targetInst: null | Fiber,     // 事件目标对应的 Fiber 实例
    nativeEvent: AnyNativeEvent,  // 原生 DOM 事件对象
    nativeEventTarget: null | EventTarget, // 标准化后的事件目标节点（getEventTarget 结果）
    eventSystemFlags: EventSystemFlags,  // 事件系统标记（如捕获/冒泡阶段、是否处理 polyfill）
    targetContainer: EventTarget // 事件所属的根容器
) {
    // 1. 第一步：调用核心基础事件插件（SimpleEventPlugin）提取事件
    // 注释说明：未来可能移除“SimpleEventPlugin”概念，将其逻辑内联到事件系统核心
    SimpleEventPlugin.extractEvents(
        dispatchQueue,
        domEventName,
        targetInst,
        nativeEvent,
        nativeEventTarget,
        eventSystemFlags,
        targetContainer
    )
    // 2. 判断是否需要处理 polyfill 插件（特殊交互插件）
    const shouldProcessPolyfillPlugins = (eventSystemFlags & SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS) === 0;

    // 3. 若允许处理 polyfill 插件，按顺序调用各类特殊插件
    if (shouldProcessPolyfillPlugins) {
        EnterLeaveEventPlugin.extractEvents(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget,
            eventSystemFlags,
            targetContainer
        )
        ChangeEventPlugin.extractEvents(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget,
            eventSystemFlags,
            targetContainer
        )
        SelectEventPlugin.extractEvents(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget,
            eventSystemFlags,
            targetContainer
        )
        BeforeInputEventPlugin.extractEvents(
            dispatchQueue,
            domEventName,
            targetInst,
            nativeEvent,
            nativeEventTarget,
            eventSystemFlags,
            targetContainer
        )
    }
}

export const mediaEventTypes: Array<DOMEventName> = [
    'abort',
    'canplay',
    'canplaythrough',
    'durationchange',
    'emptied',
    'encrypted',
    'ended',
    'error',
    'loadeddata',
    'loadedmetadata',
    'loadstart',
    'pause',
    'play',
    'playing',
    'progress',
    'ratechange',
    'resize',
    'seeked',
    'seeking',
    'stalled',
    'suspend',
    'timeupdate',
    'volumechange',
    'waiting',
]

export const nonDelegatedEvents: Set<DOMEventName> = new Set([
    'cancel',
    'close',
    'invalid',
    'load',
    'scroll',
    'toggle',
    ...mediaEventTypes
])
const listeningMarker = '_reactListening' + Math.random().toString(36).slice(2)

function createDispatchListener(
    instance: null | Fiber,
    listener: Function,
    currentTarget: EventTarget
): DispatchListener {
    return {
        instance,
        listener,
        currentTarget
    }
}

/**
 * React 合成事件的委托机制
React 采用 “事件委托”（Event Delegation）模式处理事件：不直接在具体元素上绑定事件，而是将所有事件监听委托到根容器（如 div#root 或 document）上。这样做的好处是：
减少事件监听器数量，提升性能（尤其在大量元素渲染时）。
统一事件处理逻辑，便于实现跨浏览器兼容和 React 特有的事件特性（如事件池、冒泡控制等）。
该函数就是实现这一机制的关键：在应用初始化时，在根容器上一次性注册所有支持的原生事件监听器。
*/
export function listenToAllSupportedEvents(rootContainerElement: EventTarget) {
    // 1. 检查是否已注册过事件（避免重复注册）
    if (!rootContainerElement[listeningMarker]) {
        // 标记为已注册，防止重复执行
        rootContainerElement[listeningMarker] = true
        // 2. 遍历所有 React 支持的原生事件
        allNativeEvents.forEach(domEventName => {
            // 特殊处理 selectionchange 事件（不冒泡，需绑定在 document 上）
            if (domEventName !== 'selectionchange') {
                // 非委托事件（如 scroll）不需要在冒泡阶段委托，只在捕获阶段处理
                if (!nonDelegatedEvents.has(domEventName)) {
                    // 绑定冒泡阶段的监听器（第三个参数为 false）
                    listenToNativeEvent(domEventName, false, rootContainerElement)
                }
                // 无论是否为委托事件，都绑定捕获阶段的监听器（第三个参数为 true）
                listenToNativeEvent(domEventName, true, rootContainerElement)
            }
        })
        // 3. 处理特殊事件 selectionchange（需绑定在 document 上）
        const ownerDocument = (rootContainerElement as any).nodeType === DOCUMENT_NODE ? rootContainerElement : (rootContainerElement as any).ownerDocument
        if (ownerDocument !== null) {
            // 同样检查 document 是否已注册过该事件
            if (!ownerDocument[listeningMarker]) {
                ownerDocument[listeningMarker] = true
                // 为 document 绑定 selectionchange 事件（冒泡阶段）
                listenToNativeEvent('selectionchange', false, ownerDocument)
            }
        }
    }
}

export function listenToNativeEvent(
    domEventName: DOMEventName, 
    isCapturePhaseListener: boolean,
    target: EventTarget
) {
    // 1. 初始化事件系统标记（默认为 0，无特殊标记）
    let eventSystemFlags = 0
    // 2. 如果是捕获阶段的监听器，添加捕获阶段标记
    if (isCapturePhaseListener) {
        eventSystemFlags |= IS_CAPTURE_PHASE // 按位或运算，标记为捕获阶段
    }

    // 3. 调用底层函数注册带有标记的事件监听器
    addTrappedEventListener(
        target,
        domEventName,
        eventSystemFlags,
        isCapturePhaseListener
    )
}

/**
 * addTrappedEventListener 是 React 合成事件系统中注册原生 DOM 事件监听器的底层实现，负责根据事件类型、阶段（捕获 / 冒泡）、优先级和浏览器特性，创建并绑定被 React 控制的事件监听器（“trapped” 意为 “被捕获”，表示事件会被 React 系统拦截处理）。它是连接原生 DOM 事件与 React 合成事件的最终执行环节，处理了优先级、被动监听、兼容性等细节。
 * React 合成事件需要解决多个问题：
    不同事件的优先级（如点击事件优先级高于滚动事件）。
    浏览器对 “被动事件”（passive event）的支持（提升触摸 / 滚轮事件性能）。
    事件阶段（捕获 / 冒泡）的区分。
    旧版本兼容性（如不支持 once 选项的浏览器）。
addTrappedEventListener 封装了这些逻辑，确保事件监听器以正确的方式注册，同时被 React 系统接管。
*/
function addTrappedEventListener(
    targetContainer: EventTarget, // 事件监听的目标容器（如根容器、document）
    domEventName: DOMEventName,  // 原生事件名（如 'click'、'touchstart'）
    eventSystemFlags: EventSystemFlags, // 事件系统标记（如是否为捕获阶段）
    isCapturePhaseListener: boolean, // 是否为捕获阶段监听器
    isDeferredListenerForLegacyFBSupport?: boolean // 是否为 legacy 延迟监听器
) {
    // 1. 创建带优先级的事件监听包装器
    let listener = createEventListenerWrapperWithPriority(
        targetContainer,
        domEventName,
        eventSystemFlags
    )
    // 2. 处理被动事件监听器（提升性能，避免阻塞主线程）
    let isPassiveListener: any = undefined
    if (passiveBrowserEventsSupported) { // 检查浏览器是否支持被动事件
        // 触摸和滚轮事件默认设为被动监听器，避免因 preventDefault 阻塞主线程
        if (['touchstart', 'touchmove', 'wheel'].includes(domEventName)) {
            isPassiveListener = true
        }
    }
    // 3. 调整目标容器（兼容 legacy FB 内部工具）
    targetContainer = enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport ? (targetContainer as any).ownerDocument : targetContainer
    // 4. 处理 legacy 一次性事件监听器（调用后自动移除）
    let unsubscribeListener;
    if (enableLegacyFBSupport && isDeferredListenerForLegacyFBSupport) {
        const originalListener = listener
        debugger
    }
    // 5. 根据事件阶段和被动选项，注册监听器
    if (isCapturePhaseListener) { // 捕获阶段
        if (isPassiveListener !== undefined) {
            debugger
            // 带被动选项的捕获阶段监听器
        } else {
            // 普通捕获阶段监听器
            unsubscribeListener = addEventCaptureListener(targetContainer, domEventName, listener)
        }
    } else {  // 冒泡阶段
        if (isPassiveListener !== undefined) {
            debugger
        } else {
            unsubscribeListener = addEventBubbleListener(targetContainer, domEventName, listener)
        }
    }
}

export function listenToNonDelegatedEvent(
    domEventName: DOMEventName,
    targetElement: Element
) {
    debugger
}

function isMatchingRootContainer(
    grandContainer: Element, // 待校验的容器（如 Fiber 节点关联的容器）
    targetContainer: EventTarget // 事件所属的目标根容器（如 React 挂载的根节点）
): boolean {
    // 两种匹配情况：
    // 1. 两个容器直接相等（同一 DOM 节点）
    // 2. grandContainer 是注释节点，且其父节点是 targetContainer（特殊场景：Suspense 边界的注释节点）
    return grandContainer === targetContainer || 
    (grandContainer.nodeType === COMMENT_NODE && grandContainer.parentNode === targetContainer)
}

function executeDispatch(
    event: ReactSyntheticEvent,
    listener: Function,
    currentTarget: EventTarget
) {
    const type = event.type || 'unknown-event'
    event.currentTarget = currentTarget
    // @ts-ignore
    invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event)
    event.currentTarget = null
}

/**
 * processDispatchQueueItemsInOrder 是 React 事件系统中负责按正确顺序触发单个事件监听器列表的核心子函数。它的核心逻辑是：根据事件阶段（捕获 / 冒泡）调整监听器遍历方向，逐个执行监听器回调，并在检测到 stopPropagation() 时终止传播，确保事件触发顺序与原生 DOM 行为一致，同时处理同一组件多个监听器的边缘场景。
*/
function processDispatchQueueItemsInOrder(
    event: ReactSyntheticEvent,
    dispatchListeners: Array<DispatchListener>,
    inCapturePhase: boolean
) {
    let previousInstance // 记录上一个执行监听器的 Fiber 实例（处理同一组件多监听器场景）
    // ====================== 分支1：捕获阶段（从根 → 目标，反向遍历） ======================
    if (inCapturePhase) {
        // 反向遍历监听器列表（原列表是“目标 → 根”，反向后变为“根 → 目标”）
        for (let i = dispatchListeners.length - 1; i >=0; i--) {
            const { instance, currentTarget, listener } = dispatchListeners[i]
            // 检查： 若切换到新组件且事件已中断，终止传播
            if (instance !== previousInstance && event.isPropagationStopped()) {
                return
            }
            // 执行当前监听器回调
            executeDispatch(event, listener, currentTarget)
            // 更新上一个组件实例
            previousInstance = instance
        }
    // ====================== 分支2：冒泡阶段（从目标 → 根，正向遍历） ======================
    } else {
        // 正向遍历监听器列表（原列表是“目标 → 根”，直接按顺序触发）
        for (let i = 0; i < dispatchListeners.length; i++) {
            const { instance, currentTarget, listener } = dispatchListeners[i]
            // 检查：若切换到新组件且事件已中断，终止传播
            if (instance !== previousInstance && event.isPropagationStopped()) {
                return
            }
            // 执行当前监听器回调
            executeDispatch(event, listener, currentTarget)
            // 更新上一个组件实例
            previousInstance = instance
        }
    }
}

/**
 * processDispatchQueue 是 React 事件系统中负责处理事件分发队列（DispatchQueue） 的核心函数。它的核心逻辑是：按顺序遍历队列中的 “合成事件 - 监听器” 对，调用子函数 processDispatchQueueItemsInOrder 触发监听器回调，并在所有回调执行后处理可能抛出的错误。它是 React 事件从 “收集监听器” 到 “实际触发回调” 的最终执行环节。
*/
export function processDispatchQueue(
    dispatchQueue: DispatchQueue,
    eventSystemFlags: EventSystemFlags
) {
    // ====================== 步骤1：判断当前事件阶段（捕获/冒泡） ======================
    const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0
    // 位运算判断：若 eventSystemFlags 包含 IS_CAPTURE_PHASE 标记，则为捕获阶段
    // ====================== 步骤2：遍历分发队列，处理每个“事件-监听器”对 ======================
    for (let i = 0; i < dispatchQueue.length; i++) {
        const { event, listeners } = dispatchQueue[i] // 解构合成事件和对应的监听器列表
        // 调用子函数，按顺序触发监听器
        processDispatchQueueItemsInOrder(event, listeners, inCapturePhase)
        // 注释：现代 React 事件系统不再使用事件池（event pooling），无需回收事件对象
    }
    // ====================== 步骤3：重新抛出监听器执行中捕获的错误 ======================
    rethrowCaughtError()
}

function dispatchEventsForPlugins(
    domEventName: DOMEventName,
    eventSystemFlags: EventSystemFlags,
    nativeEvent: AnyNativeEvent,
    targetInst: null | Fiber,
    targetContainer: EventTarget
) {
    // 1. 获取原生事件的目标 DOM 节点（标准化处理，兼容不同浏览器）
    const nativeEventTarget = getEventTarget(nativeEvent)
    // 2. 初始化事件分发队列（用于存储插件提取的事件处理信息）
    const dispatchQueue: DispatchQueue = []
    // 3. 调用插件提取事件信息，填充分发队列
    extractEvents(
        dispatchQueue,  // 输出：事件处理队列
        domEventName,   // 原生事件名
        targetInst,     // 目标 Fiber 实例
        nativeEvent,    // 原生事件对象
        nativeEventTarget,  // 标准化后的事件目标节点
        eventSystemFlags,  // 事件阶段标记
        targetContainer  // 根容器
    )
    // 4. 处理分发队列，按顺序触发事件回调
    processDispatchQueue(dispatchQueue, eventSystemFlags)
}

// dispatchEventForPluginEventSystem 是 React 事件系统中将原生事件分发到插件事件系统的核心入口函数。它负责处理事件的边界校验、根容器匹配、兼容逻辑（如旧版 Facebook 系统），并最终通过批量更新机制触发事件插件的处理逻辑（如合成事件创建、组件回调触发）
// React 事件系统采用 “插件化” 设计，不同类型的事件（如点击、表单、触摸）由不同的插件处理（如 SimpleEventPlugin 处理基础事件）。dispatchEventForPluginEventSystem 的作用是：在原生事件触发后，完成必要的前置处理（如确定事件所属的 React 根容器、兼容旧系统），然后将事件交给插件系统处理，最终触发组件的事件回调（如 onClick）。
export function dispatchEventForPluginEventSystem(
    domEventName: DOMEventName,
    eventSystemFlags: EventSystemFlags,
    nativeEvent: AnyNativeEvent,
    targetInst: null | Fiber,
    targetContainer: EventTarget
) {
    // 初始化：ancestorInst 用于记录最终参与事件分发的祖先 Fiber 实例
    let ancestorInst = targetInst
    if (
        (eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE) === 0 &&
        (eventSystemFlags & IS_NON_DELEGATED) === 0
    ) {
        const targetContainerNode = targetContainer  // 根容器的 DOM 节点
        // 1. 兼容旧版 Facebook 系统：延迟 click 事件到 document（模拟 React <16 的委托行为）
        if (
            enableLegacyFBSupport &&
            domEventName === 'click' && // 仅处理 click 事件
            (eventSystemFlags & SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE) === 0 &&
            !isReplayingEvent(nativeEvent)  // 非重放事件
        ) {
            debugger
        }
        // 2. 核心逻辑：确定事件所属的 React 根容器，找到对应的祖先 Fiber 实例
        if (targetInst !== null) {
            let node: Fiber | null = targetInst

            // 循环遍历 Fiber 树，向上查找匹配当前根容器的节点
            mainLoop: while (true) {
                if (node === null) {
                    return  // 未找到有效节点，终止分发
                }
                const nodeTag = node.tag
                // 检查当前节点是否是根节点（HostRoot）或 Portal 节点（HostPortal）
                if (nodeTag === HostRoot || nodeTag === HostPortal) {
                    // 获取该节点对应的容器（如 HostRoot 的 containerInfo 是根 DOM 节点）
                    let container = node.stateNode.containerInfo
                    // 若容器与当前根容器（targetContainerNode）匹配，说明找到正确的根边界
                    if (isMatchingRootContainer(container, targetContainerNode)) {
                        break  // 跳出循环，使用当前 node 对应的祖先实例
                    }
                    // 若节点是 Portal 且容器不匹配，检查其祖先是否属于当前根容器
                    if (nodeTag === HostPortal) {
                        debugger
                    }

                    // 若容器不匹配，从 DOM 层面向上查找属于当前根容器的节点
                    while (container !== null) {
                        debugger
                        break
                    }
                }
                node = node.return
            }
        }
    }
    
    batchedUpdates(() => dispatchEventsForPlugins(domEventName, eventSystemFlags, nativeEvent, ancestorInst, targetContainer))
}

export function accumulateEventHandleNonManagedNodeListeners(
    reactEventType: DOMEventName,
    currentTarget: EventTarget,
    inCapturePhase: boolean,
): Array<DispatchListener> {
    debugger
}

/**
 * accumulateSinglePhaseListeners 是 React 事件系统中负责收集特定阶段（捕获 / 冒泡）事件监听器的核心函数。它的核心逻辑是：从事件触发的「目标 Fiber 节点」开始，向上遍历整个 Fiber 树，筛选出与当前事件类型、阶段匹配的监听器（如 onClick、onClickCapture），最终返回监听器列表，为后续按顺序触发回调提供数据支撑。
之所以需要这个函数，是因为 React 采用「事件委托」机制（事件统一绑定在根容器上，而非每个 DOM 节点），无法依赖原生 DOM 事件的冒泡 / 捕获，必须手动遍历 Fiber 树模拟传播过程—— 而该函数就是 “模拟传播” 的第一步：找到所有需要触发的监听器。
核心背景：为什么需要手动收集监听器？
原生 DOM 事件会自动从目标节点向根节点冒泡（或从根向目标捕获），但 React 为了性能和兼容性，将所有事件委托到根容器（如 div#root）。这意味着：

原生事件触发后，React 只能拿到 “根容器” 和 “目标节点”，无法直接知道中间层级组件的监听器；
必须通过「遍历 Fiber 树」的方式，从目标节点向上查找所有注册了对应事件的组件，手动收集监听器；
收集时需区分「捕获阶段」（监听器名带 Capture 后缀，如 onClickCapture）和「冒泡阶段」（监听器名无后缀，如 onClick），确保触发顺序与原生一致。
*/
export function accumulateSinglePhaseListeners(
    targetFiber: Fiber | null,
    reactName: string | null,
    nativeEventType: string,
    inCapturePhase: boolean,
    accumulateTargetOnly: boolean,
    nativeEvent: AnyNativeEvent,
): Array<DispatchListener> {
    const captureName = reactName !== null ? reactName + 'Capture' : null
    const reactEventName = inCapturePhase ? captureName : reactName
    let listeners: Array<DispatchListener> = []
    let instance = targetFiber // 遍历起点：目标 Fiber
    let lastHostComponent: any = null // 记录最近的「HostComponent 对应的 DOM 节点」

    while(instance !== null) {
        const { stateNode, tag } = instance
        if (tag === HostComponent && stateNode !== null) {
            lastHostComponent = stateNode  // 更新最近的 DOM 节点
            // 收集「createEventHandleAPI」相关监听器（旧版/特殊事件，较少用）
            if (enableCreateEventHandleAPI) {
                const eventHandlerListeners = getEventHandlerListeners(lastHostComponent)
                if (eventHandlerListeners !== null) {
                    eventHandlerListeners.forEach(entry => {
                        // 筛选条件：事件类型匹配 + 阶段匹配
                        if (entry.type === nativeEventType && entry.capture === inCapturePhase) {
                            listeners.push(createDispatchListener(instance, entry.callback, lastHostComponent))
                        }
                    })
                }
            }
            // 收集「标准 React 事件监听器」（如 onClick、onClickCapture）
            if (reactEventName !== null) {
                // 从 Fiber 的 memoizedProps 中获取事件回调（如 props.onClick）
                const listener = getListener(instance, reactEventName)
                if (listener != null) {
                    // 包装成 DispatchListener 加入列表
                    listeners.push(createDispatchListener(instance, listener, lastHostComponent))
                }
            }
        // 处理「ScopeComponent」（事件作用域隔离，可选特性）
        } else if (
            enableCreateEventHandleAPI &&
            enableScopeAPI &&
            tag === ScopeComponent &&
            lastHostComponent !== null &&
            stateNode !== null
        ) {
            const reactScopeInstance = stateNode
            const eventHandlerListeners = getEventHandlerListeners(reactScopeInstance)
            if (eventHandlerListeners !== null) {
                eventHandlerListeners.forEach(entry => {
                    if (entry.type === nativeEventType && entry.capture === inCapturePhase) {
                        listeners.push(createDispatchListener(instance, entry.callback, lastHostComponent))
                    }
                })
            }
        }
        // accumulateTargetOnly：仅收集目标节点的监听器, 部分事件（如 scroll、focus）在原生 DOM 中不冒泡，React 为了对齐原生行为，通过 accumulateTargetOnly = true 中断遍历：
        if (accumulateTargetOnly) {
            break  // 停止向上遍历，仅保留目标节点的监听器
        }
        // beforeblur 事件的特殊处理（避免无效回调）
        // beforeblur 是 React 内部用于处理焦点切换的事件，可能在 “组件卸载 / 隐藏” 时触发，此时需要清空已收集的监听器（防止触发已卸载组件的回调）
        if (enableCreateEventHandleAPI && nativeEvent.type === 'beforeblur') {
            const detachedInterceptFiber = (nativeEvent as any)._detachedInterceptFiber  // 标记的“已卸载 Fiber”
            if (detachedInterceptFiber !== null && (detachedInterceptFiber === instance || detachedInterceptFiber === instance.stateNode)) {
                listeners = [] // 清空监听器，避免无效回调
            }
        }
        instance = instance.return
    }
    return listeners
}

export function accumulateTwoPhaseListeners(
    targetFiber: Fiber | null,
    reactName: string
): Array<DispatchListener> {
    debugger
}