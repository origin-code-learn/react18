import { enableCache, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { Lanes } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import ReactSharedInternals from "shared/ReactSharedInternals";
import { CacheContext, SpawnedCachePool } from "./ReactFiberCacheComponent.old";
import { isPrimaryRenderer } from "ReactDOMHostConfig";
import { getWorkInProgressRoot } from "./ReactFiberWorkLoop.old";
import { createCursor, pop, push, StackCursor } from "./ReactFiberStack.old";


export type Transition = {
    name: string,
    startTime: number,
};

const { ReactCurrentBatchConfig } = ReactSharedInternals
export const NoTransition = null

const resumedCache: StackCursor<Cache | null> = createCursor(null)

const transitionStack: StackCursor<Array<Transition> | null> = createCursor(null)

export function requestCurrentTransition(): Transition | null {
    return ReactCurrentBatchConfig.transition as any
}


export function pushRootTransition(
    workInProgress: Fiber,
    root: FiberRoot,
    renderLanes: Lanes
) {
    if (enableTransitionTracing) {
        debugger
    }
}

export function pushTransition(
    offscreenWorkInProgress: Fiber,
    prevCachePool: SpawnedCachePool | null,
    newTransitions: Array<Transition> | null
) {
    if (enableCache) {
        if (prevCachePool === null) {
            push(resumedCache, resumedCache.current, offscreenWorkInProgress)
        } else {
            push(resumedCache, (prevCachePool as any).pool, offscreenWorkInProgress)
        }
    }

    if (enableTransitionTracing) {
        if (transitionStack.current === null) {
            push(transitionStack, newTransitions, offscreenWorkInProgress)
        } else if (newTransitions === null) {
            push(transitionStack, transitionStack.current, offscreenWorkInProgress)
        } else {
            push(transitionStack, transitionStack.current.concat(newTransitions), offscreenWorkInProgress)
        }
    }
}

export function popTransition(
    workInProgress: Fiber,
    current: Fiber | null
) {
    if (current !== null) {
        if (enableCache) {
            pop(resumedCache, workInProgress)
        }
        if (enableTransitionTracing) {
            pop(transitionStack, workInProgress)
        }
    }
}

export function popRootTransition(
    workInProgress: Fiber,
    root: FiberRoot,
    renderLanes: Lanes
) {
    if (enableTransitionTracing) {
        pop(transitionStack, workInProgress)
    }
}

function peekCacheFromPool(): Cache | null {
    if (!enableCache) return null
    const cacheResumedFromPreviousRender = resumedCache.current
    if (cacheResumedFromPreviousRender !== null) {
        return cacheResumedFromPreviousRender
    }

    const root = getWorkInProgressRoot()
    const cacheFromRootCachePool = root?.pooledCache
    return cacheFromRootCachePool as Cache
}

export function getSuspendedCache(): SpawnedCachePool | null {
    if (!enableCache) return null
    const cacheFromPool = peekCacheFromPool()
    if (cacheFromPool === null) return null

    return {
        parent: isPrimaryRenderer ? (CacheContext as any)._currentValue : (CacheContext as any)._currentValue2,
        pool: cacheFromPool as any
    }
}