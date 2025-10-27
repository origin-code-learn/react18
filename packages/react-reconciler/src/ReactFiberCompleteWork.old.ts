import { popTopLevelLegacyContextObject } from "./ReactFiberContext.old";
import { ForceClientRender, NoFlags, Ref, RefStatic, Snapshot, StaticMask, Update } from "./ReactFiberFlags";
import { getHostContext, getRootHostContainer, popHostContainer, popHostContext } from "./ReactFiberHostContext.old";
import { Lanes, mergeLanes, NoLanes } from "./ReactFiberLane.old";
import { popTreeContext } from "./ReactFiberTreeContext.old";
import { Fiber } from "./ReactInternalTypes";
import { CacheComponent, ClassComponent, ContextConsumer, ContextProvider, ForwardRef, Fragment, FunctionComponent, HostComponent, HostPortal, HostRoot, HostText, IncompleteClassComponent, IndeterminateComponent, LazyComponent, LegacyHiddenComponent, MemoComponent, Mode, OffscreenComponent, Profiler, ScopeComponent, SimpleMemoComponent, SuspenseComponent, SuspenseListComponent, TracingMarkerComponent } from "./ReactWorkTags";
import {resetWorkInProgressVersions as resetMutableSourceWorkInProgressVersions} from './ReactMutableSource.old';
import { popHydrationState, upgradeHydrationErrorsToRecoverable } from "./ReactFiberHydrationContext.old";
import { RootState } from "./ReactFiberRoot.old";
import { appendInitialChild, ChildSet, Container, createInstance, finalizeInitialChildren, Instance, prepareUpdate, Props, supportsMutation, supportsPersistence, Type, UpdatePayload } from "ReactDOMHostConfig";
import { enableProfilerTimer, enableSuspenseLayoutEffectSemantics } from "shared/ReactFeatureFlags";
import { NoMode, ProfileMode } from "./ReactTypeOfMode";

let appendAllChildren;  // 子节点挂载
let updateHostContainer;  // 容器更新
let updateHostComponent;  // 元素更新
let updateHostText; // 文本更新
if (supportsMutation) {
    appendAllChildren = function (parent: Instance, workInProgress: Fiber, needsVisibilityToggle: boolean, isHidden: boolean) {
        let node = workInProgress.child  // 从第一个子节点开始遍历
        while (node !== null) {
            // 只处理宿主元素和文本节点
            if (node.tag === HostComponent || node.tag === HostText) {
                appendInitialChild(parent, node.stateNode)  // 挂载到父元素
            } else if (node.tag === HostPortal) {
                // Portal 节点不遍历其子节点（单独处理）
            } else if (node.child !== null) {
                node.child.return = node
                node = node.child
                continue
            }

            // 遍历完子节点后，回溯到兄弟节点
            if (node === workInProgress) return
            while (node.sibling === null) {
                if (node.return === null || node.return === workInProgress) return
                node = node?.return  // 无兄弟节点则返回父节点
            }

            node.sibling.return = node.return
            node = node.sibling // 处理下一个兄弟节点
        }
    }
    updateHostContainer = function (current: Fiber | null, workInProgress: Fiber) {
        // Noop
    }
    updateHostComponent = function (current: Fiber, workInProgress: Fiber, type: Type, newProps: Props, rootContainerInstance: Container) {
        const oldProps = current.memoizedProps
        if (oldProps === newProps) {
            return
        }
        const instance: Instance = workInProgress.stateNode
        const currentHostContext = getHostContext()
        const updatePayload = prepareUpdate(instance, type, oldProps, newProps, rootContainerInstance, currentHostContext)
        workInProgress.updateQueue = (updatePayload as UpdatePayload)
        if (updatePayload) {
            markUpdate(workInProgress)
        }
    }
    updateHostText = function (current: Fiber, workInProgress: Fiber, oldText: string, newText: string) {
        debugger
    }
} else if (supportsPersistence) {
    appendAllChildren = function (parent: Instance, workInProgress: Fiber, needsVisibilityToggle: boolean, isHidden: boolean) {
        debugger
    }
    const appendAllChildrenToContainer = function (containerChildSet: ChildSet, workInProgress: Fiber, needsVisibilityToggle: boolean, isHidden: boolean) {
        debugger
    }
    updateHostContainer = function (current: Fiber | null, workInProgress: Fiber) {
        debugger
    }
    updateHostComponent = function (current: Fiber, workInProgress: Fiber, type: Type, newProps: Props, rootContainerInstance: Container) {
        debugger
    }
    updateHostText = function (current: Fiber, workInProgress: Fiber, oldText: string, newText: string) {
        debugger
    }
} else {
    updateHostContainer = function (current: Fiber | null, workInProgress: Fiber) {
        debugger
    }
    updateHostComponent = function (current: Fiber, workInProgress: Fiber, type: Type, newProps: Props, rootContainerInstance: Container) {
        debugger
    }
    updateHostText = function (current: Fiber, workInProgress: Fiber, oldText: string, newText: string) {
        debugger
    }
}

/**
 * bubbleProperties 是 React Fiber 架构中渲染阶段结束时的关键函数，主要作用是将子节点的属性（如优先级 lanes、标记 flags、性能数据等）“冒泡” 到父节点，确保整个 Fiber 树的状态一致性，并为后续的提交阶段（commit）准备必要信息。
 * 在 React 的渲染阶段（reconciliation），Fiber 节点会按深度优先遍历的顺序处理。当一个节点完成渲染后（completedWork），需要将其所有子节点的关键信息向上合并到自身，这个过程称为 “冒泡”。这样，父节点就能掌握整个子树的状态，便于后续的优先级调度和提交操作。
*/
function bubbleProperties(completedWork: Fiber) {
    /**
     * didBailout: 标记当前节点是否 “跳过更新”（即复用了上一次渲染的子树，没有重新渲染子节点）。
     *  判定依据：当前节点存在备用节点（alternate，上一次渲染的 Fiber 节点），且子节点引用与上一次完全相同（alternate.child === child）
     *  若为 true：子树未重新渲染，只需处理静态标记和基础数据
     *  若为 false：子树已重新渲染，需合并所有子节点的动态信息
     * */ 
    const didBailout = completedWork.alternate !== null && completedWork.alternate.child === completedWork.child
    let newChildLanes = NoLanes // 收集所有子节点（及后代）的优先级 lanes，用于父节点判断是否需要因子树更新而重渲染。
    let subtreeFlags = NoFlags  // 收集所有子节点（及后代）的标记（如更新、删除、Suspense 等），用于提交阶段处理副作用。
    if (!didBailout) {
        let child = completedWork.child
        while(child !== null) {
            // 合并优先级 lanes
            newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes))
            // 合并所有标记
            subtreeFlags |= child.subtreeFlags
            subtreeFlags |= child.flags
            // 修正子节点的 return 指针（指向当前父节点），确保 Fiber 树结构正确
            child.return = completedWork
            child = child.sibling
        }
        // 将合并后的子树标记添加到当前节点
        completedWork.subtreeFlags |= subtreeFlags
    } else {
        if (enableProfilerTimer && (completedWork.mode & ProfileMode) !== NoMode) {
            let treeBaseDuration = (completedWork.selfBaseDuration) as number
            let child = completedWork.child
            while (child !== null) {
                newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes))
                subtreeFlags |= child.subtreeFlags & StaticMask
                subtreeFlags |= child.flags & StaticMask
                treeBaseDuration += (child.selfBaseDuration as number)
                child = child.sibling
            }
            completedWork.treeBaseDuration = treeBaseDuration
        } else {
            debugger
        }
        completedWork.subtreeFlags |= subtreeFlags
    }
    completedWork.childLanes = newChildLanes
    return didBailout
}

export function completeWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
): Fiber | null {
    const newProps = workInProgress.pendingProps
    popTreeContext(workInProgress)
    switch (workInProgress.tag) {
        case IndeterminateComponent:
        case LazyComponent:
        case SimpleMemoComponent:
        case FunctionComponent:
        case ForwardRef:
        case Fragment:
        case Mode:
        case Profiler:
        case ContextConsumer:
        case MemoComponent: {
            bubbleProperties(workInProgress)
            return null
        }
        case ClassComponent: {
            debugger
            break
        }
        case HostRoot: {
            const fiberRoot = workInProgress.stateNode
            // popRootTransition(workInProgress, fiberRoot, renderLanes)
            popHostContainer(workInProgress)
            popTopLevelLegacyContextObject(workInProgress)
            resetMutableSourceWorkInProgressVersions()
            if (fiberRoot.pendingContext) {
                fiberRoot.context = fiberRoot.pendingContext
                fiberRoot.pendingContext = null
            }
            if (current === null || current.child === null) {
                const wasHydrated = popHydrationState(workInProgress)
                if (wasHydrated) {
                    debugger
                } else {
                    if (current !== null) {
                        const prevState: RootState = current.memoizedState
                        if (!prevState.isDehydrated || (workInProgress.flags & ForceClientRender) !== NoFlags) {
                            workInProgress.flags |= Snapshot
                            upgradeHydrationErrorsToRecoverable()
                        }
                    }
                }
            }
            updateHostContainer(current, workInProgress)
            bubbleProperties(workInProgress)
            return null
        }
        case HostComponent: {
            popHostContext(workInProgress) // 清理宿主上下文
            const rootContainerInstance = getRootHostContainer()
            const type = workInProgress.type

            if (current !== null && workInProgress.stateNode !== null) {
                // 已存在 DOM 实例：更新属性（如 className、style）
                updateHostComponent(current, workInProgress, type, newProps, rootContainerInstance)
                if (current.ref !== workInProgress.ref) {
                    markRef(workInProgress) // 标记 ref 变化
                }
            } else {
                // 首次渲染：
                if (!newProps) {
                    if (workInProgress.stateNode === null) {
                        throw new Error('completeWork 阶段出错了')
                    }
                    bubbleProperties(workInProgress)
                    return null
                }

                const currentHostContext = getHostContext()

                const wasHydrated = popHydrationState(workInProgress)
                if (wasHydrated) {
                    debugger
                } else {
                    // 创建 DOM 实例并挂载子节点
                    const instance = createInstance(type, newProps, rootContainerInstance, currentHostContext, workInProgress)
                    appendAllChildren(instance, workInProgress, false, false)  // 挂载子节点到 DOM 实例
                    workInProgress.stateNode = instance // 关联 DOM 实例到 Fiber 节点
                    // 处理初始属性（如 autoFocus）
                    if (finalizeInitialChildren(instance, type, newProps, rootContainerInstance, currentHostContext)) {
                        markUpdate(workInProgress) // 标记需要更新
                    }
                }

                if (workInProgress.ref !== null) {
                    markRef(workInProgress)
                }
            }

            bubbleProperties(workInProgress)
            return null
            
        }
        case HostText: {
            debugger
        }
        case SuspenseComponent: {
            debugger
        }
        case HostPortal: {
            debugger
        }
        case ContextProvider: {
            debugger
        }
        case IncompleteClassComponent: {
            debugger
        }
        case SuspenseListComponent: {
            debugger
        }
        case ScopeComponent: {
            debugger
        }
        case OffscreenComponent: {
            debugger
        }
        case LegacyHiddenComponent: {
            debugger
        }
        case CacheComponent: {
            debugger
        }
        case TracingMarkerComponent: {
            debugger
        }
        
        throw new Error(`Unknown unit of work tag (${workInProgress.tag}). This error is likely caused by a bug in React, Please file an issue.`)
    }
}

function markUpdate(workInProgress: Fiber) {
    workInProgress.flags |= Update
}

function markRef(workInProgress: Fiber) {
    workInProgress.flags |= Ref
    if (enableSuspenseLayoutEffectSemantics) {
        workInProgress.flags |= RefStatic
    }
}