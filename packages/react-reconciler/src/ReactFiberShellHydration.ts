import { RootState } from "./ReactFiberRoot.old";
import { FiberRoot } from "./ReactInternalTypes";

export function isRootDehydrated(root: FiberRoot) {
    const currentState: RootState = root.current.memoizedState
    return currentState.isDehydrated
}