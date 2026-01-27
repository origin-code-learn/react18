import assign from "shared/assign";
import { enqueueConcurrentClassUpdate, unsafe_markUpdateLaneFromFiberToRoot } from "./ReactFiberConcurrentUpdates.old";
import { Callback } from "./ReactFiberFlags";
import { isSubsetOfLanes, Lane, Lanes, mergeLanes, NoLane, NoLanes } from "./ReactFiberLane.old";
import { isUnsafeClassRenderPhaseUpdate, markSkippedUpdateLanes } from "./ReactFiberWorkLoop.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";

export type Update<State> = {
    eventTime: number;
    lane: Lane;
    tag: 0 | 1 | 2 | 3;
    payload: any;
    callback: (() => any) | null;
    next: Update<State> | null
}

export type SharedQueue<State> = {
    pending: Update<State> | null;
    interleaved: Update<State> | null;
    lanes: Lanes
}

export type UpdateQueue<State> = {
    baseState: State;
    firstBaseUpdate: Update<State> | null;
    lastBaseUpdate: Update<State> | null;
    shared: SharedQueue<State>;
    effects: Array<Update<State>> | null;
}

export const UpdateState = 0;  // 合并更新（默认的 setState 行为）
export const ReplaceState = 1;  // 替换更新（完全替换旧状态, replaceState 行为, React 并未向开发者暴露 replaceState 方法（仅内部使用），但类组件的 setState 可以通过传入 null 或函数返回全新对象模拟类似效果（但本质不同））
export const ForceUpdate = 2;   // 强制更新（忽略 shouldComponentUpdate）,无论状态或属性是否变化，都会触发组件重新渲染, 调用 this.forceUpdate() 时触发，会跳过 shouldComponentUpdate 生命周期的判断（即使 shouldComponentUpdate 返回 false，依然会渲染）
export const CaptureUpdate = 3; // 捕获阶段更新（错误边界相关）, 表示 “捕获阶段的更新”，仅用于错误边界（Error Boundary） 在捕获子组件错误时更新状态

let hasForceUpdate = false

// 初始化更新队列
export function initializeUpdateQueue<State>(fiber: Fiber) {
    const queue: UpdateQueue<State> = {
        baseState: fiber.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: {
            pending: null,
            interleaved: null,
            lanes: NoLanes
        },
        effects: null
    }
    fiber.updateQueue = queue
}

// 创建 更新对象
export function createUpdate<T>(eventTime: number, lane: Lane): Update<T> {
    const update: Update<T> = {
        eventTime,  // 更新时间
        lane,   // 分配的 Lane 赛道
        tag: UpdateState,  // 更新类型
        payload: null,  // 更新所需的必要参数 payload
        callback: null, // 更新回调
        next: null  // 更新对象的 链表 链接指针
    }
    return update
}

/**
 * 将更新对象加入到 Fiber 节点的更新队列中，并标记更新影响的根节点
 *  - 维护更新队列的结构（循环链表），确保更新能按顺序被处理；
 *  - 区分 “不安全的类组件渲染阶段更新” 和 “并发模式下的更新”，采用不同的入队逻辑；
 *  - 返回更新所影响的根节点（FiberRoot），为后续的调度（scheduleUpdateOnFiber）提供入口
 * */
export function enqueueUpdate<State>(
    fiber: Fiber,
    update: Update<State>,
    lane: Lane
): FiberRoot | null {
    // 获取当前 Fiber 节点的更新队列 updateQueue
    const updateQueue: any = fiber.updateQueue
    if (updateQueue === null) {  // 如果没有更新队列，直接返回 null（无法处理更新）
        return null
    }
    // 获取更新队列中的 共享队列 sharedQueue，共享队列是 Fiber 节点中存储待更新的容器（通常是循环链表结构）
    const sharedQueue: SharedQueue<State> = updateQueue.shared
    // 判断是否为 不安全的类组件渲染更新阶段 （类组件在渲染阶段调用 setState，可能导致重复渲染或不一致）
    if (isUnsafeClassRenderPhaseUpdate(fiber)) {
        // 将更新加入循环链表
        const pending = sharedQueue.pending // 链表尾部指针
        if (pending === null) {
            update.next = update
        } else {
            update.next = pending.next
            pending.next = update
        }
        // 更新 pending 指针为新插入的更新 update，（现在它是最后一个）
        sharedQueue.pending = update
        // 标记从当前 Fiber 到根节点的赛道（优先级），返回根节点
        return unsafe_markUpdateLaneFromFiberToRoot(fiber, lane)
    } else {
        // 非不安全更新（如并发模式下的更新），调用并发模式的入队逻辑
        return enqueueConcurrentClassUpdate(fiber, sharedQueue, update, lane)
    }
}

export function cloneUpdateQueue<State>(current: Fiber, workInProgress: Fiber) {
    const queue: UpdateQueue<State> = workInProgress.updateQueue as any
    const currentQueue: UpdateQueue<State> = current.updateQueue as any
    if (queue === currentQueue) {
        const clone: UpdateQueue<State> = {
            baseState: currentQueue.baseState,
            firstBaseUpdate: currentQueue.firstBaseUpdate,
            lastBaseUpdate: currentQueue.lastBaseUpdate,
            shared: currentQueue.shared,
            effects: currentQueue.effects
        }
        workInProgress.updateQueue = clone
    }
}

function getStateFromUpdate<State>(
    workInProgress: Fiber,       // 当前工作中的 Fiber 节点
    queue: UpdateQueue<State>,   // 组件的更新队列
    update: Update<State>,       // 当前要处理的单个 Update 对象
    prevState: State,            // 组件的旧状态（更新前的 state）
    nextProps: any,              // 组件的新 props（本次渲染的 props）
    instance: any                // 组件实例（类组件为 this，函数组件为 null）
): any {
    switch (update.tag) {
        // 1. 替换整个状态（ReplaceState）：暂未实现（仅调试断点）
        case ReplaceState: {
            debugger
        }
        // 2. 捕获阶段更新（CaptureUpdate）：暂未实现（仅调试断点）
        case CaptureUpdate: {
            debugger
        }
        // 3. 合并状态（UpdateState）：最核心的分支（对应普通 setState）
        case UpdateState: {
            const payload = update.payload
            let partialState
            if (typeof payload === 'function') {
                // 场景1：payload 是函数 → 执行函数，传入 prevState 和 nextProps 计算部分状态
                partialState = payload.call(instance, prevState, nextProps)
            } else {
                // 场景2：payload 是对象 → 直接作为部分状态
                partialState = payload
            }
            // 边界处理：若计算出的部分状态为 null/undefined → 不修改状态，返回旧值
            if (partialState === null || partialState === undefined) {
                return prevState
            }

            return assign({}, prevState, partialState)
        }
        // 4. 强制更新（ForceUpdate）：暂未实现（仅调试断点）
        case ForceUpdate: {
            debugger
        }
    }
    // 未匹配到任何更新类型 → 返回旧状态
    return prevState
}

/**
 * 核心逻辑：将临时存储在 pendingQueue 中的更新合并到基础队列（base queue），并同步到 current 队列（已提交的 Fiber 树的队列），确保更新不会丢失。
 * pendingQueue 设计为循环链表是为了高效地添加新更新（只需修改指针），合并时需要先断开循环。
 * 核心作用：
 *  1. 合并更新队列：将临时 pending 队列的更新合并到基础队列，确保更新不丢失。
 *  2. 优先级筛选：根据当前渲染优先级（renderLanes），只处理高优先级更新，低优先级更新暂存。
 *  3. 状态计算：通过 getStateFromUpdate 应用符合优先级的更新，计算出新的状态
 *  4. 回调管理：收集更新的回调函数，标记 Fiber 节点在 commit 阶段执行这些回调。
 *  5. 状态同步：更新 Fiber 节点的 memoizedState 和未处理优先级，为后续渲染提供基础
 * 
 */
export function processUpdateQueue<State>(
    workInProgress: Fiber,
    props: any,
    instance: any,
    renderLanes: Lanes
) {

    const queue: UpdateQueue<State> = workInProgress.updateQueue as any // 当前节点的更新队列
    hasForceUpdate = false  // 重置强制更新标记

    let firstBaseUpdate = queue.firstBaseUpdate // 基础队列的第一个更新
    let lastBaseUpdate = queue.lastBaseUpdate // 基础队列的最后一个更新
    let pendingQueue = queue.shared.pending // 检查是否有未处理的 pending 更新（如刚通过 setState 加入的更新）
    if (pendingQueue !== null) {
        queue.shared.pending = null // 清空 pending 队列，避免重复处理
        // pending 队列是循环链表，先断开循环（最后一个节点的 next 指向 null）; 需要将 pendingQueue 的循环链剪开 链在 lastBaseUpdate 后面
        const lastPendingUpdate = pendingQueue
        const firstPendingUpdate = lastPendingUpdate?.next
        lastPendingUpdate.next = null
        if (lastBaseUpdate === null) {
            firstBaseUpdate = firstPendingUpdate
        } else {
            lastBaseUpdate.next = firstPendingUpdate
        }
        lastBaseUpdate = lastPendingUpdate

        // 同步更新 current 队列（当前已提交的 Fiber 树的更新队列）
        const current = workInProgress.alternate
        if (current !== null) {
            const currentQueue: UpdateQueue<State> = current.updateQueue as any
            const currentLastBaseUpdate = currentQueue.lastBaseUpdate
            if (currentLastBaseUpdate !== lastBaseUpdate) {
                // 将 pending 更新同步到 current 队列，保证状态一致性
                if (currentLastBaseUpdate === null) {
                    currentQueue.firstBaseUpdate = firstPendingUpdate
                } else {
                    currentLastBaseUpdate.next = firstPendingUpdate
                }
                currentQueue.lastBaseUpdate = lastPendingUpdate
            }
        }
    }

    // 处理基础队列中的更新
    if (firstBaseUpdate !== null) {
        let newState = queue.baseState // 从基础状态开始计算
        let newLanes = NoLanes // 记录未处理的更新优先级

        let newBaseState: State | null = null  // 新的基础状态
        let newFirstBaseUpdate: Update<State> | null = null // 新的基础队列头
        let newLastBaseUpdate: Update<State> | null = null as any // 新的基础队列尾
        let update: Update<State> = firstBaseUpdate
        do {
            const updateLane = update.lane // 当前更新的优先级
            const updateEventTime = update.eventTime // 更新发生的时间
            // 检查当前更新的优先级是否符合本次渲染的优先级（renderLanes）
            if (!isSubsetOfLanes(renderLanes, updateLane)) { // 优先级不足：跳过该更新，将其保留到新的基础队列
                const clone: Update<State> = {
                    eventTime: updateEventTime,
                    lane: updateLane,

                    tag: update.tag,
                    payload: update.payload,
                    callback: update.callback,
                    next: null
                } // 克隆更新对象
                if (newLastBaseUpdate === null) {
                    newFirstBaseUpdate = newLastBaseUpdate = clone
                    newBaseState = newState // 以当前状态作为新的基础状态
                } else {
                    newLastBaseUpdate = newLastBaseUpdate.next = clone
                }

                newLanes = mergeLanes(newLanes, updateLane) // 合并未处理的优先级
            } else { // 优先级足够：处理该更新
                if (newLastBaseUpdate !== null) {
                    const clone: Update<State> = {
                        eventTime: updateEventTime,
                        lane: NoLanes,
                        tag: update.tag,
                        payload: update.payload,
                        callback: update.callback,
                        next: null
                    }

                    newLastBaseUpdate = newLastBaseUpdate.next = clone
                }

                // 应用更新计算新状态（如执行 setState 的 updater 函数）
                newState = getStateFromUpdate(workInProgress, queue, update, newState, props, instance)

                // 处理更新的回调函数（如 setState 的第二个参数）
                const callback = update.callback
                if (callback !== null && update.lane !== NoLane) {
                    workInProgress.flags |= Callback // 标记需要执行回调
                    const effects = queue.effects
                    if (effects === null) {
                        queue.effects = [update]
                    } else {
                        effects.push(update)
                    }
                }
            }

            // 处理下一个更新（处理过程中可能有新的 pending 更新加入）
            update = update.next as any
            if (update === null) {
                // 检查是否有新的 pending 更新（可能在处理更新时被添加）
                pendingQueue = queue.shared.pending
                if (pendingQueue === null) {
                    break; // 没有新更新，退出循环
                } else {
                    // 有新的 pending 更新，合并到队列继续处理
                    const lastPendingUpdate = pendingQueue
                    const firstPendingUpdate = lastPendingUpdate.next
                    lastPendingUpdate.next = null
                    update = firstPendingUpdate as any
                    queue.lastBaseUpdate = lastPendingUpdate
                    queue.shared.pending = null
                }
            }

        } while (true)

        // 确定新的基础状态和基础队列
        if (newLastBaseUpdate === null) {
            newBaseState = newState // 所有更新都已处理，新状态即为基础状态
        }

        // 更新队列的基础信息
        queue.baseState = newBaseState as any
        queue.firstBaseUpdate = newFirstBaseUpdate
        queue.lastBaseUpdate = newLastBaseUpdate

        // 处理交错更新队列（并发模式下被延后的更新）
        const lastInterleaved = queue.shared.interleaved
        if (lastInterleaved !== null) {
            let interleaved = lastInterleaved
            do {
                newLanes = mergeLanes(newLanes, interleaved.lane) // 合并交错更新的优先级
                interleaved = interleaved.next as Update<State>
            } while (interleaved !== lastInterleaved)
        } else if (firstBaseUpdate === null) {
            queue.shared.lanes = NoLanes // 队列为空时重置优先级
        }

        // 更新 Fiber 节点状态
        markSkippedUpdateLanes(newLanes) // 标记未处理的更新优先级
        // 更新当前 Fiber 节点的未处理优先级和最终状态
        workInProgress.lanes = newLanes
        workInProgress.memoizedState = newState
    }
}

/**
 * enqueueCapturedUpdate 是 React 渲染阶段处理「子组件抛出异常时捕获的更新」的核心函数 —— 当子组件渲染抛错，父组件捕获到这个错误并产生需要执行的更新（如 setState）时，该函数会将这个「捕获型更新」安全地加入到 work-in-progress Fiber 的更新队列中，且保证仅作用于当前渲染流程、不污染旧的 current Fiber 队列，是 React 错误边界和渲染阶段异常处理的关键逻辑。
*/
export function enqueueCapturedUpdate<State>(
    workInProgress: Fiber,
    capturedUpdate: Update<State>
) {
    // 注释：捕获型更新是子组件渲染阶段抛出的更新，若渲染被中止则应丢弃
    // 因此仅将其加入 work-in-progress 队列，而非 current 队列（current 是已提交到 DOM 的稳定队列）
    let queue: UpdateQueue<State> = workInProgress.updateQueue as any
    // 第一步：检查 work-in-progress 队列是否与 current 队列共享 ==========
    const current = workInProgress.alternate
    if (current !== null) {
        const currentQueue: UpdateQueue<State> = current.updateQueue as any
        // 关键判断：work-in-progress 队列和 current 队列是否是同一个引用（未克隆）
        if (queue === currentQueue) {
            // 场景：父 Fiber 之前「跳过调和（bailout）」，但子组件抛错导致父组件需要捕获更新
            // 此时 work-in-progress 队列未克隆，直接修改会污染 current 队列 → 必须先克隆队列
            let newFirst: any = null  // 克隆后的更新队列头指针
            let newLast: any = null  // 克隆后的更新队列尾指针
            const firstBaseUpdate = queue.firstBaseUpdate //获取原队列的第一个基础更新
            if (firstBaseUpdate !== null) {
                // 1. 遍历原基础更新队列，逐个克隆 Update 对象（避免修改原队列）
                let update: any = firstBaseUpdate
                do {
                    const clone: Update<State> = {
                        eventTime: update.eventTime,
                        lane: update.lane,
                        tag: update.tag,
                        payload: update.payload,
                        callback: update.callback,
                        next: null
                    }
                    // 构建克隆后的链表
                    if (newLast === null) {
                        newFirst = newLast = clone  // 第一个克隆节点
                    } else {
                        newLast.next = clone  // 追加到链表尾部
                        newLast = clone
                    }
                    update = update.next  // 遍历下一个更新
                } while (update !== null)

                // 2. 将捕获型更新追加到克隆队列的尾部
                if (newLast === null) {
                    newFirst = newLast = capturedUpdate
                } else {
                    newLast.next = capturedUpdate
                    newLast = capturedUpdate
                }
            } else {
                // 原队列无基础更新 → 克隆队列直接以捕获型更新为唯一节点
                newFirst = newLast = capturedUpdate
            }
            // 3. 创建新的更新队列，替换 work-in-progress 的队列（不影响 current）
            queue = {
                baseState: currentQueue.baseState,
                firstBaseUpdate: newFirst,
                lastBaseUpdate: newLast,
                shared: currentQueue.shared,
                effects: currentQueue.effects
            }
            workInProgress.updateQueue = queue
            return
        }
    }

    // 第二步：队列已克隆 → 直接追加捕获型更新到队列尾部 ==========
    const lastBaseUpdate = queue.lastBaseUpdate
    if (lastBaseUpdate === null) {
        queue.firstBaseUpdate = capturedUpdate
    } else {
        lastBaseUpdate.next = capturedUpdate
    }
    queue.lastBaseUpdate = capturedUpdate
}