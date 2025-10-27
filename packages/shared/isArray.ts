
const isArrayImpl = Array.isArray

function isArray(a: any): boolean {
    return isArrayImpl(a)
}

export default isArray