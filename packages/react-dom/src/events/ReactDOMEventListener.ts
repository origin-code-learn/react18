import {
  ContinuousEventPriority,
  DefaultEventPriority,
  DiscreteEventPriority,
  getCurrentUpdatePriority,
  IdleEventPriority,
  setCurrentUpdatePriority
} from "react-reconciler/src/ReactEventPriorities";
import { DOMEventName } from "./DOMEventNames";
import { EventSystemFlags, IS_CAPTURE_PHASE } from "./EventSystemFlags";
import {
  getCurrentPriorityLevel as getCurrentSchedulerPriorityLevel,
  IdlePriority as IdleSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  LowPriority as LowSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
} from 'react-reconciler/src/Scheduler';
import { AnyNativeEvent } from "./PluginModuleType";
import ReactCurrentBatchConfig from "react/src/ReactCurrentBatchConfig";
import { enableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay } from "shared/ReactFeatureFlags";
import { Container, SuspenseInstance } from "ReactDOMHostConfig";
import getEventTarget from "./getEventTarget";
import { getClosestInstanceFromNode } from "../client/ReactDOMComponentTree";
import { getContainerFromFiber, getNearestMountedFiber, getSuspenseInstanceFromFiber } from "react-reconciler/src/ReactFiberTreeReflection";
import { HostRoot, SuspenseComponent } from "react-reconciler/src/ReactWorkTags";
import { Fiber, FiberRoot } from "react-reconciler/src/ReactInternalTypes";
import { isRootDehydrated } from "react-reconciler/src/ReactFiberShellHydration";
import { dispatchEventForPluginEventSystem } from "./DOMPluginEventSystem";
import { clearIfContinuousEvent, isDiscreteEventThatRequiresHydration, queueIfContinuousEvent } from "./ReactDOMEventReplaying";

export let _enabled = true
export function setEnabled(enabled?: boolean) {
  _enabled = !!enabled
}
export function isEnabled() {
  return _enabled
}

/**
 * findInstanceBlockingEvent 是 React 事件系统中用于检测事件传播是否被未就绪组件（如未完成 hydration 的 Suspense 组件或脱水状态的根节点）阻塞的核心函数。它会定位事件目标对应的 React 内部实例（Fiber），判断是否存在阻塞事件处理的实例（如 Suspense 组件、未 hydration 的根容器），并通过全局变量 return_targetInst 传递事件的目标 Fiber 实例，为后续事件分发或 hydration 处理提供依据。
核心背景：事件阻塞与 Hydration 场景
  在服务端渲染（SSR）的 hydration 过程中，React 会将服务器返回的静态 HTML 逐步转换为可交互的组件。若用户在 hydration 完成前触发事件（如点击未激活的按钮），事件可能被未就绪的组件（如处于 Suspense 状态的组件）或未完成 hydration 的根节点阻塞。
  该函数的作用就是识别这些阻塞实例，确保事件不会被误处理，同时为后续的 “选择性 hydration”（只激活阻塞组件）提供目标信息。
*/
// 全局变量：用于传递事件对应的目标 Fiber 实例（事件最终要触发的组件）
let return_targetInst: null | Fiber = null
export function findInstanceBlockingEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent
): null | Container | SuspenseInstance {
  return_targetInst = null

  // 1. 找到原生事件的目标 DOM 节点（如用户点击的按钮）
  const nativeEventTarget = getEventTarget(nativeEvent)
  // 从目标 DOM 节点找到对应的最近的 React Fiber 实例（事件最初要触发的组件）
  let targetInst = getClosestInstanceFromNode(nativeEventTarget)

  if (targetInst !== null) {
    // 2. 找到最近的已挂载 Fiber 节点（排除未挂载的临时节点）
    const nearestMounted = getNearestMountedFiber(targetInst)
    if (nearestMounted === null) {
      // 情况 1：目标 Fiber 树已卸载，事件无有效目标
      targetInst = null
    } else {
      // 3. 根据已挂载 Fiber 的类型判断是否阻塞事件
      const tag = nearestMounted.tag
      if (tag === SuspenseComponent) {
        // 情况 2：目标是未就绪的 Suspense 组件（处于挂起状态）
        const instance = getSuspenseInstanceFromFiber(nearestMounted)
        if (instance !== null) {
          // 返回 Suspense 实例（事件被 Suspense 阻塞，需延迟处理）
          return instance
        }
        // 异常情况：Suspense 实例不存在，清空目标（避免错误）
        targetInst = null
      } else if (tag === HostRoot) {
        // 情况 3：目标是根节点（HostRoot），检查是否处于脱水状态（未完成 hydration）
        const root: FiberRoot = nearestMounted.stateNode
        if (isRootDehydrated(root)) {
          // 返回根容器（事件被脱水的根节点阻塞，需先完成 hydration）
          return getContainerFromFiber(nearestMounted)
        }
        // 根节点已完成 hydration，清空目标（事件可正常处理）
        targetInst = null
      } else if (nearestMounted !== targetInst) {
        // 情况 4：目标组件未完成挂载（如 hydration 未结束）
        // 忽略事件，避免触发未就绪组件的回调
        targetInst = null
      }
    }
  }
  // 4. 记录事件的目标 Fiber 实例（供后续事件分发使用）
  return_targetInst = targetInst
  // 无阻塞实例，事件可正常传播
  return null
}

/**
 * dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay 是 React 在启用 “捕获阶段选择性 hydration 且不重放离散事件” 特性时使用的事件分发函数。它主要用于优化服务端渲染（SSR）场景下的事件处理，核心目标是：在事件捕获阶段，只对阻塞事件传播的未完成 hydration 组件进行同步 hydration（而非全量 hydration），同时避免离散事件（如点击）的重复触发，提升交互响应速度。
核心背景：服务端渲染（SSR）的 Hydration 问题
  在服务端渲染中，客户端会先收到服务器返回的静态 HTML，再通过 “hydration” 过程将静态节点转换为可交互的 React 组件（绑定事件、初始化状态等）。若 hydration 未完成时用户触发事件（如点击未 hydrate 的按钮），事件可能因组件未就绪而无法正确响应。
  该函数通过检测 “阻塞事件传播的未 hydrate 组件”，针对性地进行同步 hydration，确保事件能正常触发，同时避免全量 hydration 带来的性能开销。
*/
function dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  // 1. 查找阻塞事件传播的实例（通常是未完成 hydration 的组件）
  let blockedOn = findInstanceBlockingEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent)

  // 2. 若没有阻塞实例，直接分发事件并清理连续事件
  if (blockedOn === null) {
    // 调用插件事件系统分发事件（触发组件回调）
    dispatchEventForPluginEventSystem(
      domEventName,
      eventSystemFlags,
      nativeEvent,
      return_targetInst, // 事件目标对应的 Fiber 实例
      targetContainer
    )
    // 清理连续事件（如 scroll、mousemove，避免残留状态）
    clearIfContinuousEvent(domEventName, nativeEvent)
    return
  }
  // 3. 若有阻塞实例，处理连续事件（如滚动、鼠标移动）
  if (
    queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) // 若为连续事件，将其排队（后续统一处理）
  ) {
    nativeEvent.stopPropagation()
    return
  }
  // 非连续事件：清理连续事件状态
  clearIfContinuousEvent(domEventName, nativeEvent)
  // 4. 处理捕获阶段的离散事件（需 hydration 的高优先级事件，如点击）
  if (
    (eventSystemFlags & IS_CAPTURE_PHASE) &&
    isDiscreteEventThatRequiresHydration(domEventName)
  ) {
    debugger
    return
  }

  // 5. 处理不可重放的事件（直接分发，不指定目标实例）
  dispatchEventForPluginEventSystem(
    domEventName,
    eventSystemFlags,
    nativeEvent,
    null, // 不指定目标实例（可能因未hydration无法确定）
    targetContainer
  )
}

// dispatchDiscreteEvent 是 React 事件系统中处理 “离散事件”（Discrete Event）的调度函数，主要用于在触发用户交互类事件（如点击、键盘输入）时，临时提升事件处理的优先级，确保这些高优先级事件能被优先响应，同时在处理完成后恢复原有状态，避免影响其他低优先级任务。
function dispatchDiscreteEvent(
  domEventName,  // 原生 DOM 事件名（如 'click'、'keydown'）
  eventSystemFlags, // 事件系统标记（如是否为捕获阶段）
  container,  // 事件所属的容器（如根容器）
  nativeEvent  // 原生 DOM 事件对象
) {
  // 1. 保存当前的更新优先级和过渡配置（用于后续恢复）
  const previousPriority = getCurrentUpdatePriority()  // 获取当前的更新优先级
  const prevTransition = ReactCurrentBatchConfig.transition  // 获取当前的过渡配置
  ReactCurrentBatchConfig.transition = null;  // 临时清空过渡配置（避免离散事件被当作过渡任务）

  try {
    // 2. 临时将更新优先级设为“离散事件优先级”（最高优先级）
    setCurrentUpdatePriority(DiscreteEventPriority)
    // 3. 调度事件处理（核心逻辑，实际分发事件到对应的组件回调）
    dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent)
  } finally {
    // 4. 无论事件处理是否成功，恢复原有优先级和过渡配置
    setCurrentUpdatePriority(previousPriority)
    ReactCurrentBatchConfig.transition = prevTransition
  }
}

function dispatchContinuousEvent(
  domEventName,
  eventSystemFlags,
  container,
  nativeEvent
) {
  const previousPriority = getCurrentUpdatePriority()
  const prevTransition = ReactCurrentBatchConfig.transition
  ReactCurrentBatchConfig.transition = null
  try {
    setCurrentUpdatePriority(ContinuousEventPriority)
    dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent)
  } finally {
    setCurrentUpdatePriority(previousPriority)
    ReactCurrentBatchConfig.transition = prevTransition
  }
}

// dispatchEvent 是 React 合成事件系统中事件分发的入口函数，根据不同的特性开关（enableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay）决定使用不同的事件分发实现，是连接原生 DOM 事件与 React 组件事件回调的 “总开关”。
function dispatchEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  // 1. 检查事件系统是否启用（_enabled 为全局开关）
  if (!_enabled) {
    return
  }
  // 2. 根据特性开关选择事件分发实现
  if (enableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay) {
    dispatchEventWithEnableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay(domEventName, eventSystemFlags, targetContainer, nativeEvent)
  } else {
    dispatchEventOriginal(domEventName, eventSystemFlags, targetContainer, nativeEvent)
  }
}

function dispatchEventOriginal(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  targetContainer: EventTarget,
  nativeEvent: AnyNativeEvent
) {
  debugger
}


export function createEventListenerWrapperWithPriority(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags
): Function {
  const eventPriority = getEventPriority(domEventName)
  let listenerWrapper
  switch (eventPriority) {
    case DiscreteEventPriority:
      listenerWrapper = dispatchDiscreteEvent
      break;
    case ContinuousEventPriority:
      listenerWrapper = dispatchContinuousEvent
      break;
    case DefaultEventPriority:
    default:
      listenerWrapper = dispatchEvent
      break;
  }
  return listenerWrapper.bind(null, domEventName, eventSystemFlags, targetContainer)
}





export function getEventPriority(domEventName: DOMEventName) {
  switch (domEventName) {
    case 'cancel':
    case 'click':
    case 'close':
    case 'contextmenu':
    case 'copy':
    case 'cut':
    case 'auxclick':
    case 'dblclick':
    case 'dragend':
    case 'dragstart':
    case 'drop':
    case 'focusin':
    case 'focusout':
    case 'input':
    case 'invalid':
    case 'keydown':
    case 'keypress':
    case 'keyup':
    case 'mousedown':
    case 'mouseup':
    case 'paste':
    case 'pause':
    case 'play':
    case 'pointercancel':
    case 'pointerdown':
    case 'pointerup':
    case 'ratechange':
    case 'reset':
    case 'resize':
    case 'seeked':
    case 'submit':
    case 'touchcancel':
    case 'touchend':
    case 'touchstart':
    case 'volumechange':
    case 'change':
    case 'selectionchange':
    case 'textInput':
    case 'compositionstart':
    case 'compositionend':
    case 'compositionupdate':
    case 'beforeblur':
    case 'afterblur':
    case 'beforeinput':
    case 'blur':
    case 'fullscreenchange':
    case 'focus':
    case 'hashchange':
    case 'popstate':
    case 'select':
    case 'selectstart':
      return DiscreteEventPriority;
    case 'drag':
    case 'dragenter':
    case 'dragexit':
    case 'dragleave':
    case 'dragover':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
    case 'pointermove':
    case 'pointerout':
    case 'pointerover':
    case 'scroll':
    case 'toggle':
    case 'touchmove':
    case 'wheel':
    case 'mouseenter':
    case 'mouseleave':
    case 'pointerenter':
    case 'pointerleave':
      return ContinuousEventPriority;
    case 'message': {
      const schedulerPriority = getCurrentSchedulerPriorityLevel();
      switch (schedulerPriority) {
        case ImmediateSchedulerPriority:
          return DiscreteEventPriority;
        case UserBlockingSchedulerPriority:
          return ContinuousEventPriority;
        case NormalSchedulerPriority:
        case LowSchedulerPriority:
          // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
          return DefaultEventPriority;
        case IdleSchedulerPriority:
          return IdleEventPriority;
        default:
          return DefaultEventPriority;
      }
    }
    default:
      return DefaultEventPriority;
  }
}
