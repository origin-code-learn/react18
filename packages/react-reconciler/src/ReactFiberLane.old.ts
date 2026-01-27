import { allowConcurrentByDefault, enableTransitionTracing } from "shared/ReactFeatureFlags";
import { clz32 } from "./clz32";
import { FiberRoot } from "./ReactInternalTypes";
import { ConcurrentUpdatesByDefaultMode, NoMode } from "./ReactTypeOfMode";
import { Transition } from "shared/ReactTypes";

/**
 * Lane 优先级的二进制特性：
 *  在 React 的 lanes 模型中（如前文所述），二进制位越低（右移），优先级越高。例如：
 *  SyncLane 是 0b1（最低位），优先级最高
 *  InputContinuousLane 是 0b100（第 3 位），优先级次之
 *  更高位的二进制位对应更低优先级的任务
*/

export type Lanes = number;
export type Lane = number;
export type LaneMap<T> = Array<T>

export const TotalLanes = 31;

// 空赛道
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

// 同步优先级（最高优先级）
export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;

// 用户输入与连续事件优先级
export const InputContinuousHydrationLane: Lane = /*    */ 0b0000000000000000000000000000010;  // hydration 阶段（服务端渲染转客户端激活）的连续输入事件（如拖拽、滚动）
export const InputContinuousLane: Lane = /*             */ 0b0000000000000000000000000000100;  // 客户端的连续输入事件（如鼠标移动、键盘连续输入），优先级高于默认更新，保证用户操作的即时响应（避免卡顿）。

// 默认优先级
export const DefaultHydrationLane: Lane = /*            */ 0b0000000000000000000000000001000;  // hydration 阶段的默认更新任务（非输入、非过渡的普通更新）
export const DefaultLane: Lane = /*                     */ 0b0000000000000000000000000010000;  // 客户端的默认更新任务（如 setState 触发的普通更新），优先级低于输入事件，但高于过渡任务

// 过渡任务优先级（可中断，低延迟）
const TransitionHydrationLane: Lane = /*                */ 0b0000000000000000000000000100000;  // hydration 阶段的过渡任务
const TransitionLanes: Lanes = /*                       */ 0b0000000001111111111111111000000;  // 所有过渡任务的集合（共 16 个 lane），用于批量处理或检查过渡任务。
// 每个 lane 对应一个独立的过渡任务，避免不同过渡任务互相阻塞（如多个 useTransition 同时触发时，各自使用不同 lane）
const TransitionLane1: Lane = /*                        */ 0b0000000000000000000000001000000;
const TransitionLane2: Lane = /*                        */ 0b0000000000000000000000010000000;
const TransitionLane3: Lane = /*                        */ 0b0000000000000000000000100000000;
const TransitionLane4: Lane = /*                        */ 0b0000000000000000000001000000000;
const TransitionLane5: Lane = /*                        */ 0b0000000000000000000010000000000;
const TransitionLane6: Lane = /*                        */ 0b0000000000000000000100000000000;
const TransitionLane7: Lane = /*                        */ 0b0000000000000000001000000000000;
const TransitionLane8: Lane = /*                        */ 0b0000000000000000010000000000000;
const TransitionLane9: Lane = /*                        */ 0b0000000000000000100000000000000;
const TransitionLane10: Lane = /*                       */ 0b0000000000000001000000000000000;
const TransitionLane11: Lane = /*                       */ 0b0000000000000010000000000000000;
const TransitionLane12: Lane = /*                       */ 0b0000000000000100000000000000000;
const TransitionLane13: Lane = /*                       */ 0b0000000000001000000000000000000;
const TransitionLane14: Lane = /*                       */ 0b0000000000010000000000000000000;
const TransitionLane15: Lane = /*                       */ 0b0000000000100000000000000000000;
const TransitionLane16: Lane = /*                       */ 0b0000000001000000000000000000000;

// 重试任务优先级（失败重试）
const RetryLanes: Lanes = /*                            */ 0b0000111110000000000000000000000;  // 所有重试任务的集合（共 5 个 lane），用于处理失败后需要重试的任务（如 Suspense 加载失败的重试）
// 每个 lane 对应一个重试任务，优先级低于过渡任务，避免重试逻辑干扰正常更新
const RetryLane1: Lane = /*                             */ 0b0000000010000000000000000000000;
const RetryLane2: Lane = /*                             */ 0b0000000100000000000000000000000;
const RetryLane3: Lane = /*                             */ 0b0000001000000000000000000000000;
const RetryLane4: Lane = /*                             */ 0b0000010000000000000000000000000;
const RetryLane5: Lane = /*                             */ 0b0000100000000000000000000000000;

export const SomeRetryLane: Lane = RetryLane1;  // 指向 RetryLane1，作为重试任务的默认 lane

// 用于「选择性 hydration」（只激活视图中可见部分的组件），优先级低于重试任务，高于空闲任务
export const SelectiveHydrationLane: Lane = /*          */ 0b0001000000000000000000000000000;

// 所有「非空闲任务」的集合（包含同步、输入、默认、过渡、重试、选择性 hydration 任务），用于快速判断任务是否需要立即处理（非空闲）
const NonIdleLanes: Lanes = /*                          */ 0b0001111111111111111111111111111;

// 空闲任务优先级（最低优先级）
export const IdleHydrationLane: Lane = /*               */ 0b0010000000000000000000000000000; // hydration 阶段的空闲任务（仅在浏览器空闲时执行）
export const IdleLane: Lane = /*                        */ 0b0100000000000000000000000000000; // 客户端的空闲任务（如低优先级的日志收集、统计上报），仅在浏览器无其他高优先级任务时执行，避免占用主线程。

// 离屏任务优先级（不可见组件）
export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000; // 用于「离屏组件」（如 Offscreen 包裹的不可见组件）的更新，优先级最低，确保不可见内容的更新不影响可见部分的性能。

let nextTransitionLane: Lane = TransitionLane1
let nextRetryLane: Lane = RetryLane1;

/**
 * 通过 clz32 计算前导零个数，快速提取 Lane（或 Lanes 集合）的最高有效位索引，为后续操作（如修改过期时间、遍历 Lane）提供数组索引
 */
function pickArbitraryLaneIndex(lanes: Lanes) {
    return 31 - clz32(lanes)
}

/**
 * lane 转 索引位
*/
function laneToIndex(lane: Lane) {
    return pickArbitraryLaneIndex(lane)
}

// 判断是否包含某些车道
export function includesSomeLane(a: Lanes | Lane, b: Lanes | Lane) {
    return (a & b) !== NoLanes
}

// 判断 subset 是不是 set 的子集
export function isSubsetOfLanes(set: Lanes, subset: Lanes | Lane) {
    return (set & subset) === subset
}

export function laneToLanes(lane: Lane): Lanes {
    return lane
}

/**
 * 从一组任务通道（Lanes）中获取最高优先级通道（Lane）：
 *  对于任意整数 n，-n 在计算机中以「补码」形式存储，即 ~n + 1（按位取反加 1）
 *  当 n 与 -n 执行按位与（&）时，结果只会保留 n 中最右侧的 1，其余位均为 0
 *  例如: 给定 lanes = 24 ， 其二进制表示为：                   0b00011000
 *           -lanes = -24, 其二进制表示为： 0b11100111 + 1 => 0b11101000
 *          lanes & -lanes 其二进制表示为：                   0b00001000
 *  总结： 在 React 的 lanes 模型中（如前文所述），二进制位越低（右移），优先级越高
 *  该函数作用在于获取 最右侧的 1 所在的位就是其中优先级最高的 lane
 * */
export function getHighestPriorityLane(lanes: Lanes): Lane {
    return lanes & -lanes
}

// 合并车道lane
export function mergeLanes(a: Lanes | Lane, b: Lanes | Lane): Lanes {
    return a | b
}

// 从 set 车道中移除车道 subset
export function removeLanes(set: Lanes, subset: Lanes | Lane): Lanes {
    return set & ~subset
}

// 对两个 Lane/Lanes 执行按位与运算，返回它们的交集
export function intersectLanes(a: Lanes | Lane, b: Lanes | Lane): Lanes {
    return a & b
}

// 比较两个单个 Lane 的优先级，返回其中更高优先级的那个（Lane 数值越小，优先级越高（低位优先））
export function higherPriorityLane(a: Lane, b: Lane) {
    return a !== NoLane && a < b ? a : b
}

/**
 * 判断车道（Lanes）是否包含「阻塞型车道」
 * 根据当前根节点的模式（是否默认开启并发更新），检查传入的车道集合中是否包含「同步默认车道（SyncDefaultLanes）」，以此判定这些车道的更新是否会阻塞并发渲染（即是否需要同步执行，不能被中断 / 插队）。简单说，这个函数是 React 区分「阻塞型更新」和「可并发更新」的关键判断依据。
 * */
export function includesBlockingLane(root: FiberRoot, lanes: Lanes) {
    // 分支1：默认开启并发 + 根节点启用并发更新模式 → 直接返回 false（无阻塞车道）
    if (allowConcurrentByDefault && (root.current.mode & ConcurrentUpdatesByDefaultMode) !== NoMode) return false
    // 分支2：不满足并发条件 → 检查车道是否包含「同步默认车道」
    const SyncDefaultLanes = InputContinuousHydrationLane | InputContinuousLane | DefaultHydrationLane | DefaultLane
    return (lanes & SyncDefaultLanes) !== NoLanes
}

// 判断车道集合是否包含过期车道
export function includesExpiredLane(root: FiberRoot, lanes: Lanes) {
    return (lanes & root.expiredLanes) !== NoLanes
}

// 判断车道是否为过渡车道
export function isTransitionLane(lane: Lane) {
    return (lane & TransitionLanes) !== NoLanes
}

// 从车道集合中提取任意（最高优先级）车道
export function pickArbitraryLane(lanes: Lanes): Lane {
    return getHighestPriorityLane(lanes)
}

// 判断车道集合是否仅包含重试车道
export function includesOnlyRetries(lanes: Lanes) {
    return (lanes & RetryLanes) === NoLanes
}

// 筛选根节点中「挂起且就绪」的车道，标记为「已唤醒（pinged）」，触发重新调度
export function markRootPinged(
    root: FiberRoot,
    pingedLanes: Lanes,
    eventTime: number
) {
    // 核心逻辑拆解为两步：
    // 1. 筛选：root.suspendedLanes & pingedLanes → 仅保留「挂起且需要唤醒」的车道
    // 2. 合并：root.pingedLanes |= 筛选结果 → 将这些车道标记为「已唤醒」
    root.pingedLanes |= root.suspendedLanes & pingedLanes
}

export function claimNextRetryLane(): Lane {
    // 步骤1：获取本次要分配的重试车道（取当前 nextRetryLane 的值）
    const lane = nextRetryLane
    // 步骤2：左移 1 位，更新下一次要分配的车道
    // 例如：RetryLane1(128) << 1 → RetryLane2(256)
    nextRetryLane <<= 1
    // 步骤3：边界检测：判断移位后的车道是否超出 RetryLanes 范围
    // (nextRetryLane & RetryLanes) === NoLanes → 超出预定义的重试车道池
    if ((nextRetryLane & RetryLanes) === NoLanes) {
        // 重置为起始值，实现循环分配
        nextRetryLane = RetryLane1
    }
    // 步骤4：返回本次分配的重试车道
    return lane
}

/**
 * claimNextTransitionLane 是 React 为 useTransition 分配「过渡专属 Lane（车道）」的核心函数，通过循环移位 + 边界重置的方式，从预定义的 TransitionLanes 集合中依次分配空闲的低优先级 Lane，保证每个过渡更新都有唯一的 Lane，且分配逻辑高效、无冲突。简单说，这个函数是「过渡 Lane 池」的「分配器」，负责为每次 startTransition 调用分配一个专属的低优先级 Lane。
*/
export function claimNextTransitionLane(): Lane {
    // 步骤1：获取当前要分配的过渡 Lane（本次分配的值）
    const lane = nextTransitionLane

    // 步骤2：更新全局变量，移位准备下一个分配的 Lane
    // 左移 1 位：二进制位向右挪一位（如 0b100000 → 0b1000000）
    nextTransitionLane = lane << 1

    // 步骤3：边界检测：若下一个 Lane 超出 TransitionLanes 范围，重置为起始值
    // (nextTransitionLane & TransitionLanes) === NoLanes → 下一个 Lane 不在预定义的过渡车道池中
    if ((nextTransitionLane & TransitionLanes) === NoLanes) {
        nextTransitionLane = TransitionLane1  // 重置为第一个过渡车道，循环分配
    }

    // 步骤4：返回本次分配的 Lane
    return lane
}

/**
 * markRootSuspended 是 React 处理Suspense/Transition 挂起时的核心函数 —— 它的核心作用是：
 * 1.标记 FiberRoot 根节点上指定的 Lane（车道）为「挂起状态」，清理该 Lane 对应的「已 Ping 标记」和「过期时间」，确保挂起的低优先级更新暂时不参与调度，直到被唤醒（Ping）后再恢复。简单说，这个函数是 React 实现「挂起更新暂存、调度暂停」的关键，直接支撑 Suspense 兜底渲染和 Transition 优先级降级的核心逻辑
*/
export function markRootSuspended(root: FiberRoot, suspendedLanes: Lanes) {
    // 步骤1：将传入的挂起车道合并到根节点的 suspendedLanes 中
    // |= 位或运算：保留原有挂起车道 + 新增本次挂起车道
    root.suspendedLanes |= suspendedLanes

    // 步骤2：从根节点的 pingedLanes 中移除这些挂起车道
    // &= ~ 位与非运算：清除 pingedLanes 中与 suspendedLanes 重叠的位
    root.pingedLanes &= ~suspendedLanes
    const expirationTimes = root.expirationTimes
    let lanes = suspendedLanes // 临时变量，遍历所有挂起车道
    // 循环遍历所有挂起的 Lane（直到 lanes 变为 0）
    while (lanes > 0) {
        // 3.1：提取任意一个 Lane 的二进制位索引（如 0b100000 → 索引 5）
        const index = pickArbitraryLaneIndex(lanes)
        // 3.2 根据索引还原对应的单个 Lane（1 << index → 0b100000）
        const lane = 1 << index
        // 3.3：将该 Lane 对应的过期时间设为 NoTimestamp（取消超时）
        expirationTimes[index] = NoTimestamp
        // 3.4：从临时变量中移除该 Lane，继续遍历剩余车道
        lanes &= ~lane
    }
}

// 获取高优先级的任务车道
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
    switch (getHighestPriorityLane(lanes)) {
        case SyncLane:
            return SyncLane;
        case InputContinuousHydrationLane:
            return InputContinuousHydrationLane;
        case InputContinuousLane:
            return InputContinuousLane;
        case DefaultHydrationLane:
            return DefaultHydrationLane;
        case DefaultLane:
            return DefaultLane;
        case TransitionHydrationLane:
            return TransitionHydrationLane;
        case TransitionLane1:
        case TransitionLane2:
        case TransitionLane3:
        case TransitionLane4:
        case TransitionLane5:
        case TransitionLane6:
        case TransitionLane7:
        case TransitionLane8:
        case TransitionLane9:
        case TransitionLane10:
        case TransitionLane11:
        case TransitionLane12:
        case TransitionLane13:
        case TransitionLane14:
        case TransitionLane15:
        case TransitionLane16:
            return lanes & TransitionLanes;
        case RetryLane1:
        case RetryLane2:
        case RetryLane3:
        case RetryLane4:
        case RetryLane5:
            return lanes & RetryLanes;
        case SelectiveHydrationLane:
            return SelectiveHydrationLane;
        case IdleHydrationLane:
            return IdleHydrationLane;
        case IdleLane:
            return IdleLane;
        case OffscreenLane:
            return OffscreenLane;
        default:
            return lanes
    }
}

// 根据不同的 lan 车道计算对应的过期时间
function computeExpirationTime(lane: Lane, currentTime: number) {
    switch (lane) {
        case SyncLane:
        case InputContinuousHydrationLane:
        case InputContinuousLane:
            return currentTime + 250
        case DefaultHydrationLane:
        case DefaultLane:
        case TransitionHydrationLane:
        case TransitionLane1:
        case TransitionLane2:
        case TransitionLane3:
        case TransitionLane4:
        case TransitionLane5:
        case TransitionLane6:
        case TransitionLane7:
        case TransitionLane8:
        case TransitionLane9:
        case TransitionLane10:
        case TransitionLane11:
        case TransitionLane12:
        case TransitionLane13:
        case TransitionLane14:
        case TransitionLane15:
        case TransitionLane16:
            return currentTime + 5000;
        case RetryLane1:
        case RetryLane2:
        case RetryLane3:
        case RetryLane4:
        case RetryLane5:
            return NoTimestamp
        case SelectiveHydrationLane:
        case IdleHydrationLane:
        case IdleLane:
        case OffscreenLane:
            return NoTimestamp
        default:
            return NoTimestamp
    }
}

/**
 * 1. 从根节点（FiberRoot）的待处理任务（pendingLanes）中筛选出可执行的任务
 * 2. 结合任务的阻塞状态（suspendedLanes）、唤醒状态（pingedLanes）和优先级规则，确定下一批最高优先级的任务车道
 * 3. 处理任务中断逻辑和车道纠缠（entanglement）关系，确保更新的一致性
 * getNextLanes 是 React 优先级调度的 “决策中心”，其核心逻辑可概括为：
 *  1. 优先级至上：优先处理非空闲任务（用户交互、动画等），再处理空闲任务
 *  2. 状态感知：区分任务的阻塞（suspended）与唤醒（pinged）状态，只处理可执行的任务
 *  3. 中断控制：高优先级任务可打断低优先级任务，反之则不行，保证用户体验流畅
 *  4. 一致性保障：通过车道纠缠机制，确保相关任务被批量处理，避免中间状态暴露
*/
export function getNextLanes(root: FiberRoot, wipLanes: Lanes): Lanes {
    const pendingLanes = root.pendingLanes // 存储根节点上所有待处理的任务车道（Lanes 是一个位掩码，每个位代表一个优先级车道）
    if (pendingLanes === NoLanes) { // 如果没有待处理任务，直接返回 NoLanes
        return NoLanes
    }
    let nextLanes = NoLanes
    const suspendedLanes = root.suspendedLanes // 被挂起（阻塞）的任务车道
    const pingedLanes = root.pingedLanes // 被唤醒（恢复执行）的任务车道
    const nonIdlePendingLanes = pendingLanes & NonIdleLanes // 基于位运算高效筛选出 “待处理的非空闲更新”，过滤出高优先级任务
    if (nonIdlePendingLanes !== NoLanes) { // 如果存在高优先级任务
        // 1. 优先处理未被阻塞的非空闲任务
        const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes // 筛选出未被阻塞的 非空闲任务
        if (nonIdleUnblockedLanes !== NoLanes) { // 如果存在未被挂起的高优先级任务
            nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes)
        } else {
            // 2. 若所有非空闲任务都被阻塞，处理已被唤醒的非空闲任务
            const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes
            if (nonIdlePingedLanes !== NoLanes) {
                nextLanes = getHighestPriorityLanes(nonIdlePingedLanes)
            }
        }
    } else { // 处理空闲任务（仅当无其他非空闲任务时）
        // 仅剩空闲任务时的处理逻辑
        const unblockedLanes = pendingLanes & ~suspendedLanes
        if (unblockedLanes !== NoLanes) {
            nextLanes = getHighestPriorityLanes(unblockedLanes)
        } else {
            if (pendingLanes !== NoLanes) {
                nextLanes = getHighestPriorityLanes(pendingLanes)
            }
        }
    }
    // 所有任务都被阻塞且未被唤醒，返回无任务
    if (nextLanes === NoLanes) {
        return NoLanes
    }

    if (
        wipLanes !== NoLanes &&  // 当前已有正在处理的任务
        wipLanes !== nextLanes &&  // 新任务与当前任务不同
        (wipLanes & suspendedLanes) === NoLanes // 当前任务未被阻塞
    ) {
        const nextLane = getHighestPriorityLane(nextLanes) // 新任务的最高优先级
        const wipLane = getHighestPriorityLane(wipLanes) // 当前任务的最高优先级
        // 若新任务优先级 <= 当前任务，或新任务是默认更新且当前是过渡更新，则不中断
        if (
            nextLane > wipLane ||
            (nextLane === DefaultLane && (wipLane & TransitionLanes) !== NoLanes)
        ) {
            return wipLanes // 继续处理当前任务，不中断
        }
    }
    // 在非并发模式（同步默认）下，输入相关的连续任务（如鼠标滑动）需要与默认优先级任务合并，避免分批执行导致的 UI 抖动
    if (
        allowConcurrentByDefault &&
        (root.current.mode & ConcurrentUpdatesByDefaultMode) !== NoMode
    ) {
        // 发模式下不额外处理
    } else if ((nextLanes & InputContinuousLane) !== NoLanes) {
        // 同步模式下，将连续输入任务与默认任务合并（确保同一批次执行）
        nextLanes |= pendingLanes & DefaultLane
    }

    // 处理车道纠缠； 某些任务需要绑定在一起执行（如同一事件源的连续更新），避免部分更新导致的不一致
    // 例如：用户快速输入时，多次输入事件的更新需要合并为一个批次执行，避免中间状态闪烁
    // 逻辑：如果选中的车道存在纠缠关系，将所有纠缠的车道都加入下一批任务
    const entangledLanes = root.entangledLanes  // 获取根节点上所有“存在依赖关系的优先级通道”
    if (entangledLanes !== NoLanes) { // 若存在关联的优先级（entangledLanes 不为空），则处理关联逻辑
        const entanglements = root.entanglements // 获取根节点上记录的“优先级关联关系表”（entanglements 是一个数组，索引对应优先级通道，值为关联的优先级集合）
        // 筛选出“当前待处理优先级（nextLanes）”与“关联优先级（entangledLanes）”的交集
        // 即：找出当前需要处理的、且存在关联关系的优先级
        let lanes = nextLanes & entangledLanes
        // 遍历所有“需要处理的关联优先级”（通过位运算循环提取每一个置位的优先级）
        while (lanes > 0) {
            // 随机选取一个优先级通道的索引（从 lanes 中提取一个非 0 的位）
            const index = pickArbitraryLaneIndex(lanes)
            const lane = 1 << index // 将索引转换为对应的优先级通道（如 index=3 对应 1<<3 = 8，即二进制 1000）
            // 核心逻辑：将当前优先级通道关联的所有优先级（entanglements[index]）合并到 nextLanes 中
            // 确保处理当前优先级时，其关联的优先级也会被一同处理
            nextLanes |= entanglements[index] // 合并纠缠的车道
            lanes &= ~lane
        }
    }

    // next Lane 如何计算
    return nextLanes
}

/**
 * markStarvedLanesAsExpired: 用于标记 “饥饿” 的任务优先级通道（Lanes）为已过期的核心函数，主要作用是在调度过程中检查待处理任务是否超时，确保高优先级任务不会被无限延迟，是 React 优先级调度机制的重要组成部分。
*/
export function markStarvedLanesAsExpired(root: FiberRoot, currentTime: number) {
    const pendingLanes = root.pendingLanes // 根节点中所有待处理的任务通道
    const suspendedLanes = root.suspendedLanes // 因 Suspense 挂起的任务通道
    const pingedLanes = root.pingedLanes // 被 "ping" 机制唤醒的任务通道（Suspense 恢复）
    const expirationTimes = root.expirationTimes // 每个通道对应的过期时间（时间戳）

    let lanes = pendingLanes
    while (lanes > 0) {
        const index = pickArbitraryLaneIndex(lanes) // 取出任意一个待处理通道的索引（二进制位操作）
        const lane = 1 << index // 将索引转换为对应的通道（单个二进制位）
        const expirationTime = expirationTimes[index]
        if (expirationTime === NoTimestamp) { // 通道未设置过期时间，需要判断是否为其设置
            if (
                (lane & suspendedLanes) === NoLanes || //条件1：该通道未被挂起（不是因 Suspense 暂停的任务）
                (lane & pingedLanes) !== NoLanes // 条件2：该通道已被 ping 唤醒（Suspense 恢复，可继续执行）
            ) {
                // 为通道计算并设置过期时间
                expirationTimes[index] = computeExpirationTime(lane, currentTime)
            }
        } else if (expirationTime <= currentTime) { // 如果任务已过期，过期车道记录下该车道
            root.expiredLanes |= lane
        }

        // 清除已处理的通道，继续循环
        lanes &= ~lane
    }
}

// 检查 lanes 中是否包含 非空闲的工作
export function includesNonIdleWork(lanes: Lanes) {
    return (lanes & NonIdleLanes) !== NoLanes
}

export const NoTimestamp = -1
export function createLaneMap<T>(initial: T): LaneMap<T> {
    const laneMap: LaneMap<T> = []
    for (let i = 0; i < TotalLanes; i++) {
        laneMap.push(initial)
    }
    return laneMap
}

// 在开启过渡追踪（enableTransitionTracing）的前提下，从传入的车道（Lane/Lanes）集合中，提取每个车道关联的 Transition 实例并返回
export function getTransitionsForLanes(root: FiberRoot, lanes: Lane | Lanes): Array<Transition> | null {
    if (!enableTransitionTracing) {
        return null
    }

    // 步骤2：初始化数组，存储提取到的 Transition 实例
    const transitionsForLanes: any = []
    // 步骤3：循环拆解车道集合，处理每个单个 Lane
    while (lanes > 0) {
        // 3.1 提取当前车道的二进制位索引（如 TransitionLane1 → 索引5）
        const index = laneToIndex(lanes)
        // 3.2 还原为单个 Lane（1 << 索引 → 如 1<<5=32）
        const lane = 1 << index
        // 3.3 从根节点映射表中获取该车道关联的 Transition 数组
        const transitions = root.transitionLanes[index]
        // 3.4 若有关联实例，全部推入结果数组
        if (transitions !== null) {
            transitions.forEach(transition => {
                transitionsForLanes.push(transition)
            })
        }
        // 3.5 移除已处理的 Lane，继续遍历剩余车道
        lanes &= ~lane
    }
    // 步骤4：无实例则返回 null，否则返回实例数组
    if (transitionsForLanes.length === 0) {
        return null
    }
    return transitionsForLanes
}

/**
 * 标记根节点（FiberRoot）存在待处理更新的核心函数 
 * 当 React 应用中产生状态更新（如 setState、useState 触发的更新）时，最终会调用 markRootUpdated 通知根节点：“有一个新的更新需要处理”。其核心职责是：
 *  1. 记录更新的优先级（updateLane），确保高优先级更新优先被处理；
 *  2. 清除与 “挂起状态” 相关的标记（如 suspendedLanes），避免旧状态干扰新更新；
 *  3. 记录更新的触发时间（eventTime），用于优先级排序和过期判断。
 * */
export function markRootUpdated(
    root: FiberRoot,
    updateLane: Lane, // 本次更新的优先级通道（Lane）
    eventTime: number // 触发本次更新的事件时间（如用户点击的时间戳）
) {
    // 1. 将本次更新的优先级（updateLane）添加到根节点的“待处理优先级集合”中， 收集待处理更新的优先级
    root.pendingLanes |= updateLane
    // 2. 如果本次更新不是“空闲优先级”（IdleLane），则清除挂起和 ping 相关的标记，为什么要清空？
    // 因为：高优先级更新（如用户点击）的到来会打断 Suspense 的挂起状态，为了确保用户操作优先响应，避免被旧的挂起状态阻塞。
    if (updateLane !== IdleLane) {
        root.suspendedLanes = NoLanes // 清空“因 Suspense 挂起的优先级”
        root.pingedLanes = NoLanes // 清空“被 ping 唤醒的优先级”
    }
    // 3. 记录本次更新的触发时间（eventTime）到根节点的事件时间数组中
    const eventTimes = root.eventTimes // 存储各优先级对应事件时间的数组
    const index = laneToIndex(updateLane)  // 将优先级（Lane）转换为数组索引
    eventTimes[index] = eventTime // 记录时间戳
}

/**
 * markRootFinished: 用于标记根节点（FiberRoot）渲染工作完成的关键函数，主要作用是更新根节点的优先级 lanes 状态，清理已完成的任务信息，并为下一次调度做准备
 * FiberRoot 是整个应用的根节点，维护了所有待处理任务的优先级信息（通过 lanes 表示， lanes 是 React 用于优先级调度的二进制位标识）。当根节点的部分或全部渲染工作完成后，需要更新这些优先级状态，避免重复处理已完成的任务。
 * markRootFinished 就是在渲染工作完成后，负责清理已完成的 lanes 信息，保留未完成的任务，并重置相关状态。
 * 
*/
export function markRootFinished(
    root: FiberRoot,
    remainingLanes: Lanes
) {
    const noLongerPendingLanes = root.pendingLanes & ~remainingLanes // 已完成的任务优先级 pendingLanes 中剔除 remainingLanes 后的部分
    root.pendingLanes = remainingLanes

    root.suspendedLanes = NoLanes
    root.pingedLanes = NoLanes

    root.expiredLanes &= remainingLanes
    root.mutableReadLanes &= remainingLanes

    root.entangledLanes &= remainingLanes

    const entanglements = root.entanglements
    const eventTimes = root.eventTimes
    const expirationTimes = root.expirationTimes

    let lanes = noLongerPendingLanes
    while (lanes > 0) {
        const index = pickArbitraryLaneIndex(lanes)
        const lane = 1 << index
        entanglements[index] = NoLanes
        eventTimes[index] = NoTimestamp
        expirationTimes[index] = NoTimestamp

        lanes &= ~lane
    }
}

/**
 * markRootEntangled 是 React 完成「车道纠缠」的最终核心函数 —— 它的作用是：
 * 1. 将指定的 entangledLanes（纠缠车道集合）同步标记到根节点的两个核心状态中：root.entangledLanes（根节点总纠缠车道）和 root.entanglements（车道纠缠映射表），保证每个参与纠缠的车道都能关联到完整的纠缠集合，让 React 调度器能通过任意一个纠缠车道，找到所有绑定在一起的车道。简单说，这个函数是「车道纠缠」的「最终落地逻辑」，为后续「通过单个车道找到所有关联纠缠车道」提供数据支撑。
*/
export function markRootEntangled(root: FiberRoot, entangledLanes: Lanes) {
    // 步骤1：将新的纠缠车道合并到根节点总纠缠车道中
    // root.entangledLanes |= entangledLanes → 合并后赋值给 rootEntangledLanes
    const rootEntangledLanes = (root.entangledLanes |= entangledLanes)
    // 步骤2：获取根节点的纠缠映射表（entanglements 数组）
    const entanglements = root.entanglements
    // 步骤3：遍历根节点所有已纠缠的车道（rootEntangledLanes）
    let lanes = rootEntangledLanes
    while (lanes) {
        // 3.1 提取当前车道的最高有效位索引
        const index = pickArbitraryLaneIndex(lanes)
        // 3.2 还原为单个车道（如索引5 → 1<<5=32）
        const lane = 1 << index
        // 3.3 核心判断：当前车道是否需要关联新的纠缠集合
        // 条件1：当前车道属于本次要纠缠的车道（lane & entangledLanes）
        // 条件2：当前车道已关联的纠缠车道与本次纠缠车道有交集（entanglements[index] & entangledLanes）
        // 只要满足一个条件，就需要更新该车道的纠缠映射
        if (
            (lane & entangledLanes) |
            (entanglements[index] & entangledLanes)
        ) {
            // 3.4 更新映射表：将本次纠缠车道合并到该索引的映射值中
            entanglements[index] |= entangledLanes
        }
        // 3.5 移除已处理的车道，继续遍历剩余车道
        lanes &= ~lane
    }
}

export function getLanesToRetrySynchronouslyOnError(root: FiberRoot): Lanes {
    debugger
    return NoLanes
}