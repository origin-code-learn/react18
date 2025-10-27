import { enableCreateEventHandleAPI } from "shared/ReactFeatureFlags";
import { ANIMATION_END, ANIMATION_ITERATION, ANIMATION_START, DOMEventName, TRANSITION_END } from "./DOMEventNames";
import { registerTwoPhaseEvent } from "./EventRegistry";


export const topLevelEventsToReactNames: Map<DOMEventName, string | null> = new Map()

const simpleEventPluginEvents = [
    'abort',
    'auxClick',
    'cancel',
    'canPlay',
    'canPlayThrough',
    'click',
    'close',
    'contextMenu',
    'copy',
    'cut',
    'drag',
    'dragEnd',
    'dragEnter',
    'dragExit',
    'dragLeave',
    'dragOver',
    'dragStart',
    'drop',
    'durationChange',
    'emptied',
    'encrypted',
    'ended',
    'error',
    'gotPointerCapture',
    'input',
    'invalid',
    'keyDown',
    'keyPress',
    'keyUp',
    'load',
    'loadedData',
    'loadedMetadata',
    'loadStart',
    'lostPointerCapture',
    'mouseDown',
    'mouseMove',
    'mouseOut',
    'mouseOver',
    'mouseUp',
    'paste',
    'pause',
    'play',
    'playing',
    'pointerCancel',
    'pointerDown',
    'pointerMove',
    'pointerOut',
    'pointerOver',
    'pointerUp',
    'progress',
    'rateChange',
    'reset',
    'resize',
    'seeked',
    'seeking',
    'stalled',
    'submit',
    'suspend',
    'timeUpdate',
    'touchCancel',
    'touchEnd',
    'touchStart',
    'volumeChange',
    'scroll',
    'toggle',
    'touchMove',
    'waiting',
    'wheel',
];

if (enableCreateEventHandleAPI) {
    topLevelEventsToReactNames.set('beforeblur', null)
    topLevelEventsToReactNames.set('afterblur', null)
}

function registerSimpleEvent(domEventName, reactName) {
    topLevelEventsToReactNames.set(domEventName, reactName)
    registerTwoPhaseEvent(reactName, [domEventName])
}

export function registerSimpleEvents() {
    for (let i = 0; i < simpleEventPluginEvents.length; i++) {
        const eventName = simpleEventPluginEvents[i]
        const domEventName = eventName.toLowerCase()
        const capitalizedEvent = eventName[0].toUpperCase() + eventName.slice(1)
        registerSimpleEvent(domEventName, 'on' + capitalizedEvent)
    }
    registerSimpleEvent(ANIMATION_END, 'onAnimationEnd');
    registerSimpleEvent(ANIMATION_ITERATION, 'onAnimationIteration');
    registerSimpleEvent(ANIMATION_START, 'onAnimationStart');
    registerSimpleEvent('dblclick', 'onDoubleClick');
    registerSimpleEvent('focusin', 'onFocus');
    registerSimpleEvent('focusout', 'onBlur');
    registerSimpleEvent(TRANSITION_END, 'onTransitionEnd');
}