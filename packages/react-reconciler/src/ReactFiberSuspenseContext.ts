import { createCursor, pop, push, StackCursor } from "./ReactFiberStack.old";
import { Fiber } from "./ReactInternalTypes";
/**
 * Suspense 组件支持嵌套（如 <Suspense><Suspense>...</Suspense></Suspense>），不同层级的 Suspense 状态会相互影响：
    1.父 Suspense 挂起（显示 fallback）时，子 Suspense 无需重复显示 fallback；
    2.需强制某层 Suspense 显示 fallback（如调试场景）；
    3.React 通过「SuspenseContext + 栈游标」实现嵌套状态的隔离与传递，避免状态混乱。
*/

export type SuspenseContext = number;
export type SubtreeSuspenseContext = number;
export type ShallowSuspenseContext = number;

const DefaultSuspenseContext: SuspenseContext = 0b00;  // 默认上下文：无任何状态（二进制 00）
const SubtreeSuspenseContextMask: SuspenseContext = 0b01;  // 子树上下文掩码：用于提取「子树相关位」（仅关注第 0 位）
export const InvisibleParentSuspenseContext: SubtreeSuspenseContext = 0b01;  // 子树上下文标记：表示「当前 Fiber 有不可见的父 Suspense 边界」（第 0 位为 1）
export const ForceSuspenseFallback: ShallowSuspenseContext = 0b10;  // 浅层上下文标记：表示「强制当前 Suspense 组件显示 fallback」（第 1 位为 1）

// 创建 Suspense 上下文的栈游标，初始值为默认上下文（0b00）
export const suspenseStackCursor: StackCursor<SuspenseContext> = createCursor(DefaultSuspenseContext)

// 检测父上下文是否包含指定的标记（核心工具函数）
export function hasSuspenseContext(parentContext: SuspenseContext, flag: SuspenseContext): boolean {
    return (parentContext & flag) !== 0
}

export function setDefaultShallowSuspenseContext(parentContext: SuspenseContext): SuspenseContext {
    return parentContext & SubtreeSuspenseContextMask
}


export function addSubtreeSuspenseContext(
    parentContext: SuspenseContext,
    subtreeContext: SubtreeSuspenseContext
): SuspenseContext {
    return parentContext | subtreeContext
}

export function pushSuspenseContext(
    fiber: Fiber,
    newContext: SuspenseContext
) {
    push(suspenseStackCursor, newContext, fiber)
}

export function popSuspenseContext(fiber: Fiber) {
    pop(suspenseStackCursor, fiber)
}