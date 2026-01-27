import assign from "shared/assign";

export function getHostProps(element: Element, props: Object) {
    return assign({}, props, { value: undefined })
}

export function postUpdateWrapper(element: Element, props: Object) {
    debugger
}

export function restoreControlledState(element: Element, props: Object) {
    debugger
}