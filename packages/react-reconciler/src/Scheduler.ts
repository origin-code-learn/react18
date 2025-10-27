import * as Scheduler from 'scheduler'

export type SchedulerCallback = (isSync: boolean) => SchedulerCallback | null;

export const now = Scheduler.unstable_now;

export const cancelCallback = Scheduler.unstable_cancelCallback
export const scheduleCallback = Scheduler.unstable_scheduleCallback;

export const getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel
export const ImmediatePriority = Scheduler.unstable_ImmediatePriority
export const UserBlockingPriority = Scheduler.unstable_UserBlockingPriority
export const NormalPriority = Scheduler.unstable_NormalPriority
export const LowPriority = Scheduler.unstable_LowPriority
export const IdlePriority = Scheduler.unstable_IdlePriority

export const requestPaint = Scheduler.unstable_requestPaint