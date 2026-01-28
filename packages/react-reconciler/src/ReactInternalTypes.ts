import { MutableSource, MutableSourceGetSnapshotFn, MutableSourceSubscribeFn, MutableSourceVersion, ReactContext, RefObject, StartTransitionOptions, Wakeable } from "shared/ReactTypes";
import { RootTag } from "./ReactRootTags";
import { WorkTag } from "./ReactWorkTags";
import { Lane, LaneMap, Lanes } from "./ReactFiberLane.old";
import { TypeOfMode } from "./ReactTypeOfMode";
import { Flags } from "./ReactFiberFlags";
import { Source } from "shared/ReactElementType";
import { NoTimeout, SuspenseInstance } from "./ReactFiberHostConfig"
import { ConcurrentUpdate } from "./ReactFiberConcurrentUpdates.old";

export type ContextDependency<T> = {
  context: ReactContext<T>;
  next: ContextDependency<unknown> | null;
  memoizedValue: T;
  [key: string]: any
}

export type Dependencies = {
  lanes: Lanes;
  firstContext: ContextDependency<unknown> | null;
  [key: string]: any
}

export type HookType =
  | 'useState'
  | 'useReducer'
  | 'useContext'
  | 'useRef'
  | 'useEffect'
  | 'useInsertionEffect'
  | 'useLayoutEffect'
  | 'useCallback'
  | 'useMemo'
  | 'useImperativeHandle'
  | 'useDebugValue'
  | 'useDeferredValue'
  | 'useTransition'
  | 'useMutableSource'
  | 'useSyncExternalStore'
  | 'useId'
  | 'useCacheRefresh';

export type TransitionTracingCallbacks = {
  onTransitionStart?: (transitionName: string, startTime: number) => void,
  onTransitionProgress?: (
    transitionName: string,
    startTime: number,
    currentTime: number,
    pending: Array<{ name: null | string }>,
  ) => void,
  onTransitionIncomplete?: (
    transitionName: string,
    startTime: number,
    deletions: Array<{
      type: string,
      name?: string,
      newName?: string,
      endTime: number,
    }>,
  ) => void,
  onTransitionComplete?: (
    transitionName: string,
    startTime: number,
    endTime: number,
  ) => void,
  onMarkerProgress?: (
    transitionName: string,
    marker: string,
    startTime: number,
    currentTime: number,
    pending: Array<{ name: null | string }>,
  ) => void,
  onMarkerIncomplete?: (
    transitionName: string,
    marker: string,
    startTime: number,
    deletions: Array<{
      type: string,
      name?: string,
      newName?: string,
      endTime: number,
    }>,
  ) => void,
  onMarkerComplete?: (
    transitionName: string,
    marker: string,
    startTime: number,
    endTime: number,
  ) => void,
};

export type Fiber = {
  tag: WorkTag;
  key: null | string;
  elementType: any;
  type: any;
  stateNode: any;

  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  index: number;

  ref: | null | (((handle: any) => void) & { _stringRef?: string, [key: string]: any }) | RefObject;
  pendingProps: any;
  memoizedProps: any;

  updateQueue: unknown;

  memoizedState: any;

  dependencies: Dependencies | null;

  mode: TypeOfMode;

  flags: Flags;
  subtreeFlags: Flags;
  deletions: Array<Fiber> | null;

  nextEffect: Fiber | null;
  firstEffect: Fiber | null;
  lastEffect: Fiber | null;

  lanes: Lanes;
  childLanes: Lanes;

  alternate: Fiber | null;

  actualDuration?: number;
  actualStartTime?: number;
  selfBaseDuration?: number;
  treeBaseDuration?: number;

  _debugSource?: Source | null;
  _debugOwner?: Fiber | null;
  _debugIsCurrentlyTiming?: boolean;
  _debugNeedsRemount?: boolean;
  _debugHookTypes?: Array<HookType> | null

}

export type SuspenseHydrationCallbacks = {
  onHydrated?: (suspenseInstance: SuspenseInstance) => void;
  onDeleted?: (suspenseInstance: SuspenseInstance) => void;
}

type BaseFiberRootProperties = {
  tag: RootTag;
  containerInfo: any;
  pendingChildren: any;
  current: Fiber;
  pingCache: WeakMap<Wakeable, Set<unknown>> | Map<Wakeable, Set<unknown>> | null;
  finishedWork: Fiber | null;
  timeoutHandle: TimerHandler | NoTimeout;

  context: Object | null;
  pendingContext: Object | null;

  mutableSourceEagerHydrationData?: Array<MutableSource<any> | MutableSourceVersion> | null;

  callbackNode: any;
  callbackPriority: Lane;
  eventTimes: LaneMap<number>;
  expirationTimes: LaneMap<number>;
  hiddenUpdates: LaneMap<Array<ConcurrentUpdate> | null>;
  pendingLanes: Lanes;
  suspendedLanes: Lanes;
  pingedLanes: Lanes;
  expiredLanes: Lanes;
  mutableReadLanes: Lanes;

  finishedLanes: Lanes;

  entangledLanes: Lanes;
  entanglements: LaneMap<Lanes>;

  pooledCache: Cache | null;
  pooledCacheLanes: Lanes;
  identifierPrefix: string;
  onRecoverableError: (
    error: any,
    errorInfo: { digest?: string, componentStack?: string }
  ) => void,
}

type SuspenseCallbackOnlyFiberRootProperties = {
  hydrationCallbacks: null | SuspenseHydrationCallbacks
}

type UpdaterTrackingOnlyFiberRootProperties = {
  memoizedUpdaters: Set<Fiber>;
  pendingUpdatersLaneMap: LaneMap<Set<Fiber>>
}

type TransitionTracingOnlyFiberRootProperties = {
  transitionCallbacks: null | TransitionTracingCallbacks;
  transitionLanes: Array<Array<any> | null>
}

export type FiberRoot = BaseFiberRootProperties
  & SuspenseCallbackOnlyFiberRootProperties
  & UpdaterTrackingOnlyFiberRootProperties
  & TransitionTracingOnlyFiberRootProperties


type BasicStateAction<S> = ((S) => S) | S
type Dispatch<A> = (A) => void

export type Dispatcher = {
  getCacheSignal?: () => AbortSignal;
  getCacheForType?: <T>(resourceType: () => T) => T;
  readContext<T>(content: ReactContext<T>): T;
  useState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>];
  useReducer<S, I, A>(reducer: (S, A) => S, initialArg: I, init?: (I) => S): [S, Dispatch<A>];
  useContext<T>(content: ReactContext<T>): T;
  useRef<T>(initialValue: T): { current: T };
  useEffect(create: () => (() => void) | void, deps: Array<unknown> | void | null): void;
  useInsertionEffect(create: () => (() => void) | void, deps: Array<unknown> | void | null): void;
  useLayoutEffect(create: () => (() => void) | void, deps: Array<unknown> | void | null): void;
  useCallback<T>(callback: T, deps: Array<unknown> | void | null): T | Function;
  useMemo<T>(nextCreate: () => T, deps: Array<unknown> | void | null): T;
  useImperativeHandle<T>(
    ref: { current: T | null } | ((inst: T | null) => unknown) | null | void,
    create: () => T,
    deps: Array<unknown> | void | null,
  ): void,
  useDebugValue<T>(value: T, formatterFn?: (value: T) => unknown): void,
  useDeferredValue<T>(value: T): T,
  useTransition(): [boolean, (callback: () => void, options?: StartTransitionOptions) => void],
  useMutableSource<Source, Snapshot>(
    source: MutableSource<Source>,
    getSnapshot: MutableSourceGetSnapshotFn<Source, Snapshot>,
    subscribe: MutableSourceSubscribeFn<Source, Snapshot>,
  ): Snapshot,
  useSyncExternalStore<T>(
    subscribe: (callback: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T,
  useId(): string,
  useCacheRefresh?: () => <T>(callback?: () => T, t?: T) => void,

  unstable_isNewReconciler?: boolean,

}
