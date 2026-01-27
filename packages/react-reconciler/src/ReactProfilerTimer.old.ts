import { Fiber } from "./ReactInternalTypes";

export function transferActualDuration(fiber: Fiber) {
    let child = fiber.child
    while (child) {
        (fiber as any).actualDuration += child.actualDuration as number
        child = child.sibling
    }
}