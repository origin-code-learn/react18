import { shouldSetTextContent, supportsHydration, SuspenseInstance } from "ReactDOMHostConfig";
import { cloneUpdateQueue, initializeUpdateQueue, processUpdateQueue } from "./ReactFiberClassUpdateQueue.old";
import { getMaskedContext, getUnmaskedContext, pushTopLevelContextObject, hasContextChanged as hasLegacyContextChanged, } from "./ReactFiberContext.old";
import { ChildDeletion, ContentReset, DidCapture, ForceUpdateForLegacySuspense, NoFlags, PerformedWork, Placement, Ref, RefStatic } from "./ReactFiberFlags";
import { pushHostContainer, pushHostContext } from "./ReactFiberHostContext.old";
import { includesSomeLane, Lanes, laneToLanes, mergeLanes, NoLane, NoLanes, OffscreenLane, SyncLane } from "./ReactFiberLane.old";
import { RootState } from "./ReactFiberRoot.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { CacheComponent, ClassComponent, ContextConsumer, ContextProvider, ForwardRef, Fragment, FunctionComponent, HostComponent, HostPortal, HostRoot, HostText, IncompleteClassComponent, IndeterminateComponent, LazyComponent, LegacyHiddenComponent, MemoComponent, Mode, OffscreenComponent, Profiler, ScopeComponent, SimpleMemoComponent, SuspenseComponent, SuspenseListComponent, TracingMarkerComponent } from "./ReactWorkTags";
import { cloneChildFibers, mountChildFibers, reconcileChildFibers } from "./ReactChildFiber.old";
import { ConcurrentMode, NoMode, ProfileMode, TypeOfMode } from "./ReactTypeOfMode";
import { disableLegacyContext, disableModulePatternComponents, enableCache, enableCPUSuspense, enableLazyContextPropagation, enableLegacyHidden, enableProfilerTimer, enableSuspenseAvoidThisFallback, enableSuspenseLayoutEffectSemantics, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { lazilyPropagateParentContextChanges, prepareToReadContext, pushProvider } from "./ReactFiberNewContext.old";
import { bailoutHooks, checkDidRenderIdHook, renderWithHooks } from "./ReactFiberHooks.old";
import { getIsHydrating, resetHydrationState, tryToClaimNextHydratableInstance } from "./ReactFiberHydrationContext.old";
import { getSuspendedCache, pushRootTransition, pushTransition } from "./ReactFiberTransition";
import { markSkippedUpdateLanes, pushRenderLanes } from "./ReactFiberWorkLoop.old";
import { resolveDefaultProps } from "./ReactFiberLazyComponent.old";
import { isForkedChild } from "./ReactFiberTreeContext.old";
import { ReactContext, ReactProviderType } from "shared/ReactTypes";
import is from "shared/objectIs";
import { addSubtreeSuspenseContext, ForceSuspenseFallback, hasSuspenseContext, InvisibleParentSuspenseContext, pushSuspenseContext, setDefaultShallowSuspenseContext, type SuspenseContext, suspenseStackCursor } from "./ReactFiberSuspenseContext";
import { SuspenseState } from "./ReactFiberSuspenseComponent.old";
import { OffscreenProps, OffscreenState } from "./ReactFiberOffscreenComponent";
import { createFiberFromFragment, createFiberFromOffscreen, createWorkInProgress, resolveLazyComponentTag } from "./ReactFiber.old";
import { LazyComponent as LazyComponentType } from "react/src/ReactLazy";

let didReceiveUpdate: boolean = false

const SUSPENDED_MARKER: SuspenseState = {
    dehydrated: null,
    treeContext: null,
    retryLane: NoLane
}

export function markWorkInProgressReceivedUpdate() {
    didReceiveUpdate = true
}

export function reconcileChildren(
    current: Fiber | null,
    workInProgress: Fiber,
    nextChildren: any,
    renderLanes: Lanes
) {
    if (current === null) {
        workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderLanes)
    } else {
        workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderLanes)
    }
}

//
function checkScheduledUpdateOrContext(
    current: Fiber,
    renderLanes: Lanes
) {
    const updateLanes = current.lanes
    // 判断「待处理更新车道」是否与「本次渲染车道」有交集
    if (includesSomeLane(updateLanes, renderLanes)) {
        return true
    }
    // todo
    if (enableLazyContextPropagation) {
        debugger
    }
    // 无更新/无交集 → 可 bailout，无需调和
    return false
}

function attemptEarlyBailoutIfNoScheduledUpdate(
    current: Fiber,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    switch (workInProgress.tag) {
        case HostRoot: {
            pushHostRootContext(workInProgress)
            const root: FiberRoot = workInProgress.stateNode
            pushRootTransition(workInProgress, root, renderLanes)
            if (enableCache) {
                debugger
            }
            resetHydrationState()
            break
        }
        case HostComponent: {
            pushHostContext(workInProgress)
            break
        }
        case ClassComponent: {
            debugger
            break
        }
        case HostPortal: {
            debugger
            break
        }
        case ContextProvider: {
            const newValue = workInProgress.memoizedProps.value
            const context: ReactContext<any> = workInProgress.type._context
            pushProvider(workInProgress, context, newValue)
            break
        }
        case Profiler: {
            debugger
            break
        }
        case SuspenseComponent: {
            debugger
            break
        }
        case SuspenseListComponent: {
            debugger
            break
        }
        case OffscreenComponent:
        case LegacyHiddenComponent: {
            debugger
            break
        }
        case CacheComponent: {
            debugger
            break
        }
    }
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
}

/**
 * pushHostRootContext 的本质是 **“初始化根节点的上下文环境”**，它在 HostRoot 节点的渲染过程中执行，主要完成两件事：
 *  1. 将根节点的上下文（无论是待生效的 pendingContext 还是当前的 root.context）推入上下文栈，确保应用中所有组件能访问到顶层上下文。
 *  2. 将宿主容器信息推入栈中，为后续的 DOM 操作提供根容器引用。
*/
function pushHostRootContext(workInProgress: Fiber) {
    const root = workInProgress.stateNode
    if (root.pendingContext) { // 处理待生效的上下文
        pushTopLevelContextObject(workInProgress, root.pendingContext, root.pendingContext !== root.context)
    } else { // 处理当前生效的上下文
        pushTopLevelContextObject(workInProgress, root.context, false)
    }
    // 推入宿主容器信息
    pushHostContainer(workInProgress, root.containerInfo)
}

function updateHostRoot(current, workInProgress, renderLanes) {
    pushHostRootContext(workInProgress)
    if (current === null) {
        throw new Error('updateHostRoot: current is null')
    }

    const nextPrpos = workInProgress.pendingProps
    const prevState = workInProgress.memoizedState
    const prevChildren = prevState.element
    cloneUpdateQueue(current, workInProgress)
    processUpdateQueue(workInProgress, nextPrpos, null, renderLanes)
    const nextState: RootState = workInProgress.memoizedState
    const root: FiberRoot = workInProgress.stateNode
    // pushRootTransition(workInProgress, root, renderLanes)

    const nextChildren = nextState.element

    if (supportsHydration && prevState.isDehydrated) {

    } else {
        // resetHydrationState()
        if (nextChildren === prevChildren) {
            return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
        }
        reconcileChildren(current, workInProgress, nextChildren, renderLanes)
    }
    return workInProgress.child
}

function updateFragment(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    const nextChildren = workInProgress.pendingProps
    reconcileChildren(current, workInProgress, nextChildren, renderLanes)
    return workInProgress.child
}

/**
 * updateHostComponent 是 React 协调阶段中处理宿主组件（HostComponent，如 <div>、<span> 等原生 DOM 元素）更新的核心函数。它负责处理宿主组件的属性变化、子节点协调、上下文传递等逻辑，是连接虚拟 DOM 与真实 DOM 元素更新的关键环节。
 * 核心背景：宿主组件的特殊性
 *   宿主组件对应浏览器原生 DOM 元素（如 <div>、<input>），是 React 与 DOM 交互的直接载体。与自定义组件（如函数组件、类组件）不同，宿主组件的更新涉及：
 *      1. DOM 属性（如 className、style）的对比与应用。
 *      2. 子节点（文本、其他元素等）的协调（reconciliation）。
 *      3. 上下文（如 CSS 类名、样式前缀）的继承与传递
*/
function updateHostComponent(
    current: Fiber | null,  // 当前（旧）Fiber 节点（current 树）
    workInProgress: Fiber,  // 工作中（新）Fiber 节点（workInProgress 树）
    renderLanes: Lanes  // 本次更新的优先级通道
): Fiber | null {
    // 1. 将当前宿主组件的上下文信息（如父级 CSS 类名、样式等）推入上下文栈
    pushHostContext(workInProgress)

    // 2. 若为首次渲染（current 为 null）且处于 hydration 阶段，尝试关联已有的 DOM 实例
    if (current === null) {
        tryToClaimNextHydratableInstance(workInProgress)
    }

    // 3. 获取组件类型、新属性、旧属性
    const type = workInProgress.type  // 宿主组件类型（如 'div'、'span'）
    const nextProps = workInProgress.pendingProps  // 新属性（待应用）
    const prevProps = current !== null ? current.memoizedProps : null // 旧属性（已应用）

    let nextChildren = nextProps.children  // 新子节点
    // 判断当前宿主组件是否直接包含文本子节点（无需创建 HostText  Fiber）
    const isDirectTextChild = shouldSetTextContent(type, nextProps)

    if (isDirectTextChild) {
        // 优化：若为直接文本子节点，无需单独创建 HostText Fiber，后续由 DOM 操作直接设置文本
        nextChildren = null
    } else if (prevProps !== null && shouldSetTextContent(type, prevProps)) {
        // 若从“直接文本子节点”切换为“非文本子节点”，标记内容重置（清除旧文本）
        workInProgress.flags |= ContentReset
    }

    // 4. 处理 ref 属性变化（标记需要更新的 ref）
    markRef(current, workInProgress)

    // 5. 协调子节点（对比新旧子节点，生成子节点的 Fiber 树）
    reconcileChildren(current, workInProgress, nextChildren, renderLanes)

    // 6. 返回第一个子节点的 Fiber，继续协调子树
    return workInProgress.child
}

/**
 * updateContextProvider 是 React18 中处理 Context.Provider 组件更新 的核心调和阶段（Reconciliation）函数，负责：
 *  1.解析 Context.Provider 的 value 属性，完成上下文值的更新；
 *  2.判断上下文值是否发生变化，决定是否触发下游消费者（useContext/Context.Consumer）重新渲染；
 *  3.调和 Provider 的子节点，完成组件树的更新；
 *  4.包含开发环境的参数校验，保证 Context 使用的规范性。
*/
function updateContextProvider(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    // 1. 从 Fiber 节点中获取 Context.Provider 类型和对应的 Context 对象
    // providerType 是 <Context.Provider> 组件本身，_context 指向创建的 Context（如 createContext 返回的对象）
    const providerType: ReactProviderType<any> = workInProgress.type
    const context: ReactContext<any> = providerType._context

    // 2. 获取新旧 props，提取核心的 value 属性（Context 传递的上下文值）
    const newProps = workInProgress.pendingProps  // 本次更新的新 props
    const oldProps = workInProgress.memoizedProps // 上一次渲染缓存的旧 props

    const newValue = newProps.value // 本次要更新的上下文值

    // 3. 将当前 Provider 的上下文值推入上下文栈（核心：让下游消费者能获取最新 value）
    // 上下文栈是 React 内部维护的链表，保证嵌套 Provider 时能正确读取最近的 value
    pushProvider(workInProgress, context, newValue)

    // 4. 上下文值传播逻辑：区分「懒传播」和「传统传播」（React18 新特性开关）
    if (enableLazyContextPropagation) {
        // 4.1 懒传播模式（React18 默认启用）：
        // 不主动扫描消费者，直到某个消费者的更新“跳出（bailout）”时才检查上下文变化
        // 优势：减少不必要的遍历，提升性能；代价：将变化检测责任转移给消费者
    } else {
        // 4.2 传统传播模式（兼容旧逻辑）：主动检测上下文变化并触发消费者更新
        if (oldProps !== null) { // 存在旧 props（非首次渲染）
            const oldValue = oldProps.value // 旧上下文值
            // 4.2.1 上下文值未变化（通过 Object.is 比较，同 useState 的比较逻辑）
            if (is(oldValue, newValue)) {
                // 额外校验：子节点未变化 + 旧版上下文（legacy context）未变化 → 提前跳出更新
                // 核心：避免无意义的调和，提升性能（bailout 逻辑）
                if (oldProps.children === newProps.children && !hasLegacyContextChanged()) {
                    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
                }
            } else {
                // 4.2.2 上下文值发生变化 → 扫描所有匹配的消费者，调度它们重新渲染
                // propagateContextChange 内部会遍历 Fiber 树，找到使用该 Context 的消费者（useContext/Consumer）
                // 并为这些消费者标记更新优先级，触发重新调和
                propagateContextChange(workInProgress, context, renderLanes)
            }
        }
    }

    // 5. 调和 Provider 的子节点（核心：更新 Provider 包裹的子组件树）
    // reconcileChildren 是通用逻辑，对比新旧子节点，标记增/删/改，生成新的子 Fiber 树
    const newChildren = newProps.children
    reconcileChildren(current, workInProgress, newChildren, renderLanes)
    // 6. 返回第一个子节点的 Fiber，继续协调子树
    return workInProgress.child
}

function updateHostText(current, workInProgress) {
    if (current === null) {
        tryToClaimNextHydratableInstance(workInProgress)
    }
    return null
}

function shouldRemainOnFallback(
    suspenseContext: SuspenseContext,
    current: null | Fiber,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    if (current !== null) {
        const suspenseState: SuspenseState = current.memoizedState
        if (suspenseState === null) {
            return false
        }
    }

    return hasSuspenseContext(suspenseContext, ForceSuspenseFallback as SuspenseContext)
}

function mountWorkInProgressOffscreenFiber(
    offscreenProps: OffscreenProps,
    mode: TypeOfMode,
    renderLanes: Lanes
) {
    return createFiberFromOffscreen(offscreenProps, mode, NoLanes, null)
}

function mountSuspenseOffscreenState(renderLanes: Lanes): OffscreenState {
    return {
        baseLanes: renderLanes,
        cachePool: getSuspendedCache(),
        transitions: null
    }
}

function mountSuspenseFallbackChildren(workInProgress, primaryChildren, fallbackChildren, renderLanes) {
    const mode = workInProgress.mode
    const progressedPrimaryFragment: Fiber | null = workInProgress.child
    const primaryChildProps: OffscreenProps = {
        mode: 'hidden',
        children: primaryChildren
    }

    let primaryChildFragment
    let fallbackChildFragment
    if (
        (mode & ConcurrentMode) === NoMode &&
        progressedPrimaryFragment !== null
    ) {
        primaryChildFragment = progressedPrimaryFragment
        primaryChildFragment.childLanes = NoLanes
        primaryChildFragment.pendingProps = primaryChildProps

        if (enableProfilerTimer && workInProgress.mode & ProfileMode) {
            debugger
        }

        fallbackChildFragment = createFiberFromFragment(fallbackChildren, mode, renderLanes, null)
    } else {
        primaryChildFragment = mountWorkInProgressOffscreenFiber(primaryChildProps, mode, NoLanes)
        fallbackChildFragment = createFiberFromFragment(fallbackChildren, mode, renderLanes, null)
    }

    primaryChildFragment.return = workInProgress
    fallbackChildFragment.return = workInProgress
    primaryChildFragment.sibling = fallbackChildFragment
    workInProgress.child = primaryChildFragment
    return fallbackChildFragment
}

function updateWorkInProgressOffscreenFiber(
    current: Fiber,
    offscreenProps: OffscreenProps
) {
    return createWorkInProgress(current, offscreenProps)
}

function updateSuspensePrimaryChildren(
    current,
    workInProgress,
    primaryChildren,
    renderLanes
) {
    const currentPrimaryChildFragment: Fiber = current.child
    const currentFallbackChildFragment: Fiber | null = currentPrimaryChildFragment.sibling
    const primaryChildFragment = updateWorkInProgressOffscreenFiber(currentPrimaryChildFragment, { mode: 'visible', children: primaryChildren })
    if ((workInProgress.mode & ConcurrentMode) === NoMode) {
        primaryChildFragment.lanes = renderLanes
    }
    primaryChildFragment.return = workInProgress
    primaryChildFragment.sibling = null
    if (currentFallbackChildFragment !== null) {
        const deletions = workInProgress.deletions
        if (deletions === null) {
            workInProgress.deletions = [currentFallbackChildFragment]
            workInProgress.flags |= ChildDeletion
        } else {
            deletions.push(currentFallbackChildFragment)
        }
    }

    workInProgress.child = primaryChildFragment
    return primaryChildFragment
}

/**
 * mountSuspensePrimaryChildren 是 React Suspense 组件挂载阶段处理「主内容（Primary Children）」的核心函数—— 它的核心作用是：
 * 1. 为 Suspense 组件的主内容（即未挂起时展示的内容）创建一个 Offscreen 类型的 Fiber 节点，设置其为「可见（visible）」模式，并将该 Fiber 节点挂载到 Suspense Fiber 的子节点位置，完成主内容的 Fiber 树初始化。简单说，这个函数是 Suspense 组件挂载时「主内容 Fiber 树构建」的专用逻辑，是 Suspense 主内容 / 兜底内容切换的基础
 * 
 * 核心触发场景：
 *   Suspense 组件挂载 → 调和阶段判断主内容未挂起 → 调用 mountSuspensePrimaryChildren → 创建 Offscreen Fiber 包裹主内容 → 挂载到 Suspense Fiber 子节点
*/
function mountSuspensePrimaryChildren(
    workInProgress,
    primaryChildren,
    renderLanes
) {
    const mode = workInProgress.mode
    // 构建 Offscreen Fiber 的属性 → 标记为「可见」，包裹主内容
    const primaryChildProps: OffscreenProps = {
        mode: 'visible',  // 核心：主内容默认可见（未挂起时展示）
        children: primaryChildren // 包裹 Suspense 的主内容
    }
    // 创建 Offscreen 类型的 Fiber 节点（工作副本）
    const primaryChildFragment = mountWorkInProgressOffscreenFiber(primaryChildProps, mode, renderLanes)
    // 建立节点间的关系
    primaryChildFragment.return = workInProgress
    workInProgress.child = primaryChildFragment
    return primaryChildFragment
}

function updateSuspenseComponent(current, workInProgress, renderLanes) {
    const nextProps = workInProgress.pendingProps

    // ========== 第一步：初始化 Suspense 上下文，判断是否展示 fallback ==========
    let suspenseContext: SuspenseContext = suspenseStackCursor.current  // 从上下文栈中获取当前 Suspense 上下文（控制子树的挂起行为）
    let showFallback = false
    const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags // 检查 Fiber 是否有 DidCapture 标记（子组件已挂起，如懒加载组件加载中）

    /**
     * 触发 fallback 的条件：
     *  1. 子组件已挂起（didSuspend）
     *  2. 根据上下文/优先级，需要保留 fallback（如低优先级更新不切换回主内容）
     * */
    if (didSuspend || shouldRemainOnFallback(suspenseContext, current, workInProgress, renderLanes)) {
        showFallback = true  // 子树已挂起 → 切换到渲染 fallback 模式
        workInProgress.flags &= ~DidCapture  // 清除 DidCapture 标记（避免重复处理）
    } else {
        // 尝试渲染主内容（children）
        if (
            current === null ||  // 首次挂载
            (current.memoizedState !== null) // 已有 fallback 状态
        ) {
            // 标记子树上下文：存在至少一个不可见的父 Suspense 可以处理 fallback
            // (跳过标记的条件：启用 avoidThisFallback 且 props 中设置了该属性）
            if (!enableSuspenseAvoidThisFallback || nextProps.unstable_avoidThisFallback !== true) {
                // 向 Suspense 上下文添加「有不可见父级」标记
                suspenseContext = addSubtreeSuspenseContext(suspenseContext, InvisibleParentSuspenseContext)
            }
        }
    }

    // 设置默认的浅层 Suspense 上下文（确保上下文状态合法）
    suspenseContext = setDefaultShallowSuspenseContext(suspenseContext)
    // 将当前 Suspense 上下文推入栈（供子组件读取）
    pushSuspenseContext(workInProgress, suspenseContext)

    // ========== 注释：核心逻辑复杂度说明 ==========
    // 1. Legacy 模式兼容：为了向后兼容，主树可能提交不一致状态，fallback 渲染需要特殊 hack；
    // 2. 水化兼容：服务端渲染的 Suspense 有特殊 Fiber 结构（包含 dehydrated fragment）；
    // 3. 类似 try/catch：先尝试渲染主内容，失败则渲染 fallback，需跟踪渲染分支。
    // ========== 第二步：分场景调和 Suspense 子节点 ==========
    if (current === null) {
        // ---------------- 场景1：首次挂载 ----------------
        // 水化特殊处理：尝试认领下一个可水化的实例（服务端渲染的 DOM 节点）
        tryToClaimNextHydratableInstance(workInProgress)
        // 检查是否是脱水的 Suspense 组件（服务端渲染的 Suspense）
        const suspenseState: null | SuspenseState = workInProgress.memoizedState
        if (suspenseState !== null) {
            const dehydrated = suspenseState.dehydrated
            if (dehydrated !== null) {
                // 调和脱水的 Suspense 组件（服务端 → 客户端水化）
                return mountDehydratedSuspenseComponent(workInProgress, dehydrated, renderLanes)
            }
        }

        // 获取 Suspense 的主内容和 fallback 内容
        const nextPrimaryChildren = nextProps.children
        const nextFallbackChildren = nextProps.fallback

        if (showFallback) {
            // 子组件挂起 → 挂载 fallback 内容
            const fallbackFragment = mountSuspenseFallbackChildren(workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes)
            // 获取主内容的 Fiber 片段（Offscreen 状态管理）
            const primaryChildFragment: Fiber = workInProgress.child
            // 初始化主内容的 Offscreen 状态（标记为隐藏）
            primaryChildFragment.memoizedState = mountSuspenseOffscreenState(renderLanes)
            // 标记 Suspense 状态为「已挂起」
            workInProgress.memoizedState = SUSPENDED_MARKER

            // React18：Transition Tracing 特性（跟踪挂起的 Transition）
            if (enableTransitionTracing) {
                debugger
            }
            // 返回 fallback 的 Fiber 节点
            return fallbackFragment
        } else if (
            enableCPUSuspense && // 启用 CPU Suspense 特性
            typeof nextProps.unstable_expectedLoadTime === 'number' // 设置了预期加载时间
        ) {
            debugger
        } else {
            // 正常挂载：渲染主内容（children）
            return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren, renderLanes)
        }
    } else {
        // ---------------- 场景2：更新阶段（非首次挂载） ----------------
        // 水化特殊处理：检查旧状态是否是脱水的 Suspense
        const prevState: null | SuspenseState = current.memoizedState
        if (prevState !== null) {
            const dehydrated = prevState.dehydrated
            if (dehydrated !== null) {
                // 调和脱水的 Suspense 组件（更新阶段）
                return updateDehydratedSuspenseComponent(current, workInProgress, didSuspend, nextProps, dehydrated, prevState, renderLanes)
            }
        }

        if (showFallback) {
            // 更新阶段：展示 fallback
            const nextFallbackChildren = nextProps.fallback
            const nextPrimaryChildren = nextProps.children
            // 调和 fallback 内容
            const fallbackChildFragment = updateSuspenseFallbackChildren(current, workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes)
            // 获取主内容的 Fiber 片段
            const primaryChildFragment: Fiber = workInProgress.child
            // 更新主内容的 Offscreen 状态（保留旧状态或初始化）
            const prevOffscreenState: OffscreenState | null = current.child.memoizedState
            primaryChildFragment.memoizedState = prevOffscreenState === null ? mountSuspenseOffscreenState(renderLanes) : updateSuspenseOffscreenState(prevOffscreenState, renderLanes)
            if (enableTransitionTracing) {
                debugger
            }
            // 设置主内容的剩余工作车道（控制优先级）
            primaryChildFragment.childLanes = getRemainingWorkInPrimaryTree(current, renderLanes)
            // 标记 Suspense 状态为「已挂起」
            workInProgress.memoizedState = SUSPENDED_MARKER
            return fallbackChildFragment
        } else {
            // 更新阶段：展示主内容
            const nextPrimaryChildren = nextProps.children
            // 调和主内容
            const primaryChildFragment = updateSuspensePrimaryChildren(current, workInProgress, nextPrimaryChildren, renderLanes)
            // 清除 Suspense 挂起状态
            workInProgress.memoizedState = null
            return primaryChildFragment
        }
    }
}


/**
 * 根据 mode 控制子树的「可见 / 隐藏」状态，并通过「优先级车道（Lane）+ 缓存池（CachePool）」实现隐藏子树的延迟渲染、可见子树的快速恢复，是 React18 实现「离屏渲染」「性能优化」的关键逻辑
*/
function updateOffscreenComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    // 1. 读取 Offscreen 组件的新 props 和子节点
    const nextProps: OffscreenProps = workInProgress.pendingProps
    const nextChildren = nextProps.children

    // 2. 读取旧状态 (OffscreenState：存储延迟渲染的车道、缓存池等)
    const prevState: OffscreenState | null = current !== null ? current.memoizedState : null

    // ========== 核心分支1：子树需要隐藏（mode=hidden / unstable-defer-without-hiding） ==========
    if (
        nextProps.mode === 'hidden' || // 标准隐藏模式：不渲染子树 DOM，延迟调和
        (enableLegacyHidden && nextProps.mode === 'unstable-defer-without-hiding') // 遗留模式：延迟调和但不隐藏 DOM
    ) {
        debugger
    } else {
        let subtreeRenderLanes
        if (prevState !== null) {
            subtreeRenderLanes = mergeLanes(prevState.baseLanes, renderLanes)
            let prevCachePool = null
            if (enableCache) {
                debugger
            }
            pushTransition(workInProgress, prevCachePool, null)
            workInProgress.memoizedState = null
        } else {
            subtreeRenderLanes = renderLanes
            if (enableCache) {
                debugger
            }
        }
        pushRenderLanes(workInProgress, subtreeRenderLanes)
    }
    reconcileChildren(current, workInProgress, nextChildren, renderLanes)
    return workInProgress.child
}

function updateClassComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    Component: any,
    nextProps: any,
    renderLanes: Lanes
) {
    debugger
}

function updateForwardRef(
    current: Fiber | null,
    workInProgress: Fiber,
    Component: any,
    nextProps: any,
    renderLanes: Lanes
) {
    const render = Component.render
    const ref = workInProgress.ref
    prepareToReadContext(workInProgress, renderLanes)
    const nextChildren = renderWithHooks(current, workInProgress, render, nextProps, ref, renderLanes)
    const hasId = checkDidRenderIdHook()

    if (current !== null && !didReceiveUpdate) {
        bailoutHooks(current, workInProgress, renderLanes)
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
    }
    if (getIsHydrating() && hasId) {
        debugger
    }
    workInProgress.flags |= PerformedWork
    reconcileChildren(current as Fiber, workInProgress, nextChildren, renderLanes)
    return workInProgress.child
}

function updateMemoComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    Component: any,
    nextProps: any,
    renderLanes: Lanes
) {
    debugger
}

function mountLazyComponent(
    _current,
    workInProgress,
    elementType,
    renderLanes
) {
    resetSuspendedCurrentOnMountInLegacyMode(_current, workInProgress)

    const props = workInProgress.pendingProps
    const lazyComponent: LazyComponentType<any, any> = elementType
    const payload = lazyComponent._payload
    const init = lazyComponent._init
    let Component = init(payload)

    workInProgress.type = Component
    const resolvedTag = (workInProgress.tag = resolveLazyComponentTag(Component))
    const resolvedProps = resolveDefaultProps(Component, props)
    let child
    switch (resolvedTag) {
        case FunctionComponent: {
            child = updateFunctionComponent(null, workInProgress, Component, resolvedProps, renderLanes)
            return child
        }
        case ClassComponent: {
            child = updateClassComponent(null, workInProgress, Component, resolvedProps, renderLanes)
            return child
        }
        case ForwardRef: {
            child = updateForwardRef(null, workInProgress, Component, resolvedProps, renderLanes)
            return child
        }
        case MemoComponent: {
            child = updateMemoComponent(null, workInProgress, Component, resolveDefaultProps(Component.type, resolvedProps), renderLanes)
            return child
        }
    }

    throw new Error('mountLazyComponent 出错了')
}

function updatePortalComponent(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo)
    const nextChildren = workInProgress.pendingProps
    if (current === null) {
        workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderLanes)
    } else {
        reconcileChildren(current, workInProgress, nextChildren, renderLanes)
    }
    return workInProgress.child
}

export function beginWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
) {
    // 1. 处理“更新阶段”的 Fiber 节点（current 存在，说明不是首次渲染）
    if (current !== null) {
        const oldProps = current.memoizedProps // 当前节点上次渲染的 props
        const newProps = workInProgress.pendingProps // 当前节点本次待应用的 props
        if (oldProps !== newProps || hasLegacyContextChanged()) {
            didReceiveUpdate = true
        } else {
            // 检查当前节点或其上下文是否有“待处理的更新”（如 setState/useReducer 触发的更新）
            const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(current, renderLanes)
            // 条件：1. 无待处理更新/上下文变化；2. 节点未标记“捕获错误”（DidCapture）
            if (!hasScheduledUpdateOrContext && (workInProgress.flags & DidCapture) === NoFlags) {
                didReceiveUpdate = false // 标记“未接收更新”（无需重新渲染）
                // 尝试“提前跳过”（bailout）：复用上次结果，不执行完整渲染逻辑
                return attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress, renderLanes)
            }
            // 处理“Legacy Suspense 强制更新”场景（兼容旧版 Suspense 逻辑）
            if ((current.flags & ForceUpdateForLegacySuspense) !== NoFlags) {
                didReceiveUpdate = true // 标记“需要强制更新”
            } else {
                didReceiveUpdate = false // 标记“暂未确定是否更新”（后续逻辑可能修改）
            }
        }
    } else { // 2. 处理“挂载阶段”的 Fiber 节点（current 不存在，首次渲染）
        didReceiveUpdate = false // 挂载阶段无“旧状态”，初始标记为“未接收更新”
        if (getIsHydrating() && isForkedChild(workInProgress)) {
            debugger
        }
    }
    // 清空当前工作节点的“优先级通道”（已开始处理，无需保留旧优先级标记）
    workInProgress.lanes = NoLanes
    // 3. 根据 Fiber 节点的“类型（tag）”执行对应逻辑（核心分支）
    switch (workInProgress.tag) {
        case IndeterminateComponent: {
            return mountIndeterminateComponent(current, workInProgress, workInProgress.type, renderLanes)
        }
        case LazyComponent: {
            const elementType = workInProgress.elementType
            return mountLazyComponent(current, workInProgress, elementType, renderLanes)
        }
        case FunctionComponent: {
            const Component = workInProgress.type
            const unresolvedProps = workInProgress.pendingProps
            const resolvedProps = workInProgress.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps)
            return updateFunctionComponent(current, workInProgress, Component, resolvedProps, renderLanes)
        }
        case ClassComponent: {
            debugger
        }
        case HostRoot:
            return updateHostRoot(current, workInProgress, renderLanes)
        case HostComponent:
            return updateHostComponent(current, workInProgress, renderLanes)
        case HostText:
            return updateHostText(current, workInProgress)
        case SuspenseComponent:
            return updateSuspenseComponent(current, workInProgress, renderLanes)
        case HostPortal:
            return updatePortalComponent(current, workInProgress, renderLanes)
        case ForwardRef: {
            const type = workInProgress.type
            const unresolvedProps = workInProgress.pendingProps
            const resolvedProps = workInProgress.elementType === type ? unresolvedProps : resolveDefaultProps(type, unresolvedProps)
            return updateForwardRef(current, workInProgress, type, resolvedProps, renderLanes)
        }
        case Fragment:
            return updateFragment(current, workInProgress, renderLanes)
        case Mode:
            debugger
        // return updateMode(current, workInProgress, renderLanes)
        case Profiler:
            debugger
        // return updateProfiler(current, workInProgress, renderLanes)
        case ContextProvider:
            return updateContextProvider(current, workInProgress, renderLanes)
        case ContextConsumer:
            debugger
        // return updateContextConsumer(current, workInProgress, renderLanes)
        case MemoComponent: {
            debugger
        }
        case SimpleMemoComponent: {
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
            return updateOffscreenComponent(current, workInProgress, renderLanes)
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
    }
}

/**
 * mountIndeterminateComponent：处理类型不确定的组件挂载,该函数用于处理初次挂载时类型不明确的组件（例如，函数组件可能返回类实例，或未明确区分函数 / 类的组件），最终确定其类型（函数组件或类组件）并完成挂载。
 * 核心作用：
 *  1. 将 “未完成” 状态的类组件 Fiber 节点标记为明确的 ClassComponent 类型。
 *  2. 处理类组件的上下文提供逻辑（Legacy Context）。
 *  3. 初始化类组件实例（执行构造函数、绑定生命周期方法等）。
 *  4. 最终通过 finishClassComponent 完成渲染，生成子节点的 Fiber 树
 * */
function mountIndeterminateComponent(_current, workInProgress, Component, renderLanes) {
    // 1. 重置 Legacy 模式下因暂停导致的 Fiber 状态
    resetSuspendedCurrentOnMountInLegacyMode(_current, workInProgress)
    const props = workInProgress.pendingProps
    let context
    // 2. 处理 Legacy Context（获取上下文）
    if (!disableLegacyContext) {
        const unmaskedContext = getUnmaskedContext(workInProgress, Component, false)
        context = getMaskedContext(workInProgress, unmaskedContext) // 过滤上下文
    }

    // 3. 准备读取上下文
    prepareToReadContext(workInProgress, renderLanes)
    // 4. 执行组件（通过 hooks 机制）
    let value = renderWithHooks(null, workInProgress, Component, props, context, renderLanes)
    let hasId = checkDidRenderIdHook() // 

    // 5. 标记组件已执行工作
    workInProgress.flags |= PerformedWork
    // 6. 判断组件类型（核心逻辑）
    if (
        !disableModulePatternComponents &&
        typeof value === 'object' &&
        value !== null &&
        typeof value.render === 'function' &&
        value.$$typeof === undefined
    ) { // 检查是否是“类实例模式”（函数组件返回类实例，已废弃）
        debugger
        workInProgress.tag = ClassComponent // 6.1 确定为类组件（处理废弃的“模块模式”组件）
        // 清除函数组件相关的 hooks 状态
        workInProgress.memoizedState = null
        workInProgress.updateQueue = null

        // 处理上下文提供者
        let hasContext = false
        if (isLegacyContextProvider(Component)) {
            hasContext = true
            pushLegacyContextProvider(workInProgress)
        } else {
            hasContext = false
        }
        // 初始化类实例状态和更新队列
        workInProgress.memoizedState = value.state !== null && value.state !== undefined ? value.state : null
        initializeUpdateQueue(workInProgress)
        adoptClassInstance(workInProgress, value)
        mountClassInstance(workInProgress, Component, props, renderLanes)
        // 完成类组件挂载
        return finishClassComponent(null, workInProgress, Component, true, hasContext, renderLanes)
    } else { // 6.2 确定为函数组件
        workInProgress.tag = FunctionComponent
        // if (getIsHydrating() && hasId) {
        //     pushMaterializedTreeId(workInProgress)
        // }
        // 协调子节点（生成子 Fiber 树）
        reconcileChildren(null, workInProgress, value, renderLanes)
        return workInProgress.child
    }
}

/**
 * 在 Legacy 模式下强制重置暂停过的延迟组件，使其重新挂载,解决的核心问题是:
 * 在 Legacy 模式下，延迟组件暂停后会先提交空状态到 DOM（current 节点存在但无效）。当组件加载完成后:
 *  1. 若直接复用 current 节点，会导致新旧状态混淆（空状态与实际内容冲突）
 *  2. 通过断开 alternate 指针并标记 Placement，强制将其视为新组件，重新执行挂载流程，确保 DOM 与 Fiber 树状态一致
*/
function resetSuspendedCurrentOnMountInLegacyMode(current, workInProgress) {
    // workInProgress.mode：当前工作 Fiber 节点的模式标记（如并发模式、严格模式等）
    // ConcurrentMode：并发模式的标记位；NoMode 表示无特殊模式（即 Legacy 模式）
    if ((workInProgress.mode & ConcurrentMode) === NoMode) { // 检查是否为 非并发模式 (Legacy 模式)
        debugger
        if (current !== null) {
            current.alternate = null
            workInProgress.alternate = null
            workInProgress.flags |= Placement
        }
    }
}

function bailoutOnAlreadyFinishedWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
): Fiber | null {
    if (current !== null) {
        workInProgress.dependencies = current.dependencies
    }

    markSkippedUpdateLanes(workInProgress.lanes)

    if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
        if (enableLazyContextPropagation && current !== null) {
            lazilyPropagateParentContextChanges(current, workInProgress, renderLanes)
            if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
                return null
            }
        } else {
            return null
        }
    }

    cloneChildFibers(current, workInProgress)
    return workInProgress.child
}

/**
 * markRef 是 React 协调阶段中用于标记 ref 属性变化的工具函数。它通过对比新旧 Fiber 节点的 ref 属性，判断是否需要在提交阶段（Commit）执行 ref 相关的副作用（如绑定或解绑 DOM 引用），并为工作中的 Fiber 节点（workInProgress）添加相应标记，确保 ref 能正确响应组件更新
 * 核心背景：ref 的作用与处理时机
 *  ref 用于获取组件或 DOM 元素的引用（如 <div ref={myRef} />），常见用途包括直接操作 DOM、访问组件实例等。ref 的值可以是函数、对象（createRef 创建）或字符串（已不推荐）。
 *  在 React 中，ref 的绑定和解绑属于 “副作用”，需要在协调阶段判断是否需要执行，并在提交阶段（DOM 操作阶段）实际执行。markRef 正是协调阶段中判断 ref 是否需要更新的关键逻辑。
*/
function markRef(
    current: Fiber | null,
    workInProgress: Fiber
) {
    // 获取新节点的 ref 属性
    const ref = workInProgress.ref
    if (
        (current === null && ref !== null) ||  // 1. 首次渲染（无旧节点）且存在 ref
        (current !== null && current?.ref !== ref) // 2. 存在旧节点且新旧 ref 不同
    ) {
        // 标记需要执行 ref 副作用
        workInProgress.flags |= Ref

        // 若启用 Suspense 布局副作用语义，额外标记 RefStatic
        if (enableSuspenseLayoutEffectSemantics) {
            workInProgress.flags |= RefStatic
        }
    }
}

function updateFunctionComponent(
    current,
    workInProgress,
    Component,
    nextProps,
    renderLanes
) {
    let context
    if (!disableLegacyContext) {
        const unmaskedContext = getUnmaskedContext(workInProgress, Component, true)
        context = getMaskedContext(workInProgress, unmaskedContext)
    }

    let nextChildren
    let hasId
    prepareToReadContext(workInProgress, renderLanes)
    nextChildren = renderWithHooks(current, workInProgress, Component, nextProps, context, renderLanes)
    hasId = checkDidRenderIdHook()

    if (current !== null && !didReceiveUpdate) {
        bailoutHooks(current, workInProgress, renderLanes)
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes)
    }

    if (getIsHydrating() && hasId) {
        debugger
    }

    workInProgress.flags |= PerformedWork
    reconcileChildren(current, workInProgress, nextChildren, renderLanes)
    return workInProgress.child
}

function mountDehydratedSuspenseComponent(
    workInProgress: Fiber,
    suspenseInstance: SuspenseInstance,
    renderLanes: Lanes
): null | Fiber {
    if ((workInProgress.mode & ConcurrentMode) === NoMode) {
        workInProgress.lanes = laneToLanes(SyncLane)
    } else if (isSuspenseInstanceFallback(suspenseInstance)) {

    } else {
        workInProgress.lanes = laneToLanes(OffscreenLane)
    }

    return null
}