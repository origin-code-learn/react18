import { Container, SuspenseInstance } from "ReactDOMHostConfig";
import { DOMEventName } from "./DOMEventNames";
import { EventSystemFlags } from "./EventSystemFlags";
import { AnyNativeEvent } from "./PluginModuleType";

type QueuedReplayableEvent = {
    blockedOn: null | Container | SuspenseInstance,
    domEventName: DOMEventName,
    eventSystemFlags: EventSystemFlags,
    nativeEvent: AnyNativeEvent,
    targetContainers: Array<EventTarget>,
};

let queuedFocus: null | QueuedReplayableEvent = null;
let queuedDrag: null | QueuedReplayableEvent = null;
let queuedMouse: null | QueuedReplayableEvent = null;
// For pointer events there can be one latest event per pointerId.
const queuedPointers: Map<number, QueuedReplayableEvent> = new Map();
const queuedPointerCaptures: Map<number, QueuedReplayableEvent> = new Map();

const discreteReplayableEvents: Array<DOMEventName> = [
    'mousedown',
    'mouseup',
    'touchcancel',
    'touchend',
    'touchstart',
    'auxclick',
    'dblclick',
    'pointercancel',
    'pointerdown',
    'pointerup',
    'dragend',
    'dragstart',
    'drop',
    'compositionend',
    'compositionstart',
    'keydown',
    'keypress',
    'keyup',
    'input',
    'textInput', // Intentionally camelCase
    'copy',
    'cut',
    'paste',
    'click',
    'change',
    'contextmenu',
    'reset',
    'submit',
];
export function isDiscreteEventThatRequiresHydration(eventType: DOMEventName): boolean {
    return discreteReplayableEvents.indexOf(eventType) > -1
}

export function queueIfContinuousEvent(
    blockedOn: null | Container | SuspenseInstance,
    domEventName: DOMEventName,
    eventSystemFlags: EventSystemFlags,
    targetContainer: EventTarget,
    nativeEvent: AnyNativeEvent
): boolean {
    debugger
    return false
}

export function clearIfContinuousEvent(
    domEventName: DOMEventName,
    nativeEvent: AnyNativeEvent
) {
    switch (domEventName) {
        case 'focusin':
        case 'focusout':
            queuedFocus = null
            break
        case 'dragenter':
        case 'dragleave':
            queuedDrag = null
            break
        case 'mouseover':
        case 'mouseout':
            queuedMouse = null
            break
        case 'pointerover':
        case 'pointerout':
            const pointerId = (nativeEvent as PointerEvent).pointerId
            queuedPointers.delete(pointerId)
            break
        case 'gotpointercapture':
        case 'lostpointercapture': {
            const pointerId = (nativeEvent as PointerEvent).pointerId
            queuedPointerCaptures.delete(pointerId)
            break
        }
    }
}