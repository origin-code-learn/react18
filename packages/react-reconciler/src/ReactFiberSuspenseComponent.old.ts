import { enableSuspenseAvoidThisFallback } from "shared/ReactFeatureFlags"
import { SuspenseInstance } from "./ReactFiberHostConfig"
import { Lane } from "./ReactFiberLane.old"
import { TreeContext } from "./ReactFiberTreeContext.old"
import { Fiber } from "./ReactInternalTypes"


export type SuspenseState = {
    dehydrated: null | SuspenseInstance,
    treeContext: null | TreeContext,
    retryLane: Lane
}

/**
 * shouldCaptureSuspense 是 React Suspense 特性中判断「Suspense 组件是否应该捕获子树挂起」的核心决策函数—— 它的核心作用是：
 *  1.结合 Suspense 组件的缓存状态（memoizedState）、组件属性（memoizedProps）和父 Suspense 上下文状态（hasInvisibleParent），返回布尔值，决定该 Suspense 边界是否需要「捕获子树的挂起异常并渲染 fallback UI」。
 *    简单说，这个函数是 Suspense 「是否兜底」的最终判断依据，直接决定了 Suspense 组件的行为逻辑
 * 
*/
export function shouldCaptureSuspense(
    workInProgress: Fiber,
    hasInvisibleParent: boolean,
): boolean {
    // 步骤1：获取 Suspense 组件的缓存状态（memoizedState）
    const nextState: SuspenseState | null = workInProgress.memoizedState
    if (nextState !== null) {
        // 2.1：若存在 dehydrated 状态（服务端渲染脱水），直接返回 true（必须捕获）
        if (nextState.dehydrated !== null) {
            return true
        }
        // 2.2：若有缓存状态但无 dehydrated，返回 false（无需捕获）
        return false
    }
    const props = workInProgress.memoizedProps
    // 3.1：若未启用该特性，或 props 中未设置 avoidThisFallback=true → 返回 true（默认捕获）
    if (!enableSuspenseAvoidThisFallback || props.unstable_avoidThisFallback !== true) {
        return true
    }
    // 4.1：若有不可见的父边界 → 返回 false（由父边界兜底，当前边界不捕获）
    if (hasInvisibleParent) {
        return false
    }
    // 4.2：无父边界 → 返回 true（当前边界仍需捕获）
    return true
}