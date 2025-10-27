import { REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols'
import { jsx as jsxProd } from './ReactJSXElement'

const jsx = jsxProd
const jsxs = jsxProd
const jsxDEV = jsxProd

export {
    REACT_FRAGMENT_TYPE as Fragment,
    jsx,
    jsxs,
    jsxDEV
}