import { deferRenderPhaseUpdateToNextBatch, disableSchedulerTimeoutInWorkLoop, enableProfilerCommitHooks, enableProfilerNestedUpdatePhase, enableProfilerTimer, enableSchedulingProfiler, enableTransitionTracing, enableUpdaterTracking } from "shared/ReactFeatureFlags";
import { claimNextTransitionLane, getHighestPriorityLane, getLanesToRetrySynchronouslyOnError, getNextLanes, getTransitionsForLanes, includesBlockingLane, includesExpiredLane, includesSomeLane, Lane, Lanes, markRootFinished, markRootUpdated, markStarvedLanesAsExpired, mergeLanes, NoLane, NoLanes, NoTimestamp, pickArbitraryLane, removeLanes, SyncLane, markRootSuspended as markRootSuspended_dontCallThisOneDirectly, includesNonIdleWork, includesOnlyRetries, claimNextRetryLane, isSubsetOfLanes, markRootPinged, } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { ConcurrentMode, NoMode, ProfileMode } from "./ReactTypeOfMode";
import {
    scheduleCallback as Scheduler_scheduleCallback,
    cancelCallback as Scheduler_cancelCallback,
    now,
    ImmediatePriority as ImmediateSchedulerPriority,
    UserBlockingPriority as UserBlockingSchedulerPriority,
    NormalPriority as NormalSchedulerPriority,
    IdlePriority as IdleSchedulerPriority,
    requestPaint,
    shouldYield,
} from "./Scheduler"
import { LegacyRoot } from "./ReactRootTags";
import { ContinuousEventPriority, DefaultEventPriority, DiscreteEventPriority, EventPriority, getCurrentUpdatePriority, IdleEventPriority, lanesToEventPriority, lowerEventPriority, setCurrentUpdatePriority } from "./ReactEventPriorities.old";
import ReactSharedInternals from "shared/ReactSharedInternals";
import { ContextOnlyDispatcher, resetHooksAfterThrow } from "./ReactFiberHooks.old";
import { cancelTimeout, getCurrentEventPriority, noTimeout, resetAfterCommit, scheduleMicrotask, scheduleTimeout, supportsMicrotasks } from "./ReactFiberHostConfig"
import { CapturedValue } from "./ReactCapturedValue";
import { unwindInterruptedWork, unwindWork } from "./ReactFiberUnwindWork.old";
import { createWorkInProgress } from "./ReactFiber.old";
import { enqueueConcurrentRenderForLane, finishQueueingConcurrentUpdates } from "./ReactFiberConcurrentUpdates.old";
import { Transition, Wakeable } from "shared/ReactTypes";
import { resetContextDependencies } from "./ReactFiberNewContext.old";
import { beginWork } from "./ReactFiberBeginWork.old";
import { BeforeMutationMask, HostEffectMask, Incomplete, LayoutMask, MutationMask, NoFlags, PassiveMask } from "./ReactFiberFlags";
import { completeWork } from "./ReactFiberCompleteWork.old";
import { commitBeforeMutationEffects, commitLayoutEffects, commitMutationEffects, commitPassiveMountEffects, commitPassiveUnmountEffects } from "./ReactFiberCommitWork.old";
import { flushSyncCallbacks, scheduleLegacySyncCallback, scheduleSyncCallback } from "./ReactFiberSyncTaskQueue.old";
import { NoTransition, requestCurrentTransition } from "./ReactFiberTransition";

import {
    push as pushToStack,
    pop as popFromStack,
    createCursor,
    StackCursor,
} from './ReactFiberStack.old';
import { throwException } from "./ReactFiberThrow.old";
import { markComponentErrored, markComponentRenderStopped, markComponentSuspended } from "./ReactFiberDevToolsHook.old";
import { SuspenseState } from "./ReactFiberSuspenseComponent.old";
import { SuspenseComponent, SuspenseListComponent } from "./ReactWorkTags";

const {
    ReactCurrentDispatcher,
    ReactCurrentOwner,
    ReactCurrentBatchConfig,
} = ReactSharedInternals;

// 执行上下文
type ExecutionContext = number

export const NoContext = /*             */ 0b000;  // 无特殊上下文
const BatchedContext = /*               */ 0b001;  // 批量更新上下文
const RenderContext = /*                */ 0b010;  // 渲染上下文
const CommitContext = /*                */ 0b100;  // 提交上下文

// 根节点渲染结果状态
type RootExitStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const RootInProgress = 0;           // 渲染中
const RootFatalErrored = 1;         // 致命错误（无法恢复）
const RootErrored = 2;              // 普通错误（可被错误边界捕获）
const RootSuspended = 3;            // Suspense 挂起（无延迟）
const RootSuspendedWithDelay = 4;   // Suspense 挂起（带延迟）
const RootCompleted = 5;            // 渲染完成
const RootDidNotComplete = 6;       // 渲染未完成（被中断）

let executionContext: ExecutionContext = NoContext  // 当前执行上下文
let currentEventTime: number = NoTimestamp  // 当前事件时间戳 和 Lane 赛道（用于过度更新）
let currentEventTransitionLane: Lanes = NoLanes

// 根节点渲染状态（Root 级核心状态）
let workInProgress: Fiber | null = null   // 正在工作的节点
let workInProgressRoot: FiberRoot | null = null  // 正在进行的工作根节点
let workInProgressRootRenderLanes: Lanes = NoLanes  // 本次根节点渲染的目标优先级车道
let workInProgressRootIncludedLanes: Lanes = NoLanes;  // 本次渲染中所有已包含的车道总和， 记录「全局需要处理的更新车道」，用于调度器判断是否还有未处理的更新；由 pushRenderLanes 合并更新
let workInProgressRootRenderPhaseUpdatedLanes: Lanes = NoLanes // 渲染阶段新增的更新车道，渲染过程中触发的 setState（如 render 中 setState）会标记到该值，避免渲染阶段立即调度，统一延后处理
let workInProgressRootExitStatus: RootExitStatus = RootInProgress  // 根节点渲染的渲染退出状态，初始化为 RootInProgress（表示正在进行）
let workInProgressRootFatalError: any = null // 存储致命错误（如无法恢复的异常）。
let workInProgressRootSkippedLanes: Lanes = NoLanes // 本次渲染跳过的车道。因优先级低 / 可中断被跳过的更新车道，后续调度器会重新处理这些车道
let workInProgressRootInterleavedUpdatedLanes: Lanes = NoLanes // 渲染过程中穿插的新更新车道。并发渲染时，高优先级更新插队（如渲染中触发输入更新），标记这些新车道，渲染完成后优先处理
let workInProgressRootPingedLanes: Lanes = NoLanes // 触发重试的车道（Suspense 专用），Suspense 挂起的资源就绪后，标记该车道，触发根节点重新渲染
let workInProgressTransitions: Array<Transition> | null = null // 当前渲染的过渡更新集合，对应 startTransition 标记的低优先级更新，用于区分「紧急更新」和「过渡更新」

let workInProgressRootRenderTargetTime: number = Infinity  // 根节点渲染的超时时间戳， 配合 RENDER_TIMEOUT_MS = 500 使用：若渲染超过 500ms 未完成，强制中断并标记超时，避免主线程阻塞过久
const RENDER_TIMEOUT_MS = 500

// 错误处理相关
let workInProgressRootConcurrentErrors: Array<CapturedValue<any>> | null = null  // 并发渲染中捕获的错误集合，存储可恢复的并发渲染错误，后续统一处理
let workInProgressRootRecoverableErrors: Array<CapturedValue<any>> | null = null // 可恢复的错误集合， 错误边界可捕获的错误，用于渲染 fallback UI
let legacyErrorBoundariesThatAlreadyFailed: Set<any> | null = null; // 已失败的旧版错误边界集合， 避免错误边界重复捕获同一错误（如嵌套错误边界）
let hasUncaughtError = false;   // 标记是否有未捕获的错误， 全局错误标记，触发 React 错误上报 / 降级逻辑
let firstUncaughtError = null  // 第一个未捕获的错误， 存储根因错误，便于调试和错误提示

// 副作用（Passive Effects）调度相关
let rootDoesHavePassiveEffects: boolean = false;  // 标记是否有待执行的被动副作用， 被动副作用指 useEffect（区别于 useLayoutEffect 的同步副作用），该值为 true 时，调度器会在提交阶段后执行这些副作用
let rootWithPendingPassiveEffects: FiberRoot | null = null; // 有待执行副作用的根节点， 批量处理同一根节点的副作用，避免多次调度
let pendingPassiveEffectsLanes: Lanes = NoLanes;  // 待执行副作用的优先级车道， 按优先级执行副作用（高优先级副作用先执行）
let pendingPassiveProfilerEffects: Array<Fiber> = []; // 待执行的性能分析副作用， 对应 Profiler 组件的副作用，用于收集性能数据
let pendingPassiveEffectsRemainingLanes: Lanes = NoLanes; // 剩余未执行的副作用车道，标记还有哪些优先级的副作用未执行，用于进度跟踪
let pendingPassiveTransitions: Array<any> | null = null;  // 待执行的过渡副作用，与 startTransition 绑定的副作用，低优先级执行

// 嵌套更新与节流控制相关，解决「渲染阶段触发更新」「Suspense fallback 频繁切换」等问题，保证稳定性和性能
let nestedUpdateCount: number = 0;  // 嵌套更新的计数，渲染阶段触发的 setState 会增加该计数，限制嵌套更新深度（避免无限循环）
let rootWithNestedUpdates: FiberRoot | null = null; // 有嵌套更新的根节点，标记需要延后处理嵌套更新的根节点，统一在渲染完成后调度
let globalMostRecentFallbackTime: number = 0; // 最近一次 Suspense fallback 的时间戳，配合 FALLBACK_THROTTLE_MS = 500 使用：限制 fallback UI 切换频率（500ms 内不重复切换），避免频繁闪烁
const FALLBACK_THROTTLE_MS: number = 500

const subtreeRenderLanesCursor: StackCursor<Lanes> = createCursor(NoLanes)

export let subtreeRenderLanes: Lanes = NoLanes

export function markCommitTimeOfFallback() {
    globalMostRecentFallbackTime = now();
}

// 请求当前事件时间戳
export function requestEventTime() {
    // 如果处于渲染或则提交阶段，直接返回当前时间戳
    if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        return now()
    }
    // 如果 currentEventTime 有值，则复用 currentEventTime 时间，避免重复计算
    if (currentEventTime !== NoTimestamp) {
        return currentEventTime
    }

    currentEventTime = now()
    return currentEventTime
}

// 获取当前时间戳（浏览器调度使用）
export function getCurrentTime() {
    return now()
}

export function getWorkInProgressRoot(): FiberRoot | null {
    return workInProgressRoot
}

export function popRenderLanes(fiber: Fiber) {
    subtreeRenderLanes = subtreeRenderLanesCursor.current
    popFromStack(subtreeRenderLanesCursor, fiber)
}

// todo
// 请求更新赛道
export function requestUpdateLane(fiber: Fiber): Lane {
    // 1. 判断 fiber 节点是否处于并发模式
    const mode = fiber.mode
    if ((mode & ConcurrentMode) === NoMode) {
        // 若不处于并发模式 (即同步模式)， 直接返回同步最高优先级车道 SyncLane
        // 同步模式下，更新会立即执行，阻塞浏览器绘制，无优先级调度可言
        return SyncLane as Lane
        // 2. 渲染阶段：复用已有车道，避免重复调度    
    } else if (
        !deferRenderPhaseUpdateToNextBatch &&  // 条件1: 未开启「渲染阶段更新延迟到下一批次」的特性（默认关闭
        (executionContext & RenderContext) !== NoContext && // 条件2：当前处于 React 渲染上下文（正在执行组件渲染/调和逻辑）
        workInProgressRootRenderLanes !== NoLanes // 条件3：当前根 Fiber 存在正在处理的渲染车道（有未完成的更新）
    ) {
        // 从已有渲染车道中随机选取一个可用车道（实际是选取有效优先级车道），避免在渲染阶段增加无关车道，防止调度混乱，复用优先级
        return pickArbitraryLane(workInProgressRootRenderLanes)
    }

    // 3. 判断当前更新是否为过度更新，（由 startTransition 触发）
    const isTransition = requestCurrentTransition() !== NoTransition
    if (isTransition) {
        // 5. 若尚未为当前事件分配过度车道，申请一个新的过度车道
        if (currentEventTransitionLane === NoLane) {
            currentEventTransitionLane = claimNextTransitionLane()
        }
        // 返回已分配的过度车道
        return currentEventTransitionLane
    }

    // 4. 获取开发者手动指定的更新优先级
    const updateLane: Lane = getCurrentUpdatePriority()
    // 5. 若存在显式优先级（非 NoLane），直接返回该车道
    if (updateLane !== NoLane) {
        return updateLane
    }
    // 6. 获取当前触发更新的事件类型对应的隐式优先级
    const eventLane: Lane = getCurrentEventPriority()
    // 7. 返回事件对应的车道，作为最终兜底
    return eventLane
}

/**
 * 判断是否是不安全的类组件渲染阶段更新
 *  - 传统模式下不允许在渲染阶段更新
 *  - 并发模式下可以通过特性开关控制
 * 在 React 中，类组件的 render 方法是 “纯函数” 性质的 —— 它应该只根据当前 state 和 props 计算 UI，而不应该执行副作用（如 setState）。如果在 render 阶段（或由 render 触发的方法中）调用 setState，可能会导致：
    -无限渲染循环（setState 触发重新渲染，重新渲染又触发 setState）；
    -渲染结果不一致（状态更新时机与预期不符）
    isUnsafeClassRenderPhaseUpdate 的作用就是检测这种 “在渲染阶段进行的不安全状态更新”，为后续的警告或阻止操作提供判断依据。
 * */
export function isUnsafeClassRenderPhaseUpdate(fiber: Fiber) {
    return (
        // 条件1：是否需要立即处理渲染阶段的更新（非延迟处理）
        (!deferRenderPhaseUpdateToNextBatch || (fiber.mode & ConcurrentMode) === NoMode) &&
        // 条件2：当前是否处于渲染执行上下文
        (executionContext & RenderContext) !== NoContext
    )
}

/**
 * 根据更新的优先级（车道）和当前执行上下文，调度 Fiber 节点的更新任务：
 * - 标记根节点（FiberRoot）存在该优先级的更新；
 * - 检查当前执行阶段（如是否正在渲染），避免重复调度；executionContext 是 React 内部标记当前执行阶段的变量（如渲染阶段 RenderContext、提交阶段 CommitContext 等
 * - 调用 ensureRootIsScheduled 确保根节点被正确调度（同步执行或异步延迟）；
 * - 特殊处理同步优先级的更新（如传统模式下的更新）
 * */
export function scheduleUpdateOnFiber(
    root: FiberRoot,
    fiber: Fiber,
    lane: Lane,
    eventTime: number
) {
    // 检查嵌套更新（如在 render 中调用 setState 导致的嵌套更新）
    // checkForNestedUpdates()
    markRootUpdated(root, lane, eventTime) // 标记根节点存在该车道的更新，记录事件时间
    // 3. 判断是否处于“渲染上下文”且当前根节点是正在构建的 workInProgress 根, 避免新更新干扰正在进行的渲染过程（防止冲突或无限循环）
    if ((executionContext & RenderContext) !== NoLanes && root === workInProgressRoot) {
        workInProgressRootRenderPhaseUpdatedLanes = mergeLanes(workInProgressRootRenderPhaseUpdatedLanes, lane)
    } else {
        if (root === workInProgressRoot) {
            debugger
        }
        // 5. 核心逻辑：确保根节点被调度执行（根据优先级安排更新）
        ensureRootIsScheduled(root, eventTime)
        // 6. 特殊处理：同步优先级更新且处于非并发模式
        if (
            lane === SyncLane &&  // 更新是同步优先级（最高优先级）
            executionContext === NoContext &&  // 不在任何执行上下文（如事件处理外）
            (fiber.mode & ConcurrentMode) === NoMode  // 非并发模式（传统模式）
        ) {
            debugger
        }
    }
}

function performSyncWorkOnRoot(root) {
    // 性能分析相关：如果启用了性能计时器和嵌套更新阶段分析，同步嵌套更新标志
    if (enableProfilerTimer && enableProfilerNestedUpdatePhase) {
        debugger
    }

    if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        throw new Error('performSyncWorkOnRoot 出错了')
    }

    // 执行所有待处理的被动副作用（如 useEffect 回调）
    flushPassiveEffects()
    // 获取下一组需要处理的优先级通道（lanes）
    let lanes = getNextLanes(root, NoLanes)

    // 检查是否包含同步优先级的通道，如果没有则说明没有同步工作要做
    if (!includesSomeLane(lanes, SyncLane)) {
        // 确保根节点已安排好下一次更新
        ensureRootIsScheduled(root, now())
        return null
    }

    // 以同步方式渲染根节点，返回渲染状态
    let exitStatus: any = renderRootSync(root, lanes)

    // 如果不是 Legacy 根节点且渲染出错，尝试再次渲染
    if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
        // 如果渲染出错，尝试再渲染一次
        // 这次同步渲染会阻止并发数据突变，并包含所有待处理更新
        // 如果第二次尝试仍然失败，就提交当前结果
        const errorRetryLanes = getLanesToRetrySynchronouslyOnError(root)
        if (errorRetryLanes !== NoLanes) {
            lanes = errorRetryLanes
            exitStatus = recoverFromConcurrentError(root, errorRetryLanes)
        }
    }

    // 如果是致命错误状态，处理错误并抛出
    if (exitStatus === RootFatalErrored) {
        const fatalError = workInProgressRootFatalError
        // 准备新的栈，清除当前工作进度
        prepareFreshStack(root, NoLanes)
        // 标记根节点为已暂停
        markRootSuspended(root, lanes)
        // 确保根节点已安排好下一次更新
        ensureRootIsScheduled(root, now())
        // 抛出致命错误
        throw fatalError
    }

    // 如果根节点未完成工作，抛出错误（这是 React 的 bug）
    if (exitStatus === RootDidNotComplete) {
        throw new Error('Root did not complete. This is a bug in React.');
    }
    // 现在我们有了一个一致的 Fiber 树
    // 因为这是同步渲染，即使有内容被挂起（suspended），我们也会提交它
    const finishedWork = root.current.alternate
    root.finishedWork = finishedWork
    root.finishedLanes = lanes

    // 提交根节点的更新（将内存中的 Fiber 树应用到 DOM）
    commitRoot(root, workInProgressRootRecoverableErrors, workInProgressTransitions)

    // 退出前，确保为下一个待处理优先级安排了回调
    ensureRootIsScheduled(root, now())
    return null

}

/**
 * 根据根节点上的更新优先级，调度根节点的更新任务：
 * - 根据根节点上的更新车道（lane）确定最高优先级
 * - 若已有调度任务（如之前安排的低优先级更新），根据新优先级判断是否需要取消旧任务
 * - 按优先级将更新任务交给调度器（Scheduler）:
 *   - 高优先级（如 SyncLane、UserBlockingLane）可能同步执行或尽快执行
 *   - 低优先级（如 NormalLane、IdleLane）可能延迟到浏览器空闲时执行
*/
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
    // 1. 获取根节点上已有的调度任务（可能是之前安排的低优先级任务）
    const existingCallbackNode = root.callbackNode

    markStarvedLanesAsExpired(root, currentTime); // 标记“饥饿”的车道为过期（长时间未执行的低优先级更新）
    // 获取下一批需要处理的车道（根据优先级筛选）
    const nextLanes = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes)
    // 若没有需要处理的车道，取消已有任务并重置根节点状态
    if (nextLanes === NoLanes) {
        if (existingCallbackNode !== null) {
            cancelCallback(existingCallbackNode) // 取消已有任务
        }
        root.callbackNode = null  // 清空回调节点
        root.callbackPriority = NoLane  // 清空回调优先级
        return
    }

    // 3. 获取这批车道中的最高优先级（新任务的优先级）
    const newCallbackPriority = getHighestPriorityLane(nextLanes)
    // 4. 获取根节点上已有的回调任务的优先级
    const existingCallbackPriority = root.callbackPriority
    // 5. 若已有调度任务，取消它（避免低优先级任务干扰新的高优先级任务）
    if (existingCallbackNode !== null) {
        cancelIdleCallback(existingCallbackNode)
    }

    // 6. 根据新任务的优先级，决定调度方式（同步或并发）
    let newCallbackNode
    if (newCallbackPriority === SyncLane) {
        // 6.1 同步优先级任务（最高优先级，如传统模式下的 setState）
        if (root.tag === LegacyRoot) {
            scheduleLegacySyncCallback(performSyncWorkOnRoot.bind(null, root))
        } else {
            scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root))
        }
        if (supportsMicrotasks) {
            scheduleMicrotask(() => {
                if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
                    flushSyncCallbacks()
                }
            })
        } else {
            scheduleCallback(ImmediateSchedulerPriority, flushSyncCallbacks);
        }
        newCallbackNode = null
    } else {
        // 6.2 并发优先级任务（非同步，如并发模式下的低优先级更新）
        // 6.2.1 将车道优先级映射到调度器优先级
        let schedulerPriorityLevel
        switch (lanesToEventPriority(nextLanes)) {
            case DiscreteEventPriority:  // 离散事件（如点击、按键）
                schedulerPriorityLevel = ImmediateSchedulerPriority // 立即优先级
                break
            case ContinuousEventPriority: // 连续事件（如滚动、拖拽）
                schedulerPriorityLevel = UserBlockingSchedulerPriority // 用户阻塞优先级
                break
            case DefaultEventPriority: // 默认事件
                schedulerPriorityLevel = NormalSchedulerPriority // 正常优先级
                break
            case IdleEventPriority: // 空闲事件
                schedulerPriorityLevel = IdleSchedulerPriority // 空闲优先级
                break
            default:
                schedulerPriorityLevel = NormalSchedulerPriority
                break
        }
        // 6.2.2 调度并发更新任务（performConcurrentWorkOnRoot）
        newCallbackNode = scheduleCallback(schedulerPriorityLevel, performConcurrentWorkOnRoot.bind(null, root))
    }

    // 7. 更新根节点的回调信息（记录当前调度的任务和优先级）
    root.callbackPriority = newCallbackPriority
    root.callbackNode = newCallbackNode
}

function flushPassiveEffects() {
    // 检查是否存在有等待处理的被动效果的根节点（rootWithPendingPassiveEffects 是全局变量）
    if (rootWithPendingPassiveEffects !== null) {
        const root = rootWithPendingPassiveEffects // 缓存根节点（因为后续 flushPassiveEffectsImpl 可能会清空 rootWithPendingPassiveEffects）
        // 缓存并重置“剩余车道”（被动效果处理后剩余的更新优先级）
        // 重置是因为该函数可能从多个地方调用，需要确保状态干净
        const remainingLanes = pendingPassiveEffectsRemainingLanes
        pendingPassiveEffectsRemainingLanes = NoLanes
        // 将被动效果对应的车道（pendingPassiveEffectsLanes）转换为事件优先级
        const renderPriority = lanesToEventPriority(pendingPassiveEffectsLanes)
        // 计算处理被动效果的实际优先级：取“默认事件优先级”和“渲染优先级”中的较低者
        // 目的是避免被动效果处理阻塞更高优先级的任务（如用户输入）
        const priority = lowerEventPriority(DefaultEventPriority, renderPriority)
        // 保存当前的过渡配置（ReactCurrentBatchConfig 用于控制批量更新）
        const prevTransition = ReactCurrentBatchConfig.transition
        const previousPriority = getCurrentUpdatePriority() // 保存当前的更新优先级（用于后续恢复）
        try {
            ReactCurrentBatchConfig.transition = null; // 临时禁用过渡配置（被动效果处理不参与过渡）
            setCurrentUpdatePriority(priority); // 设置当前更新优先级为之前计算的较低优先级（避免阻塞高优任务）
            // 调用实际处理被动效果的函数（执行 useEffect 的 cleanup 和回调）, 返回值表示是否真的处理了效果
            return flushPassiveEffectsImpl();
        } finally {
            setCurrentUpdatePriority(previousPriority)
            ReactCurrentBatchConfig.transition = prevTransition
            // releaseRootPooledCache(root, remainingLanes)
        }
    }
    return false
}

function flushPassiveEffectsImpl() {
    if (rootWithPendingPassiveEffects === null) {
        return false
    }
    const transitions = pendingPassiveTransitions
    pendingPassiveTransitions = null

    const root = rootWithPendingPassiveEffects
    const lanes = pendingPassiveEffectsLanes
    rootWithPendingPassiveEffects = null

    pendingPassiveEffectsLanes = NoLanes

    if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        throw new Error('已呈现的被动效果无法刷新。')
    }

    if (enableSchedulingProfiler) {
        debugger
    }
    const prevExecutionContext = executionContext
    executionContext |= CommitContext

    commitPassiveUnmountEffects(root.current)
    commitPassiveMountEffects(root, root.current, lanes, transitions)

    if (enableProfilerTimer && enableProfilerCommitHooks) {
        debugger
    }

    if (enableSchedulingProfiler) {
        debugger
    }

    executionContext = prevExecutionContext
    flushSyncCallbacks()

    if (enableTransitionTracing) {
        debugger
    }
    // onPostCommitRootDevTools(root)

    if (enableProfilerTimer && enableProfilerCommitHooks) {
        debugger
    }

    return true
}

function resetRenderTimer() {
    workInProgressRootRenderTargetTime = now() - RENDER_TIMEOUT_MS
}

/**
 * renderRootConcurrent 是 React18 并发渲染模式下根节点渲染的核心入口函数—— 它的核心作用是：
 * 1. 为指定 FiberRoot 和优先级车道（Lanes）启动 / 恢复并发渲染流程，
 *    处理渲染栈的初始化 / 重置、执行并发工作循环（workLoopConcurrent），捕获渲染过程中的错误，并最终返回根节点的渲染退出状态（如「仍在进行中」「已挂起」等）。
 *    简单说，这个函数是 React 并发模式下「从根节点开始调和 Fiber 树」的总入口，是实现「可中断、可恢复、优先级驱动」渲染的核心
*/
function renderRootConcurrent(root: FiberRoot, lanes: Lanes) {
    // 步骤1：保存并切换执行上下文
    // 1. 保存原执行上下文，标记当前进入「渲染阶段」
    const prevExecutionContext = executionContext
    executionContext |= RenderContext
    // 2. 切换渲染阶段的 Dispatcher 上下文（保证 Hooks 调用正确）
    const prevDispatcher = pushDispatcher()

    // 步骤2：判断是否需要重置渲染栈
    // 条件：当前渲染的根节点/车道与本次不一致 → 需重置栈（重新开始渲染）
    if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
        // 开发工具兼容：恢复待处理的 updaters，清理缓存
        if (enableUpdaterTracking) {
            debugger
        }

        // 1.获取本次车道对应的 Transition 集合（用于优先级控制）
        workInProgressTransitions = getTransitionsForLanes(root, lanes)
        // 2. 重置渲染计时器（Profiler 性能统计）
        resetRenderTimer()
        // 3. 核心操作：清空现有工作栈，从根节点重新准备渲染栈
        prepareFreshStack(root, lanes)
    }
    // 步骤4：执行并发工作循环（核心渲染逻辑）
    do {
        try {
            workLoopConcurrent() // 执行可中断的 Fiber 调和循环
            break // 无异常则退出循环
        } catch (thrownValue) {
            handleError(root, thrownValue) // 捕获渲染阶段错误，交给错误边界处理
        }
    } while (true) // 出错时重试（保证渲染流程不中断）

    resetContextDependencies() // 重置上下文依赖（如 useContext）
    // 步骤5：恢复执行上下文
    popDispatcher(prevDispatcher) // 恢复原 Dispatcher
    executionContext = prevExecutionContext // 恢复原执行上下文

    // 步骤7：判断渲染状态并返回结果
    if (workInProgress !== null) {
        return RootInProgress // 返回「仍在进行中」状态
    } else {
        // workInProgress 为空 → 渲染完成
        // 清空渲染中状态，避免后续混淆
        workInProgressRoot = null
        workInProgressRootRenderLanes = NoLanes
        // 返回最终的根节点退出状态（如 RootCompleted/RootSuspended 等）
        return workInProgressRootExitStatus
    }
}

function workLoopSync() {
    while (workInProgress != null) {
        performUnitOfWork(workInProgress)
    }
}

function workLoopConcurrent() {
    while (workInProgress !== null && !shouldYield()) {
        performUnitOfWork(workInProgress)
    }
}

function performUnitOfWork(unitOfWork: Fiber) {
    const current = unitOfWork.alternate
    let next: any = beginWork(current, unitOfWork, subtreeRenderLanes)
    unitOfWork.memoizedProps = unitOfWork.pendingProps
    if (next === null) {
        console.log('-----completeUnitOfWork-----', unitOfWork.type)
        completeUnitOfWork(unitOfWork)
    } else {
        workInProgress = next
    }

    ReactCurrentOwner.current = null
}

function completeUnitOfWork(unitOfWork: Fiber) {
    let completedWork: any = unitOfWork
    // 循环处理: 从当前节点向上回溯（直到根节点），处理完成逻辑并寻找下一个工作单元
    do {
        // 当前节点在“current 树”中的对应节点（双缓存机制：current 是已提交到 DOM 的树，workInProgress 是内存中正在构建的树）
        const current = completedWork.alternate
        const returnFiber = completedWork.return
        // 1. 检查当前节点是否“未标记为未完成”（即正常完成渲染，无错误或中断）
        if ((completedWork.flags & Incomplete) === NoFlags) {
            // 执行“正常完成逻辑”：处理节点的 DOM 操作、副作用收集、子树状态合并等
            // 返回值 `next` 可能是“需要优先处理的新工作单元”（如 Suspense 恢复后的节点）
            let next = completeWork(current, completedWork, subtreeRenderLanes)
            // 如果存在优先处理的新工作单元，切换到该节点并终止当前循环
            if (next !== null) {
                workInProgress = next
                return
            }
        } else { // 2. 否则：当前节点标记为“未完成”（如渲染中断、出错、Suspense 挂起）
            // 执行“回退逻辑”：清理未完成的状态、恢复 Fiber 树一致性（如撤销部分渲染结果）
            const next: any = unwindWork(current, completedWork, subtreeRenderLanes)
            // 如果回退逻辑返回了需要处理的新节点，切换到该节点并清除非必要标记
            if (next !== null) {
                next.flags &= HostEffectMask // 只保留与 DOM 相关的副作用标记
                workInProgress = next
                return
            }
            // 如果有父节点，将父节点也标记为“未完成”（向上传播中断状态）
            if (returnFiber !== null) {
                returnFiber.flags |= Incomplete  // 父节点标记为未完成
                returnFiber.subtreeFlags = NoFlags // 清空子树副作用标记（子树已中断）
                returnFiber.deletions = null // 清空待删除节点列表（删除操作未完成）
            } else { // 如果没有父节点（已到根节点），标记根节点“未完成”并终止工作
                workInProgressRootExitStatus = RootDidNotComplete // 根节点状态：未完成
                workInProgress = null // 清空当前工作单元
                return
            }
        }
        // 3. 正常完成后，寻找“兄弟节点”（Fiber 树的同级节点，按兄弟顺序处理）
        const siblingFiber = completedWork.sibling
        if (siblingFiber !== null) {
            // 存在兄弟节点：下一个工作单元就是兄弟节点（深度优先遍历的“兄弟优先”逻辑）
            workInProgress = siblingFiber
            return
        }
        // 4. 没有兄弟节点：回溯到父节点，继续处理父节点的完成逻辑（深度优先遍历的“回溯”）
        completedWork = returnFiber
        workInProgress = completedWork // 更新当前工作单元为父节点
    } while (completedWork !== null)

    // 5. 所有节点处理完成（回溯到根节点且无更多工作）：更新根节点状态为“已完成”
    if (workInProgressRootExitStatus === RootInProgress) {
        workInProgressRootExitStatus = RootCompleted
    }
}

/**
 * 为指定 FiberRoot 和优先级车道（Lanes）启动不可中断的同步渲染流程，完成 Fiber 树的调和（Reconciliation），捕获渲染阶段错误，并返回根节点的最终退出状态。
 * 简单说，这个函数是 React 处理「阻塞型更新」（如用户输入、同步 setState）的渲染入口，与你之前了解的 renderRootConcurrent 对应，前者是「同步不可中断」，后者是「并发可中断」。
 * 
*/
function renderRootSync(root: FiberRoot, lanes: Lanes) {
    // 步骤1：切换执行上下文与调度器 
    // 1. 保存原执行上下文，标记当前进入「渲染阶段」
    const prevExecutionContext = executionContext
    executionContext |= RenderContext // 标记当前处于渲染阶段，React 会禁止在该阶段执行提交（Commit）、事件处理等操作，避免状态错乱
    // 2. 切换渲染阶段的 Dispatcher（保证 useState/useEffect 等 Hooks 调用上下文正确）
    const prevDispatcher = pushDispatcher()
    // 步骤2：重置渲染栈（若根节点/车道变化）
    // 
    if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) { // 当前渲染的根节点/车道与本次不一致 → 重新准备渲染栈
        workInProgressTransitions = getTransitionsForLanes(root, lanes) //1. 获取本次车道对应的 Transition 集合（同步模式下通常为空）
        prepareFreshStack(root, lanes) // 2. 核心操作：清空现有工作栈，从根节点重新初始化 workInProgress
    }
    do {
        try {
            workLoopSync()
            break;
        } catch (thrownValue) {
            handleError(root, thrownValue)
        }
    } while (true)
    // 步骤4：清理上下文依赖 
    resetContextDependencies()
    // 步骤5：恢复执行上下文
    executionContext = prevExecutionContext
    popDispatcher(prevDispatcher)
    // 步骤6：清空渲染状态，返回结果
    workInProgressRoot = null
    workInProgressRootRenderLanes = NoLanes
    // 返回根节点最终的退出状态（如完成/出错/挂起）
    return workInProgressRootExitStatus
}

// 为新的渲染周期初始化工作环境（"栈"），清理上一次可能未完成的工作，并设置新的渲染上下文
function prepareFreshStack(root: FiberRoot, lanes: Lanes): Fiber {
    root.finishedWork = null  //存储上一次渲染完成的 Fiber 树结果，这里重置为 null 表示开始新的渲染。
    root.finishedLanes = NoLanes // 存储上一次渲染完成的任务优先级（Lane），重置为 NoLanes（无优先级）。
    // 存储 Suspense 相关的超时任务句柄（如等待数据加载时的超时回调）。
    // 如果存在未完成的超时任务（timeoutHandle !== noTimeout），则取消该任务，避免干扰新的渲染。
    const timeoutHandle = root.timeoutHandle
    if (timeoutHandle !== noTimeout) {
        root.timeoutHandle = noTimeout
        cancelTimeout(timeoutHandle)
    }
    // 如果存在未完成的工作（workInProgress !== null），则向上遍历其祖先节点（interruptedWork = workInProgress.return），通过 unwindInterruptedWork 清理中断状态（如重置副作用标记、恢复优先级等），确保新渲染不受残留状态影响。
    if (workInProgress !== null) {
        let interruptedWork = workInProgress.return
        while (interruptedWork !== null) {
            const current = interruptedWork.alternate
            unwindInterruptedWork(current, interruptedWork, workInProgressRootRenderLanes)
            interruptedWork = interruptedWork.return
        }
    }
    workInProgressRoot = root
    const rootWorkInProgress = createWorkInProgress(root.current, null)
    workInProgress = rootWorkInProgress
    workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes
    workInProgressRootExitStatus = RootInProgress
    workInProgressRootFatalError = null
    workInProgressRootSkippedLanes = NoLanes
    workInProgressRootInterleavedUpdatedLanes = NoLanes
    workInProgressRootRenderPhaseUpdatedLanes = NoLanes
    workInProgressRootPingedLanes = NoLanes
    workInProgressRootConcurrentErrors = null
    workInProgressRootRecoverableErrors = null
    finishQueueingConcurrentUpdates()
    return rootWorkInProgress
}

function pushDispatcher() {
    const prevDispatcher = ReactCurrentDispatcher.current
    ReactCurrentDispatcher.current = ContextOnlyDispatcher
    if (prevDispatcher === null) {
        return ContextOnlyDispatcher
    } else {
        return prevDispatcher
    }
}

function popDispatcher(prevDispatcher) {
    ReactCurrentDispatcher.current = prevDispatcher
}

/**
 * 在并发模式下执行根节点的更新流程
 *  - 处理被动效果（如 useEffect 的清理和执行），避免其干扰后续渲染
 *  - 根据更新优先级（车道，Lane）决定是否启用时间切片（可中断渲染）
 *  - 执行并发渲染（renderRootConcurrent）或同步渲染（renderRootSync）
 *  - 处理渲染过程中的错误（重试或抛出致命错误）
 *  - 确保渲染结果与外部状态（如全局存储）一致
 *  - 完成渲染后准备提交（commit）阶段，并重新调度后续任务
 * 
*/
function performConcurrentWorkOnRoot(root, didTimeout) {
    // 重置当前事件时间和转换车道（当前更新流程独立于后续事件）; 确保当前更新流程不受后续事件的时间戳干扰；
    currentEventTime = NoTimestamp
    currentEventTransitionLane = NoLanes
    // 检查执行上下文：确保当前不在渲染或提交阶段（避免嵌套执行）
    if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        throw new Error('Should not already be working.');
    }
    // 处理所有待执行的被动效果（如 useEffect 的 cleanup 和回调）
    const originalCallbackNode = root.callbackNode
    const didFlushPassiveEffects = flushPassiveEffects()
    if (didFlushPassiveEffects) {
        // 被动效果可能调度了新任务，检查当前任务是否被取消
        if (root.callbackNode !== originalCallbackNode) {
            // 任务已被取消，退出执行
            return null
        }
    }

    let lanes = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes)
    if (lanes === NoLanes) return null
    // 判断是否启用时间切片（可中断渲染）
    const shouldTimeSlice = !includesBlockingLane(root, lanes) &&  // 不包含阻塞车道（如同步优先级）
        !includesExpiredLane(root, lanes) &&  // 不包含过期车道 （长期未执行的低优更新）
        (disableSchedulerTimeoutInWorkLoop || !didTimeout) // 未超时
    // 根据 shouldTimeSlice 选择并发渲染或同步渲染, exitStatus 表示渲染的结果状态（如 “进行中”“完成”“出错” 等），后续逻辑根据状态处理：
    let exitStatus = shouldTimeSlice ? renderRootConcurrent(root, lanes) : renderRootSync(root, lanes)
    if (exitStatus !== RootInProgress) { // 如果渲染已完成或出错
        if (exitStatus === RootErrored) { // 如果渲染出错
            // 尝试同步重试渲染（防止并发数据突变导致的错误）
            const errorRetryLanes = getLanesToRetrySynchronouslyOnError(root)
            if (errorRetryLanes !== NoLanes) {
                lanes = errorRetryLanes
                exitStatus = recoverFromConcurrentError(root, errorRetryLanes) // 同步重试
            }
        }
        if (exitStatus === RootFatalErrored) { // 致命错误
            const fatalError = workInProgressRootFatalError
            prepareFreshStack(root, NoLanes)  // 重置 Fiber 栈
            markRootSuspended(root, lanes)  // 标记根节点为挂起
            ensureRootIsScheduled(root, now()) // 重新调度
            throw fatalError // 抛出致命错误（如无法恢复的异常）
        }
        if (exitStatus === RootDidNotComplete) {
            markRootSuspended(root, lanes);
        } else {
            const renderWasConcurrent = !includesBlockingLane(root, lanes)
            const finishedWork: Fiber = root.current.alternate // 渲染完成，获取最终的 Fiber 树（workInProgress 树）
            if (renderWasConcurrent && !isRenderConsistentWithExternalStores(finishedWork)) { // 检查渲染结果与外部存储的一致性（如 Redux 等全局状态）
                exitStatus = renderRootSync(root, lanes) // 外部存储在并发渲染期间被修改，同步重新渲染（阻塞并发事件）
                if (exitStatus === RootErrored) {
                    const errorRetryLanes = getLanesToRetrySynchronouslyOnError(root)
                    if (errorRetryLanes !== NoLanes) {
                        lanes = errorRetryLanes
                        exitStatus = recoverFromConcurrentError(root, errorRetryLanes)
                    }
                }
                if (exitStatus === RootFatalErrored) {
                    const fatalError = workInProgressRootFatalError
                    prepareFreshStack(root, NoLanes);
                    markRootSuspended(root, lanes);
                    ensureRootIsScheduled(root, now());
                    throw fatalError;
                }
            }
            // 保存完成的工作和车道，准备提交阶段
            root.finishedWork = finishedWork
            root.finishedLanes = lanes
            finishConcurrentRender(root, exitStatus, lanes) //  进入提交准备
        }
    }
    // 确保根节点后续更新被重新调度
    ensureRootIsScheduled(root, now())
    // 若当前任务节点未变，返回绑定的函数作为延续（供调度器继续执行）
    if (root.callbackNode === originalCallbackNode) {
        return performConcurrentWorkOnRoot.bind(null, root)
    }
    return null
}

function commitRoot(
    root: FiberRoot,
    recoverableErrors: null | Array<CapturedValue<any>>,
    transitions: Array<Transition> | null
) {
    const previousUpdateLanePriority = getCurrentUpdatePriority()
    const prevTransition = ReactCurrentBatchConfig.transition

    try {
        ReactCurrentBatchConfig.transition = null
        setCurrentUpdatePriority(DiscreteEventPriority)
        commitRootImpl(root, recoverableErrors, transitions, previousUpdateLanePriority)
    } finally {
        ReactCurrentBatchConfig.transition = prevTransition
        setCurrentUpdatePriority(previousUpdateLanePriority)
    }

    return null
}

function commitRootImpl(
    root: FiberRoot,
    recoverableErrors: null | Array<CapturedValue<any>>,
    transitions: Array<Transition> | null,
    renderPriorityLevel: EventPriority,
) {
    do {
        flushPassiveEffects()
    } while (rootWithPendingPassiveEffects !== null)
    if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        throw new Error('Should not already be working.');
    }
    const finishedWork = root.finishedWork
    const lanes = root.finishedLanes

    if (finishedWork === null) {
        return null
    }

    root.finishedWork = null
    root.finishedLanes = NoLanes

    if (finishedWork === root.current) {
        throw new Error(
            'Cannot commit the same tree as before. This error is likely caused by ' +
            'a bug in React. Please file an issue.',
        );
    }

    root.callbackNode = null
    root.callbackPriority = NoLane

    let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes)
    markRootFinished(root, remainingLanes)

    if (root === workInProgressRoot) {
        workInProgressRoot = null
        workInProgress = null
        workInProgressRootRenderLanes = NoLanes
    }

    if (
        (finishedWork.subtreeFlags & PassiveMask) !== NoFlags ||
        (finishedWork.flags & PassiveMask) !== NoFlags
    ) {
        if (!rootDoesHavePassiveEffects) {
            rootDoesHavePassiveEffects = true
            pendingPassiveEffectsRemainingLanes = remainingLanes
            pendingPassiveTransitions = transitions
            scheduleCallback(NormalSchedulerPriority, () => {
                flushPassiveEffects()
                return null
            })
        }
    }

    const subtreeHasEffects = (finishedWork.subtreeFlags & (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !== NoFlags
    const rootHasEffect = (finishedWork.flags & (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !== NoFlags

    if (subtreeHasEffects || rootHasEffect) {
        const prevTransition = ReactCurrentBatchConfig.transition
        ReactCurrentBatchConfig.transition = null
        const previousPriority = getCurrentUpdatePriority()
        setCurrentUpdatePriority(DiscreteEventPriority)

        const prevExecutionContext = executionContext
        executionContext |= CommitContext

        ReactCurrentOwner.current = null

        const shouldFireAfterActiveInstanceBlur = commitBeforeMutationEffects(root, finishedWork)

        commitMutationEffects(root, finishedWork, lanes)

        resetAfterCommit(root.containerInfo)

        root.current = finishedWork

        commitLayoutEffects(finishedWork, root, lanes)

        requestPaint()
        executionContext = prevExecutionContext
        setCurrentUpdatePriority(previousPriority)
        ReactCurrentBatchConfig.transition = prevTransition
    } else {
        root.current = finishedWork
    }

    const rootDidHavePassiveEffects = rootDoesHavePassiveEffects
    if (rootDoesHavePassiveEffects) {
        rootDoesHavePassiveEffects = false
        rootWithPendingPassiveEffects = root
        pendingPassiveEffectsLanes = lanes
    }

    remainingLanes = root.pendingLanes
    if (remainingLanes === NoLanes) {
        legacyErrorBoundariesThatAlreadyFailed = null
    }

    // onCommitRootDevTools(finishedWork.stateNode, renderPriorityLevel)

    ensureRootIsScheduled(root, now())

    if (recoverableErrors !== null) {
        const onRecoverableError = root.onRecoverableError
        for (let i = 0; i < recoverableErrors.length; i++) {
            const recoverableError = recoverableErrors[i]
            const componentStack = recoverableError.stack
            const digest = recoverableError.digest
            onRecoverableError(recoverableError.value, { componentStack, digest } as any)
        }
    }

    if (hasUncaughtError) {
        hasUncaughtError = false
        const error = firstUncaughtError
        firstUncaughtError = null
        throw error
    }

    if (includesSomeLane(pendingPassiveEffectsLanes, SyncLane) && root.tag !== LegacyRoot) {
        flushPassiveEffects()
    }

    remainingLanes = root.pendingLanes

    if (includesSomeLane(remainingLanes, SyncLane)) {
        if (root === rootWithNestedUpdates) {
            nestedUpdateCount++
        } else {
            nestedUpdateCount = 0
            rootWithNestedUpdates = root
        }
    } else {
        nestedUpdateCount = 0
    }

    flushSyncCallbacks()

    return null
}

export function markSkippedUpdateLanes(lane: Lane | Lanes) {
    workInProgressRootSkippedLanes = mergeLanes(lane, workInProgressRootSkippedLanes)
}

function finishConcurrentRender(root, exitStatus, lanes) {
    switch (exitStatus) {
        case RootInProgress:
        case RootFatalErrored: {
            throw new Error('Root did not complete. This is a bug in React.');
        }
        case RootErrored: {
            debugger
        }
        case RootSuspended: {
            markRootSuspended(root, lanes)
            if (includesOnlyRetries(lanes) && !shouldForceFlushFallbacksInDEV()) {
                const msUntilTimeout = globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now()
                if (msUntilTimeout > 10) {
                    const nextLanes = getNextLanes(root, NoLanes)
                    if (nextLanes !== NoLanes) {
                        break
                    }
                    const suspendedLanes = root.suspendedLanes
                    if (!isSubsetOfLanes(suspendedLanes, lanes)) {
                        const eventTime = requestEventTime()
                        markRootPinged(root, suspendedLanes, eventTime)
                        break
                    }
                    root.timeoutHandle = scheduleTimeout(
                        commitRoot.bind(null, root, workInProgressRootRecoverableErrors, workInProgressTransitions),
                        msUntilTimeout
                    )
                    break
                }
            }
            commitRoot(root, workInProgressRootRecoverableErrors, workInProgressTransitions)
            break
        }
        case RootSuspendedWithDelay: {
            debugger
        }
        case RootCompleted: {
            commitRoot(root, workInProgressRootRecoverableErrors, workInProgressTransitions)
            break
        }
        default: {
            throw new Error('Unknown root exit status.');
        }
    }
}

// React 任务调度
function scheduleCallback(priorityLevel, callback) {
    console.log('-----React---将要开始任务调度了------>', priorityLevel, callback)
    return Scheduler_scheduleCallback(priorityLevel, callback)
}

function cancelCallback(callbackNode) {
    return Scheduler_cancelCallback(callbackNode)
}

function markRootSuspended(root, suspendedLanes) {
    suspendedLanes = removeLanes(suspendedLanes, workInProgressRootPingedLanes)
    suspendedLanes = removeLanes(suspendedLanes, workInProgressRootInterleavedUpdatedLanes)
    markRootSuspended_dontCallThisOneDirectly(root, suspendedLanes)
}

/**
 * isRenderConsistentWithExternalStores 是 React 保证「外部存储（如 Redux/MobX/Context）与组件渲染结果一致」的核心校验函数 —— 它的作用是：
 * 1. 迭代遍历已完成渲染的 Fiber 树，检查所有标记了 StoreConsistency 标记的节点，验证这些节点渲染时读取的外部存储快照，是否与当前外部存储的实际值一致。如果发现不一致，返回 false（触发重新渲染）；如果全量校验通过，返回 true（渲染结果有效）。简单说，这个函数是 React 解决「外部存储变更但组件未重新渲染」问题的关键，确保并发渲染下组件状态与外部数据强一致
*/
function isRenderConsistentWithExternalStores(finishedWork: Fiber): boolean {
    debugger
    return true
}


function handleError(root, thrownValue) {
    console.log('-----捕获到错误------>', thrownValue)
    do {
        let erroredWork = workInProgress
        try {
            resetContextDependencies()
            resetHooksAfterThrow()
            ReactCurrentOwner.current = null
            if (erroredWork === null || erroredWork.return === null) {
                workInProgressRootExitStatus = RootFatalErrored
                workInProgressRootFatalError = thrownValue
                workInProgress = null
                return
            }
            if (enableProfilerTimer && erroredWork.mode & ProfileMode) {
                debugger
            }
            if (enableSchedulingProfiler) {
                markComponentRenderStopped()
                if (thrownValue !== null && typeof thrownValue === 'object' && typeof thrownValue.then === 'function') {
                    const wakeable: Wakeable = thrownValue
                    markComponentSuspended(erroredWork, wakeable, workInProgressRootRenderLanes)
                } else {
                    markComponentErrored(erroredWork, thrownValue, workInProgressRootRenderLanes)
                }
            }

            throwException(root, erroredWork.return, erroredWork, thrownValue, workInProgressRootRenderLanes)
            completeUnitOfWork(erroredWork)
        } catch (yetAnotherThrownValue) {
            thrownValue = yetAnotherThrownValue
            if (workInProgress === erroredWork && erroredWork !== null) {
                erroredWork = erroredWork.return
                workInProgress = erroredWork
            } else {
                erroredWork = workInProgress
            }
            continue
        }
        return
    } while (true)
    // throw new Error(root, thrownValue)
}

export function renderDidSuspend() {
    if (workInProgressRootExitStatus === RootInProgress) {
        workInProgressRootExitStatus = RootSuspended
    }
}

/**
 * renderDidSuspendDelayIfPossible 是 React18 并发渲染中Suspense 挂起延迟调度的核心函数 —— 它的核心作用是：
 * 1. 当渲染流程因 Suspense 挂起 / 出错而未完成时，将根节点的退出状态标记为「带延迟的挂起（RootSuspendedWithDelay）」，并检查是否有被跳过的非空闲优先级更新，若有则标记根节点为挂起，优先处理这些高优先级更新，避免低优先级的 Suspense 挂起阻塞高优先级任务（如用户输入）。简单说，这个函数是 React 实现「挂起延迟 + 优先级插队」的关键，保证并发模式下渲染的响应性。
*/
export function renderDidSuspendDelayIfPossible() {
    // 分支1：更新根节点退出状态为「带延迟的挂起」 ==========
    // 当前渲染处于「进行中」「已挂起」或「已出错」状态
    if (
        workInProgressRootExitStatus === RootInProgress ||
        workInProgressRootExitStatus === RootSuspended ||
        workInProgressRootExitStatus === RootErrored
    ) {
        // 将退出状态改为「带延迟的挂起」→ 告知调度器：先处理其他高优先级任务，再重试本次挂起的渲染
        workInProgressRootExitStatus = RootSuspendedWithDelay
    }

    // 分支2：检查是否有被跳过的高优先级更新 → 标记根节点挂起
    // 检查条件：
    // 1. 存在正在处理的 FiberRoot；
    // 2. 被跳过的车道 或 穿插进来的更新车道 包含「非空闲优先级任务」
    if (workInProgressRoot !== null && (includesNonIdleWork(workInProgressRootSkippedLanes) || includesNonIdleWork(workInProgressRootInterleavedUpdatedLanes))) {
        // 注释核心：
        // 1. 标记当前渲染为挂起，切换到处理被跳过的更新；
        // 2. 通常挂起标记在渲染阶段末尾执行，这里提前标记避免遗漏插队的更新；
        // TODO：应立即标记根节点为挂起，避免渲染中 ping/更新的车道被遗漏

        // 核心操作：标记 FiberRoot 为挂起，传入本次渲染的车道 → 调度器优先处理被跳过的高优先级车道
        markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes)
    }
}

/**
 * pingSuspendedRoot 是 React18 中 Suspense 挂起恢复的核心驱动函数—— 它的核心作用是：
 * 1.当 Suspense 依赖的异步资源（Wakeable，通常是 Promise）解析完成（触发「ping」）时，清理该资源的缓存标记、标记 FiberRoot 为「已被 ping 到」状态，
 *   判断是否需要立即重启当前渲染流程，最后调度根节点重新渲染，让 Suspense 组件从 fallback 切换回主内容。
 *   简单说，这个函数是「异步资源就绪 → Suspense 恢复渲染」的最终执行入口，是你之前问的 attachPingListener 绑定的核心回调函数。
*/
export function pingSuspendedRoot(
    root: FiberRoot,
    wakeable: Wakeable,
    pingedLanes: Lanes
) {
    // 步骤1：清理 pingCache 缓存
    const pingCache = root.pingCache
    if (pingCache !== null) {
        // 注释核心：Wakeable 已解析，无需再缓存（不会被再次抛出），删除缓存避免重复触发
        pingCache.delete(wakeable)
    }
    // 步骤2：标记根节点为「已被 ping 到」
    const eventTime = requestEventTime() // 获取当前事件时间（用于调度优先级）
    markRootPinged(root, pingedLanes, eventTime) // 标记根节点的 pingedLanes，告知调度器资源就绪

    // 步骤4：判断是否需要立即重启当前渲染
    if (
        workInProgressRoot === root &&  // 当前正在渲染的根节点就是该挂起的根节点
        isSubsetOfLanes(workInProgressRootRenderLanes, pingedLanes) // ping 的车道是当前渲染车道的子集（同优先级）
    ) {
        // 注释核心：收到同优先级的 ping，可能需要重启渲染，逻辑需匹配根节点挂起的判断逻辑
        // TODO：同步渲染（Sync/Batched/过期）时不应重启
        // 重启条件：
        // 1. 根节点处于「带延迟的挂起」状态；
        // 2. 根节点处于「普通挂起」且仅包含重试车道，且 fallback 展示时间未超过节流阈值
        if (
            workInProgressRootExitStatus === RootSuspendedWithDelay ||
            (
                workInProgressRootExitStatus === RootSuspended &&
                includesOnlyRetries(workInProgressRootRenderLanes) &&
                now() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS
            )
        ) {
            // 核心操作：重置渲染栈，从根节点重新开始调和（立即重启渲染）
            prepareFreshStack(root, NoLanes)
        } else {
            // 无法立即重启 → 标记当前渲染有 ping 事件，后续有机会再重启
            workInProgressRootPingedLanes = mergeLanes(workInProgressRootPingedLanes, pingedLanes)
        }
    }
    // 步骤5：确保根节点被调度（最终触发重新渲染） 
    ensureRootIsScheduled(root, eventTime)
}

function recoverFromConcurrentError(root, errorRetryLanes) {
    debugger
}

function shouldForceFlushFallbacksInDEV() {
    return false
}


// 捕获提交节点错误
export function captureCommitPhaseError(
    sourceFiber: Fiber,
    nearestMountedAncestor: Fiber | null,
    error: any
) {
    debugger
}

export function batchedUpdates<A, R>(fn: (a: A) => R, a: A): R {
    const prevExecutionContext = executionContext
    executionContext |= BatchedContext
    try {
        return fn(a)
    } finally {
        executionContext = prevExecutionContext
    }
}

export function discreteUpdates<A, B, C, D, R>(
    fn: (a: A, b: B, c: C, d: D) => R,
    a: A,
    b: B,
    c: C,
    d: D
): R {
    debugger
}

/**
 * flushSync 是 React 中强制同步执行更新的核心 API—— 它的核心作用是：
 *  执行传入的回调函数 fn（通常包含 setState 等更新操作），并强制该回调内的所有更新「同步生效」（跳过批处理、使用最高优先级、执行后立即刷新更新队列），同时保证执行前后的上下文 / 优先级状态完全恢复，避免影响其他逻辑。简单说，这个函数是 React 中「打破批处理、强制同步渲染」的关键手段，用于解决「需要立即获取更新后 DOM / 状态」的场景。
 *  完整调用链路：
 *   用户调用 flushSync(fn) → 预处理被动副作用 → 修改上下文/优先级 → 执行 fn → 恢复上下文/优先级 → 强制刷新同步更新队列
*/
export function flushSync(fn) {
    // 步骤1：预处理被动副作用（仅 Legacy 根、无渲染/提交上下文时）
    if (
        rootWithPendingPassiveEffects !== null && // 有待处理的被动副作用
        rootWithPendingPassiveEffects.tag === LegacyRoot &&  // 是 Legacy 根（非 Concurrent 根）
        (executionContext & (RenderContext | CommitContext)) === NoContext  // 不在渲染/提交阶段
    ) {
        // 执行待处理的 useEffect 等副作用
        flushPassiveEffects()
    }
    // 步骤2：保存当前上下文/批处理/优先级状态（用于 finally 恢复）
    const prevExecutionContext = executionContext  // 保存原执行上下文
    executionContext |= BatchedContext  // 开启批处理上下文（先标记，最终强制刷新）
    const prevTransition = ReactCurrentBatchConfig.transition // 保存原过渡配置
    const previousPriority = getCurrentUpdatePriority() // 保存原更新优先级
    try {
        // 步骤3：修改批处理/优先级配置，强制同步更新
        ReactCurrentBatchConfig.transition = null  // 取消过渡更新（避免低优先级）
        setCurrentUpdatePriority(DiscreteEventPriority) // 设为最高优先级（离散事件优先级）
        // 步骤4：执行传入的回调函数，触发更新
        if (fn) {
            return fn() // 执行回调（如包含 setState）
        } else {
            return undefined
        }
    } finally {
        // 步骤5：恢复所有原始状态（无论是否报错，必执行）
        setCurrentUpdatePriority(previousPriority)
        ReactCurrentBatchConfig.transition = prevTransition
        executionContext = prevExecutionContext
        //步骤6：强制刷新同步更新队列（仅在无渲染/提交上下文时）
        if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
            flushSyncCallbacks()
        } else {
        }
    }
}

/**
 * pushRenderLanes 是 React 渲染阶段管理「子树渲染车道（Subtree Render Lanes）」的核心函数—— 它的核心作用是：
 *  1. 将指定 Fiber 节点对应的渲染车道（lanes）「压入」子树渲染车道的栈中，合并更新当前的子树渲染车道集合，同时将这些车道合并到根节点的「已包含车道」中，以此精准控制 Fiber 子树的渲染优先级范围。
 *     简单说，这个函数是 React 实现「子树级优先级隔离」的关键，保证不同 Fiber 子树仅处理自身优先级范围内的更新。
 * 调用链路: beginWork（进入子树调和）→ pushRenderLanes → 压栈原车道 → 合并新车道 → 子树仅处理合并后的车道
*/
export function pushRenderLanes(fiber: Fiber, lanes: Lanes) {
    // 步骤1：将当前 subtreeRenderLanes 和 Fiber 绑定后压入栈，用于后续弹栈恢复
    pushToStack(subtreeRenderLanesCursor, subtreeRenderLanes, fiber)
    // 步骤2：合并当前子树渲染车道与新传入的 lanes，更新 subtreeRenderLanes
    subtreeRenderLanes = mergeLanes(subtreeRenderLanes, lanes)
    // 将新 lanes 合并到根节点已包含的车道集合中，记录本次渲染的所有车道
    workInProgressRootIncludedLanes = mergeLanes(workInProgressRootIncludedLanes, lanes)
}

function prepareToThrowUncaughtError(error: any) {
    if (!hasUncaughtError) {
        hasUncaughtError = true;
        firstUncaughtError = error;
    }
}
export const onUncaughtError = prepareToThrowUncaughtError;

function requestRetryLane(fiber: Fiber) {
    const mode = fiber.mode
    if ((mode & ConcurrentMode) === NoMode) {
        return SyncLane
    }
    return claimNextRetryLane()
}

function retryTimedOutBoundary(boundaryFiber: Fiber, retryLane: Lane) {
    if (retryLane === NoLane) {
        retryLane = requestRetryLane(boundaryFiber)
    }
    const eventTime = requestEventTime()
    const root = enqueueConcurrentRenderForLane(boundaryFiber, retryLane)
    if (root !== null) {
        markRootUpdated(root, retryLane, eventTime)
        ensureRootIsScheduled(root, eventTime)
    }
}

export function resolveRetryWakeable(boundaryFiber: Fiber, wakeable: Wakeable) {
    let retryLane = NoLane
    let retryCache: WeakSet<Wakeable> | Set<Wakeable> | null
    switch (boundaryFiber.tag) {
        case SuspenseComponent:
            retryCache = boundaryFiber.stateNode
            const suspenseState: null | SuspenseState = boundaryFiber.memoizedState
            if (suspenseState !== null) {
                retryLane = suspenseState.retryLane
            }
            break
        case SuspenseListComponent:
            retryCache = boundaryFiber.stateNode
            break
        default:
            throw new Error('resolveRetryWakeable 报错了')
    }
    if (retryCache !== null) {
        retryCache.delete(wakeable)
    }
    retryTimedOutBoundary(boundaryFiber, retryLane)
}