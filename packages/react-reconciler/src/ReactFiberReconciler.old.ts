import { Container } from "./ReactFiberHostConfig"
import { RootTag } from "./ReactRootTags";
import { FiberRoot, SuspenseHydrationCallbacks, TransitionTracingCallbacks } from "./ReactInternalTypes";
import { createFiberRoot } from "./ReactFiberRoot.old";
import { Lane } from "./ReactFiberLane.old";
import { Component, ReactNodeList } from "shared/ReactTypes";
import { requestEventTime, requestUpdateLane, scheduleUpdateOnFiber } from "./ReactFiberWorkLoop.old";
import { enableSchedulingProfiler } from "shared/ReactFeatureFlags";
import { emptyContextObject, findCurrentUnmaskedContext, isContextProvider as isLegacyContextProvider, processChildContext } from "./ReactFiberContext.old";
import { get as getInstance } from 'shared/ReactInstanceMap'
import { ClassComponent } from "./ReactWorkTags";
import { createUpdate, enqueueUpdate } from "./ReactFiberClassUpdateQueue.old";
import {
    batchedUpdates,
    discreteUpdates,
    flushSync
} from './ReactFiberWorkLoop.old'

/**
 * 获取子组件树的 上下文对象
 * - 从父组件开始，向上查找最近的上下文提供者
 * - 处理 legacy context (旧版上下文 API， 如 childContextTypes 和 getChildContext)
 * - 返回最终的上下文对象，供子组件使用
 * */ 
function getContextForSubtree(parentComponent: Component<any, any>): Object {
    // 如果没有父组件，返回空的上下文
    if (!parentComponent) {
        return emptyContextObject
    }
    // 获取 parentComponent 的fiber 节点
    const fiber = getInstance(parentComponent)
    // 查找当前未被屏蔽的上下文（向上遍历找到最近的 context provider）
    const parentContext = findCurrentUnmaskedContext(fiber)
    // 如果父组件是类组件且是 legacy context 提供者
    if (fiber.tag === ClassComponent) {
        const Component = fiber.type
        if (isLegacyContextProvider(Component)) {
            // 处理 legacy context，生成新的上下文
            return processChildContext(fiber, Component, parentContext)
        }
    }
    // 默认返回找到的父上下文
    return parentContext
}

export function createContainer(
    containerInfo: Container,
    tag: RootTag,
    hydrationCallbacks: null | SuspenseHydrationCallbacks,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null | boolean,
    identifierPrefix: string,
    onRecoverableError: (error: any) => void,
    transitionCallbacks: null | TransitionTracingCallbacks
){
    const hydrate = false
    const initialChildren = null
    return createFiberRoot(
        containerInfo,
        tag,
        hydrate,
        initialChildren,
        hydrationCallbacks,
        isStrictMode,
        concurrentUpdatesByDefaultOverride,
        identifierPrefix,
        onRecoverableError,
        transitionCallbacks
    )
}

export function updateContainer(
    element: ReactNodeList,
    container: FiberRoot,
    parentComponent: Component<any, any> | null,
    callback?: (() => any) | null
): Lane {
    console.log('----', element, container, parentComponent)
    const current = container.current  // 获取当前根 Fiber 的节点和事件时间
    const eventTime = requestEventTime()
    const lane = requestUpdateLane(current)  // 请求 Lane 赛道（优先级）
    if (enableSchedulingProfiler) {  }
    // 获取子树的上下文 （用于跨层级数据传递）
    const context = getContextForSubtree(parentComponent as any)
    if (container.context === null) {
        container.context = context
    } else {
        container.pendingContext = context
    }

    // 创建更新对象并设置 payload （包含要渲染的元素）
    const update = createUpdate(eventTime, lane)
    update.payload = { element }
    // 设置回调函数 （如果有）
    callback = callback === undefined ? null : callback
    if (callback !== null) {
        update.callback = callback
    }
    // 将更新加入队列并获取根节点
    const root = enqueueUpdate(current, update, lane)
    // 如果跟节点存在，调度更新
    if (root !== null) {
        scheduleUpdateOnFiber(root, current, lane, eventTime)
        // entangleTransitions(root, current, lane)
    }

    return lane
}

export {
    batchedUpdates,
    // deferredUpdates,
    discreteUpdates,
    // flushControlled,
    flushSync,
    // isAlreadyRendering,
    // flushPassiveEffects,
};