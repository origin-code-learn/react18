import type { ReactContext } from "shared/ReactTypes";
import {REACT_PROVIDER_TYPE, REACT_CONTEXT_TYPE} from 'shared/ReactSymbols';

export function createContext<T>(defaultValue: T): ReactContext<T> {
    const context: ReactContext<T> = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null as any,
        Consumer: null as any,
        _defaultValue: null as any,
        _globalName: null as any
    }

    context.Provider = {
        $$typeof: REACT_PROVIDER_TYPE,
        _context: context
    }

    context.Consumer = context
    return context
}