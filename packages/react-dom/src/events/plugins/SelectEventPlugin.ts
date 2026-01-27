import type { Fiber } from "react-reconciler/src/ReactInternalTypes"
import type { DOMEventName } from "../DOMEventNames"
import { accumulateTwoPhaseListeners, type DispatchQueue } from "../DOMPluginEventSystem"
import type { AnyNativeEvent } from "../PluginModuleType"
import type { EventSystemFlags } from "../EventSystemFlags"
import { registerTwoPhaseEvent } from "../EventRegistry"
import { getNodeFromInstance } from "react-dom/src/client/ReactDOMComponentTree"
import isTextInputElement from "../isTextInputElement"
import { DOCUMENT_NODE } from "react-dom/src/shared/HTMLNodeType"
import getActiveElement from "react-dom/src/client/getActiveElement"
import { hasSelectionCapabilities } from "react-dom/src/client/ReactInputSelection"
import { canUseDOM } from "shared/ExecutionEnvironment"
import shallowEqual from "shared/shallowEqual"
import { SyntheticEvent } from '../../events/SyntheticEvent';

let activeElement: any = null;
let activeElementInst: any = null;
let lastSelection: any = null;
let mouseDown: any = false;

const skipSelectionChangeEvent = canUseDOM && 'documentMode' in document && ((document.documentMode as number) <= 11)

function getEventTargetDocument(eventTarget: any) {
    return eventTarget.window === eventTarget ? eventTarget.document : eventTarget.nodeType === DOCUMENT_NODE ? eventTarget : eventTarget.ownerDocument
}

function getSelection(node: any) {
    if ('selectionStart' in node && hasSelectionCapabilities(node)) {
        return {
            start: node.selectionStart,
            end: node.selectionEnd
        }
    } else {
        const win = (node.ownerDocument && node.ownerDocument.defaultView) || window
        const selection = win.getSelection()
        return {
            anchorNode: selection.anchorNode,
            anchorOffset: selection.anchorOffset,
            focusNode: selection.focusNode,
            focusOffset: selection.focusOffset,
        }
    }
}

function constructSelectEvent(
    dispatchQueue,
    nativeEvent,
    nativeEventTarget
) {
    const doc = getEventTargetDocument(nativeEventTarget)

    if (mouseDown || activeElement == null || activeElement !== getActiveElement(doc)) return

    const currentSelection = getSelection(activeElement)

    if (!lastSelection || !shallowEqual(lastSelection, currentSelection)) {
        lastSelection = currentSelection
        const listeners = accumulateTwoPhaseListeners(activeElementInst, 'onSelect')
        if (listeners.length > 0) {
            const event = new (SyntheticEvent as any)('onSelect', 'select', null, nativeEvent, nativeEventTarget)
            dispatchQueue.push({ event, listeners })
            event.target = activeElement
        }
    }
}

function registerEvents() {
    registerTwoPhaseEvent('onSelect', [
        'focusout',
        'contextmenu',
        'dragend',
        'focusin',
        'keydown',
        'keyup',
        'mousedown',
        'mouseup',
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

    switch (domEventName) {
        case 'focusin':
            if (isTextInputElement(targetNode) || (targetNode as any).contentEditable === 'true') {
                activeElement = targetNode
                activeElementInst = targetInst
                lastSelection = null
            }
            break
        case 'focusout':
            activeElement = null
            activeElementInst = null
            lastSelection = null
            break
        case 'mousedown':
            mouseDown = true
            break
        case 'contextmenu':
        case 'mouseup':
        case 'dragend':
            mouseDown = false
            constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget)
            break
        case 'selectionchange':
            if (skipSelectionChangeEvent) {
                break
            }
        case 'keydown':
        case 'keyup':
            constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget)
    }

}

export { registerEvents, extractEvents }