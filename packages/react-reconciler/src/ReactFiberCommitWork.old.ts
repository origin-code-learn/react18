import { appendChildToContainer, clearContainer, Container, insertInContainerBefore, Instance, prepareForCommit, resetTextContent, supportsHydration, supportsMutation, supportsPersistence, UpdatePayload } from "ReactDOMHostConfig";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { Lanes } from "./ReactFiberLane.old";
import { deletedTreeCleanUpLevel, enableCache, enableCreateEventHandleAPI, enableProfilerCommitHooks, enableProfilerTimer, enableSuspenseLayoutEffectSemantics, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { BeforeMutationMask, ChildDeletion, ContentReset, Hydrating, LayoutMask, MutationMask, NoFlags, Passive, PassiveMask, Placement, Ref, Snapshot, Update } from "./ReactFiberFlags";
import { CacheComponent, ClassComponent, DehydratedFragment, ForwardRef, FunctionComponent, HostComponent, HostPortal, HostRoot, HostText, IncompleteClassComponent, LegacyHiddenComponent, MemoComponent, OffscreenComponent, Profiler, ScopeComponent, SimpleMemoComponent, SuspenseComponent, SuspenseListComponent, TracingMarkerComponent } from "./ReactWorkTags";
import { resolveDefaultProps } from "./ReactFiberLazyComponent.old";
import { captureCommitPhaseError } from "./ReactFiberWorkLoop.old";
import { ConcurrentMode, NoMode, ProfileMode } from "./ReactTypeOfMode";
import {
    commitUpdate
} from './ReactFiberHostConfig';
import { 
    NoFlags as NoHookEffect,
    HasEffect as HookHasEffect,
    Layout as HookLayout,
    Insertion as HookInsertion,
    Passive as HookPassive,
    type HookFlags,
} from "./ReactHookEffectTags";
import { Transition } from "shared/ReactTypes";
import { FunctionComponentUpdateQueue } from "./ReactFiberHooks.old";


let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;
let offscreenSubtreeWasHidden: boolean = false;

let inProgressLanes: Lanes | null = null
let inProgressRoot: FiberRoot | null = null

let nextEffect: Fiber | null = null;
export function commitBeforeMutationEffects(
    root: FiberRoot,
    firstChild: Fiber
) {
    /**
     * 1. 准备提交阶段，保存焦点元素对应的 React 实例，并暂停事件监听, 主要处理:
     *  - 保存当前事件监听状态（eventsEnabled）
     *  - 记录用户焦点元素和选择范围（selectionInformation）
     *  - 暂停 React 事件监听（避免 DOM 变更时事件干扰）
     *  - 返回焦点元素对应的 React 实例（activeInstance），存储到 focusedInstanceHandle 中
     * 这一步是为了在 DOM 变更前 “冻结” 用户交互状态，确保后续操作不会破坏用户体验（如输入框光标位置）。
    */
    focusedInstanceHandle = prepareForCommit(root.containerInfo) as any
    // 2. 初始化需要处理的 Fiber 节点（从 firstChild 开始遍历）
    nextEffect = firstChild

    // 3. 执行 Before Mutation 阶段的核心逻辑（遍历 Fiber 树处理副作用）
    commitBeforeMutationEffects_begin()

    /**
     * 4. 处理焦点模糊相关的触发标记
     * shouldFireAfterActiveInstanceBlur 是一个全局标记，用于判断是否需要在提交阶段后触发焦点模糊（blur）相关事件
     * 此处将标记值保存到 shouldFire 并重置标记，最终通过返回值告知调用者是否需要触发这些事件
     * */ 
    const shouldFire = shouldFireAfterActiveInstanceBlur
    shouldFireAfterActiveInstanceBlur = false
    // 5. 重置焦点实例句柄，避免残留值影响后续流程
    focusedInstanceHandle = null

    // 返回是否需要触发焦点模糊相关事件
    return shouldFire
}

/**
 * commitBeforeMutationEffects_begin 的本质是 Before Mutation 阶段的 Fiber 树遍历器，核心功能包括:
 *  1. 递归遍历 Fiber 树：通过深度优先策略遍历整个组件树，确保所有节点都被检查
 *  2. 处理待删除节点：在节点被真正从 DOM 中删除前，执行必要的前置清理（如事件句柄移除），仅在特定 API 启用时生效。
 *  3. 控制遍历流程：根据子树是否有副作用，决定继续深入子节点或回溯处理兄弟节点，高效完成全树遍历
 * 执行时机与意义:
 *  1. 确保 DOM 变更前的所有准备工作（如删除前清理）都被执行，避免后续操作出错。
 *  2. 通过标记位（subtreeFlags）优化遍历，只处理包含相关副作用的子树，提升性能
 *  3. 为 Mutation 阶段（实际 DOM 操作）铺平道路，保证操作的安全性和完整性
*/
export function commitBeforeMutationEffects_begin() {
    // 遍历所有需要处理的 Fiber 节点（nextEffect 是全局指针）
    while (nextEffect !== null) {
        const fiber = nextEffect
        if (enableCreateEventHandleAPI) {
            debugger
        }
        // 检查子树是否包含 Before Mutation 阶段的副作用标记
        const child = fiber.child
        if (
            (fiber.subtreeFlags & BeforeMutationMask) !== NoFlags && // 子树有需要处理的副作用
            child !== null // 存在子节点
        ) {
            // 继续遍历子节点（深度优先）
            child.return = fiber // 维护父指针，确保遍历可回溯
            nextEffect = child
        } else {
            // 子树无相关副作用或无子节点，进入完成阶段（处理当前节点并回溯）
            commitBeforeMutationEffects_complete()
        }
    }
}

/**
 * React 提交阶段中 Before Mutation 阶段的收尾遍历函数，与 commitBeforeMutationEffects_begin 配合完成整个 Fiber 树的遍历。它主要负责处理当前 Fiber 节点自身的副作用，并控制遍历流程从子节点回溯到父节点或切换到兄弟节点，确保整个 Fiber 树的所有节点都被完整处理。
 * 
*/
function commitBeforeMutationEffects_complete() {
    // 循环处理当前节点及回溯路径上的节点
    while(nextEffect !== null) {
        const fiber = nextEffect
        try {
            // 处理当前 Fiber 节点自身的 Before Mutation 阶段副作用
            commitBeforeMutationEffectsOnFiber(fiber)
        } catch (error) {
            // 捕获并处理提交阶段的错误
            captureCommitPhaseError(fiber, fiber.return, error)
        }
        // 检查是否有兄弟节点
        const sibling = fiber.sibling
        if (sibling !== null) {
            // 若有兄弟节点，切换到兄弟节点继续遍历（横向遍历）
            sibling.return = fiber.return // 维护父指针
            nextEffect = sibling
            return // 退出当前函数，回到 begin 阶段处理兄弟节点
        }
        // 若无兄弟节点，回溯到父节点（向上遍历）
        nextEffect = fiber.return
    }
}

function commitBeforeMutationEffectsOnFiber(finishedWork: Fiber) {
    const current = finishedWork.alternate
    const flags = finishedWork.flags
    if (enableCreateEventHandleAPI) {
        debugger
    }
    if ((flags & Snapshot) !== NoFlags) {
        switch (finishedWork.tag) {
            case FunctionComponent:
            case ForwardRef:
            case SimpleMemoComponent: {
                break
            }
            case ClassComponent: {
                if (current !== null) {
                    const prevProps = current.memoizedProps
                    const prevState = current.memoizedState
                    const instance = finishedWork.stateNode
                    const snapshot = instance.getSnapshotBeforeUpdate(finishedWork.elementType === finishedWork.type ? prevProps : resolveDefaultProps(finishedWork.type, prevProps), prevState)
                    instance.__reactInternalSnapshotBeforeUpdate = snapshot
                    break
                }
            }
            case HostRoot: {
                if (supportsMutation) {
                    const root = finishedWork.stateNode
                    clearContainer(root.containerInfo)
                }
                break
            }
            case HostComponent:
            case HostText:
            case HostPortal:
            case IncompleteClassComponent:
                break;
            default: {
                throw new Error(`commitBeforeMutationEffectsOnFiber 发生错误！`)
            }
        }
    }
}

export function commitMutationEffects(
    root: FiberRoot,
    finishedWork: Fiber,
    committedLanes: Lanes
) {
    inProgressLanes = committedLanes
    inProgressRoot = root
    commitMutationEffectsOnFiber(finishedWork, root, committedLanes)
    inProgressLanes = null
    inProgressRoot = null
}

export function commitLayoutEffects(
    finishedWork: Fiber,
    root: FiberRoot,
    committedLanes: Lanes
) {
    inProgressLanes = committedLanes
    inProgressRoot = root
    nextEffect = finishedWork

    commitLayoutEffects_begin(finishedWork, root, committedLanes)

    inProgressLanes = null
    inProgressRoot = null
}

/**
 * commitLayoutEffects_begin 是 React 提交阶段（commit phase）中 Layout 阶段的核心遍历函数，负责递归遍历 Fiber 树，触发布局相关的副作用（如 useLayoutEffect 回调、componentDidMount/componentDidUpdate 生命周期方法等）。它与 commitLayoutMountEffects_complete 配合，实现 Layout 阶段的深度优先遍历，确保所有布局副作用按正确顺序执行。
 * 核心背景：Layout 阶段的作用
 *  1. Layout 阶段是 React 提交阶段的第三个阶段（前两个是 Before Mutation、Mutation 阶段），主要任务包括：
 *  2. 执行布局相关的副作用（如 useLayoutEffect 的回调函数）；
 *  3. 更新 DOM 元素的布局信息（如位置、尺寸）；
 *  4. 处理 ref 回调（同步获取更新后的 DOM 节点）；
 *  5. 触发组件生命周期方法（如类组件的 componentDidMount）。
*/
function commitLayoutEffects_begin(
    subtreeRoot: Fiber,   // 当前子树的根 Fiber 节点
    root: FiberRoot,      // 应用的根 Fiber 节点
    committedLanes: Lanes // 本次提交的优先级通道
) {
    // 判断当前根节点是否为现代模式（支持并发特性）
    const isModernRoot = (subtreeRoot.mode & ConcurrentMode) !== NoMode

    // 遍历所有需要处理的 Fiber 节点（nextEffect 是全局遍历指针）
    while (nextEffect !== null) {
        const fiber = nextEffect
        const firstChild = fiber.child // 当前节点的第一个子节点

        // 特殊处理：OffscreenComponent（用于 Suspense 等场景的离线组件）
        if (
            enableSuspenseLayoutEffectSemantics && // 启用 Suspense 布局语义
            fiber.tag === OffscreenComponent &&    // 当前节点是 Offscreen 组件
            isModernRoot
        ) {
            debugger
        }

        // 常规节点处理：检查子树是否包含 Layout 阶段的副作用
        if (
            (fiber.subtreeFlags & LayoutMask) !== NoFlags &&  // 子树有 Layout 副作用
            firstChild !== null  // 存在子节点
        ) {
            // 继续深度优先遍历：移动到子节点
            firstChild.return = fiber  // 维护父指针
            nextEffect = firstChild
        } else {
            // 子树无 Layout 副作用或无子节点：进入完成阶段
            commitLayoutMountEffects_complete(subtreeRoot, root, committedLanes)
        }
    }
}

function commitLayoutEffectOnFiber(
    finishedRoot: FiberRoot,
    current: Fiber | null,
    finishedWork: Fiber,
    committedLanes: Lanes
) {
    if ((finishedWork.flags & LayoutMask) !== NoFlags) {
        switch (finishedWork.tag) {
            case FunctionComponent:
            case ForwardRef:
            case SimpleMemoComponent: {
                debugger
            }
            case ClassComponent: {
                debugger
            }
            case HostRoot: {
                debugger
            }
            case HostComponent: {
                const instance: Instance = finishedWork.stateNode
                if (current === null && finishedWork.flags & Update) {
                    debugger
                }
                break
            }
            case HostText: {
                break
            }
            case HostPortal: {
                break
            }
            case Profiler: {
                debugger
            }
            case SuspenseComponent: {
                debugger
            }
            case SuspenseListComponent:
            case IncompleteClassComponent:
            case ScopeComponent:
            case OffscreenComponent:
            case LegacyHiddenComponent:
            case TracingMarkerComponent: {
                break;
            }
            default: {
                throw new Error(`commitLayoutEffectOnFiber 发生错误！`)
            }
        }
    }
    
    if (!enableSuspenseLayoutEffectSemantics || !offscreenSubtreeWasHidden) {
        debugger
    }
}

/**
 * commitLayoutMountEffects_complete 是 React 提交阶段（Layout 阶段）中负责处理当前 Fiber 节点自身布局副作用，并控制遍历流程回溯的核心函数。它与 commitLayoutEffects_begin 配合，通过 “先深入子树、后回溯处理自身” 的深度优先遍历策略，确保每个节点的布局副作用（如 useLayoutEffect 回调、ref 处理等）被完整执行
 * 核心背景：Layout 阶段的遍历逻辑
 *  Layout 阶段是 React 提交阶段中执行布局相关操作的关键阶段，主要处理依赖 DOM 变更的副作用（如获取 DOM 尺寸、同步更新 ref、执行布局回调等）。该阶段的遍历采用深度优先搜索（DFS）：
 *  commitLayoutEffects_begin 负责 “向下遍历”，深入子树处理子节点的布局副作用。
 *  当子节点遍历完成后，commitLayoutMountEffects_complete 负责 “向上回溯”，处理当前节点自身的布局副作用，并切换到兄弟节点或父节点，完成整个遍历闭环
*/
function commitLayoutMountEffects_complete(
    subtreeRoot: Fiber,  // 当前子树的根 Fiber 节点（遍历的边界）
    root: FiberRoot,     // 应用的根 Fiber 节点
    committedLanes: Lanes // 本次提交的优先级通道
) {
    // 循环处理当前节点及回溯路径上的节点，直到遍历完整个子树
    while (nextEffect !== null) {
        const fiber = nextEffect  // 当前需要处理的 Fiber 节点 (用于对比更新)
        // 1. 处理当前节点自身的 Layout 阶段副作用
        if ((fiber.flags & LayoutMask) !== NoFlags) {
            const current = fiber.alternate
            try {
                // 执行具体的布局副作用（如 useLayoutEffect 回调、ref 更新等）
                commitLayoutEffectOnFiber(root, current, fiber, committedLanes)
            } catch (error) {
                // 捕获并处理布局阶段的错误（不中断整个提交流程）
                captureCommitPhaseError(fiber, fiber.return, error)
            }
        }

        // 2. 检查是否到达当前子树的根节点（遍历边界）
        if (fiber === subtreeRoot) {
            nextEffect = null // 清空遍历指针，结束当前子树的遍历
            return 
        }

        // 3. 切换到兄弟节点（横向遍历）
        const sibling = fiber.sibling
        if (sibling !== null) {
            sibling.return = fiber.return  // 确保兄弟节点的父指针正确
            nextEffect = sibling  // 更新遍历指针为兄弟节点
            return // 退出当前函数，回到 begin 阶段处理兄弟节点的子树
        }

        // 4. 回溯到父节点（向上遍历）
        nextEffect = fiber.return
    }
}

function safelyDetachRef(current: Fiber, nearestMountedAncestor: Fiber | null) {
    debugger
}

export function commitMutationEffectsOnFiber(
    finishedWork: Fiber,
    root: FiberRoot,
    lanes: Lanes
) {
    const current = finishedWork.alternate
    const flags = finishedWork.flags
    switch (finishedWork.tag) {
        case FunctionComponent:
        case ForwardRef:
        case MemoComponent:
        case SimpleMemoComponent: {
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)
            if (flags & Update) {
                debugger
            }
            return
        }
        case ClassComponent: {
            debugger
        }
        case HostComponent: {
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)
            if (flags & Ref) {
                if (current !== null) {
                    safelyDetachRef(current, current.return)
                }
            }
            if (supportsMutation) {
                if (finishedWork.flags & ContentReset) {
                    const instance: Instance = finishedWork.stateNode
                    try {
                        resetTextContent(instance)
                    } catch (error) {
                        captureCommitPhaseError(finishedWork, finishedWork.return, error)
                    }
                }
                if (flags & Update) {
                    const instance: Instance = finishedWork.stateNode
                    if (instance != null) {
                        const newProps = finishedWork.memoizedProps
                        const oldProps = current !== null ? current.memoizedProps : newProps
                        const type = finishedWork.type
                        const updatePayload: null | UpdatePayload = finishedWork.updateQueue as any
                        finishedWork.updateQueue = null
                        if (updatePayload !== null) {
                            try {
                                commitUpdate(instance, updatePayload, type, oldProps, newProps, finishedWork)
                            } catch (error) {
                                captureCommitPhaseError(finishedWork, finishedWork.return, error)
                            }
                        }
                    }
                }
            }
            return
        }
        case HostText: {
            debugger
        }
        case HostRoot: {
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)
            if (flags & Update) {
                if (supportsMutation && supportsHydration) {
                    debugger
                }
                if (supportsPersistence) {
                    debugger
                }
            }
            return
        }
        case HostPortal: {
            debugger
        }
        case SuspenseComponent: {
            debugger
        }
        case OffscreenComponent: {
            debugger
        }
        case SuspenseListComponent: {
            debugger
        }
        case ScopeComponent: {
            debugger
        }
        default: {
            debugger
        }
    }
}

/**
 * recursivelyTraverseMutationEffects 是 React 提交阶段（commit phase）中 Mutation 阶段的核心遍历函数，负责递归处理 Fiber 树中与 DOM 变更相关的副作用（如删除节点、插入节点、更新属性等）。它是 React 将虚拟 DOM 计算出的变更实际应用到真实 DOM 的关键执行者。
 * React 提交阶段的 Mutation 阶段 是真正执行 DOM 操作的阶段，主要任务包括：
 *   1. 移除需要删除的节点（对应 deletions 列表）
 *   2. 插入新节点、更新现有节点的属性（如 className、style）、文本内容等
 *   3. 处理与 DOM 直接相关的副作用（如事件绑定）
 * recursivelyTraverseMutationEffects 通过递归遍历 Fiber 树，确保所有节点的 DOM 变更都被按序执行，是连接虚拟 DOM 与真实 DOM 的 “桥梁”
*/
function recursivelyTraverseMutationEffects(
    root: FiberRoot,     // 应用的根 Fiber 节点
    parentFiber: Fiber,  // 当前要处理的父 Fiber 节点
    lanes: Lanes         // 本次更新的优先级通道（Lanes）
) {
    // 1. 先处理待删除的子节点（删除操作需在子节点处理前执行）
    const deletions = parentFiber.deletions // 父节点记录的待删除子节点列表
    if (deletions !== null) {
        debugger
    }
    // 2. 处理当前父节点的子树中所有节点的 Mutation 阶段副作用
    if (parentFiber.subtreeFlags & MutationMask) { // 检查子树是否包含 Mutation 阶段的副作用标记（优化：避免无意义遍历）
        let child = parentFiber.child  // 从第一个子节点开始遍历
        while(child !== null) {
            // 处理单个子节点的 Mutation 阶段副作用（如插入、更新 DOM）
            commitMutationEffectsOnFiber(child, root, lanes)
            child = child.sibling // 遍历下一个兄弟节点（横向遍历）
        }
    }
}

function commitReconciliationEffects(finishedWork: Fiber) {
    const flags = finishedWork.flags
    if (flags & Placement) {
        try {
            commitPlacement(finishedWork)
        } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error)
        }
        finishedWork.flags &= ~Placement
    }
    if (flags & Hydrating) {
        finishedWork.flags &= ~Placement
    }
}

/**
 * commitPlacement 是 React 提交阶段（Mutation 阶段）中负责将标记为 “需要插入（Placement）” 的 Fiber 节点实际插入到真实 DOM 中的核心函数。它解决了 “在哪里插入” 和 “如何插入” 的关键问题，确保新增节点被准确添加到 DOM 树的正确位置。
 * 
*/
function commitPlacement(finishedWork: Fiber) {
    // 若不支持 DOM 变更（如某些测试环境），直接返回
    if (!supportsMutation) {
        return
    }
    // 1. 找到当前节点的宿主父 Fiber（即负责管理 DOM 容器的 Fiber 节点）, 这里为什么要一直往上找直到 HostFiber？
    const parentFiber = getHostParentFiber(finishedWork)
    switch (parentFiber.tag) {
        // 情况1：父节点是宿主组件（如 <div>、<span> 等对应 DOM 元素的 Fiber）
        case HostComponent: {
            const parent: Instance = parentFiber.stateNode
            if (parentFiber.flags & ContentReset) { // 若父节点有 ContentReset 标记（需重置文本内容）
                resetTextContent(parent)  // 清空父节点文本内容
                parentFiber.flags &= ~ContentReset  // 清除标记
            }
            // 找到插入的参考节点 （当前节点应插入到该节点之前）
            const before = getHostSibling(finishedWork) 
            // 递归插入当前节点及其子树中所有需要插入的宿主节点
            insertOrAppendPlacementNode(finishedWork, before, parent)
            break;
        }
        // 情况2：父节点是根节点（HostRoot）或 Portal 节点
        case HostRoot:
        case HostPortal: {
            // 父容器是根容器（如 #root）或 Portal 指定的容器
            const parent: Container = parentFiber.stateNode.containerInfo
            // 找到插入的参考节点
            const before = getHostSibling(finishedWork)
            // 插入到根容器或 Portal 容器中
            insertOrAppendPlacementNodeIntoContainer(finishedWork, before, parent)
            break
        }
        default: {
            throw new Error('commitPlacement 出错了！')
        }
    }
}


/**
 * isHostParent 是判断一个 Fiber 节点是否为 “宿主父节点”** 的工具函数。所谓 “宿主父节点”，指的是能够直接作为 DOM 元素容器的 Fiber 节点，它们是连接 React 虚拟 Fiber 树与浏览器真实 DOM 树的关键节点。
 * 核心背景：宿主节点的特殊作用
 *  在 React 中，Fiber 节点分为多种类型（如组件节点、宿主节点等），其中宿主节点（Host Node） 是直接对应真实 DOM 元素或容器的节点（如 <div> 对应 HostComponent，根容器对应 HostRoot）
 * */ 
function isHostParent(fiber: Fiber): boolean {
    return (
        fiber.tag === HostComponent || // 宿主组件（如 <div>、<span> 等对应 DOM 元素的节点）
        fiber.tag == HostRoot ||  // 根节点（对应应用挂载的根容器，如 #root）
        fiber.tag === HostPortal  // Portal 节点（对应 Portal 指向的 DOM 容器）
    )
}

function getHostParentFiber(fiber: Fiber): Fiber {
    let parent = fiber.return
    while (parent !== null) {
        if (isHostParent(parent)) {
            return parent
        }
        parent = parent.return
    }
    throw new Error('getHostParentFiber 发生错误！')
}

/**
 *  getHostSibling 是 React 提交阶段（Mutation 阶段）中为待插入节点查找参考节点（sibling） 的核心函数。它的作用是在 DOM 树中找到一个已存在的宿主节点（如 <div>、文本节点等），作为新节点插入的位置参考（新节点会被插入到该参考节点之前）。这一逻辑确保了新增节点能被插入到正确的 DOM 位置，符合协调阶段计算的布局结构。
 *  核心背景：为什么需要参考节点？
 *   当 React 需要将一个标记为 Placement（待插入）的节点添加到 DOM 时，需要明确插入位置。浏览器的 insertBefore 等 API 要求指定 “参考节点”（即新节点插入到哪个节点的前面）。
 *   getHostSibling 的任务就是找到这个参考节点，规则是：参考节点通常是待插入节点在 Fiber 树中的 “下一个稳定的宿主节点”（即未被标记为 Placement 的宿主节点）。
 */ 
function getHostSibling(fiber: Fiber) {
    // 查找待插入节点的下一个宿主节点作为参考节点
    // 若存在连续插入的节点，需要跳过它们，可能导致指数级搜索（待优化）
    let node: Fiber = fiber
    siblings: while (true) {
        // 步骤1: 若当前节点没有兄弟节点，向上回溯到父节点
        while (node.sibling === null) {
            if (node.return === null || isHostParent(node.return)) {
                // 若回溯到根节点或宿主父节点，说明没有参考节点（插入到父容器末尾）
                return null
            }
            node = node.return
        }

        // 步骤2: 移动到当前节点的兄弟节点，并确保父指针正确
        node.sibling.return = node.return
        node = node.sibling

        // 步骤3: 向下遍历兄弟节点的子树，寻找宿主节点（HostComponent/HostText 等）
        while (
            node.tag !== HostComponent &&
            node.tag !== HostText &&
            node.tag !== DehydratedFragment
        ) {
            // 若当前节点是待插入节点（有 Placement 标记），直接跳过，继续找下一个兄弟
            if (node.flags & Placement) {
                continue siblings
            }

            // 若当前节点没有子节点，或为 Portal（不属于当前宿主树），跳过找兄弟
            if (node.child === null || node.tag === HostPortal) {
                continue siblings
            } else {
                // 否则深入子节点继续查找宿主节点
                node.child.return = node
                node = node.child
            }
        }

        // 步骤4: 找到宿主节点后，检查它是否是“稳定的”（未被标记为 Placement）
        if (!(node.flags & Placement)) {
            // 返回该宿主节点的真实 DOM 实例（作为参考节点）
            return node.stateNode
        }
    }
}

/**
 * insertOrAppendPlacementNode 是 React 提交阶段（Mutation 阶段）中将标记为 “待插入（Placement）” 的 Fiber 节点及其子树实际插入到真实 DOM 中的核心函数。它根据节点类型（宿主节点、组件节点等）决定插入方式，确保整个待插入子树被正确添加到指定的父容器中。
 * 
 * 
*/
function insertOrAppendPlacementNode(
    node: Fiber, // 待插入的fiber 节点
    before: Instance | null, // 参考节点（新节点插入到该节点之前，为 null 则插入到末尾）
    parent: Instance // 父容器的真实 DOM 元素
) {
    debugger
}

/**
 * insertOrAppendPlacementNodeIntoContainer 是 React 提交阶段（Mutation 阶段）中，专门用于将标记为 “待插入（Placement）” 的 Fiber 节点及其子树插入到根容器（如 HostRoot）或 Portal 容器中的函数。它与 insertOrAppendPlacementNode 逻辑相似，但针对 “容器级” 插入场景（而非普通 DOM 元素父容器），确保节点能正确插入到顶层容器或 Portal 指定的容器中。
 * 
*/
function insertOrAppendPlacementNodeIntoContainer(
    node: Fiber,   // 待插入的 Fiber 节点
    before: Instance | null,  // 参考节点（新节点插入到该节点之前，为 null 则插入到末尾）
    parent: Container  // 顶层容器或 Portal 容器（如 #root 或 Portal 目标容器）
) {
    const { tag } = node  // 获取当前节点的类型标记
    // 1. 若为宿主节点（直接对应 DOM 元素），执行容器级插入
    const isHost = tag === HostComponent || tag === HostText
    if (isHost) {
        const stateNode = node.stateNode  // 宿主节点的真实 DOM 元素（如 div 实例）
        if (before) {
            // 若有参考节点，插入到容器中参考节点之前
            insertInContainerBefore(parent, stateNode, before)
        } else {
            // 若无参考节点，追加到容器末尾
            appendChildToContainer(parent, stateNode);
        }
    } else if (tag === HostPortal) {
        // 2. 若为 Portal 节点，不递归处理其子节点（Portal 子节点有独立插入逻辑）
        // Portal 的插入逻辑由其自身处理，此处不深入
    } else {
        // 3. 其他类型节点（如组件节点），递归处理其子节点
        const child = node.child
        if (child !== null) {
            // 递归插入第一个子节点
            insertOrAppendPlacementNodeIntoContainer(child, before, parent)
            // 遍历所有兄弟子节点，递归插入
            let sibling = child.sibling
            while (sibling !== null) {
                insertOrAppendPlacementNodeIntoContainer(sibling, before, parent)
                sibling = sibling.sibling
            }
        }
    }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
    deletedSubtreeRoot: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    debugger
}

// 该函数负责 向下遍历 Fiber 树（从父节点到子节点），核心是处理 “子节点删除” 和进入子树继续遍历，不直接执行副作用，只做 “遍历引导” 和 “删除预处理”。
function commitPassiveUnmountEffects_begin() {
    // 循环便利: 只要还有需要处理的 Fiber 节点（nextEffect 不为 null）
    while (nextEffect !== null) {
        const fiber = nextEffect  // 当前正在处理的 Fiber 节点
        const child = fiber.child // 当前节点的子 Fiber 节点

        // 1. 处理“子节点删除”：如果当前节点有 ChildDeletion 标记（存在要删除的子节点）
        if ((nextEffect.flags & ChildDeletion) !== NoFlags) {
            const deletions = fiber.deletions // 存储要删除的子节点列表
            if (deletions !== null) {
                // 遍历所有要删除的字节点，处理其内部的被动卸载副作用
                for (let i = 0; i < deletions.length; i++) {
                    const fiberToDelete = deletions[i] // 要删除的字节点
                    nextEffect = fiberToDelete // 移动指针到要删除的节点
                    // 递归处理被删除节点的子树（深度优先），执行其中的卸载副作用
                    commitPassiveUnmountEffectsInsideOfDeletedTree_begin(fiberToDelete, fiber)
                }
                // 优化逻辑：清理被删除节点的链表引用，避免内存泄漏
                if (deletedTreeCleanUpLevel >= 1) {
                    const previousFiber = fiber.alternate // 当前节点的备用节点（React双缓存机制）
                    if (previousFiber !== null) {
                        let detachedChild = previousFiber.child // 备用节点的字节点
                        if (detachedChild !== null) {
                            previousFiber.child = null  // 断开父节点与字节点的引用
                            // 循环断开所有子节点的兄弟引用
                            do {
                                const detachedSibling = detachedChild.sibling
                                detachedChild.sibling = null
                                detachedChild = detachedSibling
                            } while (detachedChild !== null)
                        }
                    }
                }

                nextEffect = fiber // 处理完删除后，指针回到当前节点
            }
        }

        // 2. 决定下一步遍历方向： 是否进入子树
        // 如果当前节点的子树有 Passive 副作用（subtreeFlags 包含 PassiveMask），且存在子节点
        if ((fiber.subtreeFlags & PassiveMask) !== NoFlags && child !== null) {
            child.return = fiber // 确保子节点的父引用正确（防止遍历错乱）
            nextEffect = child // 指针向下移动到子节点（继续深度优先遍历）
        } else {
            // 子树无 Passive 副作用，或无子女，进入“向上回溯阶段”
            commitPassiveUnmountEffects_complete()
        }
    }
}

function safelyCallDestroy(
    current: Fiber,
    nearestMountedAncestor: Fiber | null,
    destroy: () => void
) {
    debugger
}

function commitHookEffectListUnmount(
    flags: HookFlags,
    finishedWork: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    const updateQueue: FunctionComponentUpdateQueue | null = finishedWork.updateQueue as any
    const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null
    if (lastEffect !== null) {
        const firstEffect = lastEffect.next
        let effect = firstEffect
        do {
            if ((effect.tag & flags) === flags) {
                // Unmount
                const destroy = effect.destroy
                effect.destroy = undefined
                if (destroy !== undefined) {
                    safelyCallDestroy(finishedWork, nearestMountedAncestor, destroy)
                }
            }
            effect = effect.next
        } while (effect !== firstEffect);
    }
}

function commitHookEffectListMount(
    flags: HookFlags,
    finishedWork: Fiber,
) {
    const updateQueue: FunctionComponentUpdateQueue | null = finishedWork.updateQueue as any
    const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null
    if (lastEffect !== null) {
        const firstEffect = lastEffect.next
        let effect = lastEffect.next
        do {
            if ((effect.tag & flags) === flags) {
                const create = effect.create
                effect.destroy = create()
            }
            effect = effect.next
        } while (effect !== firstEffect);
    }
}

function commitPassiveMountOnFiber(
    finishedRoot: FiberRoot,
    finishedWork: Fiber,
    committedLanes: Lanes,
    committedTransitions: Array<Transition> | null,
) {
    switch (finishedWork.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
            commitHookEffectListMount(HookPassive | HookHasEffect, finishedWork)
            break
        }
        case HostRoot: {
            if (enableCache) {
                debugger
            }
            if (enableTransitionTracing) {
                debugger
            }
            break
        }
        case LegacyHiddenComponent:
        case OffscreenComponent: {
            if (enableCache) {
                debugger
            }
            if (enableTransitionTracing) {
                debugger
            }
            break
        }
        case CacheComponent: {
            if (enableCache) {
                debugger
            }
            break
        }
    }
}

function commitPassiveUnmountOnFiber(finishedWork: Fiber) {
    switch (finishedWork.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
            if (enableProfilerTimer && enableProfilerCommitHooks && finishedWork.mode & ProfileMode) {
                // startPassiveEffectTimer();
                commitHookEffectListUnmount(
                    HookPassive | HookHasEffect,
                    finishedWork,
                    finishedWork.return,
                );
                // recordPassiveEffectDuration(finishedWork);
            } else {
                commitHookEffectListUnmount(
                    HookPassive | HookHasEffect,
                    finishedWork,
                    finishedWork.return,
                );
            }
        }
    }
}

function commitPassiveUnmountEffects_complete() {
    // 循环遍历：只要还有需要处理的 Fiber 节点（nextEffect 不为 null）
    while (nextEffect !== null) {
        const fiber = nextEffect // 当前正在处理的 Fiber 节点

        // 1. 执行当前节点的被动卸载副作用
        if ((fiber.flags & Passive) !== NoFlags) {
            commitPassiveUnmountOnFiber(fiber) // 核心：执行卸载清理逻辑（如 useEffect 的清理函数）
        }

        // 2. 决定下一步遍历方向：是否处理兄弟节点
        const sibling = fiber.sibling // 当前节点的兄弟节点
        if (sibling !== null) {
            sibling.return = fiber.return // 确保兄弟节点的父引用正确
            nextEffect = sibling // 指针移动到兄弟节点（处理同层级节点）
            return // 退出当前循环，回到 begin 函数继续处理兄弟节点
        }

        // 3. 无兄弟节点，向上回溯到父节点
        nextEffect = fiber.return // 指针向上移动到父节点（继续向上回溯）
    }

}

export function commitPassiveUnmountEffects(firstChild: Fiber) {
    nextEffect = firstChild
    commitPassiveUnmountEffects_begin()
}


export function commitPassiveMountEffects(
    root: FiberRoot,
    finishedWork: Fiber,
    committedLanes: Lanes,
    committedTransitions: Array<Transition> | null
) {
    nextEffect = finishedWork
    commitPassiveMountEffects_begin(
        finishedWork,
        root,
        committedLanes,
        committedTransitions,
    )
}

// 向下遍历 Fiber 树，找到所有包含 Passive Effect 的子树，为后续执行副作用做准备。
function commitPassiveMountEffects_begin(
    subtreeRoot: Fiber, // 要处理的子树根节点
    root: FiberRoot, // React 应用的根节点（FiberRoot）
    committedLanes: Lanes, // 本次提交的优先级车道
    committedTransitions: Array<Transition> | null // 本次提交的过渡任务
) {
    // 循环遍历：只要还有待处理的 Fiber 节点（nextEffect 不为 null）
    while (nextEffect !== null) {
        const fiber = nextEffect // 当前处理的 Fiber 节点
        const firstChild = fiber.child // 当前节点的第一个子 Fiber 节点
        // 关键判断：当前节点的子树包含 Passive Effect，且存在子节点
        if ((fiber.subtreeFlags & PassiveMask) !== NoFlags && firstChild !== null) {
            firstChild.return = fiber // 确保子节点的父引用正确（避免遍历错乱）
            nextEffect = firstChild  // 指针下移：处理子节点（深度优先）
        } else {
            // 子树无 Passive Effect 或无子节点 → 进入「回溯执行阶段」
            commitPassiveMountEffects_complete(
                subtreeRoot,
                root,
                committedLanes,
                committedTransitions,
            )
        }
    }
}

// 向上回溯 Fiber 树，执行当前节点的 Passive Effect 挂载逻辑（即执行 useEffect 的 create 函数），并处理兄弟节点 / 父节点的遍历
function commitPassiveMountEffects_complete(
    subtreeRoot: Fiber,
    root: FiberRoot,
    committedLanes: Lanes,
    committedTransitions: Array<Transition> | null
) {
    while (nextEffect !== null) {
        const fiber = nextEffect // 当前处理的 Fiber 节点
        
        // 关键：当前节点有 Passive 标记 → 执行 useEffect 的挂载逻辑
        if ((fiber.flags & Passive) !== NoFlags) {
            try {
                // 核心：执行 Passive Effect 挂载（调用 useEffect 的 create 函数）
                commitPassiveMountOnFiber(
                    root,
                    fiber,
                    committedLanes,
                    committedTransitions
                )
            } catch (error) {
                // 捕获执行过程中的错误，记录到 Fiber 节点
                captureCommitPhaseError(fiber, fiber.return, error)
            }
        }

        // 终止条件：遍历到子树根节点 → 结束遍历
        if (fiber === subtreeRoot) {
            nextEffect = null
            return
        }

        // 步骤1：优先处理兄弟节点（同层级）
        const sibling = fiber.sibling
        if (sibling !== null) {
            sibling.return = fiber.return // 修复兄弟节点的父引用
            nextEffect = sibling // 指针移到兄弟节点
            return // 退出当前循环，回到 begin 函数继续处理兄弟节点
        }

        // 步骤2：无兄弟节点 → 回溯到父节点
        nextEffect = fiber.return
    }
}