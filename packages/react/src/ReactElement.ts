const ReactElement = function(type: unknown, key: unknown, ref: unknown, self: unknown, source: unknown, owner: unknown, props: unknown) {
    console.log(type, key, ref, self, source, owner, props)
} 

export function jsx(type: unknown, config: unknown, maybeKey: unknown) {
    console.log(ReactElement, type, config, maybeKey)
}

export function jsxDEV(type: any, config: any, maybeKey: any, source: any, self: any) {
    console.log(type, config, maybeKey, source, self)
}

export function createElement(type: any, config: any, children: any) {
    console.log(type, config, children)
}

export function createFactory(type: any) {
    console.log(type)
}

export function cloneElement(element: any, config: any, children: any) {
    console.log(element, config, children)
}

export function isValidElement(object: any) {
    console.log(object)
}

export function cloneAndReplaceKey(oldElement: any, newKey: any) {
    console.log(oldElement, newKey)
}