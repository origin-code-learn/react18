import { enableNewReconciler } from 'shared/ReactFeatureFlags';
import {
    DiscreteEventPriority as DiscreteEventPriority_old,
    ContinuousEventPriority as ContinuousEventPriority_old,
    DefaultEventPriority as DefaultEventPriority_old,
    IdleEventPriority as IdleEventPriority_old,
    getCurrentUpdatePriority as getCurrentUpdatePriority_old,
    setCurrentUpdatePriority as setCurrentUpdatePriority_old,
    runWithPriority as runWithPriority_old,
    isHigherEventPriority as isHigherEventPriority_old,
} from './ReactEventPriorities.old';

export type EventPriority = number

export const DiscreteEventPriority: EventPriority = DiscreteEventPriority_old
export const ContinuousEventPriority: EventPriority = ContinuousEventPriority_old
export const DefaultEventPriority: EventPriority = DefaultEventPriority_old
export const IdleEventPriority: EventPriority = IdleEventPriority_old

export function runWithPriority<T>(priority: EventPriority, fn: () => T): T {
    return enableNewReconciler ? runWithPriority_old(priority, fn) : runWithPriority_old(priority, fn)
}

export function getCurrentUpdatePriority(): EventPriority {
    return enableNewReconciler ? getCurrentUpdatePriority_old() : getCurrentUpdatePriority_old()
}

export function setCurrentUpdatePriority(priority: EventPriority) {
    return enableNewReconciler ? setCurrentUpdatePriority_old(priority) : setCurrentUpdatePriority_old(priority) 
}

export function isHigherEventPriority(a: EventPriority, b: EventPriority): boolean {
    return enableNewReconciler ? isHigherEventPriority_old(a, b) : isHigherEventPriority_old(a, b)
}
