import type { Fiber } from "react-reconciler/src/ReactInternalTypes";
import type { DOMEventName } from "./DOMEventNames"

export type DispatchConfig = {
    dependencies?: Array<DOMEventName>;  //该事件依赖的原生 DOM 事件列表（可选）
    // 分阶段的事件注册名称（捕获阶段和冒泡阶段）
    phasedRegistrationNames: {
        bubbled: null | string, // 冒泡阶段的事件注册名（如 onClick）
        captured: null | string // 捕获阶段的事件注册名（如 onClickCapture）
    };
    registrationName?: string // 事件注册名称（可选，用于非分阶段的事件）
}

export type EventInterfaceType = {
    [propName: string]: 0 | ((event: {[propName: string]: unknown}) => any)
}

// 基础合成事件类型
type BaseSyntheticEvent = {
    isPersistent: () => boolean; // 判断事件是否持久化（不被事件池回收）
    isPropagationStopped: () => boolean;  // 判断事件是否已阻止冒泡
    // 内部属性：以 _ 开头用于事件分发的 Fiber 实例列表（可选）
    _dispatchInstances?: null | Array<Fiber | null> | Fiber; // 可能是单个 Fiber、Fiber 数组或 null
    _dispatchListeners?: null | Array<Function> | Function;  // 可能是单个函数、函数数组或 null
    _targetInst: Fiber;  // 内部属性：事件目标对应的 Fiber 实例（触发事件的元素在 React 中的虚拟节点）
    nativeEvent: Event;  // 原生 DOM 事件对象（未被 React 包装的原始事件）
    target?: unknown;  // 事件的目标元素（DOM 元素，可能为任意类型）
    relatedTarget?: unknown;  // 相关目标元素（如鼠标事件中的 relatedTarget，可能为任意类型）
    type: string;  // 事件类型名称（如 'click'、'change'）
    currentTarget: null | EventTarget;  // 当前事件处理程序绑定的元素（与 nativeEvent.currentTarget 对应）
}

/**
 * 已知的 React 合成事件类型
 * 用于 React 预定义的标准事件（如 onClick、onChange 等）
 */
export type KnownReactSyntheticEvent = BaseSyntheticEvent & {
    _reactName: string; // 事件在 React 内部的名称（如 'onClick'）
}

/**
 * 未知的 React 合成事件类型
 * 用于非 React 预定义的事件（如自定义事件）
 */
export type UnknownReactSyntheticEvent = BaseSyntheticEvent & {
    // 未知事件的 _reactName 为 null
    _reactName: null;
};


/**
 * React 合成事件的联合类型
 * 涵盖所有可能的 React 合成事件（已知和未知）
 */
export type ReactSyntheticEvent = | KnownReactSyntheticEvent | UnknownReactSyntheticEvent;

interface IBaseSyntheticEvent<E = object, C = any, T = any> {
    nativeEvent: E;
    currentTarget: C;
    target: T;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    eventPhase: number;
    isTrusted: boolean;
    preventDefault(): void;
    isDefaultPrevented(): boolean;
    stopPropagation(): void;
    isPropagationStopped(): boolean;
    persist(): void;
    timeStamp: number;
    type: string;
}

export interface SyntheticEvent<T = Element, E = Event> extends IBaseSyntheticEvent<E, EventTarget & T, EventTarget> {}
