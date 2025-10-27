// import {
//     __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as Internals
// } from './'

import { CreateRootOptions } from "shared/ReactTypes";
import { RootType } from "./src/client/ReactDOMRoot";
import { createRoot as createRootImpl } from './'

export function createRoot(
    container: Element | Document | DocumentFragment,
    options?: CreateRootOptions
): RootType {
    return createRootImpl(container, options)
}