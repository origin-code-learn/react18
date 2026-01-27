import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { Lanes } from "./ReactFiberLane.old";
import { deletedTreeCleanUpLevel, enableCache, enableCreateEventHandleAPI, enableProfilerCommitHooks, enableProfilerTimer, enableSchedulingProfiler, enableScopeAPI, enableSuspenseCallback, enableSuspenseLayoutEffectSemantics, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { BeforeMutationMask, ChildDeletion, ContentReset, Hydrating, LayoutMask, MutationMask, NoFlags, Passive, PassiveMask, Placement, Ref, Snapshot, Update, Visibility } from "./ReactFiberFlags";
import { CacheComponent, ClassComponent, DehydratedFragment, ForwardRef, FunctionComponent, HostComponent, HostPortal, HostRoot, HostText, IncompleteClassComponent, LegacyHiddenComponent, MemoComponent, OffscreenComponent, Profiler, ScopeComponent, SimpleMemoComponent, SuspenseComponent, SuspenseListComponent, TracingMarkerComponent } from "./ReactWorkTags";
import { resolveDefaultProps } from "./ReactFiberLazyComponent.old";
import { captureCommitPhaseError, markCommitTimeOfFallback, resolveRetryWakeable } from "./ReactFiberWorkLoop.old";
import { ConcurrentMode, NoMode, ProfileMode } from "./ReactTypeOfMode";
import {
    commitUpdate,
    appendChildToContainer,
    clearContainer,
    Container,
    insertInContainerBefore,
    Instance,
    prepareForCommit,
    removeChild,
    removeChildFromContainer,
    resetTextContent,
    supportsHydration,
    supportsMutation,
    supportsPersistence,
    TextInstance,
    UpdatePayload,
    insertBefore,
    appendChild,
    detachDeletedInstance,
    getPublicInstance,
    hideInstance,
    unhideInstance,
    hideTextInstance,
    unhideTextInstance
} from './ReactFiberHostConfig';
import {
    NoFlags as NoHookEffect,
    HasEffect as HookHasEffect,
    Layout as HookLayout,
    Insertion as HookInsertion,
    Passive as HookPassive,
    type HookFlags,
} from "./ReactHookEffectTags";
import { Transition, Wakeable } from "shared/ReactTypes";
import { FunctionComponentUpdateQueue } from "./ReactFiberHooks.old";
import { OffscreenInstance, OffscreenState } from "./ReactFiberOffscreenComponent";
import { SuspenseState } from "./ReactFiberSuspenseComponent.old";


let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;
// 标记当前 Fiber 子树是否是 “隐藏的离屏组件”（OffscreenComponent）
let offscreenSubtreeWasHidden: boolean = false;
let offscreenSubtreeIsHidden: boolean = false;

let inProgressLanes: Lanes | null = null
let inProgressRoot: FiberRoot | null = null

let hostParent: Instance | Container | null = null;
let hostParentIsContainer: boolean = false;

let nextEffect: Fiber | null = null;

const PossiblyWeakSet = typeof WeakSet === 'function' ? WeakSet : Set

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
    while (nextEffect !== null) {
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

function reappearLayoutEffects_begin(subtreeRoot: Fiber) {
    while (nextEffect !== null) {
        const fiber = nextEffect
        const firstChild = fiber.child
        if (fiber.tag === OffscreenComponent) {
            const isHidden = fiber.memoizedState !== null
            if (isHidden) {
                reappearLayoutEffects_complete(subtreeRoot)
                continue
            }
        }

        if (firstChild !== null) {
            firstChild.return = fiber
            nextEffect = firstChild
        } else {
            reappearLayoutEffects_complete(subtreeRoot)
        }
    }
}

function safelyAttachRef(
    current: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    try {
        commitAttachRef(current)
    } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error)
    }
}

function safelyCallCommitHookLayoutEffectListMount(
    current: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    try {
        commitHookEffectListMount(HookLayout, current)
    } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error)
    }
}

function safelyCallComponentDidMount(
    current: Fiber,
    nearestMountedAncestor: Fiber | null,
    instance: any
) {
    try {
        instance.componentDidMount()
    } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error)
    }
}

function reappearLayoutEffectsOnFiber(node: Fiber) {
    switch (node.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
            safelyCallCommitHookLayoutEffectListMount(node, node.return)
            break
        }
        case ClassComponent: {
            const instance = node.stateNode
            if (typeof instance.componentDidMount === 'function') {
                safelyCallComponentDidMount(node, node.return, instance)
            }
            safelyAttachRef(node, node.return)
            break
        }
        case HostComponent: {
            safelyAttachRef(node, node.return)
            break
        }
    }
}

function reappearLayoutEffects_complete(subtreeRoot: Fiber) {
    while (nextEffect !== null) {
        const fiber = nextEffect
        try {
            reappearLayoutEffectsOnFiber(fiber)
        } catch (error) {
            captureCommitPhaseError(fiber, fiber.return, error)
        }

        if (fiber === subtreeRoot) {
            nextEffect = null
            return
        }

        const sibling = fiber.sibling
        if (sibling !== null) {
            sibling.return = fiber.return
            nextEffect = sibling
            return
        }

        nextEffect = fiber.return
    }
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
            const isHidden = fiber.memoizedState !== null
            const newOffscreenSubtreeIsHidden = isHidden || offscreenSubtreeIsHidden
            if (newOffscreenSubtreeIsHidden) {
                commitLayoutMountEffects_complete(subtreeRoot, root, committedLanes)
                continue
            } else {
                const current = fiber.alternate
                const wasHidden = current !== null && current.memoizedState !== null
                const newOffscreenSubtreeWasHidden = wasHidden || offscreenSubtreeWasHidden
                const prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden
                const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden

                offscreenSubtreeIsHidden = newOffscreenSubtreeIsHidden;
                offscreenSubtreeWasHidden = newOffscreenSubtreeWasHidden;

                if (offscreenSubtreeWasHidden && !prevOffscreenSubtreeWasHidden) {
                    nextEffect = fiber
                    reappearLayoutEffects_begin(fiber)
                }

                let child = firstChild
                while (child !== null) {
                    nextEffect = child
                    commitLayoutEffects_begin(child, root, committedLanes)
                    child = child.sibling
                }

                nextEffect = fiber
                offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden
                offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden
                commitLayoutMountEffects_complete(subtreeRoot, root, committedLanes)
                continue
            }
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

/**
 * commitSuspenseHydrationCallbacks 是 React18 中服务端渲染（SSR）水化（Hydration）完成后 的回调处理函数 —— 它的核心作用是：
 * 1.在 Suspense 组件完成水化并进入提交阶段时，触发水化完成的收尾操作（调用 commitHydratedSuspenseInstance），并在启用 Suspense 回调特性时执行 onHydrated 回调，通知外部「Suspense 组件已完成水化」。简单说，这个函数是 SSR 场景下 Suspense 水化收尾的「回调触发器」，专门处理水化完成后的副作用和外部通知逻辑
*/
function commitSuspenseHydrationCallbacks(
    finishedRoot: FiberRoot,
    finishedWork: Fiber
) {
    if (!supportsHydration) {
        return;
    }
    debugger
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
                if (finishedWork.type.render) {
                    console.log('-------finishedWork.type.render---------')
                }
                commitHookEffectListMount(HookLayout | HookHasEffect, finishedWork)
                break
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
                commitSuspenseHydrationCallbacks(finishedRoot, finishedWork)
                break
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

    // 补充执行 ref 赋值（边缘场景）
    // 条件：禁用 Suspense 布局语义 或 非隐藏的离屏组件
    if (!enableSuspenseLayoutEffectSemantics || !offscreenSubtreeWasHidden) {
        if (enableScopeAPI) {
            // ScopeAPI 开启时：非 ScopeComponent 且有 Ref 标记 → 执行 ref 赋值
            if (finishedWork.flags & Ref && finishedWork.tag !== ScopeComponent) {
                commitAttachRef(finishedWork); // 核心：赋值 ref.current = DOM 节点
            }
        } else {
            // 常规场景：有 Ref 标记 → 执行 ref 赋值
            if (finishedWork.flags & Ref) {
                commitAttachRef(finishedWork)
            }
        }
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

// 安全解绑 Fiber 节点 ref 引用的核心函数（safelyDetachRef），主要作用是在组件卸载 / 删除时，规范地清空 ref 引用（包括函数式 ref 和对象式 ref），同时处理异常、性能埋点和开发环境校验，避免内存泄漏或执行错误。
function safelyDetachRef(
    current: Fiber, // 要解绑 ref 的 Fiber 节点（当前正在卸载/删除的节点）
    nearestMountedAncestor: Fiber | null // 最近的已挂载祖先节点（用于错误捕获时定位）
) {
    // 1. 获取当前 Fiber 节点的 ref 属性（可能是函数式/对象式 ref，或 null）
    const ref = current.ref
    if (ref !== null) { // 只有 ref 存在时才处理
        if (typeof ref === 'function') {
            let retVal
            try {
                if (enableProfilerTimer && enableProfilerCommitHooks && current.mode & ProfileMode) {
                    try {
                        retVal = ref(null) // 核心：调用函数式 ref，传入 null 解绑
                    } finally {

                    }
                } else {
                    // 非 Profiler 模式：直接调用函数式 ref，传入 null 解绑
                    retVal = ref(null)
                }
            } catch (error) {
                captureCommitPhaseError(current, nearestMountedAncestor, error)
            }
        } else {
            // 3. 处理「对象式 ref」（如 useRef 创建的 ref）
            ref.current = null  // 核心：清空 ref.current，解绑引用
        }
    }
}

function commitSuspenseCallback(finishedWork: Fiber) {
    const newState: SuspenseState | null = finishedWork.memoizedState
    if (enableSuspenseCallback && newState !== null) {
        const suspenseCallback = finishedWork.memoizedProps.suspenseCallback
        if (typeof suspenseCallback === 'function') {
            const wakeables: Set<Wakeable> | null = finishedWork.updateQueue as any
            if (wakeables !== null) {
                suspenseCallback(new Set(wakeables))
            }
        }
    }
}

function attachSuspenseRetryListeners(finishedWork: Fiber) {
    const wakeables: Set<Wakeable> | null = finishedWork.updateQueue as any
    if (wakeables !== null) {
        finishedWork.updateQueue = null
        let retryCache = finishedWork.stateNode
        if (retryCache === null) {
            retryCache = finishedWork.stateNode = new (PossiblyWeakSet as any)()
        }
        wakeables.forEach(wakeable => {
            const retry = resolveRetryWakeable.bind(null, finishedWork, wakeable)
            if (!retryCache.has(wakeable)) {
                retryCache.add(wakeable)
                wakeable.then(retry, retry)
            }
        })
    }
}

/**
 * hideOrUnhideAllChildren 是 React18 中提交阶段（Commit Phase） 控制 DOM 节点显示 / 隐藏的核心函数 —— 它的核心作用是：
 * 1. 遍历指定 Fiber 节点的所有子节点，仅对「最顶层的宿主节点（HostComponent/HostText）」执行隐藏 / 显示操作（非递归到所有子节点），同时跳过嵌套的 Offscreen/LegacyHidden 组件，保证 DOM 操作的最小粒度和嵌套逻辑的正确性。
 * 简单说，这个函数是 React 实现 Offscreen/Suspense 「离屏隐藏」「懒加载」等特性的底层 DOM 操作入口，专门处理 Fiber 子树的批量显隐控制。
*/
function hideOrUnhideAllChildren(finishedWork, isHidden) {
    // 注释核心：仅隐藏/显示「最顶层」的宿主节点（避免递归到所有子节点）
    let hostSubtreeRoot: any = null  // 标记当前子树的最顶层宿主节点
    if (supportsMutation) {  // 仅在支持 DOM 变更的环境执行（浏览器）
        // 遍历逻辑：从 finishedWork 开始，深度优先遍历所有子/兄弟 Fiber 节点
        let node: Fiber = finishedWork
        while (true) {
            // 分支1：当前节点是 HostComponent（DOM 元素）
            if (node.tag === HostComponent) {
                if (hostSubtreeRoot === null) { // 仅处理最顶层宿主节点
                    hostSubtreeRoot = node // 标记为当前子树根节点
                    try {
                        const instance = node.stateNode // 获取真实 DOM 实例
                        if (isHidden) {
                            hideInstance(instance) // 隐藏：如设置 display: none
                        } else {
                            unhideInstance(node.stateNode, node.memoizedProps) // 显示：恢复原样式
                        }
                    } catch (error) {
                        // 捕获提交阶段错误，交给错误边界处理
                        captureCommitPhaseError(finishedWork, finishedWork.return, error)
                    }
                }
                // 分支2：当前节点是 HostText（文本节点）
            } else if (node.tag === HostText) {
                if (hostSubtreeRoot === null) { // 仅处理最顶层文本节点
                    try {
                        const instance = node.stateNode // 获取真实文本节点
                        if (isHidden) {
                            hideTextInstance(instance) // 隐藏文本节点
                        } else {
                            unhideTextInstance(instance, node.memoizedProps) // 显示文本节点
                        }
                    } catch (error) {
                        captureCommitPhaseError(finishedWork, finishedWork.return, error)
                    }
                }
                // 分支3：遇到嵌套的 Offscreen/LegacyHidden 组件
            } else if (
                (node.tag === OffscreenComponent || node.tag === LegacyHiddenComponent) &&
                node.memoizedState !== null && node !== finishedWork
            ) {
                // 分支4：有子节点 → 递归进入子节点
            } else if (node.child !== null) {
                node.child.return = node  // 修正 Fiber 父子引用（防止引用错乱）
                node = node.child
                continue // 继续遍历子节点
            }

            // ==== 遍历终止/回溯逻辑 ====
            // 1. 回到起始节点 → 遍历结束
            if (node === finishedWork) {
                return
            }
            // 2. 无兄弟节点 → 回溯到父节点
            while (node.sibling === null) {
                if (node.return === null || node.return === finishedWork) {
                    return // 父节点为空/回到起始节点 → 遍历结束
                }
                // 回溯时重置 hostSubtreeRoot（进入新的兄弟子树）
                if (hostSubtreeRoot === node) {
                    hostSubtreeRoot = null
                }
                node = node.return
            }
            // 3. 有兄弟节点 → 重置 hostSubtreeRoot 并遍历兄弟节点
            if (hostSubtreeRoot === node) {
                hostSubtreeRoot = null
            }
            node.sibling.return = node.return // 修正兄弟节点的父引用
            node = node.sibling
        }
    }
}

function disappearLayoutEffects_begin(subtreeRoot: Fiber) {
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
                try {
                    commitHookEffectListUnmount(HookInsertion | HookHasEffect, finishedWork, finishedWork.return)
                    commitHookEffectListMount(HookInsertion | HookHasEffect, finishedWork)
                } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error)
                }

                try {
                    commitHookEffectListUnmount(HookLayout | HookHasEffect, finishedWork, finishedWork.return)
                } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error)
                }
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
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)
            if (flags & Update) {
                if (supportsPersistence) {
                    const portal = finishedWork.stateNode
                    const containerInfo = portal.containerInfo
                    const pendingChildren = portal.pendingChildren
                    try {
                        debugger
                        // replaceContainerChildren(containerInfo, pendingChildren)
                    } catch (error) {
                        captureCommitPhaseError(finishedWork, finishedWork.return, error)
                    }
                }
            }
        }
        case SuspenseComponent: {
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)

            const offscreenFiber: Fiber = finishedWork.child as any
            if (offscreenFiber.flags & Visibility) {
                const offscreenInstance: OffscreenInstance = offscreenFiber.stateNode
                const newState: OffscreenState | null = offscreenFiber.memoizedState
                const isHidden = newState !== null
                offscreenInstance.isHidden = isHidden
                if (isHidden) {
                    const wasHidden = offscreenFiber.alternate !== null && offscreenFiber.alternate.memoizedState !== null
                    if (!wasHidden) {
                        markCommitTimeOfFallback()
                    }
                }
            }
            if (flags & Update) {
                try {
                    commitSuspenseCallback(finishedWork)
                } catch (error) {
                    captureCommitPhaseError(finishedWork, finishedWork.return, error)
                }
                attachSuspenseRetryListeners(finishedWork)
            }
            return
        }
        case OffscreenComponent: {
            const wasHidden = current !== null && current.memoizedState !== null
            if (enableSuspenseLayoutEffectSemantics && finishedWork.mode & ConcurrentMode) {
                const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden
                offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden
                recursivelyTraverseMutationEffects(root, finishedWork, lanes)
                offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden
            } else {
                recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            }
            commitReconciliationEffects(finishedWork)
            if (flags & Visibility) {
                const offscreenInstance: OffscreenInstance = finishedWork.stateNode
                const newState: OffscreenState | null = finishedWork.memoizedState
                const isHidden = newState !== null
                const offscreenBoundary: Fiber = finishedWork
                offscreenInstance.isHidden = isHidden
                if (enableSuspenseLayoutEffectSemantics) {
                    if (isHidden) {
                        if (!wasHidden) {
                            if ((offscreenBoundary.mode & ConcurrentMode) !== NoMode) {
                                nextEffect = offscreenBoundary
                                let offscreenChild = offscreenBoundary.child
                                while (offscreenChild !== null) {
                                    nextEffect = offscreenChild
                                    disappearLayoutEffects_begin(offscreenChild)
                                    offscreenChild = offscreenChild.sibling
                                }
                            }
                        }
                    }
                }
                if (supportsMutation) {
                    hideOrUnhideAllChildren(offscreenBoundary, isHidden)
                }
            }
            return
        }
        case SuspenseListComponent: {
            debugger
        }
        case ScopeComponent: {
            debugger
        }
        default: {
            recursivelyTraverseMutationEffects(root, finishedWork, lanes)
            commitReconciliationEffects(finishedWork)
            return
        }
    }
}

function recursivelyTraverseDeletionEffects(
    finishedWork: FiberRoot,
    nearestMountedAncestor: Fiber,
    parent: Fiber
) {
    let child = parent.child
    while (child !== null) {
        commitDeletionEffectsOnFiber(finishedWork, nearestMountedAncestor, child)
        child = child.sibling
    }
}

function commitDeletionEffectsOnFiber(
    finishedWork: FiberRoot,
    nearestMountedAncestor: Fiber,
    deletedFiber: Fiber
) {
    switch (deletedFiber.tag) {
        case HostComponent: {
            if (!offscreenSubtreeWasHidden) {
                safelyDetachRef(deletedFiber, nearestMountedAncestor)
            }
        }
        case HostText: {
            if (supportsMutation) {
                const prevHostParent = hostParent
                const prevHostParentIsContainer = hostParentIsContainer
                hostParent = null
                recursivelyTraverseDeletionEffects(finishedWork, nearestMountedAncestor, deletedFiber)
                hostParent = prevHostParent
                hostParentIsContainer = prevHostParentIsContainer
                if (hostParent !== null) {
                    if (hostParentIsContainer) {
                        removeChildFromContainer(hostParent as Container, deletedFiber.stateNode as Instance | TextInstance)
                    } else {
                        console.log('-------removeChild-------')
                        removeChild(hostParent as Instance, deletedFiber.stateNode as Instance | TextInstance)
                    }
                }
            } else {
                recursivelyTraverseDeletionEffects(finishedWork, nearestMountedAncestor, deletedFiber)
            }
            return
        }
        case DehydratedFragment: {
            debugger
        }
        case HostPortal: {
            debugger
        }
        case FunctionComponent:
        case ForwardRef:
        case MemoComponent:
        case SimpleMemoComponent: {
            if (!offscreenSubtreeWasHidden) {
                const updateQueue: FunctionComponentUpdateQueue | null = deletedFiber.updateQueue as any
                if (updateQueue !== null) {
                    const lastEffect = updateQueue.lastEffect
                    if (lastEffect !== null) {
                        const firstEffect = lastEffect.next
                        let effect = firstEffect
                        do {
                            const { destroy, tag } = effect
                            if (destroy !== undefined) {
                                if ((tag & HookInsertion) !== NoHookEffect) {
                                    safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy)
                                } else if ((tag & HookLayout) !== NoHookEffect) {
                                    if (enableSchedulingProfiler) {
                                        debugger
                                    }

                                    if (enableProfilerTimer && enableProfilerCommitHooks && deletedFiber.mode & ProfileMode) {
                                        safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy)
                                    } else {
                                        safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy)
                                    }

                                    if (enableSchedulingProfiler) {
                                        debugger
                                    }
                                }
                            }
                            effect = effect.next
                        } while (effect !== firstEffect)
                    }
                }
            }

            recursivelyTraverseDeletionEffects(finishedWork, nearestMountedAncestor, deletedFiber)
            return
        }
        case ClassComponent: {
            debugger
        }
        case ScopeComponent: {
            debugger
        }
        case OffscreenComponent: {
            debugger
        }
        default: {
            recursivelyTraverseDeletionEffects(finishedWork, nearestMountedAncestor, deletedFiber)
            return
        }
    }
}

function detachFiberMutation(
    fiber: Fiber
) {
    const alternate = fiber.alternate
    if (alternate !== null) {
        alternate.return = null
    }
    fiber.return = null
}

function commitDeletionEffects(
    root: FiberRoot,
    returnFiber: Fiber,
    deletedFiber: Fiber
) {
    if (supportsMutation) {
        let parent: Fiber | null = returnFiber
        // 为什么要遍历？因为 returnFiber 可能不是直接的 HostComponent/HostRoot （如 Fragment、Context 等无 DOM 节点的 Fiber）
        findParent: while (parent !== null) {
            switch (parent.tag) {
                // case1: 如果父节点是普通 DOM 组件（如 div/button 等 HostComponent）
                case HostComponent: {
                    hostParent = parent.stateNode
                    hostParentIsContainer = false
                    break findParent
                }
                // case2：父节点是 HostRoot（应用根节点，对应 ReactDOM.createRoot 的容器）
                case HostRoot: {
                    hostParent = parent.stateNode.containerInfo
                    hostParentIsContainer = true
                    break findParent
                }
                // case3: 父节点是 HostPortal（Portal 组件，对应 ReactDOM.createPortal）
                case HostPortal: {
                    hostParent = parent.stateNode.containerInfo
                    hostParentIsContainer = true
                    break findParent
                }
            }
            // 其他 Fiber 类型（如 Fragment、Context、FunctionComponent 等）：无真实 DOM 节点，继续向上遍历
            parent = parent.return
        }

        if (hostParent === null) {
            throw new Error('hostParent 没找到，程序出错');
        }
        commitDeletionEffectsOnFiber(root, returnFiber, deletedFiber)
        hostParent = null
        hostParentIsContainer = false
    } else {
        commitDeletionEffectsOnFiber(root, returnFiber, deletedFiber)
    }

    // 重置 Fiber 的 return/child/sibling 指针、清空 effectTag、解绑 ref 等，便于 GC 回收
    detachFiberMutation(deletedFiber)
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
        for (let i = 0; i < deletions.length; i++) {
            const childToDelete = deletions[i]
            try {
                commitDeletionEffects(root, parentFiber, childToDelete)
            } catch (error) {
                captureCommitPhaseError(childToDelete, parentFiber, error)
            }
        }
    }

    // 2. 处理当前父节点的子树中所有节点的 Mutation 阶段副作用
    if (parentFiber.subtreeFlags & MutationMask) { // 检查子树是否包含 Mutation 阶段的副作用标记（优化：避免无意义遍历）
        let child = parentFiber.child  // 从第一个子节点开始遍历
        while (child !== null) {
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
    const { tag } = node
    const isHost = tag === HostComponent || tag === HostText
    if (isHost) {
        const stateNode = node.stateNode
        if (before) {
            insertBefore(parent, stateNode, before)
        } else {
            appendChild(parent, stateNode)
        }
    } else if (tag === HostPortal) {
        debugger
    } else {
        const child = node.child
        if (child !== null) {
            insertOrAppendPlacementNode(child, before, parent)
            let sibling = child.sibling
            while (sibling !== null) {
                insertOrAppendPlacementNode(sibling, before, parent)
                sibling = sibling.sibling
            }
        }
    }
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

function commitPassiveUnmountInsideDeletedTreeOnFiber(
    current: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    switch (current.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
            commitHookEffectListUnmount(HookPassive, current, nearestMountedAncestor)
            break
        }
        case LegacyHiddenComponent:
        case OffscreenComponent:
        case CacheComponent: {
            break
        }
    }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
    deletedSubtreeRoot: Fiber,
    nearestMountedAncestor: Fiber | null
) {
    while (nextEffect !== null) {
        const fiber = nextEffect
        commitPassiveUnmountInsideDeletedTreeOnFiber(fiber, nearestMountedAncestor)
        const child = fiber.child
        if (child !== null) {
            child.return = fiber
            nextEffect = child
        } else {
            commitPassiveUnmountEffectsInsideOfDeletedTree_complete(deletedSubtreeRoot)
        }
    }
}

function detachFiberAfterEffects(fiber: Fiber) {
    const alternate = fiber.alternate
    if (alternate !== null) {
        fiber.alternate = null
        detachFiberAfterEffects(alternate)
    }

    if (!(deletedTreeCleanUpLevel >= 2)) {
        fiber.child = null;
        fiber.deletions = null;
        fiber.dependencies = null;
        fiber.memoizedProps = null;
        fiber.memoizedState = null;
        fiber.pendingProps = null;
        fiber.sibling = null;
        fiber.stateNode = null;
        fiber.updateQueue = null;
    } else {
        fiber.child = null;
        fiber.deletions = null;
        fiber.sibling = null;

        if (fiber.tag === HostComponent) {
            const hostInstance: Instance = fiber.stateNode as Instance
            if (hostInstance !== null) {
                detachDeletedInstance(hostInstance)
            }
        }

        fiber.stateNode = null

        if (deletedTreeCleanUpLevel >= 3) {
            fiber.return = null;
            fiber.dependencies = null;
            fiber.memoizedProps = null;
            fiber.memoizedState = null;
            fiber.pendingProps = null;
            fiber.stateNode = null;
            fiber.updateQueue = null;
        }
    }
}

/**
 * 作用: 遍历被删除的 Fiber 子树，根据清理级别执行不同粒度的 Fiber 节点清理，最终终止遍历并完成子树分离
*/
function commitPassiveUnmountEffectsInsideOfDeletedTree_complete(
    deletedSubtreeRoot: Fiber
) {
    // 遍历待处理的副作用节点 (nextEffect 是遍历游标)
    while (nextEffect !== null) {
        // 1. 获取当前处理的 Fiber 节点及其兄弟节点和父节点引用
        const fiber = nextEffect
        const sibling = fiber.sibling
        const returnFiber = fiber.return

        // 2. 根据清理级别决定清理粒度
        if (deletedTreeCleanUpLevel >= 2) { // 深度清理（级别≥2）→ 递归清理整棵删除子树的所有 Fiber 节点
            detachFiberAfterEffects(fiber) // 清理当前 Fiber 节点的字段/副作用
            // 若遍历到删除子树的根节点，终止遍历（完成整棵树清理）
            if (fiber === deletedSubtreeRoot) {
                nextEffect = null
                return
            }
        } else {
            // 默认清理（级别0）→ 仅清理删除子树的根节点，不递归子节点
            if (fiber === deletedSubtreeRoot) {
                detachFiberAfterEffects(fiber); // 仅清理根节点
                nextEffect = null
                return
            }
        }

        // 3. 遍历逻辑：优先处理兄弟节点，无兄弟则回退到父节点
        if (sibling !== null) {
            sibling.return = returnFiber
            nextEffect = sibling
            return
        }

        nextEffect = returnFiber
    }
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
    try {
        destroy()
    } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error)
    }
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

// ref 赋值核心函数（ref.current = DOM 节点/ 执行 ref 回调）
function commitAttachRef(finishedWork: Fiber) {
    const ref = finishedWork.ref
    if (ref !== null) {
        const instance = finishedWork.stateNode
        let instanceToUse
        switch (finishedWork.tag) {
            case HostComponent:
                instanceToUse = getPublicInstance(instance)
                break
            default:
                instanceToUse = instance
        }

        if (enableScopeAPI && finishedWork.tag === ScopeComponent) {
            instanceToUse = instance
        }

        if (typeof ref === 'function') {
            let retVal = ref(instanceToUse)
        } else {
            ref.current = instanceToUse
        }
    }
}