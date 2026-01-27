import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useReducer,
} from 'react'

import { createRoot } from 'react-dom/client'

import HookDemo from './Hook'
import CompDemo from './Comp'
import ApiDemo from './Api'


function App() {
  return (<ApiDemo />)
}

const options = {
  unstable_strictMode: false,
  unstable_concurrentUpdatesByDefault: true,
  identifierPrefix: 'react-',
  onRecoverableError: (error: unknown) => {
    console.log('onRecoverableError', error)
  },
  transitionCallbacks: {
  }
}

createRoot(document.getElementById('root')!, options).render(<App />)
