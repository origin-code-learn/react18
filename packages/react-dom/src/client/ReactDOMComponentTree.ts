import { Fiber } from "react-reconciler/src/ReactInternalTypes";
import { HostComponent, HostRoot, HostText, SuspenseComponent } from "react-reconciler/src/ReactWorkTags";
import { getParentSuspenseInstance, Instance, Props, SuspenseInstance, TextInstance } from "ReactDOMHostConfig";
import { ReactScopeInstance } from "shared/ReactTypes";
import { ReactDOMEventHandleListener } from "../shared/ReactDOMTypes";

const randomKey = Math.random().toString(36).slice(2)

// 用于在 DOM 元素（或宿主实例）上存储对应的 Fiber 节点，建立 “真实 DOM → 虚拟 Fiber 节点” 的映射。
const internalInstanceKey = '__reactFiber$' + randomKey
// 在 DOM 元素上缓存 当前 props，供更新阶段对比新旧 props 时快速访问
const internalPropsKey = '__reactProps$' + randomKey;
// 在根容器 DOM 元素（如 document.getElementById('root')）上存储对应的 FiberRoot 实例，标识该容器是 React 管理的根节点
const internalContainerInstanceKey = '__reactContainer$' + randomKey;
// 用于 React 合成事件系统，存储 事件处理器 和 原生事件监听器
const internalEventHandlersKey = '__reactEvents$' + randomKey;
// 存储 React 内部添加的原生事件监听器（如 addEventListener('click', ...)）。
const internalEventHandlerListenersKey = '__reactListeners$' + randomKey;
// 存储与事件处理相关的 句柄集合（如用于清理事件监听的标识），确保组件卸载时能正确移除所有事件监听，避免内存泄漏。
const internalEventHandlesSetKey = '__reactHandles$' + randomKey;

// getClosestInstanceFromNode 是 React 内部用于从 DOM 节点反向查找最近关联的 React Fiber 实例的核心函数
export function getClosestInstanceFromNode(targetNode: Node): null | Fiber {
    // 1. 尝试从目标节点直接获取关联的 Fiber 实例
    // internalInstanceKey 是 React 为 DOM 节点添加的内部属性，指向对应的 Fiber
    let targetInst = targetNode[internalInstanceKey]
    if (targetInst) {
        // 直接返回（后续逻辑会处理 HostRoot 或 SuspenseComponent 的排除）
        return targetInst
    }

    // 2. 若目标节点无直接关联的 Fiber，向上遍历父节点查找
    let parentNode = targetNode.parentNode
    while (parentNode) {
        // 检查父节点是否是 React 容器实例（internalContainerInstanceKey）或普通实例（internalInstanceKey）
        targetInst = parentNode[internalContainerInstanceKey] ||  // 容器实例（如根容器）
                     parentNode[internalInstanceKey] // 普通组件实例
        if (targetInst) {
            // 3. 若找到实例，处理可能存在的未 hydration 的 Suspense 边界
            // 检查实例是否有子节点（包括 alternate 节点的子节点），判断是否可能包含 Suspense 组件
            const alternate = targetInst.alternate
            if (
                targetInst.child !== null || // 当前 Fiber 有子节点
                (alternate !== null && alternate.child !== null)  // 备用 Fiber 有子节点
            ) {
                // 查找父级的 Suspense 实例（未 hydration 时的标记）
                let suspenseInstance = getParentSuspenseInstance(targetNode)
                while (suspenseInstance !== null) {
                    // 从 Suspense 实例（通常是注释节点）获取关联的 Fiber 实例
                    const targetSuspenseInst = suspenseInstance[internalInstanceKey]
                    if (targetSuspenseInst) {
                        // 返回 Suspense 对应的 Fiber（优先级高于普通实例，因未 hydration 需优先处理）
                        return targetSuspenseInst
                    }
                    // 若当前 Suspense 实例无 Fiber，继续查找上层 Suspense 实例
                    suspenseInstance = getParentSuspenseInstance(suspenseInstance)
                }
            }

            // 4. 无 Suspense 边界或已处理，返回找到的 Fiber 实例
            return targetInst
        }
        // 继续向上遍历父节点
        targetNode = parentNode
        parentNode = targetNode.parentNode
    }

    // 5. 遍历完所有父节点仍未找到，返回 null（非 React 管理的 DOM 节点）
    return null
}

// precacheFiberNode 是 React 中建立 Fiber 节点与 DOM 节点（或其他宿主实例）关联的核心工具函数，将 node 对应的 Fiber 存储到 node 属性上，便于快速查找
export function precacheFiberNode(hostInst: Fiber, node: Instance | TextInstance | SuspenseInstance | ReactScopeInstance) {
    node[internalInstanceKey] = hostInst
}

export function updateFiberProps(
    node: Instance | TextInstance | SuspenseInstance,
    props: Props
) {
    node[internalPropsKey] = props
}

export function getInstanceFromNode(node: Node): Fiber | null {
    const inst = node[internalInstanceKey] || node[internalContainerInstanceKey]
    if (inst) {
        if (
            inst.tag === HostComponent ||
            inst.tag === HostText || 
            inst.tag === SuspenseComponent || 
            inst.tag === HostRoot
        ) {
            return inst
        } else {
            return null
        }
    }
    return null
}

export function getFiberCurrentPropsFromNode(node: Instance | TextInstance | SuspenseInstance):Props {
    return node[internalPropsKey] || null
}

export function getNodeFromInstance(inst: Fiber): Instance | TextInstance {
    if (inst.tag === HostComponent || inst.tag === HostText) {
        return inst.stateNode
    }
    throw new Error('getNodeFromInstance 出错了')
}

export function getEventHandlerListeners(
    scope: EventTarget | ReactScopeInstance
): null | Set<ReactDOMEventHandleListener> {
    return scope[internalEventHandlerListenersKey] || null
}