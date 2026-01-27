import { Fragment, Suspense, lazy } from 'react'
// React 内置组件：Fragment

const lists = [
    {
        label: 'hello, React',
        value: 1
    },
    {
        label: 'hello, vue',
        value: 2
    },
    {
        label: 'hello, anglar',
        value: 3
    },
    {
        label: 'hello, redux',
        value: 4
    }
]

// 1. 懒加载组件（异步组件）
const LazyComponent = lazy(() => import('./LazyComponent'));

function FragmentDemo() {
    return (<>
        React 内置组件:
        {lists?.map(v => <Fragment key={v.value}>{v.label}</Fragment>)}
    </>)
}

function SuspenseDemo() {
    return (<div>
        <h1>Suspense 示例:</h1>
        <Suspense fallback={<div>组件加载中...</div>}>
            <LazyComponent />
        </Suspense>
        {/* 3. 嵌套Suspense（React 18支持） */}
        <Suspense fallback={<div>外层加载中...</div>}>
            <div>
                <Suspense fallback={<div>内层加载中...</div>}>
                    <LazyComponent />
                </Suspense>
            </div>
        </Suspense>
    </div>)
}

export default function Comp() {
    return (<>
        <FragmentDemo />
        <SuspenseDemo />
    </>)
}