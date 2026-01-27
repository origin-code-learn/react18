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
    useTransition,
    useImperativeHandle,
    forwardRef
} from 'react'

const ThemeContext: any = createContext<any>('light')

function reducer(state, action) {
    console.log('-----reducer-------', state, action)
    switch (action.type) {
        case 'add':
            return { ...state, num: state.num + 1 }
        case 'sub':
            return { ...state, num: state.num - 1 }
        case 'reset':
            return { ...state, num: 0 }
        default:
            return state
    }
}

function Count() {
    const [count, setCount] = useState(0)
    const [num, dispatch] = useReducer(reducer, { num: 0 })
    const countRef = useRef(0)

    const onClick = () => {
        countRef.current++
        console.log('-----countRef-------', countRef.current)
        // setCount(countRef.current)
    }

    return (
        <div>
            <h1>{num?.num}</h1>
            <button onClick={() => dispatch({ type: 'add' })}>+1</button>
            <button onClick={() => dispatch({ type: 'sub' })}>-1</button>
            <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
        </div>
    )
}

function Child() {
    const divRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        console.log('-----Child useEffect-------')
        return () => {
            console.log('-----child 组件Effect 清除-------')
        }
    }, [])

    useLayoutEffect(() => {
        console.log('-----Child----useLayoutEffect-------')
        console.log('-----divRef-----', divRef)
        if (divRef.current) {
            console.log('-----divRef-----', divRef)
            // divRef.current.style.color = 'red'
        }
        return () => {
            console.log('-----Child 组件LayoutEffect 清除-------')
        }
    }, [])

    return (<div ref={divRef}>我是 child 组件</div>)
}

function Child2() {
    const theme = useContext(ThemeContext)
    useEffect(() => {
        console.log('-----Child2------useEffect1-------')
        return () => {
            console.log('-----child2--------组件Effect1 清除-------')
        }
    }, [])

    useEffect(() => {
        console.log('-----Child2--------useEffect2-------')
        return () => {
            console.log('-----child2--------组件Effect2 清除-------')
        }
    }, [])
    return (<div>我是 child2 组件, 当前主题是 {theme}</div>)
}

// 非紧急更新
function TransitionDemo() {
    const [inputValue, setInputValue] = useState('')
    const [list, setList] = useState<any>([])
    // isPending：过渡更新是否进行中；startTransition：标记非紧急更新
    const [isPending, startTransition] = useTransition()

    // 输入框变化时，优先更新输入框，再异步更新列表
    const handleInputChange = (e) => {
        const value = e.target.value
        // 紧急更新：立即执行
        setInputValue(value)
        // 非紧急更新：标记为过渡任务，不阻塞UI
        startTransition(() => {
            // 模拟大量数据生成（耗时操作）
            const newList = Array(10000).fill(value)
            setList(newList)
        })
    }
    console.log('----isPending----', isPending)
    return (<div>
        <input value={inputValue} onChange={handleInputChange} placeholder="输入内容" />
        {isPending ? <p>加载中...</p> : (
            <ul>
                {list.map((item, index) => (
                    <li key={index}>{item}</li>
                ))}
            </ul>
        )}
    </div>)
}

function MyInput(props, ref) {
    console.log('-----MyInput---')
    const inputRef = useRef<any>(null)
    useImperativeHandle(ref, () => {
        console.log('---useImperativeHandle--执行了----')
        return {
            focus() {
                inputRef?.current.focus()
            },
        }
    })

    return <input {...props} ref={inputRef} />
}

const MyInputDemo = forwardRef(MyInput)

// useImperativeHandle 
function ImperativeHandleDemo() {
    const ref = useRef<any>(null)

    const onClick = () => {
        console.log('----click----', ref)
        ref.current.focus()
    }
    return (<form>
        <MyInputDemo placeholder="Enter your name" ref={ref} />
        <button type="button" onClick={onClick}>编辑</button>
    </form>)
}

export default function HookDemo({ }) {
    const [number, setNumber] = useState(0);
    // const number = 0
    const onChange = () => {
        console.log('----- +5 -----')
        setNumber(number + 1);
        // number++
    }

    // todo: 验证一下 React 中 commitMutationEffectsOnFiber 中 newProps 与 oldProps 是否相等
    const onChangeCallBack = useCallback(onChange, [number])
    console.log('-----rerender-------', number)
    useEffect(() => {
        console.log('-----App----useEffect1-------', number)
        return () => {
            console.log('-----App 组件Effect1 清除-------')
        }
    }, [])

    useEffect(() => {
        console.log('-----App----useEffect2-------', number)
        return () => {
            console.log('-----App 组件Effect2 清除-------')
        }
    }, [])

    const memoizedCount = useMemo(() => <Count />, [])

    return (
        <ThemeContext.Provider value="dark">
            <h1 style={{ color: 'red' }}>{number}</h1>
            <div>hello, react</div>
            <button onClick={onChangeCallBack}>+1</button>
            {memoizedCount}
            <Child2 />
            {number % 2 === 0 ? <Child key="child1" /> : <Child2 key="child2" />}
            <TransitionDemo />
            <ImperativeHandleDemo />
        </ThemeContext.Provider>
    )
}
