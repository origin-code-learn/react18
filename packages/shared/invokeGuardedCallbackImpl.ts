
function invokeGuardedCallbackProd<A, B, C, D, E, F, Context>(
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
    const funcArgs = Array.prototype.slice.call(arguments, 3)
    try {
        func.apply(context, funcArgs as any)
    } catch (error) {
        this.onError(error)
    }
}

let invokeGuardedCallbackImpl = invokeGuardedCallbackProd

export default invokeGuardedCallbackImpl