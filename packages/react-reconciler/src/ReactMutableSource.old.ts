import { MutableSource } from "shared/ReactTypes"

const workInProgressSources: Array<MutableSource<any>> = []
export function resetWorkInProgressVersions() {
    for(let i = 0; i < workInProgressSources.length; i++) {
        const mutableSource = workInProgressSources[i]
        mutableSource._workInProgressVersionSecondary = null;
    }
    workInProgressSources.length = 0
}