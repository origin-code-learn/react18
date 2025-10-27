import { DiscreteEventPriority, getCurrentUpdatePriority, setCurrentUpdatePriority } from "./ReactEventPriorities.old";
import { ImmediatePriority, scheduleCallback, SchedulerCallback } from "./Scheduler";

// 同步回调队列：存储需要同步执行的回调函数
let syncQueue: Array<SchedulerCallback> | null = null;

// 标记队列中是否包含传统模式的同步回调
let includesLegacySyncCallbacks: boolean = false;

// 标记当前是否正在执行同步队列（防止重入）
let isFlushingSyncQueue: boolean = false;


/**
 * flushSyncCallbacks 是 React 中用于同步执行队列中积累的同步回调函数的核心函数。在 React 的更新机制中，某些同步操作（如 flushSync API、离散事件回调等）会将回调函数加入 syncQueue，而本函数负责按顺序执行这些回调，确保同步操作的即时性和执行顺序。
 * 核心背景：同步回调队列的必要性
 *  React 通常采用异步调度更新以提升性能，但在某些场景下（如用户明确使用 flushSync、处理表单提交等关键事件），需要强制同步执行更新和回调，以保证操作的即时性和数据一致性。
 *  syncQueue 就是用于暂存这些需要同步执行的回调函数的队列，flushSyncCallbacks 则是这个队列的 “执行者”，确保队列中的回调按添加顺序依次执行，且执行过程中不会被其他低优先级任务打断。
*/
export function flushSyncCallbacks() {
    // 检查是否正在执行队列，且队列不为空（避免重入和空执行）
    if (!isFlushingSyncQueue && syncQueue !== null) {
        // 标记正在执行队列，防止重入（避免嵌套调用导致的混乱）
        isFlushingSyncQueue = true
        let i = 0
        // 保存当前的更新优先级（用于执行完毕后恢复）
        const previousUpdatePriority = getCurrentUpdatePriority()
        try {
            const isSync = true // 标记当前为同步执行模式
            const queue = syncQueue; // 引用当前的同步队列

            // 将当前更新优先级提升为离散事件优先级（最高优先级之一）
            // 确保同步回调执行时不会被其他任务打断
            setCurrentUpdatePriority(DiscreteEventPriority)
            // 遍历同步队列中的所有回调
            for (; i < queue.length; i++) {
                let callback: any = queue[i]
                // 循环执行回调，直到返回 null（支持回调链式调用）
                do {
                    callback = callback(isSync)
                } while (callback !== null)
            }
            // 清空队列和相关标记
            syncQueue = null
            includesLegacySyncCallbacks = false
        } catch (error) {
            // 若执行过程中出错，保留剩余未执行的回调（从出错位置的下一个开始）
            if (syncQueue !== null) {
                syncQueue = syncQueue.slice(i + 1)
            }
            // 安排在下一个微任务中继续执行剩余回调
            scheduleCallback(ImmediatePriority, flushSyncCallbacks)
            throw error // 抛出错误，让上层处理（如错误边界）
        } finally {
            // 恢复之前的更新优先级
            setCurrentUpdatePriority(previousUpdatePriority);
            // 标记队列执行完毕，允许下次执行
            isFlushingSyncQueue = false;
        }
    }
    return null
}

export function scheduleSyncCallback(callback: SchedulerCallback) {
    if (syncQueue === null) {
        syncQueue = [callback]
    } else {
        syncQueue.push(callback)
    }
}

export function scheduleLegacySyncCallback(callback: SchedulerCallback) {
    includesLegacySyncCallbacks = true
    scheduleSyncCallback(callback)
}