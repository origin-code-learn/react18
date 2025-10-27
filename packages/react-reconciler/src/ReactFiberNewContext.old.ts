import { ReactContext } from "shared/ReactTypes";
import { ContextDependency, Fiber } from "./ReactInternalTypes";
import { includesSomeLane, Lanes } from "./ReactFiberLane.old";
import { enableLazyContextPropagation } from "shared/ReactFeatureFlags";
import { markWorkInProgressReceivedUpdate } from "./ReactFiberBeginWork.old";

// 指向当前正在渲染的 Fiber 节点。上下文系统需要知道 “哪个组件在读取上下文”，以便记录依赖关系。
let currentlyRenderingFiber: Fiber | null = null;
// 用于追踪当前组件读取的最后一个上下文依赖（链表结构的指针）。
let lastContextDependency: ContextDependency<any> | null = null;
// 用于追踪完全被观察的上下文（与并发模式下的上下文部分更新有关）。
let lastFullyObservedContext: ReactContext<any> | null = null;

export function resetContextDependencies() {
    currentlyRenderingFiber = null
    lastContextDependency = null;
    lastFullyObservedContext = null;
}

export function readContext<T>(context: ReactContext<T>): T {
    const value = {}
    debugger
}

/**
 * 在 React 中，组件（无论是类组件还是函数组件）在渲染过程中可能会读取上下文（如通过 useContext 钩子或 Legacy Context 的 this.context）。为了确保：
    1. 正确追踪组件对哪些上下文的依赖（以便上下文更新时能触发组件重渲染）。
    2. 清除上一次渲染留下的上下文依赖残留，避免干扰本次渲染。
    3. 检测上下文是否有未处理的更新，确保组件能响应最新的上下文变化。
 * */ 
export function prepareToReadContext(
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    currentlyRenderingFiber = workInProgress
    lastContextDependency = null
    lastFullyObservedContext = null
    const dependencies = workInProgress.dependencies
    if (dependencies !== null) {
        if (enableLazyContextPropagation) {
            dependencies.firstContext = null
        } else {
            const firstContext = dependencies.firstContext
            if (firstContext !== null) {
                if (includesSomeLane(dependencies.lanes, renderLanes)) {
                    markWorkInProgressReceivedUpdate()
                }
                dependencies.firstContext = null
            }
        }
    }
}

function propagateParentContextChanges(
    current: Fiber,
    workInProgress: Fiber,
    renderLanes: Lanes,
    forcePropagateEntireTree: boolean
) {
    debugger
}

export function lazilyPropagateParentContextChanges(
    current: Fiber,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    const forcePropagateEntireTree = false
    propagateParentContextChanges(current, workInProgress, renderLanes, forcePropagateEntireTree)
}

