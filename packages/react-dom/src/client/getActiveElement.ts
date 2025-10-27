
/**
 * 获取当前文档中获得焦点的元素
 * 在浏览器中，document.activeElement 用于获取当前拥有焦点的 DOM 元素（如输入框、按钮等），这在以下场景中至关重要：
    1.表单交互：判断用户正在输入的输入框，确保状态同步。
    2.无障碍访问（A11y）：屏幕阅读器需要知道当前焦点位置，提供正确的语音反馈。
    3.提交阶段恢复焦点：React 在 DOM 操作后可能需要恢复之前的焦点状态（如 resetAfterCommit 阶段）
 * */ 

export default function getActiveElement(doc?: Document): Element | null {
    doc = doc || (typeof document !== 'undefined' ? document : undefined)
    if (typeof doc === 'undefined') {
        return null
    }
    // 安全获取焦点元素
    try {
        return doc.activeElement || doc.body
    } catch (e) {
        return doc.body
    }
}
