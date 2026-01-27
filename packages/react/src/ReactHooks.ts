import type { Dispatcher } from "react-reconciler/src/ReactInternalTypes"
import ReactCurrentDispatcher from "./ReactCurrentDispatcher"
import { ReactContext, StartTransitionOptions } from "shared/ReactTypes"


type BasicStateAction<S> = ((s: S) => S) | S
type Dispatch<A> = (a: A) => void

function resolveDispatcher() {
    const dispatcher = ReactCurrentDispatcher.current
    return dispatcher as Dispatcher
}

export function useState<S>(
    initialState: (() => S) | S
): [S, Dispatch<BasicStateAction<S>>] {
    const dispatcher = resolveDispatcher()
    return dispatcher.useState(initialState)
}

export function useEffect(
    create: () => (() => void) | void,
    deps: Array<unknown> | void | null
): void {
    const dispatcher = resolveDispatcher()
    return dispatcher.useEffect(create, deps)
}

export function useLayoutEffect(
    create: () => (() => void) | void,
    deps: Array<unknown> | void | null
): void {
    const dispatcher = resolveDispatcher()
    return dispatcher.useLayoutEffect(create, deps)
}

export function useCallback<T>(
    callback: T,
    deps: Array<unknown> | void | null
): T | Function {
    const dispatcher = resolveDispatcher()
    return dispatcher.useCallback(callback, deps)
}

export function useMemo<T>(
    create: () => T,
    deps: Array<unknown> | void | null
): T {
    const dispatcher = resolveDispatcher()
    return dispatcher.useMemo(create, deps)
}

export function useRef<T>(initialValue: T): { current: T } {
    const dispatcher = resolveDispatcher()
    return dispatcher.useRef(initialValue)
}

export function useReducer<S, I, A>(
    reducer: (S, A) => S,
    initialArg: I,
    init?: (i: I) => S
): [S, Dispatch<A>] {
    const dispatcher = resolveDispatcher()
    return dispatcher.useReducer(reducer, initialArg, init)
}

export function useContext<T>(Context: ReactContext<T>): T {
    const dispatcher = resolveDispatcher()
    return dispatcher.useContext(Context)
}

export function useTransition(): [boolean, (callback: () => void, options?: StartTransitionOptions) => void] {
    const dispatcher = resolveDispatcher()
    return dispatcher.useTransition()
}

export function useImperativeHandle<T>(
    ref: { current: T | null } | ((inst: T | null) => any) | null | void,
    create: () => T,
    deps: Array<any> | void | null
): void {
    const dispatcher = resolveDispatcher()
    return dispatcher.useImperativeHandle(ref, create, deps)
}