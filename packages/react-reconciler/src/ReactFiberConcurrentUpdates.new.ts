import { Lane } from "./ReactFiberLane.old";

export type ConcurrentUpdate = {
    next: ConcurrentUpdate,
    lane: Lane,
};