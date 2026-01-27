import { clz32 } from "./clz32";
import { Forked, NoFlags } from "./ReactFiberFlags";
import { Fiber } from "./ReactInternalTypes";

export type TreeContext = {
    id: number,
    overflow: string
}

let treeForkProvider: Fiber | null = null;
let forkStackIndex: number = 0;
let treeForkCount: number = 0;
const forkStack: Array<any> = [];

const idStack: Array<any> = [];
let idStackIndex: number = 0;
let treeContextProvider: Fiber | null = null;
let treeContextId: number = 1;
let treeContextOverflow: string = '';

function getBitLength(number: number): number {
    return 32 - clz32(number);
}

function getLeadingBit(id: number): number {
    return 1 << (getBitLength(id) - 1);
}

export function getTreeId(): string {
    const overflow = treeContextOverflow
    const idWithLeadingBit = treeContextId
    const id = idWithLeadingBit & ~getLeadingBit(idWithLeadingBit);
    return id.toString(32) + overflow;
}

export function isForkedChild(workInProgress: Fiber) {
    return (workInProgress.flags & Forked) !== NoFlags
}

export function popTreeContext(workInProgress: Fiber) {
    while(workInProgress === treeForkProvider) {
        treeForkProvider = forkStack[--forkStackIndex];
        forkStack[forkStackIndex] = null;
        treeForkCount = forkStack[--forkStackIndex];
        forkStack[forkStackIndex] = null;
    }

    while (workInProgress === treeContextProvider) {
        treeContextProvider = idStack[--idStackIndex];
        idStack[idStackIndex] = null;
        treeContextOverflow = idStack[--idStackIndex];
        idStack[idStackIndex] = null;
        treeContextId = idStack[--idStackIndex];
        idStack[idStackIndex] = null;
    }
}