import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { DOMEventName } from "../DOMEventNames"
import { accumulateEnterLeaveTwoPhaseListeners, type DispatchQueue } from "../DOMPluginEventSystem"
import type { AnyNativeEvent } from "../PluginModuleType"
import type { EventSystemFlags } from "../EventSystemFlags"
import { registerDirectEvent } from "../EventRegistry"
import { isReplayingEvent } from "../CurrentReplayingEvent"
import { getClosestInstanceFromNode, getNodeFromInstance, isContainerMarkedAsRoot } from "react-dom/src/client/ReactDOMComponentTree"
import { getNearestMountedFiber } from "react-reconciler/src/ReactFiberTreeReflection"
import { HostComponent, HostText } from "react-reconciler/src/ReactWorkTags"
import { SyntheticMouseEvent, SyntheticPointerEvent } from "../SyntheticEvent"
import { KnownReactSyntheticEvent } from "../ReactSyntheticEventType"

function registerEvents() {
    registerDirectEvent('onMouseEnter', ['mouseout', 'mouseover']);
    registerDirectEvent('onMouseLeave', ['mouseout', 'mouseover']);
    registerDirectEvent('onPointerEnter', ['pointerout', 'pointerover']);
    registerDirectEvent('onPointerLeave', ['pointerout', 'pointerover']);
}

function extractEvents(
    dispatchQueue: DispatchQueue,
    domEventName: DOMEventName,
    targetInst: null | Fiber,
    nativeEvent: AnyNativeEvent,
    nativeEventTarget: null | EventTarget,
    eventSystemFlags: EventSystemFlags,
    targetContainer: EventTarget,
) {
    const isOverEvent = domEventName === 'mouseover' || domEventName === 'pointerover'
    const isOutEvent = domEventName === 'mouseout' || domEventName === 'pointerout'

    if (isOverEvent && !isReplayingEvent(nativeEvent)) {
        const related = (nativeEvent as any).relatedTarget || (nativeEvent as any).fromElement
        if (related) {
            if (getClosestInstanceFromNode(related) || isContainerMarkedAsRoot(related)) return
        }
    }
    if (!isOutEvent && !isOverEvent) {
        return
    }
    let win
    if ((nativeEventTarget as any).window === nativeEventTarget) {
        win = nativeEventTarget
    } else {
        const doc = (nativeEventTarget as any).ownerDocument
        if (doc) {
            win = doc.defaultView || doc.parentWindow
        } else {
            win = window
        }
    }

    let from
    let to
    if (isOutEvent) {
        const related = (nativeEvent as any).relatedTarget || (nativeEvent as any).toElement
        from = targetInst
        to = related ? getClosestInstanceFromNode(related) : null
        if (to !== null) {
            const nearestMounted = getNearestMountedFiber(to)
            if (to !== nearestMounted || (to.tag !== HostComponent && to.tag !== HostText)) {
                to = null
            }
        }
    } else {
        from = null
        to = targetInst
    }
    if (from === to) return

    let SyntheticEventCtor: any = SyntheticMouseEvent
    let leaveEventType = 'onMouseLeave'
    let enterEventType = 'onMouseEnter'
    let eventTypePrefix = 'mouse'
    if (domEventName === 'pointerout' || domEventName === 'pointerover') {
        SyntheticEventCtor = SyntheticPointerEvent;
        leaveEventType = 'onPointerLeave';
        enterEventType = 'onPointerEnter';
        eventTypePrefix = 'pointer';
    }
    const fromNode = from == null ? win : getNodeFromInstance(from)
    const toNode = to == null ? win : getNodeFromInstance(to)
    const leave = new SyntheticEventCtor(leaveEventType, eventTypePrefix + 'leave', from, nativeEvent, nativeEventTarget)
    leave.target = fromNode
    leave.relatedTarget = toNode
    let enter: KnownReactSyntheticEvent | null = null
    const nativeTargetInst = getClosestInstanceFromNode(nativeEventTarget as any)
    if (nativeEventTarget === targetInst) {
        const enterEvent: KnownReactSyntheticEvent = new SyntheticEventCtor(enterEventType, eventTypePrefix + 'enter', to, nativeEvent, nativeEventTarget)
        enterEvent.target = toNode
        enterEvent.relatedTarget = fromNode
        enter = enterEvent
    }
    accumulateEnterLeaveTwoPhaseListeners(dispatchQueue, leave, enter, from, to)
}

export { registerEvents, extractEvents }