import { Container, getChildHostContext, getRootHostContext, HostContext } from "ReactDOMHostConfig"
import { Fiber } from "./ReactInternalTypes"
import { createCursor, pop, push, StackCursor } from "./ReactFiberStack.old"

declare class NoContextT {}
const NO_CONTEXT: NoContextT = {}

// 用于存储宿主环境上下文（HostContext）的栈游标
const contextStackCursor: StackCursor<HostContext | NoContextT> = createCursor(NO_CONTEXT)
// 用于存储关联 Fiber 节点的栈游标
const contextFiberStackCursor: StackCursor<Fiber | NoContextT> = createCursor(NO_CONTEXT)
// 用于存储根容器实例（Container）的栈游标
const rootInstanceStackCursor: StackCursor<Container | NoContextT> = createCursor(NO_CONTEXT)

function requiredContext<Value>(c: Value | NoContextT): Value {
    if (c === NO_CONTEXT) {
        throw new Error('requiredContext 请求上下文出错了！')
    }
    return c as any
}

/**
 * pushHostContainer 的本质是 **「初始化根容器的上下文栈」**，它在 React 应用初始化渲染或根容器切换时被调用，主要完成：
将根容器实例、关联的 Fiber 节点、宿主环境上下文（如命名空间）推入对应的栈中。
建立上下文与 Fiber 树的关联，确保后续渲染过程中（如创建子元素）能正确访问根容器的环境信息。
这一过程是 React 连接虚拟 DOM 与实际宿主环境（如浏览器 DOM）的关键环节，为后续的元素创建（如 createElementNS）、属性设置等操作提供了必要的环境基础。
*/
export function pushHostContainer(fiber: Fiber, nextRootInstance: Container) {
    push(rootInstanceStackCursor, nextRootInstance, fiber) // 将新的根容器实例推入栈，并关联当前 Fiber 节点
    push(contextFiberStackCursor, fiber, fiber) // 将当前 Fiber 节点推入上下文 Fiber 栈
    push(contextStackCursor, NO_CONTEXT, fiber) // 先推入一个空上下文作为临时占位， 避免后续计算实际上下文时栈状态不一致。
    // 获取根容器的宿主环境上下文（如命名空间等）
    const nextRootContext = getRootHostContext(nextRootInstance) 
    pop(contextStackCursor, fiber) // 弹出临时的空上下文
    push(contextStackCursor, nextRootContext, fiber) // 将实际的根容器上下文推入栈
}

export function popHostContainer(fiber: Fiber) {
    pop(contextStackCursor, fiber)
    pop(contextFiberStackCursor, fiber)
    pop(rootInstanceStackCursor, fiber)
}

export function pushHostContext(fiber: Fiber) {
    const rootInstance: Container = requiredContext(rootInstanceStackCursor.current)
    const context: HostContext = requiredContext(contextStackCursor.current)
    const nextContext = getChildHostContext(context, fiber.type, rootInstance)
    if (context === nextContext) {
        return
    }

    push(contextFiberStackCursor, fiber, fiber)
    push(contextStackCursor, nextContext, fiber)
}

export function popHostContext(fiber: Fiber) {
    if (contextFiberStackCursor.current !== fiber) {
        return
    }
    pop(contextStackCursor, fiber)
    pop(contextFiberStackCursor, fiber)
}

export function getRootHostContainer(): Container {
    const rootInstance = requiredContext(rootInstanceStackCursor.current)
    return rootInstance
}

export function getHostContext(): HostContext {
    const context = requiredContext(contextStackCursor.current)
    return context
}