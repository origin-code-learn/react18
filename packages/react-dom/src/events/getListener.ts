import { Fiber } from "react-reconciler/src/ReactInternalTypes";
import { getFiberCurrentPropsFromNode } from "../client/ReactDOMComponentTree";
import { Props } from "ReactDOMHostConfig";

function isInteractive(tag: string): boolean {
    return ['button', 'input', 'select', 'textarea'].includes(tag)
}

function shouldPreventMouseEvent(
    name: string,
    type: string,
    props: Props
): boolean {
    switch (name) {
        case 'onClick':
        case 'onClickCapture':
        case 'onDoubleClick':
        case 'onDoubleClickCapture':
        case 'onMouseDown':
        case 'onMouseDownCapture':
        case 'onMouseMove':
        case 'onMouseMoveCapture':
        case 'onMouseUp':
        case 'onMouseUpCapture':
        case 'onMouseEnter':
            return !!(props.disabled && isInteractive(type))
        default:
            return false
    }
}

export function getListener(
    inst: Fiber,
    registrationName: string
): Function | null {
    // ====================== 步骤1：检查 Fiber 对应的真实节点是否存在 ======================
    const stateNode = inst.stateNode // stateNode：Fiber 对应的真实节点（DOM 或组件实例）
    if (stateNode === null) {
        // 场景：Fiber 处于“工作中”状态（如增量渲染时的 onload 事件），无真实节点，返回 null
        return null
    }
    // ====================== 步骤2：获取 Fiber 当前生效的 props ======================
    const props = getFiberCurrentPropsFromNode(stateNode)
    if (props === null) {
        // 场景：props 尚未就绪（如组件正在初始化），返回 null
        return null
    }
    // ====================== 步骤3：从 props 中读取事件监听器 ======================
    const listener = props[registrationName]  // 如 registrationName = "onClick"，则读取 props.onClick
    // ====================== 步骤4：过滤需阻止的事件（如禁用按钮的点击事件） ======================
    if (shouldPreventMouseEvent(registrationName, inst.type, props)) {
        // 场景：该事件需被阻止（如 disabled 为 true 的按钮的 onClick），返回 null
        return null
    }
    // ====================== 步骤5：校验监听器类型（确保是函数） ======================
    if (listener && typeof listener !== 'function') {
        throw new Error('getListener 方法出错了， listener 应该是个 function')
    }

    return listener || null
}