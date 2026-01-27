import ReactVersion from 'shared/ReactVersion';
import { CreateRootOptions, createRoot as createRootImpl, isValidContainer, } from './ReactDOMRoot';
import { setBatchingImplementation } from '../events/ReactDOMUpdateBatching';
import {
    batchedUpdates,
    discreteUpdates,
    flushSync as flushSyncWithoutWarningIfAlreadyRendering,
} from 'react-reconciler/src/ReactFiberReconciler';
import { createPortal as createPortalImpl } from 'react-reconciler/src/ReactPortal'
import { setRestoreImplementation } from '../events/ReactDOMControlledComponent';
import { restoreControlledState } from './ReactDOMComponent';
import { ReactNodeList } from 'shared/ReactTypes';

setRestoreImplementation(restoreControlledState)
setBatchingImplementation(
    batchedUpdates,
    discreteUpdates,
    flushSyncWithoutWarningIfAlreadyRendering
)

function flushSync(fn) {
    return flushSyncWithoutWarningIfAlreadyRendering(fn)
}

function createRoot(
    container: Element | Document | DocumentFragment,
    options?: CreateRootOptions
) {
    return createRootImpl(container, options)
}

function createPortal(
    children: ReactNodeList,
    container: Element | DocumentFragment,
    key: string | null
) {
    if (!isValidContainer(container)) {
        throw new Error('Target container is not a DOM element.')
    }
    return createPortalImpl(children, container, null, key)
}

const Internals = {
    usingClientEntryPoint: false,
    Events: [
        // getInstanceFromNode,
        // getNodeFromInstance,
        // getFiberCurrentPropsFromNode,
        // enqueueStateRestore,
        // restoreStateIfNeeded,
        batchedUpdates
    ]
}

export {
    ReactVersion as version,
    Internals as __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
    createRoot,
    createPortal,
    flushSync
}
