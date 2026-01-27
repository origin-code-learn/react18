import { CapturedValue } from "./ReactCapturedValue";

type RootExitStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const RootInProgress = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;
const RootDidNotComplete = 6;

let workInProgressRootExitStatus: RootExitStatus = RootInProgress;
let workInProgressRootConcurrentErrors: Array<CapturedValue<any>> | null = null

export function renderDidError(error: CapturedValue<any>) {
    if (workInProgressRootExitStatus !== RootSuspendedWithDelay) {
        workInProgressRootExitStatus = RootErrored
    }

    if (workInProgressRootConcurrentErrors === null) {
        workInProgressRootConcurrentErrors = [error]
    } else {
        workInProgressRootConcurrentErrors.push(error)
    }
}