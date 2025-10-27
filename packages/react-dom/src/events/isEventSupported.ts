import { canUseDOM } from "shared/ExecutionEnvironment"

function isEventSupported(eventNameSuffix: string): boolean {
    if (!canUseDOM) {
        return false
    }

    const eventName = 'on' + eventNameSuffix
    let isSupported = eventName in document

    if (!isSupported) {
        const element = document.createElement('div')
        element.setAttribute(eventName, 'return')
        isSupported = typeof element[eventName] === 'function'
    }

    return isSupported
}

export default isEventSupported