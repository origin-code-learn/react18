import { Wakeable } from "shared/ReactTypes";
import { Lanes } from "./ReactFiberLane.old";
import { Fiber } from "./ReactInternalTypes";

type DevToolsProfilingHooks = any
let injectedProfilingHooks: DevToolsProfilingHooks | null = null;

export function markComponentRenderStopped() {
    debugger
}

export function markComponentSuspended(
    fiber: Fiber,
    wakeable: Wakeable,
    lanes: Lanes
) {
    debugger
}

export function markComponentErrored(
    fiber: Fiber,
    thrownValue: any,
    lanes: Lanes
) {
    debugger
}