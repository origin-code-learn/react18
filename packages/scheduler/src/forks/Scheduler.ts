import { continuousYieldMs, enableIsInputPending, enableIsInputPendingContinuous, enableSchedulerDebugging, frameYieldMs, maxYieldMs } from "../SchedulerFeatureFlags";
import { peek, pop, push } from "../SchedulerMinHeap";
import { IdlePriority, ImmediatePriority, LowPriority, NormalPriority, UserBlockingPriority } from "../SchedulerPriorities";

let taskIdCounter = 1  // 任务 ID 计数器 (确保任务唯一，维护插入顺序)
let taskTimeoutID = -1  // 超时 ID
let startTime = -1  // 任务开始时间 （用于计算阻塞时长）
let isHostTimeoutScheduled = false // 宿主环境超时调度标记（是否已调度 handleTimeout）
let isHostCallbackScheduled = false  // 宿主环境回调调度标记（是否已调度 flushWork）
let isPerformingWork = false  // 正在执行任务的标记（防止重入）
let isMessageLoopRunning = false  // 标记消息循环是否运行
let needsPaint = false  // 是否需要重绘 （由 requestPaint 标记）

let currentTask: any = null  // 当前任务
let scheduledHostCallback: any = null  // 已调度的宿主回调 （即 flushWork）
let isSchedulerPaused = false // 调度器是否暂停

const taskQueue = []  // 任务队列（存储可立即执行的任务， 用小顶堆实现，按过期时间排序）
const timerQueue = [] // 定时器队列 （存储延迟执行的任务，按开始时间排序）
const maxSigned31BitInt = 1073741823; // 最大 31 位整数 (V8 中 32 位系统的最大安全整数)

// 不同任务优先级的超时时间：任务过期时间 = 开始事件 + 超时时间
const IMMEDIATE_PRIORITY_TIMEOUT = -1  // 立即执行 (无超时)
const USER_BLOCKING_PRIORITY_TIMEOUT = 250  // 用户阻塞级 250ms 过期
const NORMAL_PRIORITY_TIMEOUT = 5000  // 普通级 5s
const LOW_PRIORITY_TIMEOUT = 10000  // 低优先级 10s
const IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt  // 空闲级：几乎不过期

let currentPriorityLevel = NormalPriority // 当前执行的优先级等级
// 连续输入检测配置（是否包含连续输入事件，如鼠标移动）
const continuousOptions = { includeContinuous: enableIsInputPendingContinuous }

const hasPerformanceNow: any = typeof performance === 'object' && typeof performance.now === 'function'
const localSetTimeout: any = typeof setTimeout === 'function' ? setTimeout : null
const localClearTimeout: any = typeof clearTimeout === 'function' ? clearTimeout : null
const localSetImmediate: any = typeof setImmediate !== 'undefined' ? setImmediate : null
// 利用 navigator.scheduling.isInputPending Api 来判断用户是否有未处理的输入事件 (如键盘、 鼠标操作)
const isInputPending = typeof navigator !== 'undefined' && 
    (navigator as any).scheduling !== undefined && 
    (navigator as any).scheduling.isInputPending !== undefined
      ? (navigator as any).scheduling.isInputPending.bind((navigator as any).scheduling) : null

// 定义获取当前时间的高精度函数
let getCurrentTime;
if (hasPerformanceNow) {
    const localPerformance = performance
    getCurrentTime = () => localPerformance.now()
} else {
    const localDate = Date
    const initialTime = localDate.now()
    getCurrentTime = () => localDate.now() - initialTime
}

// 调度 performWorkUntilDeadline（兼容不同宿主环境）
let schedulePerformWorkUntilDeadline
if (typeof localSetImmediate === 'function') {
    // Node.js / IE: 用 setImmediate (比 setTimeout 更高效)
    schedulePerformWorkUntilDeadline = () => localSetImmediate?.(performWorkUntilDeadline)
} else if (typeof MessageChannel !== 'undefined') {
    // 浏览器环境：用 MessageChannel （避免 setTimeout 4ms 延迟）
    const channel = new MessageChannel()
    const port = channel.port2
    channel.port1.onmessage = performWorkUntilDeadline
    schedulePerformWorkUntilDeadline = () => port.postMessage(null)
} else {
    // 降级：用 setTimeout
    schedulePerformWorkUntilDeadline = () => localSetTimeout?.(performWorkUntilDeadline, 0)
}


// 核心作用：判断是否应该暂停当前任务，让出主线程给浏览器处理高优先级工作（如用户输入、重绘），避免页面卡顿。依据阻塞时间和输入事件动态决定。
let frameInterval = frameYieldMs  // 普通桢间隔 （默认 5ms）
const continuousInputInterval = continuousYieldMs // 连续输入间隔 （默认 30ms）
const maxInterval = maxYieldMs  // 最大阻塞时间 （默认 50ms）
function shouldYieldToHost() {
    const timeElapsed = getCurrentTime() - startTime  // 已阻塞主线程的时间
    if (timeElapsed < frameInterval) {  // 阻塞时间很短（小于一桢），不用让出
        return false
    }
    // 阻塞时间较长，判断是否需要让出（优先响应用户输入或重绘）
    if (enableIsInputPending) {
        if (needsPaint) {
            // 有重绘需求，让出
            return true
        }
        if (timeElapsed < continuousInputInterval) {
            // 阻塞时间较短：仅在有离散输入（如点击）时让出
            if (isInputPending !== null) {
                return isInputPending()
            }
        } else if (timeElapsed < maxInterval) {
            // 阻塞时间中等：有离散或连续输入 （如鼠标移动） 时候让出
            if (isInputPending !== null) {
                return isInputPending(continuousOptions)
            }
        } else {
            // 阻塞时间过长： 强制让出 （避免主线程卡死）
            return true
        }
    }
    // 不支持 isInputPending：直接让出
    return true
}

// 标记需要重绘（触发 shouldYieldToHost 让出）
function requestPaint() {
    if (
        enableIsInputPending &&
        navigator !== undefined &&
        (navigator as any).scheduling !== undefined &&
        (navigator as any).scheduling.isInputPending !== undefined
    ) {
        needsPaint = true;
    }
}

// 执行任务直到超时的函数 （宿主环境回调的核心）
function performWorkUntilDeadline () {
    if (scheduledHostCallback !== null) {
        const currentTime = getCurrentTime()
        startTime = currentTime // 记录任务开始时间
        const hasTimeRemaining = true
        let hasMoreWork = true
        try {
            // 执行调度回调 （flushWork）返回是否有更多任务
            hasMoreWork = scheduledHostCallback?.(hasTimeRemaining, currentTime)
        } finally {
            if (hasMoreWork) {
                // 如果有更多任务，继续调度下一次执行
                schedulePerformWorkUntilDeadline()
            } else {
                // 无任务，重置状态
                isMessageLoopRunning = false
                scheduledHostCallback = null
            }
        }
    } else {
        isMessageLoopRunning = false
    }

    needsPaint = false  // 重置重绘标记
}


function unstable_getCurrentPriorityLevel() {
    return currentPriorityLevel
}

// 推进定时器队列
function advanceTimers(currentTime) {
    // 从定时器队列顶部取任务
    let timer: any = peek(timerQueue)
    while (timer !== null) {
        if (timer.callback === null) {
            // 任务已取消，从队列中移除
            pop(timerQueue)
        } else if (timer.startTime <= currentTime) {
            // 任务已经到开始时间，转移到任务队列(可执行)
            pop(timerQueue)
            timer.sortIndex = timer.expirationTime  // 按过期时间排序
            push(taskQueue, timer)
        } else {
            // 剩余任务未到期，推出循环
            return
        }
        timer = peek(timerQueue) // 继续检查下一个任务
    }
}

// 处理超时
function handleTimeout(currentTime) {
    isHostTimeoutScheduled = false // 清除超时调度标记
    advanceTimers(currentTime) // 推进定时器队列
    if (!isHostCallbackScheduled) {
        if (peek(taskQueue) !== null) {
            // 任务队列有任务，执行调度
            isHostTimeoutScheduled = true
            requestHostCallback(flushWork)
        } else {
            // 任务队列为空， 检查下一个定时器任务
            const firstTimer: any = peek(timerQueue)
            if(firstTimer !== null) {
                // 调度下一个定时器超时
                requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime)
            }
        }
    }
}

// 调度宿主回调（执行 flushWork）
function requestHostCallback(callback) {
    scheduledHostCallback = callback
    if (!isMessageLoopRunning) {
        isMessageLoopRunning = true
        schedulePerformWorkUntilDeadline() // 启动消息循环
    }
}

// 执行任务
function flushWork(hasTimeRemaining, initialTime) {
    // 重置调度标记 （下一次任务需要重新调度）
    isHostCallbackScheduled = false
    if (isHostTimeoutScheduled) {
        // 取消已调度的超时（任务已开始执行，无需再等超时）
        isHostTimeoutScheduled = false
        cancelHostTimeout()
    }
    isPerformingWork = true  // 标记正在执行任务
    const previousPriorityLevel = currentPriorityLevel // 保存当前优先级
    try {
        return workLoop(hasTimeRemaining, initialTime) // 执行工作循环
    } finally {
        currentTask = null  // 重置当前任务
        currentPriorityLevel = previousPriorityLevel  // 恢复优先级
        isPerformingWork = false // 清除执行标记
    }
}

// 工作循环
function workLoop(
    hasTimeRemaining, 
    initialTime
) {
    let currentTime = initialTime
    advanceTimers(currentTime) // 先推进定时器队列
    currentTask = peek(taskQueue) // 取任务队列中最高优先级的任务
    while(currentTask !== null && !(enableSchedulerDebugging && isSchedulerPaused)) {
        console.log('-------React---任务调度-----', currentTask, taskQueue)
        if (
            currentTask.expirationTime > currentTime &&  // 任务未过期
            (!hasTimeRemaining || shouldYieldToHost()) // 无剩余时间 或需要让出主线程
        ) {
            // 跳出循环，等待下一次调度
            break
        }
        const callback = currentTask.callback
        if (typeof callback === 'function') {
            currentTask.callback = null  // 清空回调（防止重复绘制）
            currentPriorityLevel = currentTask.priorityLevel  // 更新当前优先级
            const didUserCallbackTimeout = currentTask.expirationTime <= currentTime  // 任务是否过期
            // 执行任务回调（返回值为后续任务，如 React 的 workInProgress 继续执行）
            const continuationCallback = callback(didUserCallbackTimeout)
            currentTime = getCurrentTime()
            if (typeof continuationCallback === 'function') {
                // 有后续任务，重新设置回调
                currentTask.callback = continuationCallback
            } else {
                // 任务完成
                if (currentTask === peek(taskQueue)) {
                    // 从队列中移除任务
                    pop(taskQueue)
                }
            }
            advanceTimers(currentTime) // 再次推进定时器队列（可能有新任务到期）
        } else {
            // 回调无效，直接移除任务
            pop(taskQueue)
        }
        currentTask = peek(taskQueue) // 取下一个任务
    }

    // 返回是否还有剩余任务
    if (currentTask !== null) {
        return true
    } else {
        // 无任务，检查定时器队列
        const firstTimer: any = peek(timerQueue)
        if (firstTimer !== null) {
            // 调度下一个定时器
            requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime)
        }
        return false
    }
}

function unstable_runWithPriority(priorityLevel, eventHandler) {
    // 校验优先级，默认普通优先级
    switch(priorityLevel) {
        case ImmediatePriority:
        case UserBlockingPriority:
        case NormalPriority:
        case LowPriority:
        case IdlePriority:
            break;
        default:
            priorityLevel = NormalPriority
    }
    const previousPriorityLevel = currentPriorityLevel
    currentPriorityLevel = priorityLevel  // 临时切换优先级
    try {
        return eventHandler() // 执行函数
    } finally {
        currentPriorityLevel = previousPriorityLevel // 恢复优先级
    }
}

// 调度任务
function unstable_scheduleCallback(
    priorityLevel,
    callback,
    options?: any
) {
    const currentTime = getCurrentTime()
    let startTime // 计算任务开始时间 （支持延迟执行）
    if (typeof options === 'object' && options !== null) {
        let delay = options.delay
        if (typeof delay === 'number' && delay > 0) {
            startTime = currentTime + delay // 延迟执行
        } else {
            startTime = currentTime  // 立即执行
        }
    } else {
        startTime = currentTime
    }
    let timeout  // 根据优先级获取超时时间 （计算过期时间）
    switch(priorityLevel) {
        case ImmediatePriority:
            timeout = IMMEDIATE_PRIORITY_TIMEOUT
            break
        case UserBlockingPriority:
            timeout = USER_BLOCKING_PRIORITY_TIMEOUT
            break
        case IdlePriority:
            timeout = IDLE_PRIORITY_TIMEOUT
            break
        case LowPriority:
            timeout = LOW_PRIORITY_TIMEOUT
            break
        case NormalPriority:
        default:
            timeout = NORMAL_PRIORITY_TIMEOUT
            break
    }
    const expirationTime = startTime + timeout  // 任务过期时间
    // 创建任务对象
    const newTask = {
        id: taskIdCounter++,  // 任务 Id
        callback,   // 任务回调
        priorityLevel,  // 优先级
        startTime,  // 开始时间
        expirationTime,  // 过期时间
        sortIndex: -1  // 排序索引 （堆排序用）
    }

    // 如果当前任务的 startTime > currentTime, 那么判定该任务为非立即执行任务放在 timerQueue 中延迟执行
    if (startTime > currentTime) {
        // 延迟任务： 加入定时器队列（按开始时间排序）
        newTask.sortIndex = startTime
        push(timerQueue, newTask)
        // 如果是定时器队列中最早的任务，调度超时
        if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
            if (isHostTimeoutScheduled) {
                cancelHostTimeout()  // 取消已有超时
            } else {
                isHostTimeoutScheduled = true
            }
            // 调度超时回调 （到 startTime 时执行）
            requestHostTimeout(handleTimeout, startTime - currentTime)
        }
    } else {
        // 立即执行任务：加入任务队列（按过期时间排序）
        newTask.sortIndex = expirationTime
        push(taskQueue, newTask)
        // 调度执行（如果未调度且不在执行中）
        if (!isHostCallbackScheduled && !isPerformingWork) {
            isHostCallbackScheduled = true
            requestHostCallback(flushWork)
        }
    }
    return newTask  // 返回任务对抗（用于取消）
}

// 取消任务 （清空回调，堆中无法直接删除，执行时跳过）
function unstable_cancelCallback(task) {
    task.callback = null  // 回调置空，执行时会被跳过
}

// 暂停调度 (调试用)
function unstable_pauseExecution() {
    isSchedulerPaused = true
}

// 继续调度
function unstable_continueExecution() {
    isSchedulerPaused = false
    if (!isHostCallbackScheduled && !isPerformingWork) {
        isHostCallbackScheduled = true
        requestHostCallback(flushWork)
    }
}

// 取消超时回调
function cancelHostTimeout() {
    localClearTimeout?.(taskTimeoutID)
    taskTimeoutID = -1
}

// 调度超时回调 （执行 handleTimeout）
function requestHostTimeout(callback, ms) {
    taskTimeoutID = localSetTimeout(() => {
        callback(getCurrentTime())
    }, ms)
}

function unstable_wrapCallback(callback) {
    const parentPriorityLevel = currentPriorityLevel
    return function () {
        const previousPriorityLevel = currentPriorityLevel
        currentPriorityLevel = parentPriorityLevel
        try {
            return callback.apply(this, arguments)
        } finally {
            currentPriorityLevel = previousPriorityLevel
        }
    }
}

function unstable_getFirstCallbackNode() {
    return peek(taskQueue)
}

function forceFrameRate(fps) {
    if (fps < 0 || fps > 125) {
        return
    }
    if (fps > 0) {
        frameInterval = Math.floor(1000 / fps)
    } else {
        frameInterval = frameYieldMs
    }
}

const unstable_requestPaint = requestPaint

export {
    ImmediatePriority as unstable_ImmediatePriority,
    UserBlockingPriority as unstable_UserBlockingPriority,
    NormalPriority as unstable_NormalPriority,
    IdlePriority as unstable_IdlePriority,
    LowPriority as unstable_LowPriority,
    unstable_runWithPriority,
    unstable_scheduleCallback,
    unstable_cancelCallback,
    unstable_wrapCallback,
    unstable_getCurrentPriorityLevel,
    shouldYieldToHost as unstable_shouldYield,
    unstable_requestPaint,
    unstable_continueExecution,
    unstable_pauseExecution,
    unstable_getFirstCallbackNode,
    getCurrentTime as unstable_now,
    forceFrameRate as unstable_forceFrameRate,
}