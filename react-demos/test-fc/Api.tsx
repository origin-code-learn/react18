import { useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'

export function CreatePortalDemo() {
    return (
        <div style={{ border: '2px solid black' }}>
            <p>这个子节点被放置在父节点 div 中。</p>
            {createPortal(
                <p>这个子节点被放置在 document body 中。</p>,
                document.body
            )}
        </div>
    )
}

export function FlushSyncDemo() {
    const [isPrinting, setIsPrinting] = useState(false)
    useEffect(() => {
        function handleBeforePrint() {
            debugger
            flushSync(() => {
                setIsPrinting(true)
            })
        }
        function handleAfterPrint() {
            setIsPrinting(false)
        }
        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        }
    }, [])

    console.log('----isPrinting----->', isPrinting)
    return (
        <>
            <h1>是否打印：{isPrinting ? '是' : '否'}</h1>
            <button onClick={() => window.print()}>
                打印
            </button>
        </>
    )
}

export default function ApiDemo() {
    return <>
        {/* <CreatePortalDemo /> */}
        <FlushSyncDemo />
    </>
}