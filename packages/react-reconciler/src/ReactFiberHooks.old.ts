import { enableLazyContextPropagation, enableNewReconciler } from "shared/ReactFeatureFlags"
import { isSubsetOfLanes, isTransitionLane, Lane, Lanes, mergeLanes, NoLane, NoLanes, removeLanes } from "./ReactFiberLane.old"
import { readContext } from "./ReactFiberNewContext.old"
import { Dispatcher, Fiber, FiberRoot } from "./ReactInternalTypes"
import ReactSharedInternals from "shared/ReactSharedInternals"
import { 
    type HookFlags, 
    HasEffect as HookHasEffect,
    Passive as HookPassive 
} from "./ReactHookEffectTags"
import { MutableSource, MutableSourceGetSnapshotFn, MutableSourceSubscribeFn } from "shared/ReactTypes"
import { markSkippedUpdateLanes, requestEventTime, requestUpdateLane, scheduleUpdateOnFiber } from "./ReactFiberWorkLoop.old"
import { enqueueConcurrentHookUpdate, enqueueConcurrentHookUpdateAndEagerlyBailout } from "./ReactFiberConcurrentUpdates.old"
import is from 'shared/objectIs'
import {
    LayoutStatic as LayoutStaticEffect,
    MountLayoutDev as MountLayoutDevEffect,
    MountPassiveDev as MountPassiveDevEffect,
    Passive as PassiveEffect,
    PassiveStatic as PassiveStaticEffect,
    StaticMask as StaticMaskEffect,
    Update as UpdateEffect,
    StoreConsistency,
} from './ReactFiberFlags';
import { markWorkInProgressReceivedUpdate } from "./ReactFiberBeginWork.old"

const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher

type BasicStateAction<S> = ((s:S) => S) & S
type Dispatch<A> = (a: A) => void

export type Update<S, A> = {
    lane: Lane,
    action: A,
    hasEagerState: boolean,
    eagerState: S | null,
    next: Update<S, A>
}

export type UpdateQueue<S, A> = {
    pending: Update<S, A> | null,
    interleaved: Update<S, A> | null,
    lanes: Lanes,
    dispatch: ((a: A) => unknown) | null,
    lastRenderedReducer: ((s: S, a: A) => S) | null,
    lastRenderedState: S | null
}

export type Hook = {
    memoizedState: any,
    baseState: any,
    baseQueue: Update<any, any> | null,
    queue: any,
    next: Hook | null
}

export type Effect = {
    tag: HookFlags,
    create: () => (() => void) | void,
    destroy: (() => void) | void,
    deps: Array<any> | null,
    next: Effect
}

type StoreConsistencyCheck<T> = {
    value: T,
    getSnapshot: () => T
}

export type FunctionComponentUpdateQueue = {
    lastEffect: Effect | null,
    stores: Array<StoreConsistencyCheck<any>> | null,
}

// 局部计数器，用于追踪 `useId` 钩子的调用次数
let localIdCounter: number = 0;
let renderLanes: Lanes = NoLanes;
let currentlyRenderingFiber: Fiber = null as any;
let didScheduleRenderPhaseUpdateDuringThisPass: boolean = false
let currentHook: Hook | null = null
let workInProgressHook: Hook | null = null
let didScheduleRenderPhaseUpdate: boolean = false

// React hook.deps 比较逻辑
function areHookInputsEqual(
    nextDeps: Array<any>,
    prevDeps: Array<any> | null
): boolean {
    if (prevDeps === null) {
        return false
    }

    for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
        if (is(nextDeps[i], prevDeps[i])) {
            continue
        }
        return false
    }
    return true
}

function basicStateReducer<S>(state: S, action: BasicStateAction<S>): S {
    return typeof action === 'function' ? action(state) : action
}

function isRenderPhaseUpdate(fiber: Fiber) {
    const alternate = fiber.alternate
    return (fiber === currentlyRenderingFiber || alternate !== null && alternate === currentlyRenderingFiber)
}

function createFunctionComponentUpdateQueue(): FunctionComponentUpdateQueue {
    return {
        lastEffect: null,
        stores: null
    }
}

function pushEffect(tag, create, destroy, deps) {
    const effect: Effect = {
        tag,
        create,
        destroy,
        deps,
        next: null as any
    }
    let componentUpdateQueue: null | FunctionComponentUpdateQueue = (currentlyRenderingFiber.updateQueue as any)
    if (componentUpdateQueue === null) {
        componentUpdateQueue = createFunctionComponentUpdateQueue()
        currentlyRenderingFiber.updateQueue = (componentUpdateQueue as any)
        componentUpdateQueue.lastEffect = effect.next = effect
    } else {
        const lastEffect = componentUpdateQueue.lastEffect
        if (lastEffect === null) {
            componentUpdateQueue.lastEffect = effect.next = effect
        } else {
            const firstEffect = lastEffect.next
            lastEffect.next = effect
            effect.next = firstEffect
            componentUpdateQueue.lastEffect = effect
        }
    }
    return effect
}

function entangleTransitionUpdate<S, A>(
    root: FiberRoot,
    queue: UpdateQueue<S, A>,
    lane: Lane
) {
    if (isTransitionLane(lane)) {
        debugger
    }
}

function dispatchSetState<S, A>(
    fiber: Fiber,
    queue: UpdateQueue<S, A>,
    action: A
) {
    // 根据当前 Fiber 节点获取合适的更新优先级（lane 表示优先级通道）
    const lane = requestUpdateLane(fiber)
    // 创建一个更新对象，包含此次更新的信息
    const update: Update<S, A> = {
        lane,    // 此次更新的优先级
        action,   // 要执行的更新操作
        hasEagerState: false, // 是否已经提前计算过新状态
        eagerState: null,  // 提前计算的新状态（用于优化）
        next: null as any  // 指向下一个更新的指针（形成更新队列）
    }

    // 判断当前是否处于渲染阶段（如在 render 函数中调用 setState）
    if(isRenderPhaseUpdate(fiber)) {
        // 将更新加入渲染阶段的更新队列
        enqueueRenderPhaseUpdate(queue, update)
    } else {  // 检查当前 Fiber 及其备用节点是否没有等待处理的更新
        const alternate = fiber.alternate
        // 队列当前为空，可以在进入渲染阶段前提前计算下一个状态，如果新状态与当前状态相同，可能可以完全跳过更新
        if (fiber.lanes === NoLanes && (alternate === null || alternate.lanes === NoLanes)) {
            const lastRenderedReducer = queue.lastRenderedReducer
            if(lastRenderedReducer !== null) {
                let prevDispatcher
                try {
                    // 获取当前渲染的状态
                    const currentState: S = queue.lastRenderedState as any
                    const eagerState = lastRenderedReducer(currentState, action) // 提前计算新状态（eager computation 优化）
                    // 存储提前计算的结果，供后续使用
                    update.hasEagerState = true
                    update.eagerState = eagerState
                    // 检查新状态是否与当前状态相同（使用 React 内部的 is 方法比较）
                    if (is(eagerState, currentState)) {
                        // 快速路径：如果状态未改变，可以跳过重新渲染
                        // 但仍需将更新加入队列，以防后续因其他原因重新渲染时需要
                        enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update, lane)
                        return
                    }
                } catch (error) {

                } finally {

                }
            }

        }
        // 将更新加入并发模式下的 Hook 更新队列，并返回对应的根节点
        const root: any = enqueueConcurrentHookUpdate(fiber, queue, update, lane)
        if (root !== null) {
            // 获取事件时间戳，用于优先级排序
            const eventTime = requestEventTime()
            // 调度 Fiber 节点的更新
            scheduleUpdateOnFiber(root, fiber, lane, eventTime)
            // 将过渡更新与当前更新关联（处理 Suspense 等场景）
            entangleTransitionUpdate(root, queue, lane)
        }
    }
}

function enqueueRenderPhaseUpdate<S, A>(
    queue: UpdateQueue<S, A>,
    update: Update<S, A>
) {
    debugger
}

// 检测组件渲染过程中是否调用过 useId 钩子的辅助函数
export function checkDidRenderIdHook() {
    const didRenderIdHook = localIdCounter !== 0
    localIdCounter = 0
    return didRenderIdHook
}

function mountWorkInProgressHook(): Hook {
    const hook: Hook = {
        memoizedState: null,
        baseState: null,
        baseQueue: null,
        queue: null,
        next: null
    }

    // 构建 hooks 链表
    if (workInProgressHook === null) {
        currentlyRenderingFiber.memoizedState = workInProgressHook = hook
    } else {
        workInProgressHook = workInProgressHook.next = hook
    }
    return workInProgressHook
}

function mountCallback<T>(callback: T, deps: Array<any> | void | null): T {
    debugger
}

function mountEffectImpl(
    fiberFlags, 
    hookFlags: HookFlags,
    create: () => (() => void) | void,
    deps: Array<any> | void | null
) {
    const hook = mountWorkInProgressHook()
    const nextDeps = deps === undefined ? null : deps
    currentlyRenderingFiber.flags |= fiberFlags
    hook.memoizedState = pushEffect(
        HookHasEffect | hookFlags,
        create,
        undefined,
        nextDeps
    )
}

function mountEffect(create: () => (() => void) | void, deps: Array<any> | void | null) {
    return mountEffectImpl(
        PassiveEffect | PassiveStaticEffect,
        HookPassive,
        create,
        deps
    )
}

function mountImperativeHandle<T>(
    ref: { current: T | null } | ((inst: T | null) => any) | null | void,
    create: () => T,
    deps: Array<any> | void | null
) {
    debugger
}

function mountLayoutEffect(
    create: () => (() => void) | void,
    deps: Array<any> | void | null
): void {
    debugger
}

function mountInsertionEffect(
    create: () => (() => void) | void,
    deps: Array<any> | void | null
) {
    debugger
}

function mountMemo<T>(
    nextCreate: () => T,
    deps: Array<any> | void | null
): T {
    debugger
}

function mountReducer<S, I, A>(
    reducer: (S, A) => S,
    initialArg: I,
    init?: (i: I) => S
): [S, Dispatch<A>] {
    debugger
}

function mountRef<T>(initialValue: T): { current: T } {
    debugger
}

function mountState<S>(
    initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
    const hook = mountWorkInProgressHook()
    if (typeof initialState === 'function') {
        initialState = (initialState as () => S)()
    }
    hook.memoizedState = hook.baseState = initialState
    const queue: UpdateQueue<S, BasicStateAction<S>> = {
        pending: null,
        interleaved: null,
        lanes: NoLanes,
        dispatch: null,
        lastRenderedReducer: basicStateReducer,
        lastRenderedState: initialState
    }

    hook.queue = queue
    const dispatch: Dispatch<BasicStateAction<S>> = queue.dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue as any)
    return [hook.memoizedState, dispatch]
}

function mountDeferredValue<T>(value: T): T {
    debugger
    return value
}

function mountTransition(): [boolean, (callback: () => void, options?: StartTransitionOptions) => void] {
    debugger
    
}

function mountMutableSource<Source, Snapshot>(
    source: MutableSource<Source>,
    getSnapshot: MutableSourceGetSnapshotFn<Source, Snapshot>,
    subscribe: MutableSourceSubscribeFn<Source, Snapshot>,
): Snapshot {
    debugger
}

function updateWorkInProgressHook(): Hook {
    let nextCurrentHook: null | Hook
    if (currentHook === null) {
        const current = currentlyRenderingFiber.alternate
        if (current !== null) {
            nextCurrentHook = current.memoizedState
        } else {
            nextCurrentHook = null
        }
    } else {
        nextCurrentHook = currentHook.next
    }

    let nextWorkInProgressHook: null | Hook
    if (workInProgressHook === null) {
        nextWorkInProgressHook = currentlyRenderingFiber.memoizedState
    } else {
        nextWorkInProgressHook = workInProgressHook.next
    }

    if (nextWorkInProgressHook !== null) {
        workInProgressHook = nextWorkInProgressHook
        nextWorkInProgressHook = workInProgressHook.next
        currentHook = nextCurrentHook
    } else {
        if (nextCurrentHook === null) {
            throw new Error('Rendered more hooks than during the previous render')
        }
        currentHook = nextCurrentHook
        const newHook: Hook = {
            memoizedState: currentHook.memoizedState,
            baseState: currentHook.baseState,
            baseQueue: currentHook.baseQueue,
            queue: currentHook.queue,
            next: null
        }

        if (workInProgressHook === null) {
            currentlyRenderingFiber.memoizedState = workInProgressHook = newHook
        } else {
            workInProgressHook = workInProgressHook.next = newHook
        }
    }

    return workInProgressHook as Hook
}

function updateEffectImpl(fiberFlags, hookFlags, create, deps): void {
    const hook = updateWorkInProgressHook()
    const nextDeps = deps === undefined ? null : deps
    let destroy = undefined
    if (currentHook !== null) {
        const prevEffect = currentHook.memoizedState
        destroy = prevEffect.destroy
        if (nextDeps !== null) {
            const prevDeps = prevEffect.deps
            if (areHookInputsEqual(nextDeps, prevDeps)) {
                hook.memoizedState = pushEffect(hookFlags, create, destroy, nextDeps)
                return
            }
        }
    }
    currentlyRenderingFiber.flags |= fiberFlags
    hook.memoizedState = pushEffect(HookHasEffect | hookFlags, create, destroy, nextDeps)
}

/**
 * 初始化同步外部存储钩子（挂载阶段）
 * @param subscribe - 订阅函数，接收一个更新回调，返回取消订阅的函数
 * @param getSnapshot - 获取当前存储快照的函数，返回快照值
 * @param getServerSnapshot - 可选，获取服务端渲染时的初始快照的函数
 * @returns 外部存储的当前快照值
 */
function mountSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
): T {
    debugger;
    // 实际实现会在这里处理订阅逻辑并返回初始快照
    // 例如：
    // const initialSnapshot = getServerSnapshot ? getServerSnapshot() : getSnapshot();
    // 订阅外部存储变化，触发更新时调用 onStoreChange
    // return initialSnapshot;
}

function mountId(): string {
    debugger
}

function updateCallback<T>(callback: T, deps: Array<any> | void | null): T {
    debugger
}

function updateEffect(
    create: () => (() => void) | void,
    deps: Array<any> | void | null
): void {
    return updateEffectImpl(PassiveEffect, HookPassive, create, deps)
}

function updateImperativeHandle<T>(
    ref: { current: T | null } | ((inst: T | null) => any) | null | void,
    create: () => T,
    deps: Array<any> | void | null
): void {
    debugger
}

function updateInsertionEffect(
    create: () => (() => void) | void,
    deps: Array<any> | void | null
): void {
    debugger
}

function updateLayoutEffect(
    create: () => (() => void) | void,
    deps: Array<any> | void | null
): void {
    debugger
}

function updateMemo<T>(
    nextCreate: () => T,
    deps: Array<any> | void | null
): T {
    debugger
}

function updateReducer<S, I, A>(
    reducer: (s: S, a: A) => S,
    initialArg: I,
    init?: (i: I) => S
): [S, Dispatch<A>] {
    // 获取当前正在处理的 Hook 对象（与当前 Fiber 节点相关）
    const hook = updateWorkInProgressHook()
    const queue = hook.queue // 获取Hook 的更新队列
    // 检验队列是否存在 （React 内部一致性检查）
    if (queue === null) {
        throw new Error('Should have a queue. This is likely a bug in React. Please file an issue.')
    }
    // 更新队列中记录的最后一次渲染使用的 reducer
    queue.lastRenderedReducer = reducer
    // 获取当前已提交到 DOM 的 Hook 状态（current 树中的对应节点）
    const current: Hook = currentHook as any
    let baseQueue = current.baseQueue  // 获取基础更新队列（上次渲染未处理完的更新）
    const pendingQueue = queue.pending  // 获取待处理的更新队列（新产生的更新）
    // 如果存在待处理的更新，将其合并到基础更新队列中
    if (pendingQueue !== null) {
        if (baseQueue !== null) {
            // 合并两个循环链表：
            // 1. 基础队列的 next 指向待处理队列的第一个元素
            // 2. 待处理队列的 next 指向基础队列的第一个元素
            const baseFirst = baseQueue.next
            const pendingFirst = pendingQueue.next
            baseQueue.next = pendingFirst
            pendingQueue.next = baseFirst
        }
        // 更新基础队列为合并后的队列
        current.baseQueue = baseQueue = pendingQueue
        // 清空待处理队列
        queue.pending = null
    }

    // 如果存在需要处理的更新队列
    if (baseQueue !== null) {
        const first = baseQueue.next // 获取队列中的第一个更新
        let newState = current.baseState  // 从基础状态开始计算
        let newBaseState: any = null  // 新的基础状态
        let newBaseQueueFirst: any = null // 新基础队列的头
        let newBaseQueueLast: any = null // 新基础队列的尾
        let update = first // 当前正在处理的更新

        // 遍历循环更新队列（直到回到起点）
        do {
            const updateLane = update.lane // 当前更新的优先级通道
            // 检查当前更新的优先级是否在本次渲染的优先级范围内
            if (!isSubsetOfLanes(renderLanes, updateLane)) {
                // 优先级不够：将此更新放入新的基础队列（留到下次处理）
                const clone: Update<S, A> = {
                    lane: updateLane,
                    action: update.action,
                    hasEagerState: update.hasEagerState,
                    eagerState: update.eagerState,
                    next: null as any
                }
                // 构建新的基础队列（循环链表）
                if (newBaseQueueFirst === null) {
                    newBaseQueueFirst = newBaseQueueLast = clone
                    newBaseState = newState // 记录当前状态作为新的基础状态
                } else {
                    newBaseQueueLast = newBaseQueueLast.next = clone
                }
                // 将此更新优先级合并到当前 Fiber 的 lanes 中（确保下次能处理）
                currentlyRenderingFiber.lanes = mergeLanes(currentlyRenderingFiber.lanes, updateLane)
                // 标记此更新通道为已跳过
                markSkippedUpdateLanes(updateLane)
            } else {
                // 优先级足够：处理此更新
                // 如果已有未处理的低优先级更新，克隆当前更新并清除优先级（已处理）
                if (newBaseQueueLast !== null) {
                    const clone: Update<S, A> = {
                        lane: NoLane,
                        action: update.action,
                        hasEagerState: update.hasEagerState,
                        eagerState: update.eagerState,
                        next: null as any
                    }
                    newBaseQueueLast = newBaseQueueLast.next = clone
                }
                // 计算新状态：如果有提前计算的状态（eagerState）则直接使用，否则调用 reducer
                if (update.hasEagerState) {
                    newState = update.eagerState
                } else {
                    const action = update.action
                    newState = reducer(newState, action)
                }
            }
            // 处理下一个更新
            update = update.next
        } while(update !== null && update !== first) // 循环结束条件

        // 处理新的基础队列
        if (newBaseQueueLast === null) {
            // 没有剩余的低优先级更新，新基础状态就是最终状态
            newBaseState = newState
        } else {
            // 形成循环链表
            newBaseQueueLast.next = newBaseQueueFirst
        }

        // 如果计算出的新状态与当前记忆化状态不同，标记当前 Fiber 有更新
        if (!is(newState, hook.memoizedState)) {
            markWorkInProgressReceivedUpdate()
        }

        // 更新 Hook 的状态
        hook.memoizedState = newState
        hook.baseState = newBaseState
        hook.baseQueue = newBaseQueueLast

        // 更新队列中记录的最后渲染状态
        queue.lastRenderedState = newState
    }
    // 处理交错更新队列（并发模式下的特殊情况）
    const lastInterleaved = queue.interleaved
    if (lastInterleaved !== null) {
        debugger
    } else if (baseQueue === null) {
        // 如果没有基础队列，清空队列的优先级标记
        queue.lanes = NoLanes
    }
    // 获取 dispatch 函数并返回 [状态, dispatch]
    const dispatch: Dispatch<A> = queue.dispatch
    return [hook.memoizedState, dispatch]
}

function updateRef<T>(initialValue: T): { current: T } {
    debugger
}

function updateState<S>(
    initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>]{
    return updateReducer(basicStateReducer, initialState)
}

function updateDeferredValue<T>(value: T): T {
    debugger
}

function updateTransition(): [boolean, (callback: () => void, options?: StartTransitionOptions) => void] {
    debugger
    
}

function updateMutableSource<Source, Snapshot>(
    source: MutableSource<Source>,
    getSnapshot: MutableSourceGetSnapshotFn<Source, Snapshot>,
    subscribe: MutableSourceSubscribeFn<Source, Snapshot>,
): Snapshot {
    debugger
}

function updateSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
): T {
    debugger;
    // 实际实现会在这里处理订阅逻辑并返回初始快照
    // 例如：
    // const initialSnapshot = getServerSnapshot ? getServerSnapshot() : getSnapshot();
    // 订阅外部存储变化，触发更新时调用 onStoreChange
    // return initialSnapshot;
}

function updateId(): string {
    debugger
}

export function bailoutHooks(
    current: Fiber,
    workInProgress: Fiber,
    lanes: Lanes
) {
    workInProgress.updateQueue = current.updateQueue
    workInProgress.flags &= ~(PassiveEffect | UpdateEffect)
    current.lanes = removeLanes(current.lanes, lanes)
}


function mountDebugValue<T>(value: T, formatterFn?: (value: T) => any): void {}
const updateDebugValue = mountDebugValue

/**
 * renderWithHooks: 负责在 Fiber 节点渲染过程中初始化和管理 Hooks 系统。它是连接 React 组件渲染与 Hooks 机制的桥梁，确保 Hooks 能按正确顺序执行并与组件状态关联。
 *
*/
export function renderWithHooks<Props, SecondArg>(
    current: Fiber | null,
    workInProgress: Fiber,
    Component: (p: Props, arg: SecondArg) => any,
    props: Props,
    secondArg: SecondArg,
    nextRenderLanes: Lanes
) {
    renderLanes = nextRenderLanes // 设置当前渲染优先级
    currentlyRenderingFiber = workInProgress // 标记当前正在渲染的 Fiber 节点

    // 重置工作中 Fiber 节点的 Hooks 相关状态
    workInProgress.memoizedState = null  // 清空记忆化状态
    workInProgress.updateQueue = null  // 清空更新队列
    workInProgress.lanes = NoLanes  // 清空优先级赛道
    // 根据组件是否首次渲染，选择不同的 hooks 调度器， 首次渲染（current 不存在或无记化状态）使用挂载阶段的调度器，更新阶段使用更新阶段的调度器
    ReactCurrentDispatcher.current = (current === null || current.memoizedState === null) ? HooksDispatcherOnMount : HooksDispatcherOnUpdate
    let children = Component(props, secondArg)
    
    // 处理渲染阶段可能发生的更新（如在 render中调用 setState）
    if (didScheduleRenderPhaseUpdateDuringThisPass) {
        debugger
    }

    // 重置 Hooks 调度器，防止组件外非法调用 Hooks
    ReactCurrentDispatcher.current = ContextOnlyDispatcher
    // 检查 Hooks 调用数量是否一致 （React 要求每次渲染 Hooks 调用顺序和数量必须相同）
    const didRenderTooFewHooks = currentHook !== null && currentHook.next !== null

    // 清理渲染相关的全局变量
    renderLanes = NoLanes
    currentlyRenderingFiber = null as any
    currentHook = null
    workInProgressHook = null
    didScheduleRenderPhaseUpdate = false

    // 如果本次渲染的 Hooks 数量少于上次，抛出错误
    if (didRenderTooFewHooks) {
        throw new Error(
            'Rendered fewer hooks than expected. This may be caused by an accidental early return statement.',
        )
    }

    // 延迟上下文传播相关逻辑（React 内部优化）
    if (enableLazyContextPropagation) {
        debugger
    }
    
    // 返回组件渲染产生的子节点
    return children
}

export const ContextOnlyDispatcher: Dispatcher = {
    readContext,
    useCallback: throwInvalidHookError,
    useContext: throwInvalidHookError,
    useEffect: throwInvalidHookError,
    useImperativeHandle: throwInvalidHookError,
    useInsertionEffect: throwInvalidHookError,
    useLayoutEffect: throwInvalidHookError,
    useMemo: throwInvalidHookError,
    useReducer: throwInvalidHookError,
    useRef: throwInvalidHookError,
    useState: throwInvalidHookError,
    useDebugValue: throwInvalidHookError,
    useDeferredValue: throwInvalidHookError,
    useTransition: throwInvalidHookError,
    useMutableSource: throwInvalidHookError,
    useSyncExternalStore: throwInvalidHookError,
    useId: throwInvalidHookError,

    unstable_isNewReconciler: enableNewReconciler,
}

const HooksDispatcherOnMount: Dispatcher = {
    readContext,
    useCallback: mountCallback,
    useContext: readContext,
    useEffect: mountEffect,
    useImperativeHandle: mountImperativeHandle,
    useLayoutEffect: mountLayoutEffect,
    useInsertionEffect: mountInsertionEffect,
    useMemo: mountMemo,
    useReducer: mountReducer,
    useRef: mountRef,
    useState: mountState,
    useDebugValue: mountDebugValue,
    useDeferredValue: mountDeferredValue,
    useTransition: mountTransition,
    useMutableSource: mountMutableSource,
    useSyncExternalStore: mountSyncExternalStore,
    useId: mountId,
  
    unstable_isNewReconciler: enableNewReconciler,
};

const HooksDispatcherOnUpdate: Dispatcher = {
    readContext,
  
    useCallback: updateCallback,
    useContext: readContext,
    useEffect: updateEffect,
    useImperativeHandle: updateImperativeHandle,
    useInsertionEffect: updateInsertionEffect,
    useLayoutEffect: updateLayoutEffect,
    useMemo: updateMemo,
    useReducer: updateReducer,
    useRef: updateRef,
    useState: updateState,
    useDebugValue: updateDebugValue,
    useDeferredValue: updateDeferredValue,
    useTransition: updateTransition,
    useMutableSource: updateMutableSource,
    useSyncExternalStore: updateSyncExternalStore,
    useId: updateId,
  
    unstable_isNewReconciler: enableNewReconciler,
};

function throwInvalidHookError(): any {
    throw new Error('throwInvalidHookError 发生错误')
}