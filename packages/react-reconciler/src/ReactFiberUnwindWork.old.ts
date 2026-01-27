import { enableCache, enableProfilerTimer } from "shared/ReactFeatureFlags";
import { DidCapture, NoFlags, ShouldCapture } from "./ReactFiberFlags";
import { resetHydrationState } from "./ReactFiberHydrationContext.old";
import { Lanes } from "./ReactFiberLane.old";
import { SuspenseState } from "./ReactFiberSuspenseComponent.old";
import { popSuspenseContext } from "./ReactFiberSuspenseContext";
import { popRootTransition, popTransition } from "./ReactFiberTransition";
import { popTreeContext } from "./ReactFiberTreeContext.old";
import { popRenderLanes } from "./ReactFiberWorkLoop.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { CacheComponent, ClassComponent, ContextProvider, HostComponent, HostPortal, HostRoot, LegacyHiddenComponent, OffscreenComponent, SuspenseComponent, SuspenseListComponent } from "./ReactWorkTags";
import { NoMode, ProfileMode } from "./ReactTypeOfMode";
import { transferActualDuration } from "./ReactProfilerTimer.old";
import { popHostContainer, popHostContext } from "./ReactFiberHostContext.old";
import { popTopLevelLegacyContextObject } from "./ReactFiberContext.old";
import { resetWorkInProgressVersions as resetMutableSourceWorkInProgressVersions } from './ReactMutableSource.old';
import { ReactContext } from "shared/ReactTypes";
import { popProvider } from "./ReactFiberNewContext.old";


export function unwindInterruptedWork(
    current: Fiber | null,
    interruptedWork: Fiber,
    renderLanes: Lanes
) {
    debugger
}

/**
 * unwindWork 是 React 调和阶段处理「渲染异常 / 中止」时的核心「回退清理」函数 —— 当组件渲染（或子组件）抛出异常、需要中止当前调和流程时，该函数会从当前 Fiber 向上回退（unwind），清理各类上下文（如树上下文、Suspense 上下文、缓存上下文）、重置状态标记，并判断是否需要捕获异常（如错误边界、Suspense 边界），是 React 实现「异常冒泡」「边界捕获」「上下文栈对齐」的关键逻辑。
*/
export function unwindWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    // 注释：不单独判断是否在水化（hydration），因为对比 current 树的 provider fiber 更高效且不易出错
    // 理想情况下应有专门的水化工作循环，但当前复用该逻辑
    // 第一步：通用清理——弹出当前 Fiber 的树上下文（基础上下文，所有 Fiber 通用）
    popTreeContext(workInProgress)
    switch (workInProgress.tag) {
        case ClassComponent: {
            debugger
        }
        case HostRoot: {
            const root: FiberRoot = workInProgress.stateNode
            if (enableCache) {
                debugger
            }
            popRootTransition(workInProgress, root, renderLanes)
            popHostContainer(workInProgress)
            popTopLevelLegacyContextObject(workInProgress)
            resetMutableSourceWorkInProgressVersions()
            const flags = workInProgress.flags
            if (
                (flags & ShouldCapture) !== NoFlags &&
                (flags & DidCapture) !== NoFlags
            ) {
                workInProgress.flags = (flags & ~ShouldCapture) | DidCapture
                return workInProgress
            }
            return null
        }
        case HostComponent: {
            popHostContext(workInProgress)
            return null
        }
        case SuspenseComponent: {
            popSuspenseContext(workInProgress)
            const suspenseState: null | SuspenseState = workInProgress.memoizedState
            if (suspenseState !== null && suspenseState.dehydrated !== null) {
                if (workInProgress.alternate === null) {
                    throw new Error('unwindWork 报错了')
                }
                resetHydrationState()
            }
            const flags = workInProgress.flags
            if (flags & ShouldCapture) {
                workInProgress.flags = (flags & ~ShouldCapture) | DidCapture
                if (enableProfilerTimer && (workInProgress.mode & ProfileMode) !== NoMode) {
                    transferActualDuration(workInProgress)
                }
                return workInProgress
            }

            return null
        }
        case SuspenseListComponent: {
            debugger
        }
        case HostPortal: {
            debugger
        }
        case ContextProvider: {
            const context: ReactContext<any> = workInProgress.type._context
            popProvider(context, workInProgress)
            return null
        }
        case OffscreenComponent:
        case LegacyHiddenComponent: {
            popRenderLanes(workInProgress)
            popTransition(workInProgress, current)
            return null
        }
        case CacheComponent: {
            debugger
        }
        default:
            return null
    }
}