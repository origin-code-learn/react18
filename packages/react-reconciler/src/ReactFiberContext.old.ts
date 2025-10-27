import { disableLegacyContext } from "shared/ReactFeatureFlags";
import { Fiber } from "./ReactInternalTypes";
import { ClassComponent, HostRoot } from "./ReactWorkTags";
import { createCursor, pop, push } from "./ReactFiberStack.old";


export const emptyContextObject = {}
export const contextStackCursor = createCursor(emptyContextObject)
export const didPerformWorkStackCursor = createCursor(false)

export function hasContextChanged (): boolean {
    if (disableLegacyContext) {
        return false
    } else {
        return didPerformWorkStackCursor.current
    }
}

/**
 * 判断一个组件是否为 Legacy Context 提供者
 *  - Legacy Context 是 React 旧版的上下文 Api (React16.3 之前)， Legacy Context判断标准：
 *     1. 是一个 类组件
 *     2. 定义了静态属性  childContextTypes（用于声明上下文的类型）
 *     3. 实现了 getChildContext() 方法（用于返回上下文值）
 *  - 新的 Api 使用  createContext() 和 <Context.Provider>
 *  - 此函数用于兼容旧版 APi，在新代码中通常不会直接使用
*/
export function isContextProvider(type: Function): boolean {
    if (disableLegacyContext) {
        return false
    } else {
        // 检查组件是否定义了 childContextTypes 属性
        const childContextTypes = (type as any).childContextTypes
        return childContextTypes !== null && childContextTypes !== undefined
    }
}

export function popTopLevelLegacyContextObject(fiber: Fiber) {
    if (disableLegacyContext) {
        return
    } else {
        pop(didPerformWorkStackCursor, fiber)
        pop(contextStackCursor, fiber)
    }
}

/**
 * pushTopLevelContextObject 是 React 18 中处理顶层上下文（Top-Level Context）入栈的核心函数，
 * 主要用于在 Fiber 树渲染过程中管理全局上下文的传递状态。它是 React legacy 上下文系统的一部分，
 * 确保组件在渲染时能正确访问到当前有效的顶层上下文。
 * 
*/
export function pushTopLevelContextObject(
    fiber: Fiber,
    context: Object,
    didChange: boolean
) {
    if (disableLegacyContext) {
        return 
    } else {
        if (contextStackCursor.current !== emptyContextObject) {
            throw new Error('在堆栈上发现意外的上下文,此错误可能是由React中的错误引起的。请提交一个问题')
        }
        push(contextStackCursor, context, fiber)
        push(didPerformWorkStackCursor, didChange, fiber)
    }
}

// 合并父上下文 与当前组件的子上下文
export function processChildContext(
    fiber: Fiber,
    type: any,
    parentContext: Object
) : Object {
    // 如果禁用了 Legacy Context，直接返回父上下文（不处理子上下文）
    if(disableLegacyContext) {
        return parentContext
    } else {
        // 2. 获取当前类组件的实例（fiber.stateNode 指向类组件实例）
        const instance = fiber.stateNode
        // 3. 获取组件定义的 childContextTypes（声明上下文的类型，Legacy Context 必需）
        const childContextTypes = type.childContextTypes
        // 4. 如果组件实例没有 getChildContext 方法，无法提供子上下文，直接返回父上下文
        if (typeof instance.getChildContext !== 'function') {
            return parentContext
        }
        // 5. 调用组件实例的 getChildContext 方法，获取子上下文
        const childContext = instance.getChildContext()
        // 6. 合并父上下文和子上下文（子上下文覆盖同名属性，保留其他属性）
        return { ...parentContext, ...childContext }
    }
}

/**
 * 向上查找当前未被屏蔽的最近上下文
 * 为什么只处理 HostRoot 和 ClassComponent 两个 tag 的 fiber 节点？
 - 历史实现兼容：类组件曾是上下文的主要载体，其缓存上下文的机制需要被特殊处理；
 - 根节点必要性：HostRoot 作为全局上下文的起点，必须被纳入查找逻辑；
 - 职责边界划分：函数组件中的 Context.Provider 对应 ContextProvider 类型的 Fiber 节点，其处理逻辑在更上层的上下文传播中完成，无需在此函数中重复处理。
 - 函数组件中的 Context.Provider 对应 ContextProvider 类型的 Fiber 节点，其处理逻辑在更上层的上下文传播中完成，无需在此函数中重复处理。
 - 因为函数组件中的 Context.Provider 对应 ContextProvider 类型的 Fiber 节点，其处理逻辑在更上层的上下文传播中完成，无需在此函数中重复处理。
 - 因为函数组件中的 Context.Provider 对应 ContextProvider 类型的 Fiber 节点，其处理逻辑在更上层的上下文传播中完成，无需在此函数中重复处理。
 * */ 
export function findCurrentUnmaskedContext(fiber: Fiber) {
    // 如果禁用了 legacy context（旧版上下文 API），直接返回空上下文
    if(disableLegacyContext) {
        return emptyContextObject
    } else {
        // if (!isFiberMounted(fiber) || fiber.tag !== ClassComponent) {
        //     throw new Error('出错了')
        // }
        // 遍历 Fiber 树
        let node: any = fiber
        do {
            switch(node.tag) {
                // 如果是 HostRoot（跟节点），返回其上下文
                case HostRoot:
                    return node.stateNode.context
                // 如果是类组件，检查是否为上下文提供者
                case ClassComponent: {
                    const Component = node.type
                    // 判断组件是否为上下文提供者
                    if (isContextProvider(Component)) {
                        // 返回 memoized 的合并子上下文（优化性能）
                        return node.stateNode.__reactInternalMemoizedMergedChildContext
                    }
                    break;
                }
            }
            // 继续向上遍历
            node = node.return
        } while(node !== null)
    }
}

function cacheContext(
    workInProgress: Fiber, 
    unmaskedContext: Object, 
    maskedContext: Object 
) {
    if (disableLegacyContext) {
        return
    } else {
        const instance = workInProgress.stateNode
        instance.__reactInternalMemoizedUnmaskedChildContext = unmaskedContext;
        instance.__reactInternalMemoizedMaskedChildContext = maskedContext;
    }
}


let previousContext: Object = emptyContextObject
/**
 * getUnmaskedContext 的核心功能是为 Legacy Context 机制提供当前有效的原始上下文对象，主要场景包括：
    1. 当组件是已推送自身上下文的 Provider 时，返回其上层上下文（previousContext），确保 Provider 能访问父级上下文。
    2. 其他情况下，返回上下文栈顶的当前有效上下文（contextStackCursor.current），供组件消费。
*/
export function getUnmaskedContext(
    workInProgress: Fiber, // 当前正在处理的 Fiber 节点
    Component: Function, // 当前组件的构造函数或函数组件
    didPushOwnContextIfProvider: boolean // 标识是否已推送当前组件的上下文（若为 Provider）
): Object {
    if (disableLegacyContext) {
        return emptyContextObject
    } else {
        if (didPushOwnContextIfProvider && isContextProvider(Component)) {
            return previousContext
        }
        return contextStackCursor.current
    }
}

/**
 * Legacy Context 的遮蔽机制:
 * 在 Legacy Context 中，父组件通过 getChildContext 提供的上下文可能包含多个字段，但子组件通常只需要其中一部分。为了避免子组件意外访问到未声明的上下文字段，React 引入了 “遮蔽” 机制：
    1. 组件必须通过 contextTypes 显式声明它需要的上下文字段（类似 propTypes 的用法）。
    2. getMaskedContext 根据 contextTypes 从完整上下文中筛选出匹配的字段，生成仅包含这些字段的 “遮蔽上下文”。
    3. 组件最终只能访问到这个遮蔽后的上下文，确保上下文使用的明确性。
*/
export function getMaskedContext(
    workInProgress: Fiber,
    unmaskedContext: Object
): Object {
    if (disableLegacyContext) {
        return emptyContextObject
    } else {
        const type = workInProgress.type
        const contextTypes = type.contextTypes
        if (!contextTypes) {
            return emptyContextObject
        }
        const instance = workInProgress.stateNode
        if (instance && instance.__reactInternalMemoizedUnmaskedChildContext === unmaskedContext) {
            // 若未遮蔽上下文未变，直接复用缓存的遮蔽上下文
            return instance.__reactInternalMemoizedMaskedChildContext
        }
        const context = {}
        for (const key in contextTypes) {
            context[key] = unmaskedContext[key] // 只提取 contextTypes 中声明的字段
        }
        if (instance) {
            cacheContext(workInProgress, unmaskedContext, context); // 缓存遮蔽上下文
        }
        return context
    }
}

