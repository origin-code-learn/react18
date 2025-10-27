import type { Dispatcher } from "react-reconciler/src/ReactInternalTypes"
import ReactCurrentDispatcher from "./ReactCurrentDispatcher"


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
    console.log('-----useEffect-------', create, deps)
    debugger
}