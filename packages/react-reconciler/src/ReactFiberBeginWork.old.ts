import { shouldSetTextContent, supportsHydration } from "ReactDOMHostConfig";
import { cloneUpdateQueue, initializeUpdateQueue, processUpdateQueue } from "./ReactFiberClassUpdateQueue.old";
import { getMaskedContext, getUnmaskedContext, pushTopLevelContextObject, hasContextChanged as hasLegacyContextChanged, } from "./ReactFiberContext.old";
import { ContentReset, DidCapture, ForceUpdateForLegacySuspense, NoFlags, PerformedWork, Placement, Ref, RefStatic } from "./ReactFiberFlags";
import { pushHostContainer, pushHostContext } from "./ReactFiberHostContext.old";
import { includesSomeLane, Lanes, NoLanes } from "./ReactFiberLane.old";
import { RootState } from "./ReactFiberRoot.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { CacheComponent, ClassComponent, ContextConsumer, ContextProvider, ForwardRef, Fragment, FunctionComponent, HostComponent, HostPortal, HostRoot, HostText, IncompleteClassComponent, IndeterminateComponent, LazyComponent, LegacyHiddenComponent, MemoComponent, Mode, OffscreenComponent, Profiler, ScopeComponent, SimpleMemoComponent, SuspenseComponent, SuspenseListComponent, TracingMarkerComponent } from "./ReactWorkTags";
import { cloneChildFibers, mountChildFibers, reconcileChildFibers } from "./ReactChildFiber.old";
import { ConcurrentMode, NoMode } from "./ReactTypeOfMode";
import { disableLegacyContext, disableModulePatternComponents, enableCache, enableLazyContextPropagation, enableSuspenseLayoutEffectSemantics } from "shared/ReactFeatureFlags";
import { lazilyPropagateParentContextChanges, prepareToReadContext } from "./ReactFiberNewContext.old";
import { checkDidRenderIdHook, renderWithHooks } from "./ReactFiberHooks.old";
import { getIsHydrating, resetHydrationState, tryToClaimNextHydratableInstance } from "./ReactFiberHydrationContext.old";
import { pushRootTransition } from "./ReactFiberTransition";
import { markSkippedUpdateLanes } from "./ReactFiberWorkLoop.old";
import { resolveDefaultProps } from "./ReactFiberLazyComponent.old";
import { isForkedChild } from "./ReactFiberTreeContext.old";

let didReceiveUpdate: boolean = false

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

function checkScheduledUpdateOrContext(
    current: Fiber, 
    renderLanes: Lanes
) {
    const updateLanes = current.lanes
    if (includesSomeLane(updateLanes, renderLanes)) {
        return true
    }
    // todo
    if (enableLazyContextPropagation) {
        debugger
    }
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
            debugger
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
    if (current === null ){
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
    switch(workInProgress.tag) {
        case IndeterminateComponent: {
            return mountIndeterminateComponent(current, workInProgress, workInProgress.type, renderLanes)
        }
        case LazyComponent: {
            debugger
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
            debugger
            // return updateHostText(current, workInProgress)
        case SuspenseComponent:
            debugger
            // return updateSuspenseComponent(current, workInProgress, renderLanes)
        case HostPortal:
            debugger
            // return updatePortalComponent(current, workInProgress, renderLanes)
        case ForwardRef: {
            debugger
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
            debugger
            // return updateContextProvider(current, workInProgress, renderLanes)
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
): Fiber | null{
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