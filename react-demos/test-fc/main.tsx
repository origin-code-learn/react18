import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

function Child() {
  useEffect(() => {
    console.log('-----Child useEffect-------')
    return () => {
      console.log('-----child 组件Effect 清除-------')
    }
  }, [])
  return (<div>我是 child 组件</div>)
}

function Child2() {
  useEffect(() => {
    console.log('-----Child2 useEffect-------')
    return () => {
      console.log('-----child2 组件Effect 清除-------')
    }
  }, [])
  return (<div>我是 child2 组件</div>)
}

let number = 0
function App ({}) {
  const [number, setNumber] = useState(0);
  // const number = 0
  const onChange = () => {
    console.log('----- +5 -----')
    setNumber(number + 5);
    // number++
  }
  console.log('-----rerender-------', number)
  useEffect(() => {
    console.log('-----useEffect-------', number)
    return () => {
      console.log('-----App 组件Effect 清除-------')
    }
  }, [])

  return (
    <div>
      <h1 style={{ color: 'red' }}>{number}</h1>
      <div>hello, react</div>
      <button onClick={onChange}>+5</button>
      <Child />
      <Child2 />
    </div>
  )
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
