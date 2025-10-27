import invokeGuardedCallbackImpl from "./invokeGuardedCallbackImpl"

let hasError: boolean = false
let caughtError: any = null

let hasRethrowError: boolean = false
let rethrowError: any = null

const reporter = {
    onError(error: any) {
        hasError = true
        caughtError = error
    }
}

export function invokeGuardedCallback<A, B, C, D, E, F, Context>(
    name: string | null,
    func: (a: A, b: B, c: C, d: D, e: E, f: F) => void,
    context: Context,
    a: A,
    b: B,
    c: C,
    d: D,
    e: E,
    f: F
) {
    hasError = false
    caughtError = null
    // @ts-ignore
    invokeGuardedCallbackImpl.apply(reporter, arguments)
}

export function invokeGuardedCallbackAndCatchFirstError<A, B, C, D, E, F, Context>(
    name: string | null,
    func: (a: A, b: B, c: C, d: D, e: E, f: F) => void,
    context: Context,
    a: A,
    b: B,
    c: C,
    d: D,
    e: E,
    f: F
) {
    invokeGuardedCallback.apply(this, arguments as any)
    if (hasError) {
        const error = clearCaughtError()
        if (!hasRethrowError) {
            hasRethrowError = true
            rethrowError = error
        }
    }
}

export function rethrowCaughtError() {
    if (hasRethrowError) {
        const error = rethrowError
        hasRethrowError = false
        rethrowError = null
        throw error
    }
}

export function hasCaughtError() {
    return hasError
}

export function clearCaughtError() {
    if (hasError) {
        const error = caughtError
        hasError = false
        caughtError = null
        return error
    } else {
        throw new Error('clearCaughtError 出错了')
    }
}