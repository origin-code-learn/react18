import { Source } from "./ReactElementType";

function describeComponentFrame(
    name: null | string,
    source: void | null | Source,
    ownerName: null | string
) {
    let sourceInfo = ''
    if (ownerName) {
        sourceInfo = ' (created by ' + ownerName + ')';
    }
    return '\n    in ' + (name || 'Unknown') + sourceInfo;
}

export function describeBuiltInComponentFrame(
    name: string,
    source: void | null | Source,
    ownerFn: void | null | Source
) {
    return describeComponentFrame(name, source, null)
}

export function describeFunctionComponentFrame(
    fn: Function,
    source: void | null | Source,
    ownerFn: void | null | Source
): string {
    if (!fn) return ''
    const name = (fn as any).displayName || fn.name || null
    let ownerName = null
    return describeComponentFrame(name, source, ownerName)
}

export function describeClassComponentFrame(
    ctor: Function,
    source: void | null | Source,
    ownerFn: void | null | Function
): string {
    return describeFunctionComponentFrame(ctor, source, ownerFn as any)
}