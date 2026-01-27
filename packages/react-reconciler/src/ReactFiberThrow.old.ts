import { enableLazyContextPropagation, enableUpdaterTracking } from "shared/ReactFeatureFlags";
import { ForceClientRender, Incomplete, ShouldCapture } from "./ReactFiberFlags";
import { Lane, Lanes, mergeLanes, NoTimestamp, pickArbitraryLane } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { Wakeable } from "shared/ReactTypes";
import { ConcurrentMode, NoMode } from "./ReactTypeOfMode";
import { getIsHydrating } from "./ReactFiberHydrationContext.old";
import { ClassComponent, ForwardRef, FunctionComponent, HostRoot, SimpleMemoComponent, SuspenseComponent } from "./ReactWorkTags";
import { CapturedValue, createCapturedValueAtFiber } from "./ReactCapturedValue";
import { renderDidError } from "./ReactFiberWorkLoop.new";
import { InvisibleParentSuspenseContext, suspenseStackCursor } from "./ReactFiberSuspenseContext";
import { hasSuspenseContext } from "./ReactFiberSuspenseContext";
import { CaptureUpdate, createUpdate, enqueueCapturedUpdate, Update } from "./ReactFiberClassUpdateQueue.old";
import { onUncaughtError, pingSuspendedRoot } from "./ReactFiberWorkLoop.old";
import { logCapturedError } from "./ReactFiberErrorLogger";
import { shouldCaptureSuspense } from "./ReactFiberSuspenseComponent.old";

const PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map

/**
 * resetSuspendedComponent 是 React18 中处理组件挂起（Suspend）后的状态重置函数，主要作用是：
 *  1. 针对 Legacy 模式（非并发模式）下的函数组件 / ForwardRef/Memo 组件，当组件因 Suspense 挂起后，将其 Fiber 节点的状态（updateQueue/memoizedState/lanes）回滚到上一次渲染的状态（从 alternate 备用 Fiber 读取），避免挂起导致的状态错乱，保证后续重新渲染时组件状态的一致性。
 *     简单说，这个函数是 Legacy 模式下「挂起组件状态回滚」的专用逻辑，仅作用于特定类型的函数组件。
 *  2. 核心触发场景：
 *      Legacy 模式函数组件渲染 → 抛 Promise 触发 Suspense 挂起 → resetSuspendedComponent 执行 → 回滚 Fiber 状态 → 重新渲染时使用正确状态
*/
function resetSuspendedComponent(
    sourceFiber: Fiber,
    rootRenderLanes: Lanes
) {
    if (enableLazyContextPropagation) {
        debugger
    }

    // 1. 获取 Fiber 节点的类型标记
    const tag = sourceFiber.tag
    if (
        (sourceFiber.mode & ConcurrentMode) === NoMode && // Legacy 模式（非并发）
        (tag === FunctionComponent || tag === ForwardRef || tag === SimpleMemoComponent) // Fiber 类型为 函数组件/ForwardRef/Memo 组件（SimpleMemoComponent）
    ) {
        // 2. 获取备用 Fiber（current Fiber）→ 存储上一次提交的状态
        const currentSource = sourceFiber.alternate
        if (currentSource) {
            sourceFiber.updateQueue = currentSource.updateQueue // 回滚更新队列
            sourceFiber.memoizedState = currentSource.memoizedState // 回滚 Hooks 缓存状态
            sourceFiber.lanes = currentSource.lanes // 回滚优先级车道
        } else {
            // 场景2：无备用 Fiber（首次挂载）→ 清空状态，避免脏数据
            sourceFiber.updateQueue = null
            sourceFiber.memoizedState = null
        }
    }
}

/**
 * getNearestSuspenseBoundaryToCapture 是 React Suspense 特性中查找「最近可捕获挂起的 Suspense 边界」的核心函数—— 它的核心作用是：
 *  1.从抛出挂起异常的 Fiber 节点的父节点（returnFiber）开始，向上遍历 Fiber 树，找到第一个满足「可捕获挂起」条件的 Suspense 组件 Fiber 节点；若遍历至根节点仍未找到，则返回 null。
 *      简单说，这个函数是 Suspense 「挂起捕获范围」的「定位器」，决定了哪个 Suspense 组件来处理当前的挂起并渲染 fallback UI
 *  调用流程: Fiber 调和抛 Promise → throwException → 调用 getNearestSuspenseBoundaryToCapture → 找到最近可捕获的 Suspense 边界 → 标记该边界捕获挂起并渲染 fallback
 *  
*/
function getNearestSuspenseBoundaryToCapture(returnFiber: Fiber) {
    let node: Fiber | null = returnFiber
    // 获取当前 Suspense 上下文，判断是否有「不可见的父 Suspense 边界」
    const hasInvisibleParentBoundary = hasSuspenseContext(suspenseStackCursor.current, InvisibleParentSuspenseContext)
    do {
        if (node.tag === SuspenseComponent && shouldCaptureSuspense(node, hasInvisibleParentBoundary)) return node
        node = node.return
    } while (node !== null)
    // 注：若返回 null，说明无可用的 Suspense 边界，React 会将 Suspense 挂起升级为普通错误处理。
    return null
}

function createRootErrorUpdate(
    fiber: Fiber,
    errorInfo: CapturedValue<any>,
    lane: Lane
): Update<any> {
    const update = createUpdate(NoTimestamp, lane)
    update.tag = CaptureUpdate
    update.payload = { element: null }
    const error = errorInfo.value
    update.callback = () => {
        onUncaughtError(error)
        logCapturedError(fiber, errorInfo)
    }
    return update
}

/**
 * attachPingListener 是 React18 中 Suspense 异步恢复机制的核心监听函数—— 它的核心作用是：
 *  1. 给 Suspense 挂起时依赖的「可唤醒对象（Wakeable，通常是 Promise）」绑定「ping 回调」，当异步资源（如懒加载组件、异步数据）解析完成时，触发回调重新调度 Suspense 组件的渲染，让 Suspense 从 fallback 切换回主内容。简单说，这个函数是「Suspense 挂起 → 恢复」的关键桥梁。
*/
function attachPingListener(
    root: FiberRoot,
    wakeable: Wakeable,
    lanes: Lanes
) {
    // 注释核心：
    // 1. 异步资源可能在 fallback 提交前就解析完成，或刷新时永远不会提交 fallback；
    // 2. 因此需要立即绑定监听，资源解析（ping）时决定是否重新渲染；
    // 3. 仅为当前渲染的 lanes 绑定监听（lanes 作为线程 ID），避免重复；
    // 4. 仅在并发模式执行，Legacy 模式无 ping 机制。

    // 第一步：获取/初始化 root 上的 pingCache（缓存 Wakeable 与 lanes 的绑定关系）
    let pingCache = root.pingCache
    let threadIDs; // 即 lanes 集合，作为「线程 ID」
    if (pingCache === null) {
        // 首次绑定：初始化 pingCache 和当前 Wakeable 的 lanes 集合
        pingCache = root.pingCache = new (PossiblyWeakMap as any)()
        threadIDs = new Set()
        pingCache?.set(wakeable, threadIDs)
    } else {
        // 非首次：获取该 Wakeable 已绑定的 lanes 集合
        threadIDs = pingCache.get(wakeable)
        if (threadIDs === undefined) {
            // 该 Wakeable 未绑定过 → 初始化集合
            threadIDs = new Set()
            pingCache.set(wakeable, threadIDs)
        }
    }

    // 第二步：判断当前 lanes 是否已绑定，避免重复监听
    if (!threadIDs.has(lanes)) {
        // 1. 缓存当前 lanes，标记为已绑定
        threadIDs.add(lanes)

        // 2. 绑定 ping 回调（核心：资源解析后触发 pingSuspendedRoot）
        const ping = pingSuspendedRoot.bind(null, root, wakeable, lanes)

        // 3. 开发工具兼容：恢复待处理的 updaters（仅 enableUpdaterTracking 开启时）
        if (enableUpdaterTracking) {
            debugger
        }
        wakeable.then(ping, ping)
    }
}

/**
 * attachRetryListener 是 React18 中 Suspense 组件「fallback 提交后」的重试监听函数 —— 它的核心作用是：
 * 1. 当 Suspense 的 fallback 内容成功提交到 DOM 后，将挂起依赖的「可唤醒对象（Wakeable，通常是 Promise）」缓存到 Suspense Fiber 的 updateQueue 中，为后续「异步资源就绪后重试渲染主内容」做准备。简单说，这个函数是「fallback 已展示 → 等待资源就绪后重试」的关键缓存逻辑，与你之前问的 attachPingListener 互补，共同完成 Suspense 的恢复流程。
*/
function attachRetryListener(
    suspenseBoundary: Fiber,
    root: FiberRoot,
    wakeable: Wakeable,
    lanes: Lanes
) {
    // 注释核心：
    // 1. 若 fallback 已提交，需要绑定「重试类型」监听（而非 ping 监听）；
    // 2. 该监听会在 Suspense 边界调度更新，关闭 fallback 状态；
    // 3. 将 wakeable 暂存到边界 Fiber 上，方便提交阶段访问；
    // 4. wakeable 解析后，尝试重新渲染该边界（「重试」逻辑）。

    // 第一步：获取 Suspense Fiber 上已缓存的 wakeable 集合
    // 注意：这里复用了 updateQueue 字段存储 wakeable 集合（非常规用法） 
    const wakeables: Set<Wakeable> | null = suspenseBoundary.updateQueue as any
    if (wakeables === null) {
        // 场景1：首次缓存 → 初始化 Set 集合，添加当前 wakeable
        const updateQueue = new Set()
        updateQueue.add(wakeable)
        suspenseBoundary.updateQueue = updateQueue // 绑定到 Fiber 的 updateQueue 字段
    } else {
        // 场景2：已有缓存 → 直接添加当前 wakeable（支持多个异步资源挂起）
        wakeables.add(wakeable)
    }
}

function markSuspenseBoundaryShouldCapture(
    suspenseBoundary: Fiber,
    returnFiber: Fiber,
    sourceFiber: Fiber,
    root: FiberRoot,
    rootRenderLanes: Lanes
): Fiber | null {
    if ((suspenseBoundary.mode & ConcurrentMode) === NoMode) {
        debugger
    }

    suspenseBoundary.flags |= ShouldCapture
    suspenseBoundary.lanes = rootRenderLanes
    return suspenseBoundary
}

/**
 * throwException 是 React 渲染阶段处理「异常抛出」的核心函数—— 它的核心作用是：
 * 1. 当 Fiber 调和过程中抛出异常（包括普通错误和 Suspense 挂起的 Promise）时，标记异常相关 Fiber 的状态，区分「Suspense 挂起」和「普通错误」两种场景：对 Suspense 挂起，找到最近的 Suspense 边界并标记捕获，绑定重试监听；对普通错误，向上遍历 Fiber 树寻找错误边界（如 HostRoot/ClassComponent），标记错误并创建错误更新，最终实现「错误兜底」或「Suspense 降级渲染」。简单说，这个函数是 React 错误处理和 Suspense 挂起逻辑的统一入口。
 * 触发场景:
 *   1. 抛出 Promise（Suspense 挂起）：如 lazy 加载组件、use 加载数据时抛出 Promise
 *   2. 抛出普通错误：如渲染阶段抛错、代码逻辑错误
 * 调用链路:
 *   Fiber 调和抛错 → 调用 throwException → 区分 Promise/普通错误 → 处理 Suspense 挂起 或 寻找错误边界 → 标记 Fiber 状态/绑定重试监听
*/
function throwException(
    root: FiberRoot,
    returnFiber: Fiber,
    sourceFiber: Fiber,
    value: any,
    rootRenderLanes: Lanes
) {
    // 步骤1：标记源 Fiber 为「未完成」（因异常中断调和）
    sourceFiber.flags |= Incomplete
    if (enableUpdaterTracking) {
        debugger
    }
    // 步骤2：判断是否是 Suspense 挂起（抛出 Promise）
    if (
        value !== null &&
        typeof value === 'object' &&
        typeof value.then === 'function'
    ) {
        const wakeable: Wakeable = value // 类型转换为可唤醒对象（Promise）
        resetSuspendedComponent(sourceFiber, rootRenderLanes) // 重置挂起的组件状态，标记车道

        // 步骤2.1：找到最近的 Suspense 边界
        const suspenseBoundary = getNearestSuspenseBoundaryToCapture(returnFiber)
        if (suspenseBoundary !== null) {
            // 步骤2.2：清除「强制客户端渲染」标记，避免冲突
            suspenseBoundary.flags &= ~ForceClientRender
            // 步骤2.3：标记 Suspense 边界需要捕获挂起，准备渲染 fallback
            markSuspenseBoundaryShouldCapture(suspenseBoundary, returnFiber, sourceFiber, root, rootRenderLanes)
            // 步骤2.4：并发模式下，为 Promise 绑定「Ping 监听」（就绪后触发根渲染）
            if (suspenseBoundary.mode & ConcurrentMode) {
                attachPingListener(root, wakeable, rootRenderLanes)
            }
            // 步骤2.5：为 Suspense 边界绑定「重试监听」（Promise 就绪后重试渲染)
            attachRetryListener(suspenseBoundary, root, wakeable, rootRenderLanes)
            return
        } else {
            debugger
        }
    } else {
        if (getIsHydrating() && sourceFiber.mode & ConcurrentMode) {
            debugger
        }
    }

    // 步骤3：处理普通错误（非 Suspense 挂起）
    // 3.1：包装错误信息为 CapturedValue（关联源 Fiber）
    value = createCapturedValueAtFiber(value, sourceFiber)
    // 3.2：标记「渲染出错」全局状态
    renderDidError(value)
    // 3.3 向上遍历 Fiber 树，寻找错误边界（HostRoot/ClassComponent）
    let workInProgress: Fiber | null = returnFiber
    do {
        switch (workInProgress.tag) {
            case HostRoot: { // 根节点作为最终错误边界
                const errorInfo = value
                // 标记根节点需要捕获错误
                workInProgress.flags |= ShouldCapture
                // 从当前渲染车道中选一个车道用于错误更新
                const lane = pickArbitraryLane(rootRenderLanes)
                // 合并错误车道到根节点的待处理车道
                workInProgress.lanes = mergeLanes(workInProgress.lanes, lane)
                // 创建根节点的错误更新（用于渲染错误兜底）
                const update = createRootErrorUpdate(workInProgress, errorInfo, lane)
                // 将错误更新加入队列，后续调和时处理
                enqueueCapturedUpdate(workInProgress, update)
                return
            }
            case ClassComponent: {
                debugger
            }
            default:
                break
        }
        workInProgress = workInProgress.return
    } while (workInProgress !== null)
}

export {
    throwException
}