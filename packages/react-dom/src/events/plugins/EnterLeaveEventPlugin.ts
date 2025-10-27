import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { DOMEventName } from "../DOMEventNames"
import type { DispatchQueue } from "../DOMPluginEventSystem"
import type { AnyNativeEvent } from "../PluginModuleType"
import type { EventSystemFlags } from "../EventSystemFlags"
import { registerDirectEvent } from "../EventRegistry"
import { isReplayingEvent } from "../CurrentReplayingEvent"

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
        debugger
    }
    if (!isOutEvent && !isOverEvent) {
        return
    }
    debugger
}

export { registerEvents, extractEvents }