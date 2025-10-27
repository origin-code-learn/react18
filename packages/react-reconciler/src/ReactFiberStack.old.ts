import { Fiber } from "./ReactInternalTypes"

/**
 * 核心概念：栈游标（Stack Cursor）
 * 在 React 遍历 Fiber 树时（深度优先遍历），需要频繁进入和离开不同的 Fiber 节点。
 * 对于某些全局状态（如当前上下文、工作优先级），需要在「进入节点时保存新状态，
 * 离开节点时恢复旧状态」，这种行为类似函数调用栈的「入栈 - 出栈」操作
 * 
*/
export type StackCursor<T> = { current: T }

const valueStack: Array<any> = []
let fiberStack: Array<Fiber | null> = []

let index = -1

export function createCursor<T>(defaultValue: T): StackCursor<T> {
    return { current: defaultValue }
}

export function isEmpty(fiber: Fiber | null) {
    return index === -1
}

// 出栈操作（恢复状态）
export function pop<T>(cursor: StackCursor<T>, fiber: Fiber | null) {
    if (index < 0) {
        return
    }
    cursor.current = valueStack[index]
    valueStack[index] = null
    index--
}

// 入栈操作（保存并更新状态）
export function push<T>(cursor: StackCursor<T>, value: T, fiber: Fiber | null) {
    index++
    valueStack[index] = cursor.current
    cursor.current = value
}
