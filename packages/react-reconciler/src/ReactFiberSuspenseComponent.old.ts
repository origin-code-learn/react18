import { SuspenseInstance } from "./ReactFiberHostConfig"
import { Lane } from "./ReactFiberLane.old"
import { TreeContext } from "./ReactFiberTreeContext.old"


export type SuspenseState = {
    dehydrated: null | SuspenseInstance,
    treeContext: null | TreeContext,
    retryLane: Lane
}