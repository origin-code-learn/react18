
export type EventSystemFlags = number;

// 用于表示事件处理发生在非 React 管理的 DOM 节点上（例如： 通过 ReactDOM.findDOMNode 访问的节点）
// 用于区分 React 管理的节点和外部节点的事件处理逻辑
export const IS_EVENT_HANDLE_NON_MANAGED_NODE = 1;

// 表示事件不使用 React 的事件委托机制 （即直接绑定到目标元素而非顶层容器）
// React 默认使用事件委托优化性能，但某些特俗事件可能需要直接绑定
export const IS_NON_DELEGATED = 1 << 1;  // 十进制：2

// 表示事件处理处于捕获阶段 而非冒泡阶段，对应 DOM 事件流中的 捕获阶段(从文档根到目标元素的传播过程)
export const IS_CAPTURE_PHASE = 1 << 2;  // 十进制 4

// 表示事件监听是被动的， 被动监听器用于优化滚动性能（如 touchmove、 wheel 事件），不会阻止默认行为
export const IS_PASSIVE = 1 << 3;  // 十进制 8

// 表示启用了 Facebook 内部的遗留支持模式。用于兼容旧版 Facebook 应用中的特殊事件处理逻辑
export const IS_LEGACY_FB_SUPPORT_MODE = 1 << 4; // 十进制 16

// 用于判断是否不应为 Facebook 遗留模式延迟点击事件处理。避免在遗留模式和捕获阶段处理事件时产生无限循环（如事件重放导致的循环调用）。
export const SHOULD_NOT_DEFER_CLICK_FOR_FB_SUPPORT_MODE = IS_LEGACY_FB_SUPPORT_MODE | IS_CAPTURE_PHASE;

// 用于判断是否不应处理事件插件的 polyfill（如自定义事件行为），当事件发生在非管理节点、使用非委托模式或处于捕获阶段时，跳过某些事件插件的处理，避免不必要的兼容性逻辑。
export const SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS = IS_EVENT_HANDLE_NON_MANAGED_NODE | IS_NON_DELEGATED | IS_CAPTURE_PHASE;