import { needsStateRestore, restoreStateIfNeeded } from "./ReactDOMControlledComponent";

let isInsideEventHandler = false

let flushSyncImpl = function() {}
let batchedUpdatesImpl = function (fn, bookkeeping, c?: any) {
    return fn(bookkeeping)
}
let discreteUpdatesImpl = function (fn, a, b, c, d) {
    return fn(a, b, c, d)
}

function finishEventHandler() {
    // 1. 检查是否有受控组件需要恢复状态
    // needsStateRestore() 用于判断是否存在未同步到 DOM 的受控组件状态更新
    const controlledComponentsHavePendingUpdates = needsStateRestore();
    if (controlledComponentsHavePendingUpdates) {
        // 2. 若存在待同步的状态，先强制刷新所有等待中的更新
       // flushSyncImpl() 会立即执行所有暂存的同步更新（跳过批量延迟）
       flushSyncImpl()
       restoreStateIfNeeded()
    }
}

// batchedUpdates 是 React 中用于批量处理状态更新的核心函数，它能将多个连续的状态更新（如 setState）合并为一次渲染，避免频繁更新 DOM 导致的性能损耗。这是 React 性能优化的关键机制之一，尤其在事件处理等场景中广泛应用
export function batchedUpdates(fn, a?: any, b?: any) {
    // 1. 检查是否已处于事件处理的批量更新中
    if (isInsideEventHandler) {
        // 若已在批量更新中，直接执行函数（不嵌套开启新的批量模式）
        return fn(a, b)
    }
    // 2. 未处于批量更新中，开启批量模式
    isInsideEventHandler = true
    try {
        // 3. 执行目标函数（函数内的所有状态更新会被批量处理）
        return batchedUpdatesImpl(fn, a, b)
    } finally {
        // 4. 无论函数执行成功与否，最终关闭批量模式
        isInsideEventHandler = false
        // 5. 完成批量更新后，触发最终的渲染更新
        finishEventHandler()
    }
}

export function setBatchingImplementation(
    _batchedUpdatesImpl,
    _discreteUpdatesImpl,
    _flushSyncImpl,
) {
    batchedUpdatesImpl = _batchedUpdatesImpl;
    discreteUpdatesImpl = _discreteUpdatesImpl;
    flushSyncImpl = _flushSyncImpl;
}