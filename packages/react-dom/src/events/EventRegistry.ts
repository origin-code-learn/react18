import { DOMEventName } from "./DOMEventNames";

export const allNativeEvents: Set<DOMEventName> = new Set()

export const registrationNameDependencies = {}

// registerTwoPhaseEvent：注册支持捕获与冒泡阶段的事件
export function registerTwoPhaseEvent(
    registrationName: string, // React 事件名（如 'onClick'）
    dependencies: Array<DOMEventName> // 依赖的原生 DOM 事件（如 ['click']）
) {
    // 注册冒泡阶段事件（如 'onClick' 关联 'click'）
    registerDirectEvent(registrationName, dependencies)
    // 注册捕获阶段事件（如 'onClickCapture' 关联 'click'）
    registerDirectEvent(registrationName + 'Capture', dependencies)
}

// registerDirectEvent：注册单个事件（直接映射）
export function registerDirectEvent(
    registrationName: string,
    dependencies: Array<DOMEventName>
) {
    // 记录事件名与原生依赖的映射（如 'onClick' → ['click']）
    registrationNameDependencies[registrationName] = dependencies

    // 将依赖的原生事件添加到全局列表（用于后续批量注册监听器）
    for (let i = 0; i < dependencies.length; i++) {
        allNativeEvents.add(dependencies[i])
    }
}