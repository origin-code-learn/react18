import { Container, SuspenseInstance } from "ReactDOMHostConfig";
import { Hydrating, NoFlags, Placement } from "./ReactFiberFlags";
import { Fiber } from "./ReactInternalTypes";
import { HostRoot, SuspenseComponent } from "./ReactWorkTags";
import { SuspenseState } from "./ReactFiberSuspenseComponent.old";

// getNearestMountedFiber 是 React 内部用于从指定 Fiber 节点向上遍历，找到最近的已挂载（mounted）Fiber 节点的核心函数。
// 在 React 中，“已挂载” 指的是 Fiber 节点对应的组件已被渲染到 DOM 中，处于活跃状态（非卸载、非未插入状态）
export function getNearestMountedFiber(fiber: Fiber): null | Fiber {
    // 初始化：node 用于遍历，nearestMounted 记录最近的已挂载节点（初始为当前 fiber）
    let node = fiber
    let nearestMounted: Fiber | null = fiber
    // 情况 1：当前 fiber 没有 alternate 节点（可能是新创建的、未完成插入的节点）
    if (!fiber.alternate) {
        // 遍历父节点链，查找已挂载节点
        let nextNode: Fiber | null = node
        do {
            node = nextNode
            // 检查当前节点是否有“待插入”或“正在 hydration”的标志
            if ((node.flags & (Placement | Hydrating)) !== NoFlags) {
                // 若有这些标志，说明当前节点未完全挂载，最近的已挂载节点可能是其父节点
                nearestMounted = node.return
            }
            // 继续向上遍历父节点
            nextNode = node.return
        } while (nextNode)
    } else {
        // 情况 2：当前 fiber 有 alternate 节点（可能是已更新、经历过协调的节点）
        // 向上遍历到根节点（HostRoot）
        while (node.return) {
            node = node.return
        }
    }
    // 检查最终遍历到的节点是否是根节点（HostRoot）
    if (node.tag === HostRoot) {
        // 若根节点有效，返回找到的最近已挂载节点
        return nearestMounted
    }

    // 若未遍历到根节点，说明当前树已被卸载，返回 null
    return null
}

// getSuspenseInstanceFromFiber 是 React 内部用于从 Suspense 组件对应的 Fiber 节点中获取其关联的 DOM 实例（SuspenseInstance） 的工具函数。
export function getSuspenseInstanceFromFiber(fiber: Fiber): null | SuspenseInstance {
    // 1. 首先判断当前 Fiber 是否是 Suspense 组件类型
    if (fiber.tag === SuspenseComponent) {
        // 2. 从 Fiber 的 memoizedState 中获取 Suspense 状态
        let suspenseState: SuspenseState | null = fiber.memoizedState
        // 3. 若当前 Fiber 无状态，尝试从备用 Fiber（alternate）中获取
        if (suspenseState === null) {
            const current = fiber.alternate  // alternate 是当前 Fiber 的备用节点（双缓存机制）
            if (current !== null) {
                suspenseState = current.memoizedState  // 从备用节点获取状态
            }
        }
        // 4. 若获取到状态，返回其中的 dehydrated 字段（即 SuspenseInstance）
        if (suspenseState !== null) {
            return suspenseState.dehydrated  // dehydrated 保存着对应的 DOM 注释节点
        }
    }
    // 5. 若 Fiber 不是 Suspense 组件或无有效状态，返回 null
    return null
}

export function getContainerFromFiber(fiber: Fiber): null | Container {
    return fiber.tag === HostRoot ? fiber.stateNode.containerInfo : null
}