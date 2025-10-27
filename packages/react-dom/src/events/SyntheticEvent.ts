import { Fiber } from "react-reconciler/src/ReactInternalTypes"
import assign from "shared/assign"
import getEventCharCode from "./getEventCharCode";
import { EventInterfaceType } from "./ReactSyntheticEventType";

let lastMovementX;
let lastMovementY;
let lastMouseEvent;

function updateMouseMovementPolyfillState(event) {
    if (event !== lastMouseEvent) {
        if (lastMouseEvent && event.type === 'mousemove') {
            lastMovementX = event.screenX - lastMouseEvent.screenX
            lastMovementY = event.screenY - lastMouseEvent.screenY
        } else {
            lastMovementX = 0
            lastMovementY = 0
        }
        lastMouseEvent = event
    }
}



function functionThatReturnsTrue() {
    return true
}

function functionThatReturnsFalse() {
    return false
}

const modifierKeyToProp = {
    Alt: 'altKey',
    Control: 'ctrlKey',
    Meta: 'metaKey',
    Shift: 'shiftKey',
}
function modifierStateGetter(keyArg) {
    // 1. 获取当前合成事件实例（this 绑定为合成事件对象，如 SyntheticMouseEvent）
    const syntheticEvent = this
    // 2. 从合成事件中获取原生 DOM 事件对象
    const nativeEvent = syntheticEvent.nativeEvent

    // 3. 优先使用现代浏览器的标准 API：getModifierState
    if (nativeEvent.getEventModifierState) {
        return nativeEvent.getEventModifierState(keyArg)
    }
    // 4. 兼容旧浏览器（如 IE8）：通过修饰键属性映射表获取状态
    // modifierKeyToProp：React 内部定义的“修饰键名 → 原生事件属性”映射表
    const keyProp = modifierKeyToProp[keyArg]
    // 若存在对应属性，返回属性值（转为布尔值）；否则返回 false
    return keyProp ? !!nativeEvent[keyProp] : false
}
function getEventModifierState(keyArg) {
    return modifierStateGetter
}

function getEventKey(nativeEvent) {
    debugger
}

// 接收“事件接口定义”，返回合成事件基类（如 SyntheticEvent）
function createSyntheticEvent(Interface: EventInterfaceType) {
    // 1. 定义合成事件构造函数（SyntheticBaseEvent）
    function SyntheticBaseEvent(
        reactName: string | null,  // React 事件名（如 'onClick'）
        reactEventType: string,    // 事件类型（如 'click'）
        targetInst: Fiber,         // 事件目标对应的 Fiber 实例
        nativeEvent: {[propName: string]: any},  // 原生 DOM 事件对象
        nativeEventTarget: null | EventTarget   // 标准化后的事件目标节点
    ) {
        // 初始化合成事件的核心属性
        this._reactName = reactName      // 关联 React 事件名（内部使用）
        this._targetInst = targetInst    // 关联 Fiber 实例（用于事件传播）
        this.type = reactEventType       // 事件类型（与原生一致，如 'click'）
        this.nativeEvent = nativeEvent   // 保存原生事件（供开发者访问底层信息）
        this.target = nativeEventTarget  // 标准化目标节点（兼容浏览器差异）
        this.currentTarget = null        // 当前触发回调的节点（触发时动态赋值）

        // 2. 根据“事件接口定义”初始化事件属性（标准化核心步骤）
        for (const propName in Interface) {
            if (!Interface.hasOwnProperty(propName)) continue
            const normalize = Interface[propName]  // 属性的标准化函数（可选）
            // 若有标准化函数，调用函数处理原生事件；否则直接取原生属性
            this[propName] = normalize ? normalize(nativeEvent) : nativeEvent[propName]
        }

        // 3. 初始化“默认行为阻止”状态（兼容浏览器差异）
        const defaultPrevented =
            nativeEvent.defaultPrevented !== null ? 
            nativeEvent.defaultPrevented :  // 标准浏览器
            nativeEvent.returnValue === false  // IE 兼容
        // 绑定 isDefaultPrevented 方法（返回是否阻止了默认行为）
        this.isDefaultPrevented = defaultPrevented ? functionThatReturnsTrue : functionThatReturnsFalse

        // 4. 初始化“事件传播阻止”状态
        this.isPropagationStopped = functionThatReturnsFalse
        return this
    }

    // 3. 为合成事件原型添加统一方法（preventDefault、stopPropagation 等）
    assign(SyntheticBaseEvent.prototype, {
        // 阻止事件默认行为（如表单提交、链接跳转）
        preventDefault: function () {
            this.defaultPrevented = true // 标记合成事件的状态
            const event = this.nativeEvent
            if (!event) return
            // 兼容浏览器：调用原生 preventDefault 或设置 returnValue（IE）
            if (event.preventDefault) {
                event.preventDefault()
                // @ts-ignore
            } else if (typeof event.returnValue !== 'unknown') { // IE 专属的安全检测，判断当前事件是否是 IE 中不支持取消默认行为的 propertychange 事件，如果不是，才安全地执行 event.returnValue = false 以兼容 IE 标准事件
                event.returnValue = false
            }
            // 更新 isDefaultPrevented 方法，后续调用将返回 true
            this.isDefaultPrevented = functionThatReturnsTrue
        },
        // 阻止事件传播（捕获/冒泡阶段）
        stopPropagation: function () {
            const event = this.nativeEvent
            if (!event) return
            // 兼容浏览器：调用原生 stopPropagation 或设置 cancelBubble（IE）
            if (event.stopPropagation) {
                event.stopPropagation()
                // @ts-ignore
            } else if (typeof event.cancelBubble !== 'unknown') {
                event.cancelBubble = true
            }
            // 更新 isPropagationStopped 方法，后续调用将返回 true
            this.isPropagationStopped = functionThatReturnsTrue
        },
        // 保留事件引用（历史兼容：旧版 React 用事件池复用对象，现代已废弃）
        persist: function () {

        },
        // 检查事件是否持久化（现代系统始终返回 true，表示事件不会被回收）
        isPersistent: functionThatReturnsTrue
    })

    // 4. 返回生成的合成事件基类
    return SyntheticBaseEvent
}

const EventInterface: EventInterfaceType = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function (event) {
        return event.timeStamp || Date.now()
    },
    defaultPrevented: 0,
    isTrusted: 0
}

const UIEventInterface: EventInterfaceType = {
    ...EventInterface,
    view: 0,
    detail: 0
}

const MouseEventInterface: EventInterfaceType = {
    ...UIEventInterface,
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: getEventModifierState,
    button: 0,
    buttons: 0,
    relatedTarget: function (event) {
        if (event.relatedTarget === undefined) {
            return event.fromElement === event.srcElement ? event.toElement : event.fromElement
        }
        return event.relatedTarget
    },
    movementX: function (event) {
        if ('movementX' in event) {
            return event.movementX
        }
        updateMouseMovementPolyfillState(event)
        return lastMovementX
    },
    movementY: function (event) {
        if ('movementY' in event) {
            return event.movementY
        }
        return lastMovementY
    }
}

const PointerEventInterface: EventInterfaceType = {
    ...MouseEventInterface,
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0,
}

const TouchEventInterface: EventInterfaceType = {
    ...UIEventInterface,
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: getEventModifierState
}

const TransitionEventInterface: EventInterfaceType = {
    ...EventInterface,
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0,
}

const WheelEventInterface: EventInterfaceType = {
    ...MouseEventInterface,
    deltaX(event) {
        return 'deltaX' in event ? event.deltaX : 'wheelDeltaX' in event ? -(event as any).wheelDeltaX : 0
    },
    deltaY(event) {
        return 'deltaY' in event ? event.deltaY : 'wheelDeltaY' in event ? -(event as any).wheelDeltaY : 'wheelDelta' in event ? -(event as any).wheelDelta : 0
    },
    deltaZ: 0,
    deltaMode: 0
}

const ClipboardEventInterface: EventInterfaceType = {
    ...EventInterface,
    clipboardData: function (event) {
        return 'clipboardData' in event ? event.clipboardData : (window as any).clipboardData
    }
}

const AnimationEventInterface: EventInterfaceType = {
    ...EventInterface,
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0,
}

const DragEventInterface: EventInterfaceType = {
    ...MouseEventInterface,
    dataTransfer: 0
}

const FocusEventInterface: EventInterfaceType = {
    ...UIEventInterface,
    relatedTarget: 0
}

const KeyboardEventInterface: EventInterfaceType = {
    ...UIEventInterface,
    key: getEventKey,
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: getEventModifierState,
    charCode: function (event) {
        if (event.type === 'keypress') {
            return getEventCharCode(event as any)
        }
        return 0
    },
    keyCode: function (event) {
        if (event.type === 'keydown' || event.type === 'keyup') {
            return event.keyCode
        }
        return 0
    },
    which: function (event) {
        if (event.type === 'keypress') {
            return getEventCharCode(event as any)
        }
        if (event.type === 'keydown' || event.type === 'keyup') {
            return event.keyCode
        }
        return 0
    }
}

export const SyntheticEvent = createSyntheticEvent(EventInterface)

export const SyntheticDragEvent = createSyntheticEvent(DragEventInterface)

export const SyntheticUIEvent = createSyntheticEvent(UIEventInterface)

export const SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface)

export const SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface)

export const SyntheticAnimationEvent= createSyntheticEvent(AnimationEventInterface)

export const SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface)

export const SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface)

export const SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface)

export const SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface)

export const SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface)

export const SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface)