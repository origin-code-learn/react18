import { enableTransitionTracing } from "shared/ReactFeatureFlags";
import { Lanes } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";

export function pushRootTransition(
    workInProgress: Fiber,
    root: FiberRoot,
    renderLanes: Lanes
) {
    if (enableTransitionTracing) {
        debugger
    }
}