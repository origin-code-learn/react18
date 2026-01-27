import { getStackByFiberInDevAndProd } from "./ReactFiberComponentStack";
import { Fiber } from "./ReactInternalTypes";

export type CapturedValue<T> = {
    value: T;
    source: Fiber | null;
    stack: string | null;
    digest: string | null
}

export function createCapturedValueAtFiber<T>(
    value: T,
    source: Fiber,
): CapturedValue<T> {
    return {
        value,
        source,
        stack: getStackByFiberInDevAndProd(source),
        digest: null
    }
}