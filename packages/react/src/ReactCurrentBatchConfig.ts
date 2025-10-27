import type { BatchConfigTransition } from "react-reconciler/src/ReactFiberTracingMarkerComponent.new"

type BatchConfig = {
    transition: BatchConfigTransition | null
}

const ReactCurrentBatchConfig: BatchConfig = {
    transition: null
}

export default ReactCurrentBatchConfig