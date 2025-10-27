import { HydratableInstance, supportsHydration } from "ReactDOMHostConfig";
import { Fiber } from "./ReactInternalTypes";
import { CapturedValue } from "./ReactCapturedValue";

let isHydrating: boolean = false;
let hydrationParentFiber: null | Fiber = null;
let hydrationErrors: Array<CapturedValue<any>> | null = null;
let nextHydratableInstance: null | HydratableInstance = null;
let didSuspendOrErrorDEV: boolean = false;

export function getIsHydrating(): boolean {
    return isHydrating;
}

export function popHydrationState(fiber: Fiber): boolean {
    if (!supportsHydration) {
        return false
    }
    if (fiber !== hydrationParentFiber) {
        return false
    }
    debugger
    return true
}

export function upgradeHydrationErrorsToRecoverable() {
    if (hydrationErrors !== null) {
        debugger
    }
}

export function tryToClaimNextHydratableInstance(fiber: Fiber) {
    if (!isHydrating) {
        return
    }
    debugger
}

export function resetHydrationState() {
    if (!supportsHydration) return

    hydrationParentFiber = null;
    nextHydratableInstance = null;
    isHydrating = false;
    didSuspendOrErrorDEV = false;
}