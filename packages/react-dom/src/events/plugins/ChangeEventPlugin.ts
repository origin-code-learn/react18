import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { DOMEventName } from "../DOMEventNames"
import { accumulateTwoPhaseListeners, processDispatchQueue, type DispatchQueue } from "../DOMPluginEventSystem"
import type { AnyNativeEvent } from "../PluginModuleType"
import type { EventSystemFlags } from "../EventSystemFlags"
import { registerTwoPhaseEvent } from "../EventRegistry"
import { getNodeFromInstance } from "react-dom/src/client/ReactDOMComponentTree"
import { disableInputAttributeSyncing, enableCustomElementPropertySupport } from "shared/ReactFeatureFlags"
import isTextInputElement from "../isTextInputElement"
import { isCustomComponent } from "react-dom/src/shared/isCustomComponent"
import { canUseDOM } from "shared/ExecutionEnvironment"
import isEventSupported from "../isEventSupported"
import { updateValueIfChanged } from "../../client/inputValueTracking"
import { setDefaultValue } from "../../client/ReactDOMInput"
import getEventTarget from "../getEventTarget"
import { batchedUpdates } from '../ReactDOMUpdateBatching';
import { SyntheticEvent } from "../SyntheticEvent"
import { enqueueStateRestore } from "../ReactDOMControlledComponent"


let activeElement: any = null;
let activeElementInst: any = null;
let isInputEventSupported = canUseDOM ? isEventSupported('input') && ((!(document as any).documentMode) || (document as any).documentMode > 9) : false

function shouldUseChangeEvent(elem) {
    const nodeName = elem.nodeName && elem.nodeName.toLowerCase()
    return (
        nodeName === 'select' ||
        (nodeName === 'input') && elem.type === 'file'
    )
}

function shouldUseClickEvent(elem) {
    const nodeName = elem.nodeName
    return (
        nodeName &&
        nodeName.toLowerCase() === 'input' &&
        (elem.type === 'checkbox' || elem.type === 'radio')
    )
}

function createAndAccumulateChangeEvent(
    dispatchQueue,
    inst,
    nativeEvent,
    target
) {
    enqueueStateRestore(target)
    const listeners = accumulateTwoPhaseListeners(inst, 'onChange')
    if (listeners.length > 0) {
        const event = new (SyntheticEvent as any)('onChange', 'change', null, nativeEvent, target)
        dispatchQueue.push({ event, listeners })
    }
}

function getTargetInstForChangeEvent(domEventName: DOMEventName, targetInst) {
    if (domEventName === 'change') {
        return targetInst
    }
}

function getInstIfValueChanged(targetInst) {
    const targetNode = getNodeFromInstance(targetInst)
    if (updateValueIfChanged(targetNode)) {
        return targetInst
    }
}

function startWatchingForValueChange(
    target,
    targetInst
) {
    activeElement = target
    activeElementInst = targetInst
    activeElement.attachEvent('onpropertychange', handlePropertyChange)
}

function getTargetInstForInputOrChangeEvent(
    domEventName: DOMEventName,
    targetInst
) {
    if (domEventName === 'input' || domEventName === 'change') {
        return getInstIfValueChanged(targetInst)
    }
}

function getTargetInstForInputEventPolyfill(
    domEventName: DOMEventName,
    targetInst
) {
    if (
        domEventName === 'selectionchange' ||
        domEventName === 'keyup' ||
        domEventName === 'keydown'
    ) {
        return getInstIfValueChanged(activeElementInst)
    }
}

function runEventInBatch(dispatchQueue) {
    processDispatchQueue(dispatchQueue, 0)
}

function manualDispatchChangeEvent(nativeEvent) {
    const dispatchQueue = []
    createAndAccumulateChangeEvent(dispatchQueue, activeElementInst, nativeEvent, getEventTarget(nativeEvent))

    batchedUpdates(runEventInBatch, dispatchQueue)
}

function handlePropertyChange(nativeEvent) {
    if (nativeEvent.propertyName !== 'value') {
        return
    }
    if (getInstIfValueChanged(activeElementInst)) {
        manualDispatchChangeEvent(nativeEvent)
    }
}

function stopWatchingForValueChange() {
    if (!activeElement) return
    activeElement.detachEvent('onpropertychange', handlePropertyChange)
    activeElement = null
    activeElementInst = null
}

function handleEventsForInputEventPolyfill(
    domEventName: DOMEventName,
    target,
    targetInst
) {
    if (domEventName === 'focusin') {
        stopWatchingForValueChange()
        startWatchingForValueChange(target, targetInst)
    } else if (domEventName === 'focusout') {
        stopWatchingForValueChange()
    }
}

function getTargetInstForClickEvent(
    domEventName: DOMEventName,
    targetInst
) {
    if (domEventName === 'click') {
        return getInstIfValueChanged(targetInst)
    }
}

function handleControlledInputBlur(
    node: HTMLInputElement
) {
    const state = (node as any)._wrapperState;
    if (!state || !state.controlled || node.type !== 'number') {
        return
    }

    if (!disableInputAttributeSyncing) {
        setDefaultValue(node as any, 'number', node.value)
    }
}

function registerEvents() {
    registerTwoPhaseEvent('onChange', [
        'change',
        'click',
        'focusin',
        'focusout',
        'input',
        'keydown',
        'keyup',
        'selectionchange',
    ]);
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
    const targetNode = targetInst ? getNodeFromInstance(targetInst) : window
    let getTargetInstFunc, handleEventFunc
    if (shouldUseChangeEvent(targetNode)) {
        getTargetInstFunc = getTargetInstForChangeEvent
    } else if (isTextInputElement(targetNode)) {
        if (isInputEventSupported) {
            getTargetInstFunc = getTargetInstForInputOrChangeEvent
        } else {
            getTargetInstFunc = getTargetInstForInputEventPolyfill
            handleEventFunc = handleEventsForInputEventPolyfill
        }
    } else if (shouldUseClickEvent(targetNode)) {
        getTargetInstFunc = getTargetInstForClickEvent
    } else if (enableCustomElementPropertySupport && targetInst && isCustomComponent(targetInst.elementType, targetInst.memoizedProps)) {
        getTargetInstFunc = getTargetInstForChangeEvent
    }

    if (getTargetInstFunc) {
        const inst = getTargetInstFunc(domEventName, targetInst)
        if (inst) {
            createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, nativeEventTarget)
            return
        }
    }

    if (handleEventFunc) {
        handleEventFunc(domEventName, targetNode, targetInst)
    }

    if (domEventName === 'focusout') {
        handleControlledInputBlur(targetNode as any)
    }

}

export { registerEvents, extractEvents }