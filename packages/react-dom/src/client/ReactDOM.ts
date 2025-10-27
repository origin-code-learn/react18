import ReactVersion from 'shared/ReactVersion';
import { CreateRootOptions, createRoot as createRootImpl, } from './ReactDOMRoot';
import { setBatchingImplementation } from '../events/ReactDOMUpdateBatching';
import { 
    batchedUpdates, 
    discreteUpdates,
    flushSync as flushSyncWithoutWarningIfAlreadyRendering,
} from 'react-reconciler/src/ReactFiberReconciler';

setBatchingImplementation(
    batchedUpdates,
    discreteUpdates,
    flushSyncWithoutWarningIfAlreadyRendering
)

function createRoot(
    container: Element | Document | DocumentFragment,
    options?: CreateRootOptions
) {
    return createRootImpl(container, options)
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
    createRoot
}
