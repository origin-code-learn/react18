import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { DOMEventName } from "../DOMEventNames"
import { accumulateTwoPhaseListeners, type DispatchQueue } from "../DOMPluginEventSystem"
import type { AnyNativeEvent } from "../PluginModuleType"
import type { EventSystemFlags } from "../EventSystemFlags"
import { registerTwoPhaseEvent } from "../EventRegistry"
import { canUseDOM } from "shared/ExecutionEnvironment"

const documentMode: any = (canUseDOM && 'documentMode' in document) ? document.documentMode : null
const canUseCompositionEvent = canUseDOM && 'CompositionEvent' in window
const canUseTextInputEvent = canUseDOM && 'TextEvent' in window && !documentMode

const useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || (documentMode && documentMode > 8 && documentMode <= 11))

function isUsingKoreanIME(nativeEvent: any) {
    return nativeEvent.local === 'ko'
}

function registerEvents() {
    registerTwoPhaseEvent('onBeforeInput', [
        'compositionend',
        'keypress',
        'textInput',
        'paste',
    ]);
    registerTwoPhaseEvent('onCompositionEnd', [
        'compositionend',
        'focusout',
        'keydown',
        'keypress',
        'keyup',
        'mousedown',
    ]);
    registerTwoPhaseEvent('onCompositionStart', [
        'compositionstart',
        'focusout',
        'keydown',
        'keypress',
        'keyup',
        'mousedown',
    ]);
    registerTwoPhaseEvent('onCompositionUpdate', [
        'compositionupdate',
        'focusout',
        'keydown',
        'keypress',
        'keyup',
        'mousedown',
    ]);
}

function getCompositionEventType(domEventName: DOMEventName) {
    switch (domEventName) {
        case 'compositionstart':
            return 'onCompositionStart'
        case 'compositionend':
            return 'onCompositionEnd'
        case 'compositionupdate':
            return 'onCompositionUpdate'
    }
}

function isFallbackCompositionEnd(
    domEventName: DOMEventName,
    nativeEvent: any
): boolean {
    switch(domEventName) {
        case 'keyup':
            debugger
        case 'keydown':
            debugger
        case 'keypress':
        case 'mousedown':
        case 'focusout':
            return true
        default:
            return false
    }
}

let isComposing = false
function extractCompositionEvent(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget
) {
    
    let eventType
    let fallbackData
    if (canUseCompositionEvent) {
        eventType = getCompositionEventType(domEventName)
    } else if (!isComposing) {
        debugger
    } else if (isFallbackCompositionEnd(domEventName, nativeEvent)) {
        eventType = 'onCompositionEnd'
    }

    if (!eventType) return null

    if (useFallbackCompositionData && !isUsingKoreanIME(nativeEvent)) {
        debugger
    }

    const listeners = accumulateTwoPhaseListeners(targetInst, eventType)
    if (listeners.length > 0) {
        debugger
    }
    
}

function getNativeBeforeInputChars(
    domEventName: DOMEventName,
    nativeEvent: any
): string | null {
    switch (domEventName) {
        case 'compositionend':
            debugger
        case 'keypress':
            debugger
        case 'textInput':
            debugger
        default: 
            return null
    }
}

function getFallbackBeforeInputChars(
    domEventName: DOMEventName,
    nativeEvent: any
): string | null {
    if (isComposing) {
        if (domEventName === 'compositionend' || (!canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent))) {
            debugger
        }
        return null
    }

    switch(domEventName) {
        case 'paste':
            debugger
        case 'keypress':
            debugger
        case 'compositionend':
            debugger
        default:
            return null
    }
}

function extractBeforeInputEvent(
    dispatchQueue,
    domEventName,
    targetInst,
    nativeEvent,
    nativeEventTarget
) {
    const chars = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent)
    
    if (!chars) return null

    const listeners = accumulateTwoPhaseListeners(targetInst, 'onBeforeInput')
    if (listeners.length > 0) {
        debugger
    }
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
    extractCompositionEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget)

    extractBeforeInputEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget)
}

export { registerEvents, extractEvents }