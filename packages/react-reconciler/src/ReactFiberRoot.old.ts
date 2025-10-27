import { ReactNodeList } from "shared/ReactTypes";
import { RootTag } from "./ReactRootTags";
import { FiberRoot, SuspenseHydrationCallbacks, TransitionTracingCallbacks } from "./ReactInternalTypes";
import { noTimeout } from "./ReactFiberHostConfig"
import { createLaneMap, NoLane, NoLanes, NoTimestamp } from "./ReactFiberLane.old";
import { enableCache, enableSuspenseCallback, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { createHostRootFiber } from "./ReactFiber.old";
import { initializeUpdateQueue } from "./ReactFiberClassUpdateQueue.old";

export type RootState = {
    element: any;
    isDehydrated: boolean;
    cache: Cache;
    pendingSuspenseBoundaries: any;
    transitions: Set<any> | null,
}

function FiberRootNode(
    containerInfo,
    tag,
    hydrate,
    identifierPrefix,
    onRecoverableError
){
    // 基础标识与容器信息
    this.tag = tag  // 根节点的类型标识
    this.containerInfo = containerInfo // 宿主环境的根容器实例（如浏览器中的 div#root DOM 元素）
    this.identifierPrefix = identifierPrefix // 用于在开发工具中标识该根节点的前缀，避免多个 React 应用共存时的 ID 冲突
    this.onRecoverableError = onRecoverableError // 可恢复错误的回调函数，当 React 内部捕获到非致命错误时触发（如渲染异常但不影响整体应用）。

    // Fiber 树相关
    this.current = null  // 指向当前已提交到 DOM 的 Fiber 树（即 “当前树”），与 finishedWork 形成 “双缓存” 机制
    this.pingCache = null // 
    this.finishedWork = null // 指向渲染完成后待提交的 Fiber 树（即 “工作树”），当渲染完成后，React 会将其替换为 current 并提交到 DOM

    // 上下文相关
    this.context = null // 当前生效的顶层上下文对象（如通过 createContext 创建的全局上下文），供整个应用共享。
    this.pendingContext = null // 待生效的顶层上下文，通常是通过 root.setContext() 更新的新上下文，将在下次渲染时生效。

    // 调度与超时相关
    this.timeoutHandle = noTimeout // 超时任务的句柄（如 setTimeout 返回的 ID），用于管理延迟任务（如 Suspense 超时、过期任务清理等），noTimeout 表示无超时任务
    this.callbackNode = null // 与当前调度任务关联的节点（如浏览器的 requestIdleCallback 或 setTimeout 返回的 ID），用于取消或跟踪任务
    this.callbackPriority = NoLane // 当前回调任务的优先级（NoLane 表示无优先级），用于调度系统决定任务执行顺序

    // 优先级与 lanes 相关（React 18 并发特性核心）
    this.pendingLanes = NoLanes;  // 待处理的任务优先级集合，包含所有需要被调度的更新（如 setState 触发的更新）
    this.suspendedLanes = NoLanes; // 被挂起（suspended）的任务优先级集合，通常与 Suspense 相关（如数据加载未完成时暂停的任务）
    this.pingedLanes = NoLanes; // 被 “ping” 唤醒的任务优先级集合，用于恢复被 Suspense 挂起的任务（如数据加载完成后触发）
    this.expiredLanes = NoLanes; // 已过期的任务优先级集合，这些任务超过了超时时间，需要立即执行以避免用户体验下降
    this.mutableReadLanes = NoLanes; // 在本次渲染中被 “可变读取” 的任务优先级集合（与并发模式下的状态读取相关）
    this.finishedLanes = NoLanes; // 已完成渲染的任务优先级集合，这些任务已处理完毕，等待提交到 DOM
    this.entangledLanes = NoLanes // 被 “纠缠” 的任务优先级集合，用于关联多个相互依赖的任务（如父子组件的更新依赖）
    this.entanglements = createLaneMap(NoLanes) // 存储 lanes 之间的纠缠关系的映射表，用于跟踪哪些优先级被关联在一起
    
    // 时间跟踪相关
    this.eventTimes = createLaneMap(NoLanes) // 记录不同优先级任务的触发时间（通过 createLaneMap 初始化，以 lanes 为键），用于调度时判断任务的紧迫性
    this.expirationTimes = createLaneMap(NoTimestamp) // 记录不同优先级任务的过期时间（通过 createLaneMap 初始化），用于判断任务是否已过期（超过该时间需立即执行）
}

// 创建 FiberRoot
export function createFiberRoot(
    containerInfo: any,
    tag: RootTag,
    hydrate: boolean,
    initialChildren: ReactNodeList,
    hydrationCallbacks: null | SuspenseHydrationCallbacks,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null | boolean,
    identifierPrefix: string,
    onRecoverableError: null | ((error: any) => void),
    transitionCallbacks: null | TransitionTracingCallbacks
): FiberRoot {
    // 创建 rootFiber
    const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onRecoverableError))
    if (enableSuspenseCallback) {
        root.hydrationCallbacks = hydrationCallbacks
    }
    if (enableTransitionTracing) {
        root.transitionCallbacks = transitionCallbacks
    }
    // 创建 FiberRoot； rootFiber.current -> FiberRoot FiberRoot.stateNode -> rootFiber
    const uninitializedFiber = createHostRootFiber(tag, isStrictMode, concurrentUpdatesByDefaultOverride)
    root.current = uninitializedFiber
    uninitializedFiber.stateNode = root

    if (enableCache) {
        debugger
    } else {
        // 初始化 rootState 作为 FiberRoot 的 memoizedState
        const initialState: RootState = {
            element: initialChildren,
            isDehydrated: hydrate,
            cache: null as any,
            transitions: null,
            pendingSuspenseBoundaries: null
        }
        uninitializedFiber.memoizedState = initialState
    }
    // 初始化更新队列
    initializeUpdateQueue(uninitializedFiber)
    return root
}