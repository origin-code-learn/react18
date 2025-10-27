
import { IS_CAPTURE_PHASE, IS_EVENT_HANDLE_NON_MANAGED_NODE, type EventSystemFlags } from '../EventSystemFlags'
import type { Fiber } from 'react-reconciler/src/ReactInternalTypes'
import { ANIMATION_END, ANIMATION_ITERATION, ANIMATION_START, TRANSITION_END, type DOMEventName } from '../DOMEventNames'
import type { AnyNativeEvent } from '../PluginModuleType'
import { accumulateEventHandleNonManagedNodeListeners, accumulateSinglePhaseListeners, type DispatchQueue } from '../DOMPluginEventSystem'

import { registerSimpleEvents, topLevelEventsToReactNames } from '../DOMEventProperties'
import { SyntheticAnimationEvent, SyntheticClipboardEvent, SyntheticDragEvent, SyntheticEvent, SyntheticFocusEvent, SyntheticKeyboardEvent, SyntheticMouseEvent, SyntheticPointerEvent, SyntheticTouchEvent, SyntheticTransitionEvent, SyntheticUIEvent, SyntheticWheelEvent } from '../SyntheticEvent'
import getEventCharCode from '../getEventCharCode'
import { enableCreateEventHandleAPI } from 'shared/ReactFeatureFlags'

/**
 * 这段代码是 SimpleEventPlugin 内部的核心 extractEvents 函数（SimpleEventPlugin 是 React 处理基础事件的核心插件），负责将原生基础事件（如 click、keydown、mouseover 等）转换为 React 合成事件（SyntheticEvent），过滤无效事件，收集对应阶段的事件监听器（回调函数），并最终将 “合成事件 + 监听器” 的组合填入 dispatchQueue（分发队列），是基础事件从 “原生” 到 “React 可处理” 的关键转换逻辑
 * 
*/
function extractEvents(
    dispatchQueue: DispatchQueue,  // 输出：事件分发队列（存储“合成事件+监听器”）
    domEventName: DOMEventName,    // 原生事件名（如 'click'、'keydown'）
    targetInst: null | Fiber,      // 事件目标对应的 Fiber 实例
    nativeEvent: AnyNativeEvent,   // 原生 DOM 事件对象
    nativeEventTarget: null | EventTarget, // 标准化后的事件目标节点
    eventSystemFlags: EventSystemFlags,  // 事件系统标记（捕获/冒泡阶段、API 开关）
    targetContainer: EventTarget,  // 事件所属的根容器
) {
    // ====================== 步骤1：原生事件名 → React 事件名映射 ======================
    // topLevelEventsToReactNames：全局映射表，存储“原生事件名 → React 事件名”（如 'click' → 'onClick'）
    const reactName = topLevelEventsToReactNames.get(domEventName)
    if (reactName === undefined) {
        return // 无对应 React 事件名（非基础事件），直接退出
    }
    // ====================== 步骤2：根据原生事件类型，选择对应的合成事件构造函数 ======================
    let SyntheticEventCtor: any = SyntheticEvent  // 默认合成事件基类
    let reactEventType: DOMEventName = domEventName  // React 事件类型（默认与原生一致）
    switch (domEventName) {
        // 键盘事件：keypress/keydown/keyup → SyntheticKeyboardEvent
        case 'keypress':
            // 过滤 Firefox 下函数键的无效 keypress 事件（函数键 charCode 为 0）
            if (getEventCharCode(nativeEvent as KeyboardEvent) === 0) {
                return 
            }
        /* falls through */ // 穿透到 keydown/keyup 的逻辑
        case 'keydown':
        case 'keyup':
            SyntheticEventCtor = SyntheticKeyboardEvent
            break;
        // 焦点事件：focusin/focusout → SyntheticFocusEvent（修正事件类型为 focus/blur）
        case 'focusin':
            reactEventType = 'focus' // React 暴露的事件名是 onFocus，而非 onFocusin
            SyntheticEventCtor = SyntheticFocusEvent
            break
        case 'focusout':
            reactEventType = 'blur'  // 同理，onBlur 对应原生 focusout
            SyntheticEventCtor = SyntheticFocusEvent
            break
        case 'beforeblur':
        case 'afterblur':
            SyntheticEventCtor = SyntheticFocusEvent
            break
        // 鼠标事件：click/dblclick/mousedown 等 → SyntheticMouseEvent
        case 'click':
            // 过滤 Firefox 下右键点击的无效 click 事件（右键 button 值为 2）
            // @ts-ignore
            if (nativeEvent.button === 2) {
                return
            }
        case 'auxclick':
        case 'dblclick':
        case 'mousedown':
        case 'mousemove':
        case 'mouseup':
        case 'mouseout':
        case 'mouseover':
        case 'contextmenu':
            SyntheticEventCtor = SyntheticMouseEvent
            break
        // 其他事件类型：拖拽、触摸、动画、滚动等，对应各自的合成事件类
        case 'drag':
        case 'dragend':
        case 'dragenter':
        case 'dragexit':
        case 'dragleave':
        case 'dragover':
        case 'dragstart':
        case 'drop':
            SyntheticEventCtor = SyntheticDragEvent
            break
        case 'touchcancel':
        case 'touchend':
        case 'touchmove':
        case 'touchstart':
            SyntheticEventCtor = SyntheticTouchEvent
            break
        case ANIMATION_END:
        case ANIMATION_ITERATION:
        case ANIMATION_START:
            SyntheticEventCtor = SyntheticAnimationEvent;
            break;
        case TRANSITION_END:
            SyntheticEventCtor = SyntheticTransitionEvent;
            break; 
        case 'scroll':
            SyntheticEventCtor = SyntheticUIEvent;
            break;
        case 'wheel':
            SyntheticEventCtor = SyntheticWheelEvent;
            break;
        case 'copy':
        case 'cut':
        case 'paste':
            SyntheticEventCtor = SyntheticClipboardEvent;
            break;
        case 'gotpointercapture':
        case 'lostpointercapture':
        case 'pointercancel':
        case 'pointerdown':
        case 'pointermove':
        case 'pointerout':
        case 'pointerover':
        case 'pointerup':
            SyntheticEventCtor = SyntheticPointerEvent;
            break;
        default:
            break
    }

    // ====================== 步骤3：判断事件阶段（捕获/冒泡） ======================
    const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0

    // ====================== 步骤4：收集事件监听器（分两种场景） ======================
    if (
        enableCreateEventHandleAPI && // 启用了非托管节点事件 API
        eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE // 处理非 React 管理的 DOM 节点
    ) {
        // 场景1：收集非 React 管理节点的监听器（如直接操作 DOM 的节点）
        const listeners = accumulateEventHandleNonManagedNodeListeners(reactEventType, targetContainer, inCapturePhase)
        if (listeners.length > 0) {
            // 惰性创建合成事件（有监听器才创建，优化性能）
            const event = new SyntheticEventCtor(
                reactName,        // React 事件名（如 'onClick'）
                reactEventType,   // 修正后的事件类型（如 'focus'）
                null,             // 暂存的 currentTarget（后续触发时赋值）
                nativeEvent,      // 原生事件对象
                nativeEventTarget // 标准化目标节点
            )
            dispatchQueue.push({event, listeners}) // 加入分发队列
        }
    } else {
        // 场景2：收集 React 管理节点的监听器（绝大多数情况）
        // 判断是否只收集目标节点的监听器（如 scroll 事件默认不冒泡，对齐浏览器行为）
        const accumulateTargetOnly = !inCapturePhase && // 仅冒泡阶段
                                    domEventName === 'scroll'  //  scroll 事件特殊处理（不冒泡）
        // 从目标 Fiber 向上遍历，收集当前阶段（捕获/冒泡）的所有监听器
        const listeners = accumulateSinglePhaseListeners(
            targetInst,        // 目标 Fiber 实例
            reactName,         // React 事件名（如 'onClick'）
            nativeEvent.type,  // 原生事件类型（如 'click'）
            inCapturePhase,    // 是否为捕获阶段
            accumulateTargetOnly, // 是否只收集目标节点
            nativeEvent        // 原生事件对象
        )
        if (listeners.length > 0) {
            // 惰性创建合成事件
            const event = new SyntheticEventCtor(
                reactName,
                reactEventType,
                null,
                nativeEvent,
                nativeEventTarget
            )
            dispatchQueue.push({event, listeners}) // 加入分发队列
        }
    }
}

export {
    registerSimpleEvents as registerEvents,
    extractEvents
}