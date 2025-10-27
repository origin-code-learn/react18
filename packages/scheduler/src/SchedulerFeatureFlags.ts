
export const enableSchedulerDebugging = false;  // 启用调度器调试模式
export const enableIsInputPending = false;  // 启用 navigator.scheduling.isInputPending() API 检测用户输入
export const enableProfiling = false; // 启用调度器性能分析。
export const enableIsInputPendingContinuous = false; // 扩展 isInputPending() 检测范围，包含连续输入事件（如鼠标移动、滚动）。
export const frameYieldMs = 5; // 单个任务的最大执行时间（超过则让出主线程）
export const continuousYieldMs = 50; // 处理连续输入事件时的任务执行时间阈值
export const maxYieldMs = 300; // 任务的最大阻塞时间（强制让出主线程的兜底值）