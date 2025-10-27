import { Fiber, TransitionTracingCallbacks } from "react-reconciler/src/ReactInternalTypes";

type Key = string | number | bigint;

// TypeScript 等价定义
type JSXElementConstructor<P> = | ((props: P, ) => ReactNode | Promise<ReactNode>) | (new(props: P, context: any) => any);

interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
  type: T;
  props: P;
  key: Key | null;
}

export type ReactNode = ReactElement 
| ReactPortal
| ReactText
| ReactFragment
| ReactProvider<any>
| ReactConsumer<any>;


export interface Wakeable {
    then(onFulfill: () => unknown, onReject: () => unknown): void | Wakeable
}

export type MutableSource<Source> = {
    _source: Source,
    _getVersion: MutableSourceGetVersionFn,

    _workInProgressVersionPrimary: null | MutableSourceVersion,
    _workInProgressVersionSecondary: null | MutableSourceVersion,

    _currentPrimaryRenderer?: Object | null,
    _currentSecondaryRenderer?: Object | null,

    _currentlyRenderingFiber?: Fiber | null,
    _initialVersionAsOfFirstRender?: MutableSourceVersion | null,
}

export type ReactText = string | number
export type ReactEmpty = null | void | boolean
export type ReactNodeList = ReactEmpty | ReactNode
export type ReactFragment = ReactElement | Iterable<ReactNode>
export type ReactProviderType<T> = {
    $$typeof: Symbol | number;
    _context: ReactContext<T>;
    [key: string]: any
}

export type ReactProvider<T> = {
    $$typeof: Symbol | number;
    type: ReactProviderType<T>;
    key: null | string;
    ref: null;
    props: {
        value: T;
        children?: ReactNodeList;
        [key: string]: any
    }
    [key: string]: any
}

export type ReactConsumer<T> = {
    $$typeof: Symbol | number;
    type: ReactContext<T>;
    key: null | string;
    ref: null;
    props: {
        children: (value: T) => ReactNodeList;
        [key: string]: any
    }
}

export type ReactContext<T> = {
    $$typeof: Symbol | number;
    Consumer: ReactContext<T>;
    Provider: ReactProviderType<T>;
    _currentValue: T;
    _currentValue2: T;
    _threadCount: number;
    _currentRenderer?: Object | null;
    _currentRenderer2?: Object | null;
    displayName?: string;
    _defaultValue: T;
    _globalName: string;
    [key: string]: any
}

export type ReactPortal = {
    $$typeof: Symbol | number;
    key: null | string;
    containerInfo: any;
    children: ReactNodeList;
    implementation: any;
    [key: string]: any;
}


export type CreateRootOptions = {
    unstable_strictMode?: boolean;
    unstable_concurrentUpdatesByDefault?: boolean,
    identifierPrefix?: string,
    onRecoverableError?: (error: any) => void,
    transitionCallbacks?: TransitionTracingCallbacks,
}

export type RefObject = {
    current: any;
}

export type ReactScope = {
    $$typeof: Symbol | number
}

export type MutableSourceVersion = NonNullable<unknown>

export type MutableSourceGetVersionFn = (source: NonNullable<unknown>) => MutableSourceVersion

export type MutableSource<Source extends NonNullable<unknown>> = {
    _source: Source;
    _getVersion: MutableSourceGetVersionFn;
    _workInProgressVersionPrimary: null | MutableSourceVersion;
    _workInProgressVersionSecondary: null | MutableSourceVersion;

    _currentPrimaryRenderer?: Object | null;
    _currentSecondaryRenderer?: Object | null;

    _currentlyRenderingFiber?: Fiber | null;
    _initialVersionAsOfFirstRender?: MutableSourceVersion | null
}

interface ErrorInfo {
    componentStack?: string | null;
    digest?: string | null;
}

interface NewLifecycle<P, S, SS> {
    getSnapshotBeforeUpdate?: (prevProps: Readonly<P>, prevState: Readonly<S>) => SS | null;
    componentDidUpdate?: (prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: SS) => void;
}

interface DeprecatedLifecycle<P, S> {
    componentWillMount?: () => void;
    UNSAFE_componentWillMount?: () => void;
    componentWillReceiveProps?: (nextProps: Readonly<P>, nextContext: any) => void;
    UNSAFE_componentWillReceiveProps?: (nextProps: Readonly<P>, nextContext: any) => void;
    componentWillUpdate?: (nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any) => void;
    UNSAFE_componentWillUpdate?(nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any): void;
}

interface ComponentLifecycle<P, S, SS = any> extends NewLifecycle<P, S, SS>, DeprecatedLifecycle<P, S> {
    componentDidMount?: () => void;
    shouldComponentUpdate?: (nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any) => boolean;
    componentWillUnmount?: () => void;
    componentDidCatch?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ExoticComponent<P = {}> {
    (props: P): ReactNode;
    readonly $$typeof: symbol
}

interface ProviderProps<T> {
    value: T;
    children?: ReactNode | undefined
}

interface ProviderExoticComponent<P> extends ExoticComponent<P> {}

type Provider<T> = ProviderExoticComponent<ProviderProps<T>>

interface Context<T> extends Provider<T> {}

interface Component<P = {}, S = {}, SS = any> extends ComponentLifecycle<P, S, SS> {}

export class Component<P, S> {
    static contextType?: Context<any> | undefined;
    static propTypes?: any;
    context: unknown;
    constructor(props: P);
    constructor(props: P, context: any);
    setState<K extends keyof S>(
        state: ((prevState: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null) | (Pick<S, K> | S | null),
        callback?: () => void
    ): void;
    forceUpdate(callback?: () => void): void;
    render(): ReactNode;
    readonly props: Readonly<P>;
    state: Readonly<S>
}

export type Transition = {
    name: string,
    startTime: number,
};

export type StartTransitionOptions = {
    name?: string
}

export type MutableSourceGetSnapshotFn<Source, Snapshot> = (source: Source) => Snapshot

export type MutableSourceSubscribeFn<Source, Snapshot> = (source: Source, callback: (snapshot: Snapshot) => void) => () => void

export type ReactScopeInstance = {
    DO_NOT_USE_queryAllNodes(ReactScopeQuery): null | Array<Object>,
    DO_NOT_USE_queryFirstNode(ReactScopeQuery): null | Object,
    containsNode(Object): boolean,
    getChildContextValues: <T>(context: ReactContext<T>) => Array<T>
}