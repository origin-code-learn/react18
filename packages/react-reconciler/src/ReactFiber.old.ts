import { createRootStrictEffectsByDefault, enableProfilerTimer, enableStrictEffects } from "shared/ReactFeatureFlags";
import { NoFlags, StaticMask } from "./ReactFiberFlags";
import { Lanes, NoLanes } from "./ReactFiberLane.old";
import { Fiber } from "./ReactInternalTypes";
import { ConcurrentRoot, RootTag } from "./ReactRootTags";
import { ConcurrentMode, NoMode, ProfileMode, StrictEffectsMode, StrictLegacyMode, TypeOfMode } from "./ReactTypeOfMode";
import { ClassComponent, Fragment, HostComponent, HostPortal, HostRoot, HostText, IndeterminateComponent, WorkTag } from "./ReactWorkTags";
import { ReactElement } from "shared/ReactElementType";
import { ReactFragment, ReactPortal } from "shared/ReactTypes";

function shouldConstruct(Component: Function) {
    const prototype = Component.prototype
    return !! (prototype && prototype.isReactComponent)
}

// Fiber 节点的构造函数
function FiberNode(
    tag: WorkTag,
    pendingProps: any,
    key: null | string,
    mode: TypeOfMode
) {
    // Instance
    this.tag = tag
    this.key = key
    this.elementType = null
    this.type = null
    this.stateNode = null

    // Fiber
    this.return = null
    this.child = null
    this.sibling = null
    this.index = 0

    this.ref = null
    
    this.pendingProps = pendingProps
    this.memoizedProps = null
    this.updateQueue = null
    this.memoizedState = null
    this.dependencies = null

    this.mode = mode

    // Effects
    this.flags = NoFlags
    this.subtreeFlags = NoFlags
    this.deletions = null

    this.lanes = NoLanes
    this.childLanes = NoLanes

    this.alternate = null
    
}

export function createHostRootFiber(
    tag: RootTag,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null | boolean
): Fiber {
    let mode = NoMode;
    if (tag === ConcurrentRoot) {
        // todo 处理 mode
        mode = ConcurrentMode
        if (isStrictMode === true) {
            mode |= StrictLegacyMode
            if (enableStrictEffects) {
                mode |= StrictEffectsMode
            }
        } else if (enableStrictEffects && createRootStrictEffectsByDefault) {
            mode |= StrictLegacyMode | StrictEffectsMode
        }
    } else {
        mode = NoMode
    }

    if (enableProfilerTimer) {
        mode |= ProfileMode
    }

    return createFiber(HostRoot, null, null, mode)
}

// 创建 Fiber 节点
export function createFiber(
    tag: WorkTag,
    pendingProps: any,
    key: null | string,
    mode: TypeOfMode
): Fiber {
    return new FiberNode(tag, pendingProps, key, mode)
}

export function createWorkInProgress(
    current: Fiber,
    pendingProps: any
): Fiber {
    let workInProgress = current.alternate
    if (workInProgress === null) {
        workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode)
        workInProgress.elementType = current.elementType
        workInProgress.type = current.type
        workInProgress.stateNode = current.stateNode
        // 
        workInProgress.alternate = current
        current.alternate = workInProgress
    } else {
        workInProgress.pendingProps = pendingProps
        workInProgress.type = current.type
        workInProgress.flags = NoFlags
        workInProgress.subtreeFlags = NoFlags
        workInProgress.deletions = null
    }

    workInProgress.flags = current.flags & StaticMask
    workInProgress.childLanes = current.childLanes
    workInProgress.lanes = current.lanes

    workInProgress.child = current.child
    workInProgress.memoizedProps = current.memoizedProps
    workInProgress.memoizedState = current.memoizedState
    workInProgress.updateQueue = current.updateQueue

    const currentDependencies = current.dependencies
    workInProgress.dependencies = currentDependencies === null ? null : { lanes: currentDependencies.lanes, firstContext: currentDependencies.firstContext }
    workInProgress.sibling = current.sibling
    workInProgress.index = current.index
    workInProgress.ref = current.ref

    return workInProgress
}

export function createFiberFromText(
    content: string,
    mode: TypeOfMode,
    lanes: Lanes
): Fiber {
    const fiber = createFiber(HostText, content, null, mode)
    fiber.lanes = lanes
    return fiber
}

export function createFiberFromTypeAndProps(
    type: any,
    key: null | string,
    pendingProps: any,
    owner: null | Fiber,
    mode: TypeOfMode,
    lanes: Lanes
): Fiber {
    let fiberTag: WorkTag = IndeterminateComponent
    let resolvedType = type
    if (typeof type === 'function') {
        if (shouldConstruct(type)) {
            fiberTag = ClassComponent
        }
    } else if (typeof type === 'string') {
        fiberTag = HostComponent
    } else {
        debugger
    }
    const fiber = createFiber(fiberTag, pendingProps, key, mode)
    fiber.elementType = type
    fiber.type = resolvedType
    fiber.lanes = lanes

    return fiber
}

export function createFiberFromElement(
    element: ReactElement,
    mode: TypeOfMode,
    lanes: Lanes
): Fiber {
    let owner = null
    const type = element.type
    const key = element.key
    const pendingProps = element.props
    const fiber = createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes)
    return fiber
}

export function createFiberFromFragment(
    elements: ReactFragment,
    mode: TypeOfMode,
    lanes: Lanes,
    key: null | string
): Fiber {
    const fiber = createFiber(Fragment, elements, key, mode)
    fiber.lanes = lanes
    return fiber
}

export function createFiberFromPortal(
    portal: ReactPortal,
    mode: TypeOfMode,
    lanes: Lanes
): Fiber {
    // 处理 Portal 的子节点：若子节点为 null，默认设为空数组（统一子节点格式）
    const pendingProps = portal.children !== null ? portal.children : []
    // 1. 创建基础 Fiber 节点，类型为 HostPortal
    const fiber = createFiber(HostPortal, pendingProps, portal.key, mode)
    // 2. 设置 Fiber 节点的优先级
    fiber.lanes = lanes
    // 3. 初始化 Fiber 的 stateNode（存储 Portal 特有的状态信息）
    fiber.stateNode = {
        containerInfo: portal.containerInfo,  // 目标 DOM 容器（如 document.body）
        pendingChildren: null, // 用于持久化更新的临时子节点存储
        implementation: portal.implementation  // Portal 的渲染实现（内部使用）
    }
    return fiber
}