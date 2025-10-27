
// 添加事件冒泡
export function addEventBubbleListener(
    target: EventTarget, 
    eventType: string, 
    listener: any
) {
    target.addEventListener(eventType, listener, false)
    return listener
}

// 添加事件捕获
export function addEventCaptureListener(
    target: EventTarget,
    eventType: string,
    listener: Function
): Function {
    target.addEventListener(eventType, listener as EventListener, true)
    return listener
}