import { enableCache } from "shared/ReactFeatureFlags"
import { REACT_CONTEXT_TYPE } from "shared/ReactSymbols"
import { ReactContext } from "shared/ReactTypes"

const AbortControllerLocal = enableCache
    ? typeof AbortController !== 'undefined'
        ? AbortController
        : (function AbortControllerShim() {
            const listeners: any[] = []
            const signal = (this.signal = {
                aborted: false,
                addEventListener: (type, listener) => {
                    listeners.push(listener)
                }
            })
            this.abort = () => {
                signal.aborted = true
                listeners.forEach(listener => listener())
            }
        }) : null

export type Cache = {
    controller: typeof AbortControllerLocal,
    data: Map<() => any, any>,
    refCount: number
}

export type CacheComponentState = {
    parent: Cache,
    cache: Cache
}

export type SpawnedCachePool = {
    parent: Cache,
    pool: Cache
}

export const CacheContext: ReactContext<Cache> | null = enableCache ? {
    $$typeof: REACT_CONTEXT_TYPE,
    Consumer: null as any,
    Provider: null as any,
    _currentValue: null as any,
    _currentValue2: null as any,
    _threadCount: 0,
    _defaultValue: null as any,
    _globalName: null as any
} : null