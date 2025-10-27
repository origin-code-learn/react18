// 环境变量声明：用于区分不同构建环境的标识
declare const __PROFILE__: boolean; // 性能分析环境（启用性能追踪工具）
declare const __DEV__: boolean; // 开发环境（启用警告、调试等功能）
declare const __EXPERIMENTAL__: boolean; // 实验性环境（启用未稳定的实验性功能）


/*************** 生命周期与兼容性警告 *****************/ 
// 启用对废弃生命周期方法（如 componentWillMount、componentWillReceiveProps）的警告
// 帮助开发者迁移到新的生命周期（如 getDerivedStateFromProps）
export const warnAboutDeprecatedLifecycles = true;

// 警告函数组件使用 defaultProps（计划在未来版本废弃）
// 推荐使用函数参数默认值（如 function Component({ name = 'default' }) {}）替代
export const warnAboutDefaultPropsOnFunctionComponents = true;

// 警告在 JSX 中通过扩展运算符传播 key 属性（如 <div {...{key: '1'}} />）
// key 是 React 内部标识，不应作为 props 传递给组件，需显式声明（<div key="1" />）
export const warnAboutSpreadingKeyToJSX = true;

// 警告使用字符串 refs（如 <div ref="myRef" />）
// 推荐使用回调 refs（ref={(el) => this.myRef = el}）或 useRef 钩子
export const warnAboutStringRefs = true;


/************* 渲染与协调（Reconciliation）特性 ***************/ 
// 是否启用新的协调器（Reconciler）实现
// 新协调器是实验性重构，旨在优化渲染性能，目前尚未稳定
export const enableNewReconciler = false;

// 跳过已卸载的边界组件（如错误边界、Suspense 边界）的更新
// 避免对已从 DOM 中移除的组件执行无用的更新操作，优化性能
export const skipUnmountedBoundaries = true;

// 是否将渲染阶段的状态更新延迟到下一批次执行
// 实验性优化：防止渲染过程中嵌套更新导致的性能问题和不一致性
export const deferRenderPhaseUpdateToNextBatch = false;

// 启用 Suspense 与 useLayoutEffect 协同工作的语义
// 确保在 Suspense 加载完成后，useLayoutEffect 能正确执行布局相关副作用
export const enableSuspenseLayoutEffectSemantics = true;


/********** 上下文（Context）相关 ***********/ 
// 启用上下文的懒加载传播机制
// 优化点：仅在组件实际读取上下文时才传播上下文，减少无关组件的重渲染
export const enableLazyContextPropagation = false;

// 是否禁用 Legacy Context（旧版上下文机制，通过 childContextTypes 和 contextTypes 实现）
// 默认保留以兼容旧代码，现代应用推荐使用 createContext + useContext
export const disableLegacyContext = false;

// 启用服务端上下文功能（实验性）
// 用于服务端渲染（SSR）中传递上下文，解决客户端与服务端上下文同步问题
export const enableServerContext = __EXPERIMENTAL__;


/*********** 并发模式与 Suspense *************/
// 是否默认启用并发模式
// 目前默认关闭，需通过 createRoot 显式启用（React 18 中并发模式是 opt-in 特性）
export const allowConcurrentByDefault = false;

// 启用 Suspense 的回调功能（实验性）
// 允许注册回调函数追踪 Suspense 的状态变化（如开始加载、加载完成）
export const enableSuspenseCallback = false;

// 启用 CPU 密集型任务的 Suspense 支持（实验性）
// 允许 Suspense 暂停 CPU 密集型渲染任务，避免阻塞主线程
export const enableCPUSuspense = __EXPERIMENTAL__;

// 优化 Suspense 的 fallback 渲染逻辑
// 避免在某些场景下不必要地显示 fallback（如快速完成的加载）
export const enableSuspenseAvoidThisFallback = false;


/*********** 开发工具与调试 ************/
// 在错误堆栈中包含组件的层级位置信息
// 开发环境下帮助开发者快速定位错误发生的组件路径（如 "App > Parent > Child"）
export const enableComponentStackLocations = true;

// 是否基于 React 过期时间禁用调度器超时（内部调度优化）
// 控制调度器如何处理超时任务，默认关闭以保持兼容性
export const disableSchedulerTimeoutBasedOnReactExpirationTime = false;

// 为 Web 环境启用 Symbol 类型的降级支持
// 兼容不支持 Symbol 的旧环境，默认关闭（现代浏览器已普遍支持 Symbol）
export const enableSymbolFallbackForWWW = false;

// 在客户端渲染时，当文本内容不匹配时启用 fallback 渲染
// 用于处理服务端渲染（SSR）与客户端 hydration 时的文本不一致问题
export const enableClientRenderFallbackOnTextMismatch = true;

// 启用捕获阶段的选择性 hydration，无需重放离散事件
// 优化 hydration 性能，避免不必要的事件重放（如点击、输入事件）
export const enableCapturePhaseSelectiveHydrationWithoutDiscreteEventReplay = true;

// 启用 useMutableSource 钩子（已废弃，被 useSyncExternalStore 替代）
// 用于订阅外部可变数据源，确保并发模式下的数据一致性
export const enableUseMutableSource = false;

// 启用调度器调试模式
// 输出调度任务的详细日志，用于调试调度器的行为（如任务优先级、执行顺序）
export const enableSchedulerDebugging = false;

// 在工作循环中禁用调度器超时
// 控制调度器是否忽略超时设置，默认关闭以保持正常的超时机制
export const disableSchedulerTimeoutInWorkLoop = false;

// 启用 Scope API（实验性）
// 用于组件作用域隔离，控制状态和副作用的作用范围
export const enableScopeAPI = false;

// 启用 createEventHandleAPI（实验性）
// 用于创建稳定的事件处理函数引用，优化事件回调的内存使用
export const enableCreateEventHandleAPI = false;

// 启用对旧版 Facebook 内部特性的支持
// 仅用于兼容 Facebook 内部旧系统，外部应用无需关注
export const enableLegacyFBSupport = false;

// 启用缓存 API（实验性）
// 提供内置的缓存机制，用于缓存计算结果或数据请求
export const enableCache = __EXPERIMENTAL__;

// 启用 Cache 元素（实验性）
// 用于在 JSX 中声明缓存范围，控制缓存的生效边界
export const enableCacheElement = __EXPERIMENTAL__;

// 启用过渡（Transition）追踪
// 记录过渡状态的变化日志，用于调试并发模式下的过渡行为
export const enableTransitionTracing = false;

// 启用旧版 hidden 特性支持
// 兼容旧版的 hidden 属性处理逻辑，现代应用推荐使用 CSS 或条件渲染
export const enableLegacyHidden = false;

// 针对 Fizz（React 新服务端渲染引擎）优化 Suspense fallback 逻辑
// 进一步减少 Fizz 环境下不必要的 fallback 显示
export const enableSuspenseAvoidThisFallbackFizz = false;

// 已删除树的清理级别（内部优化）
// 控制 React 如何清理已从 DOM 中删除的 Fiber 树，级别 3 为默认优化策略
export const deletedTreeCleanUpLevel = 3;

// 创建根节点时是否默认启用严格模式效果
// 严格模式下会执行双重渲染以检测副作用，默认关闭（需显式启用严格模式）
export const createRootStrictEffectsByDefault = false;

// 禁用模块模式组件（已废弃的组件写法）
// 模块模式指函数组件返回类实例（如 function MyComponent() { return { render() {} } }），默认保留兼容性
export const disableModulePatternComponents = false;

// 启用 useRef 访问警告
// 警告在渲染阶段访问 useRef 返回的 current 属性（可能导致并发模式下的不一致）
export const enableUseRefAccessWarning = false;

// 启用同步默认更新
// 控制默认状态更新（如 useState）是否同步执行，默认启用以保持向后兼容
export const enableSyncDefaultUpdates = true;

// 禁用将注释节点作为 DOM 容器
// 防止意外将 React 应用挂载到注释节点（<!-- -->），避免渲染异常
export const disableCommentsAsDOMContainers = true;

// 禁用 javascript: 协议的 URL
// 安全优化：防止通过 href 或 src 注入 javascript: 代码导致 XSS 攻击，默认关闭（需手动启用）
export const disableJavaScriptURLs = false;

// 启用 Trusted Types 集成（安全标准）
// 限制 DOM 操作中使用不可信值，防止 XSS 攻击，目前为实验性
export const enableTrustedTypesIntegration = false;

// 禁用输入框属性同步
// 控制 React 是否同步输入框（如 input、textarea）的属性（如 value、checked），默认关闭以保持正常同步
export const disableInputAttributeSyncing = false;

// 在 DOM 中过滤空字符串属性
// 优化：不渲染值为空字符串的属性（如 <div className="" /> 不渲染 className）
export const enableFilterEmptyStringAttributesDOM = false;

// 启用自定义元素（Web Components）的属性支持（实验性）
// 优化 React 与 Web Components 的交互，正确传递属性和事件
export const enableCustomElementPropertySupport = __EXPERIMENTAL__;

// 禁用 textarea 的子节点
// 控制是否允许 <textarea> 包含子节点（如 <textarea>text</textarea>），默认关闭以兼容旧代码
// 推荐使用 value 属性（<textarea value="text" />）替代
export const disableTextareaChildren = false;

// 启用调度器性能分析
// 在 __PROFILE__ 环境下记录调度任务的执行时间、优先级等信息
export const enableSchedulingProfiler = __PROFILE__;

// 在严格模式下调试渲染阶段的副作用
// 开发环境下，严格模式会二次执行渲染阶段的函数（如 useEffect 回调），以检测不稳定的副作用
export const debugRenderPhaseSideEffectsForStrictMode = __DEV__;

// 启用严格模式效果检查
// 开发环境下增强严格模式的检查，捕获更多潜在问题（如过时的 API 使用）
export const enableStrictEffects = __DEV__;

// 在开发环境下，使用 invokeGuardedCallback 重放失败的工作单元
// 用于捕获和处理渲染过程中的错误，提供更友好的错误信息
export const replayFailedUnitOfWorkWithInvokeGuardedCallback = __DEV__;

// 启用 Profiler 组件的计时器
// 在 __PROFILE__ 环境下，记录组件渲染的开始和结束时间，用于性能分析
export const enableProfilerTimer = __PROFILE__;

// 启用 Profiler 的提交阶段钩子
// 在 __PROFILE__ 环境下，允许在提交阶段（DOM 更新后）触发 Profiler 回调
export const enableProfilerCommitHooks = __PROFILE__;

// 启用 Profiler 对嵌套更新阶段的追踪
// 在 __PROFILE__ 环境下，记录组件嵌套更新（如渲染中触发的更新）的性能数据
export const enableProfilerNestedUpdatePhase = __PROFILE__;

// 启用调试追踪
// 输出详细的渲染和协调过程日志，用于深入调试 React 内部机制
export const enableDebugTracing = false;

// 启用更新器（Updater）追踪
// 在 __PROFILE__ 环境下，记录状态更新的来源和传播路径
export const enableUpdaterTracking = __PROFILE__;

// 禁用原生组件的调用栈帧
// 控制是否在错误栈中隐藏原生组件（如 div、span）的帧，减少干扰
export const disableNativeComponentFrames = false;

// 在生产环境中启用对实例的检查器数据获取
// 允许生产环境下的 React DevTools 获取组件实例信息，默认关闭（保护隐私和性能）
export const enableGetInspectorDataForInstanceInProduction = false;

// 启用 Profiler 对嵌套更新调度的钩子
// 在 __PROFILE__ 环境下，追踪嵌套更新的调度时间点
export const enableProfilerNestedUpdateScheduledHook = false;

// 在严格模式下，由 DevTools 管理控制台输出
// 避免严格模式下双重执行导致的重复日志，由 DevTools 统一处理
export const consoleManagedByDevToolsDuringStrictMode = true;