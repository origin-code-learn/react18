import type { FiberRoot, TransitionTracingCallbacks } from "react-reconciler/src/ReactInternalTypes";
import type { MutableSource, ReactNodeList } from "shared/ReactTypes";
import { ConcurrentRoot } from 'react-reconciler/src/ReactRootTags';
import { createContainer, updateContainer } from 'react-reconciler/src/ReactFiberReconciler';
import { allowConcurrentByDefault, disableCommentsAsDOMContainers } from "shared/ReactFeatureFlags";
import { COMMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_NODE, ELEMENT_NODE } from "../shared/HTMLNodeType";
import { listenToAllSupportedEvents } from "../events/DOMPluginEventSystem";

export type RootType = {
    render(children: ReactNodeList): void;
    unmount(): void;
    _internalRoot: FiberRoot | null;
};

export type CreateRootOptions = {
    unstable_strictMode?: boolean;  // 是否启用严格模式
    unstable_concurrentUpdatesByDefault?: boolean;  // 是否默认启用并发更新
    identifierPrefix?: string;  // 为 React 生成的 DOM 属性添加前缀，在微前端或多个 React 应用共存的场景中，用于避免不同应用之间的属性冲突。
    onRecoverableError?: (error: unknown) => void,  // 自定义可恢复错误的处理函数，React 18 改进了错误边界机制，这个回调函数会在 React 遇到可恢复的错误时被调用。
    transitionCallbacks?: TransitionTracingCallbacks; // 过渡动画的回调函数，用于性能监控和调试
}

export type HydrateRootOptions = {
    hydratedSources?: Array<MutableSource<any>>;
    onHydrated?: (suspenseNode: Comment) => void;
    onDeleted?: (suspenseNode: Comment) => void;
    // Options for all roots
    unstable_strictMode?: boolean;
    unstable_concurrentUpdatesByDefault?: boolean;
    identifierPrefix?: string;
    onRecoverableError?: (error: unknown) => void;
}

const defaultOnRecoverableError = typeof reportError === 'function' ? reportError : (error: any) => console.error(error)

export function isValidContainer(node: any): boolean {
    return !!(
        node &&
        ([ELEMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE].includes(node.nodeType) ||
            (!disableCommentsAsDOMContainers && node.nodeType === COMMENT_NODE && node.nodeValue === ' react-mount-point-unstable '))
    )
}

function ReactDOMRoot(internalRoot: FiberRoot) {
    this._internalRoot = internalRoot
}

ReactDOMRoot.prototype.render = function (children: ReactNodeList) {
    const root = this._internalRoot
    if (root === null) {
        throw new Error('Cannot update an unmounted root.');
    }
    updateContainer(children, root, null, null)
}

export function createRoot(
    container: Element | Document | DocumentFragment,
    options?: CreateRootOptions
) {

    let isStrictMode = false
    let concurrentUpdatesByDefaultOverride = false
    let identifierPrefix = ''
    let onRecoverableError = defaultOnRecoverableError
    let transitionCallbacks: any = null

    if (options !== null && options !== undefined) {
        if (options.unstable_strictMode === true) {
            isStrictMode = true
        }
        if (allowConcurrentByDefault && options.unstable_concurrentUpdatesByDefault === true) {
            concurrentUpdatesByDefaultOverride = true
        }
        if (options.identifierPrefix !== undefined) {
            identifierPrefix = options.identifierPrefix
        }
        if (options.onRecoverableError !== undefined) {
            onRecoverableError = options.onRecoverableError
        }
        if (options.transitionCallbacks !== undefined) {
            transitionCallbacks = options.transitionCallbacks
        }
    }

    const root = createContainer(
        container,
        ConcurrentRoot,
        null,
        isStrictMode,
        concurrentUpdatesByDefaultOverride,
        identifierPrefix,
        onRecoverableError,
        transitionCallbacks
    )

    // todo
    // markContainerAsRoot(root.current, container)
    const rootContainerElement: Document | Element | DocumentFragment = (container.nodeType === COMMENT_NODE ? container.parentNode : container) as any
    // react 事件系统
    listenToAllSupportedEvents(rootContainerElement)
    return new ReactDOMRoot(root)
}
