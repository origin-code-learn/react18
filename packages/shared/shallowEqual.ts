import is from './objectIs'
import hasOwnProperty from './hasOwnProperty'

function shallowEqual(objA: any, objB: any): boolean {
    if (is(objA, objB)) return true
    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false

    const keysA = Object.keys(objA)
    const keysB = Object.keys(objB)

    if (keysA.length !== keysB.length) return false

    for (let i = 0; i < keysA.length; i++) {
        const currentKey = keysA[i]
        if (!hasOwnProperty.call(objB, currentKey) || !is(objA[currentKey], objB[currentKey])) return false
    }

    return true
}

export default shallowEqual