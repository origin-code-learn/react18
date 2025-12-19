import { deferRenderPhaseUpdateToNextBatch, disableSchedulerTimeoutInWorkLoop, enableProfilerCommitHooks, enableProfilerNestedUpdatePhase, enableProfilerTimer, enableSchedulingProfiler, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { getHighestPriorityLane, getLanesToRetrySynchronouslyOnError, getNextLanes, getTransitionsForLanes, includesBlockingLane, includesExpiredLane, includesSomeLane, Lane, Lanes, markRootFinished, markRootUpdated, markStarvedLanesAsExpired, mergeLanes, NoLane, NoLanes, NoTimestamp, SyncLane } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { ConcurrentMode, NoMode } from "./ReactTypeOfMode";
import { 
    scheduleCallback as Scheduler_scheduleCallback,
    cancelCallback as Scheduler_cancelCallback,
    now,
    ImmediatePriority as ImmediateSchedulerPriority,
    UserBlockingPriority as UserBlockingSchedulerPriority,
    NormalPriority as NormalSchedulerPriority,
    IdlePriority as IdleSchedulerPriority,
    requestPaint,
} from "./Scheduler"
import { LegacyRoot } from "./ReactRootTags";
import { ContinuousEventPriority, DefaultEventPriority, DiscreteEventPriority, EventPriority, getCurrentUpdatePriority, IdleEventPriority, lanesToEventPriority, lowerEventPriority, setCurrentUpdatePriority } from "./ReactEventPriorities.old";
import ReactSharedInternals from "shared/ReactSharedInternals";
import { ContextOnlyDispatcher } from "./ReactFiberHooks.old";
import { cancelTimeout, getCurrentEventPriority, noTimeout, resetAfterCommit, scheduleMicrotask, supportsMicrotasks } from "./ReactFiberHostConfig"
import { CapturedValue } from "./ReactCapturedValue";
import { unwindInterruptedWork } from "./ReactFiberUnwindWork.old";
import { createWorkInProgress } from "./ReactFiber.old";
import { finishQueueingConcurrentUpdates } from "./ReactFiberConcurrentUpdates.old";
import { Transition } from "shared/ReactTypes";
import { resetContextDependencies } from "./ReactFiberNewContext.old";
import { beginWork } from "./ReactFiberBeginWork.old";
import { BeforeMutationMask, HostEffectMask, Incomplete, LayoutMask, MutationMask, NoFlags, PassiveMask } from "./ReactFiberFlags";
import { completeWork } from "./ReactFiberCompleteWork.old";
import { commitBeforeMutationEffects, commitLayoutEffects, commitMutationEffects, commitPassiveMountEffects, commitPassiveUnmountEffects } from "./ReactFiberCommitWork.old";
import { flushSyncCallbacks, scheduleLegacySyncCallback, scheduleSyncCallback } from "./ReactFiberSyncTaskQueue.old";

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
const RootInProgress = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;
const RootDidNotComplete = 6;

let executionContext: ExecutionContext = NoContext  // 当前执行上下文
let currentEventTime: number = NoTimestamp  // 当前事件时间戳 和 Lane 赛道（用于过度更新）
let currentEventTransitionLane: Lanes = NoLanes

let workInProgress: Fiber | null = null
let workInProgressRoot: FiberRoot | null = null  // 正在进行的工作根节点 以及其渲染 Lane 赛道
let workInProgressRootRenderLanes: Lanes = NoLanes
let workInProgressRootRenderPhaseUpdatedLanes: Lanes = NoLanes
let workInProgressRootIncludedLanes: Lanes = NoLanes;
let workInProgressRootExitStatus: RootExitStatus = RootInProgress  // 渲染退出状态，初始化为 RootInProgress（表示正在进行）
let workInProgressRootFatalError: any = null // 存储致命错误（如无法恢复的异常）。
let workInProgressRootSkippedLanes: Lanes = NoLanes // 记录本次渲染中跳过的任务优先级。
let workInProgressRootInterleavedUpdatedLanes: Lanes = NoLanes // 记录渲染过程中穿插的新更新优先级。
let workInProgressRootPingedLanes: Lanes = NoLanes // 记录触发重试的优先级（如 Suspense 数据就绪）
let workInProgressTransitions: Array<Transition> | null = null

let workInProgressRootConcurrentErrors: Array<CapturedValue<any>> | null = null
let workInProgressRootRecoverableErrors: Array<CapturedValue<any>> | null = null

let rootDoesHavePassiveEffects: boolean = false;
let rootWithPendingPassiveEffects: FiberRoot | null = null;
let pendingPassiveEffectsLanes: Lanes = NoLanes;
let pendingPassiveProfilerEffects: Array<Fiber> = [];
let pendingPassiveEffectsRemainingLanes: Lanes = NoLanes;
let pendingPassiveTransitions: Array<any> | null = null;

let legacyErrorBoundariesThatAlreadyFailed: Set<any> | null = null;

let hasUncaughtError = false;
let firstUncaughtError = null
let nestedUpdateCount: number = 0;
let rootWithNestedUpdates: FiberRoot | null = null;

export let subtreeRenderLanes: Lanes = NoLanes



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

// todo
// 请求更新赛道
export function requestUpdateLane(fiber: Fiber): Lane {
    const mode = fiber.mode
    if ((mode & ConcurrentMode) === NoMode) {
        return SyncLane as Lane
    }

    // todo

    const updateLane: Lane =  getCurrentUpdatePriority()
    if (updateLane !== NoLane) {
        return updateLane
    }
    const eventLane: Lane = getCurrentEventPriority()
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

function renderRootConcurrent(root: FiberRoot, lanes: Lanes) {
    debugger
}

function workLoopSync() {
    while(workInProgress != null) {
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
            const next = unwindWork(current, completedWork, subtreeRenderLanes)
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

function renderRootSync(root: FiberRoot, lanes: Lanes) {
    const prevExecutionContext = executionContext
    executionContext |= RenderContext
    const prevDispatcher = pushDispatcher()
    if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
        workInProgressTransitions = getTransitionsForLanes(root, lanes)
        prepareFreshStack(root, lanes)
    }
    do {
        try {
            workLoopSync()
            break;
        } catch (thrownValue) {
            handleError(root, thrownValue)
        }
    } while(true)
    resetContextDependencies()
    executionContext = prevExecutionContext
    popDispatcher(prevDispatcher)

    workInProgressRoot = null
    workInProgressRootRenderLanes = NoLanes

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
        while(interruptedWork !== null) {
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
            // markRootSuspended(root, lanes);
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
    } while(rootWithPendingPassiveEffects !== null)
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
        for(let i = 0; i < recoverableErrors.length; i++) {
            const recoverableError = recoverableErrors[i]
            const componentStack = recoverableError.stack
            const digest = recoverableError.digest
            onRecoverableError(recoverableError.value, {componentStack, digest} as any)
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
            debugger
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

function scheduleCallback(priorityLevel, callback) {
    return Scheduler_scheduleCallback(priorityLevel, callback)
}

function cancelCallback(callbackNode) {
    return Scheduler_cancelCallback(callbackNode)
}

function markRootSuspended(root, suspendedLanes) {
    debugger
}

function isRenderConsistentWithExternalStores(finishedWork: Fiber): boolean {
    debugger
    return true
}


function handleError(root, thrownValue) {
    console.log('-----捕获到错误------>')
    throw new Error(root, thrownValue)
}

function recoverFromConcurrentError(root, errorRetryLanes) {
    debugger
}


// 捕获提交节点错误
export function captureCommitPhaseError(
    sourceFiber:Fiber,
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

export function discreteUpdates<A, B, C, D, R> (
    fn: (a: A, b: B, c: C, d: D) => R,
    a: A, 
    b: B, 
    c: C, 
    d: D
): R {
    debugger
}

export function flushSync(fn) {
    debugger
}