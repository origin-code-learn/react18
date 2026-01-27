import { REACT_LAZY_TYPE } from "shared/ReactSymbols";
import type { Thenable, Wakeable } from "shared/ReactTypes";

// 懒组件状态枚举（状态机核心）
const Uninitialized = -1;  // 未初始化：还未触发动态导入
const Pending = 0;         // 加载中：动态导入已触发，等待结果
const Resolved = 1;        // 已解析：动态导入成功，拿到组件
const Rejected = 2;        // 已失败：动态导入出错

// 未初始化：存储动态导入的函数（如 () => import('./LazyComp')
type UninitializedPayload<T> = {
    _status: -1,
    _result: () => Thenable<{ default: T }>  // Thenable 是 Promise 兼容类型
}

// 加载中：存储待解析的 Promise（Wakeable 是 React 内部的 Promise 类型）
type PendingPayload = {
    _status: 0,
    _result: Wakeable
}

// 已解析：存储动态导入的结果（默认导出的组件）
type ResolvedPayload<T> = {
    _status: 1,
    _result: { default: T }
}

// 已失败：存储加载失败的错误信息
type RejectedPayload = {
    _status: 2,
    _result: any
}

type Payload<T> = UninitializedPayload<T> | PendingPayload | ResolvedPayload<T> | RejectedPayload

export type LazyComponent<T, P> = {
    $$typeof: Symbol | number, // 标记 React 元素类型（REACT_LAZY_TYPE）
    _payload: P,               // 存储状态机数据（Payload）
    _init: (payload: P) => T   // 初始化函数（触发加载/返回组件）
}

function lazyInitializer<T>(payload: Payload<T>): T {
    // 1. 未初始化状态：触发动态导入
    if (payload._status === Uninitialized) {
        const ctor = payload._result  // 获取动态导入函数
        const thenable = ctor()  // 执行导入（返回 Promise/Thenable）
        // 2. 监听导入结果，更新状态机
        thenable.then(
            moduleObject => {
                // 防止竞态：仅当状态是 加载中/未初始化 时更新
                if (payload._status as number === Pending || payload._status === Uninitialized) {
                    const resolved: ResolvedPayload<T> = payload as any
                    resolved._status = Resolved
                    resolved._result = moduleObject
                }
            },
            error => {
                if (payload._status === Pending as number || payload._status === Uninitialized) {
                    const rejected: RejectedPayload = payload as any
                    rejected._status = Rejected
                    rejected._result = error
                }
            }
        )

        // 3. 将状态标记为“加载中”
        if (payload._status === Uninitialized) {
            const pending: PendingPayload = payload as any
            pending._status = Pending
            pending._result = thenable
        }
    }

    // 4. 根据最终状态返回组件或抛出异常
    if (payload._status === Resolved) {
        const moduleObject = payload._result
        return moduleObject.default // 返回默认导出的组件
    } else {
        throw payload._result
    }
}

export function lazy<T>(ctor: () => Thenable<{ default: T }>): LazyComponent<T, Payload<T>> {

    const payload: Payload<T> = {
        _status: Uninitialized,
        _result: ctor
    }
    const lazyType: LazyComponent<T, Payload<T>> = {
        $$typeof: REACT_LAZY_TYPE,
        _payload: payload,
        _init: lazyInitializer
    }

    return lazyType
} 