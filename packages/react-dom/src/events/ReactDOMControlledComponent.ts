import { getFiberCurrentPropsFromNode, getInstanceFromNode } from "../client/ReactDOMComponentTree";


let restoreImpl: any = null;    // 状态恢复的具体实现函数（由外部注入）
let restoreTarget: any = null;  // 需要恢复状态的单个目标 DOM 节点
let restoreQueue: any = null;   // 需要恢复状态的目标 DOM 节点队列（批量处理）

// setRestoreImplementation(impl)：注入状态恢复的具体逻辑
export function setRestoreImplementation(
    impl: (domElement: Element, tag: string, props: Object) => void
) {
    restoreImpl = impl // 保存外部传入的恢复逻辑
}

// restoreStateOfTarget(target: Node)：单个节点的状态恢复
function restoreStateOfTarget(target: Node) {
    // 从 DOM 节点反向获取对应的 Fiber 实例（内部组件实例）
    const internalInstance = getInstanceFromNode(target)
    if (!internalInstance) {
        return  // 组件已卸载，无需恢复
    }

    // 检查是否已注入恢复实现（确保恢复逻辑存在）
    if (typeof restoreImpl !== 'function') {
        throw new Error('未设置状态恢复实现，这通常是 React 内部错误')
    }

    // 获取 Fiber 对应的 DOM 节点（stateNode）和当前 props
    const stateNode = internalInstance.stateNode
    if (stateNode) {  // 确保 DOM 节点存在
        const props = getFiberCurrentPropsFromNode(stateNode)
        // 调用恢复实现，将 props 同步到 DOM 节点（核心步骤）
        restoreImpl(internalInstance.stateNode, internalInstance.type, props)
    }
}

// needsStateRestore()：检查是否有需要恢复的节点
export function needsStateRestore(): boolean {
    return restoreTarget !== null || restoreQueue !== null
}

// restoreStateIfNeeded()：执行所有待恢复节点的状态同步
export function restoreStateIfNeeded() {
    if (!restoreTarget) {
        return  // 无待恢复节点，直接返回
    }
    // 暂存目标节点和队列，然后重置变量（避免重复处理）
    const target = restoreTarget
    const queuedTargets: any = restoreQueue
    restoreTarget = null
    restoreQueue = null
    // 恢复单个目标节点的状态
    restoreStateOfTarget(target)
    // 恢复队列中所有节点的状态
    if (queuedTargets) {
        for (let i = 0; i < queuedTargets.length; i++) {
            restoreStateOfTarget(queuedTargets[i])
        }
    }
}

export function enqueueStateRestore(target) {
    if (restoreTarget) {
        if (restoreQueue) {
            restoreQueue.push(target)
        } else {
            restoreQueue = [target]
        }
    } else {
        restoreTarget = target
    }
}