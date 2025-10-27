import { Lane, mergeLanes } from "./ReactFiberLane.old";
import { Fiber, FiberRoot } from "./ReactInternalTypes";
import { HostRoot } from "./ReactWorkTags";

import type {
    UpdateQueue as HookQueue,
    Update as HookUpdate,
} from './ReactFiberHooks.old';

import type {
    SharedQueue as ClassQueue,
    Update as ClassUpdate,
} from './ReactFiberClassUpdateQueue.old';

export const unsafe_markUpdateLaneFromFiberToRoot = markUpdateLaneFromFiberToRoot;

let concurrentQueues: Array<HookQueue<any, any> | ClassQueue<any>> | null = null
// 将当前类组件的更新队列加入全局并发更新队列集合， 让 React 调度器（Scheduler）能够统一管理所有并发更新队列，按优先级处理更新。
export function pushConcurrentUpdateQueue(
    queue: HookQueue<any, any> | ClassQueue<any>
) {
    if (concurrentQueues === null) {
        concurrentQueues = [queue]
    } else {
        concurrentQueues.push(queue)
    }
}

/**
 * 从源 Fiber 节点向上遍历到根节点，标记所有祖先节点的 “更新车道”，确保：
 * 1. 每个节点都记录自身或子树中存在的更新优先级；
 * 2. 根节点能感知到整个树中存在的更新，从而触发调度；
 * 3. 后续协调过程中，可通过车道信息快速判断哪些节点需要处理更新（优化性能）
 * 向上遍历的意义：
 *  1. 让每个祖先节点都 “知道” 子树中存在该优先级的更新；
 *  2. 根节点（HostRoot）最终会感知到整个树的更新，从而触发 scheduleUpdateOnFiber 进行调度；
 *  3. 后续协调阶段，父节点可通过 childLanes 快速判断是否需要深入子树处理更新（若 childLanes 中没有高优先级车道，可跳过子树）。
 * */ 
function markUpdateLaneFromFiberToRoot(
    sourceFiber: Fiber,
    lane: Lane
): FiberRoot | null {
    // 1. 标记源 Fiber 自身的 Lanes（自身的更新 lane 集合）
    sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane) // 合并现有车道 和新车道（保留所有优先级）
    let alternate = sourceFiber.alternate  // 处理源 Fiber 的备用节点（alternate 双缓存机制）
    if (alternate !== null) {
        // 备用节点的 lanes 也要合并新车道（确保双缓存一致性）
        alternate.lanes = mergeLanes(alternate.lanes, lane)
    }
    // 3. 向上遍历父节点，标记所有祖先节点的 childLanes（子树更新车道集合）
    let node = sourceFiber
    let parent = sourceFiber.return
    while(parent !== null) {
        // 父节点的 childLanes 记录子树中所有更新的车道（合并当前车道）
        parent.childLanes = mergeLanes(parent.childLanes, lane)
        // 同样处理父节点的备用节点
        alternate = parent.alternate
        if (alternate !== null) {
            alternate.childLanes = mergeLanes(alternate.childLanes, lane)
        }
        // 继续向上遍历
        node = parent
        parent = parent.return
    }
    // 遍历到根节点后，返回根节点对应的 FiberRoot
    if (node.tag === HostRoot) {
        const root: FiberRoot = node.stateNode // // HostRoot 的 stateNode 是 FiberRoot
        return root
    } else {
        return null
    }
}

/**
 * 为并发模式下的类组件更新创建循环链表队列，并传播更新的优先级车道：
 * - 维护类组件更新队列的循环链表结构，支持高效插入更新；
 * - 区分并发更新队列（interleaved）与同步更新队列，确保并发模式下的更新可被中断、优先级排序；
 * - 向上传播更新的优先级车道，触发根节点调度
 * 
 * 
*/
export function enqueueConcurrentClassUpdate<State>(
    fiber: Fiber,
    queue: ClassQueue<State>,
    update: ClassUpdate<State>,
    lane: Lane
) {
    // 获取队列中的并发更新链表（interleaved 是循环链表的尾指针）
    const interleaved = queue.interleaved
    if (interleaved === null) {
        // 2. 若并发队列为空，初始化循环链表
        update.next = update  // 新更新的 next 指向自身（循环链表的起点）
        pushConcurrentUpdateQueue(queue) // 将队列加入全局并发更新队列集合
    } else {
        update.next = interleaved.next
        interleaved.next = update
    }
    // 4. 更新队列的 interleaved 指针为新插入的更新（现在它是尾节点）
    queue.interleaved = update

    // 向上传播更新的车道信息，返回根节点（用于后续调度）
    return markUpdateLaneFromFiberToRoot(fiber, lane)
}

/**
 * 核心背景：React 的并发更新队列设计
 * 在并发渲染模式下，React 可能同时存在多个更新来源（如用户交互、定时器、网络请求等），这些更新会被临时存放在两种队列中：
 *  - pending 队列：主更新队列，存放当前正在处理或等待处理的更新。
 *  - interleaved 队列：交错更新队列，存放并发模式下被中断或延后处理的更新（如低优先级更新被高优先级更新打断后暂存）。
 * 这两种队列均采用循环链表结构（每个节点的 next 指针指向队列中的下一个更新，最后一个节点的 next 指向第一个节点，形成闭环），以高效支持更新的添加和合并。
*/
export function finishQueueingConcurrentUpdates() {
    if (concurrentQueues !== null) {
        for (let i = 0; i < concurrentQueues.length; i++) {
            const queue: any = concurrentQueues[i]
            const lastInterleavedUpdate = queue.interleaved
            if (lastInterleavedUpdate !== null) {
                queue.interleaved = null
                const firstInterleavedUpdate = lastInterleavedUpdate.next
                const lastPendingUpdate = queue.pending
                if (lastPendingUpdate !== null) {
                    const firstPendingUpdate = lastPendingUpdate.next
                    lastPendingUpdate.next = firstInterleavedUpdate
                    lastInterleavedUpdate.next = firstPendingUpdate
                }
                queue.pending = lastInterleavedUpdate
            }
        }
        concurrentQueues = null
    }
}

export function enqueueConcurrentHookUpdate<S, A>(
    fiber: Fiber,
    queue: HookQueue<S, A>,
    update: HookUpdate<S, A>,
    lane: Lane
) {
    //获取队列中交错的更新链表（interleaved 用于存储并发模式下的更新）
    const interleaved = queue.interleaved
    if (interleaved === null) {
        // 如果交错更新队列为空，说明这是第一个更新
        // 创建一个循环链表（更新的 next 指针指向自身）
        update.next = update
        // 在当前渲染结束时，这个队列的交错更新将被转移到 pending 队列
        pushConcurrentUpdateQueue(queue);
    } else {
        // 如果队列不为空，将新更新插入到循环链表中
        // 新更新的 next 指向当前链表的第一个元素（interleaved.next）
        update.next = interleaved.next;
        // 前一个元素的 next 指向新更新，形成新的循环
        interleaved.next = update;
    }

    // 更新队列的 interleaved 指针指向最新加入的更新
    queue.interleaved = update

    // 标记从当前 Fiber 到根节点的更新通道，并返回根节点
    return markUpdateLaneFromFiberToRoot(fiber, lane)
}

export function enqueueConcurrentHookUpdateAndEagerlyBailout<S, A>(
    fiber: Fiber,
    queue: HookQueue<S, A>,
    update: HookUpdate<S, A>,
    lane: Lane
) {
    debugger
}