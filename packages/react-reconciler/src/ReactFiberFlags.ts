
export type Flags = number;

// 基础标记（无特定分组）
export const NoFlags = /*                      */ 0b00000000000000000000000000; // 无任何副作用（初始状态）
export const PerformedWork = /*                */ 0b00000000000000000000000001; // 标记节点已执行过工作（如协调阶段已处理）

// 提交阶段 - Mutation 阶段相关标记（DOM 变更）
export const Placement = /*                    */ 0b00000000000000000000000010; // 节点需要插入到 DOM 中（新增节点）
export const Update = /*                       */ 0b00000000000000000000000100; // 节点需要更新（如属性、文本内容变化）
export const Deletion = /*                     */ 0b00000000000000000000001000; // 节点需要从 DOM 中删除（标记自身删除）
export const ChildDeletion = /*                */ 0b00000000000000000000010000; // 节点的子节点需要删除（用于父节点批量处理子节点删除）
export const ContentReset = /*                 */ 0b00000000000000000000100000; // 节点的文本内容需要重置（如清空父节点文本后插入子节点）
export const Callback = /*                     */ 0b00000000000000000001000000; // 提交阶段 - Layout 阶段相关标记（DOM 变更后）
export const DidCapture = /*                   */ 0b00000000000000000010000000; // 节点已捕获错误（用于错误边界 Error Boundary）
export const ForceClientRender = /*            */ 0b00000000000000000100000000; // 强制客户端渲染（即使已服务端渲染，仍需客户端重新渲染）
export const Ref = /*                          */ 0b00000000000000001000000000; // 需要处理 ref 引用（如执行 ref 回调或更新 ref.current）
export const Snapshot = /*                     */ 0b00000000000000010000000000; // 需要执行快照相关逻辑（如 getSnapshotBeforeUpdate）
export const Passive = /*                      */ 0b00000000000000100000000000; // 需要处理被动效果（如 useEffect 的回调和清理函数）
export const Hydrating = /*                    */ 0b00000000000001000000000000; // 节点处于服务端渲染（SSR）的 hydration 阶段（激活静态 HTML 为交互组件）
export const Visibility = /*                   */ 0b00000000000010000000000000; // 节点可见性变化（如用于懒加载、动画触发等场景）
export const StoreConsistency = /*             */ 0b00000000000100000000000000; // 确保状态存储一致性（内部用于协调状态更新）

export const LifecycleEffectMask = Passive | Update | Callback | Ref | Snapshot | StoreConsistency;  // 生命周期相关效果的掩码（包含被动效果、更新、回调等）

export const HostEffectMask = /*               */ 0b00000000000111111111111111; // 宿主环境（DOM）相关效果的掩码（包含大部分 DOM 操作标记）

// 渲染阶段相关标记
export const Incomplete = /*                   */ 0b00000000001000000000000000; // 节点的工作尚未完成（渲染阶段未处理完）
export const ShouldCapture = /*                */ 0b00000000010000000000000000; // 节点需要捕获错误（用于错误边界触发捕获逻辑）
export const ForceUpdateForLegacySuspense = /* */ 0b00000000100000000000000000; // 为兼容旧版 Suspense 强制更新（内部过渡用）
export const DidPropagateContext = /*          */ 0b00000001000000000000000000; // 上下文（Context）已传播到子节点（避免重复传播）
export const NeedsPropagation = /*             */ 0b00000010000000000000000000; // 节点需要传播上下文（子节点依赖上下文，需触发传播）
export const Forked = /*                       */ 0b00000100000000000000000000; // 节点已分叉（用于并发模式下的任务分叉，内部调度用）

// 静态标记（优化相关）
export const RefStatic = /*                    */ 0b00001000000000000000000000; // ref 是静态的（不会变化，可优化避免重复处理）
export const LayoutStatic = /*                 */ 0b00010000000000000000000000; // 布局效果是静态的（如 useLayoutEffect 依赖不变，可优化）
export const PassiveStatic = /*                */ 0b00100000000000000000000000; // 被动效果是静态的（如 useEffect 依赖不变，可优化）

//开发环境相关标记
export const MountLayoutDev = /*               */ 0b01000000000000000000000000; // 开发环境：标记布局效果在挂载时触发（用于 DevTools 追踪）
export const MountPassiveDev = /*              */ 0b10000000000000000000000000; // 开发环境：标记被动效果在挂载时触发（用于 DevTools 追踪）

// 阶段掩码（批量判断某类标记）
export const BeforeMutationMask = Update | Snapshot | 0 // Before Mutation 阶段需要处理的标记掩码（DOM 变更前的操作）

export const MutationMask = Placement | Update | ChildDeletion | ContentReset | Ref | Hydrating | Visibility // Mutation 阶段需要处理的标记掩码（实际执行 DOM 变更的操作）

export const LayoutMask = Update | Callback | Ref | Visibility // Layout 阶段需要处理的标记掩码（DOM 变更后的布局操作

export const PassiveMask = Passive | ChildDeletion // 被动效果阶段需要处理的标记掩码（如 useEffect 相关操作）

export const StaticMask = LayoutStatic | PassiveStatic | RefStatic // 静态效果的掩码（用于优化判断，避免重复处理静态内容）
