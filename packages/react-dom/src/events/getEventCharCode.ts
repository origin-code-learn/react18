
/**
核心背景：浏览器 charCode 与 keyCode 的兼容性乱象
在早期浏览器中，键盘事件的字符编码存在两大问题，导致直接使用原生属性会出现不一致：

属性支持差异：
现代浏览器（如 Chrome）同时支持 charCode（表示字符的 Unicode 编码，仅可打印字符有效）和 keyCode（表示键盘物理键的编码，与字符无关）；
Firefox 对部分按键（如 Enter）不设置 charCode（返回 0），需通过 keyCode 补充；
IE8 不支持 charCode，仅通过 keyCode 传递字符编码。
特殊按键编码不一致：
部分浏览器（如 IE、Edge、Windows 下的 Chrome）在按下 Ctrl+Enter 时，会将 Enter 的 charCode 错误报告为 10（换行符 \n），而非标准的 13（回车符 \r）；
非打印按键（如 F1、ESC、Tab）的 charCode 可能被错误赋值为非 0 值，需过滤。

getEventCharCode 的作用就是 “抹平” 这些差异，返回统一的、可信赖的字符编码。
*/

function getEventCharCode(nativeEvent: KeyboardEvent): number {
    let charCode // 最终返回的标准化字符编码
    const keyCode = nativeEvent.keyCode // 键盘物理键编码（备用）
    // ====================== 步骤1：优先获取 charCode（现代浏览器逻辑） ======================
    if ('charCode' in nativeEvent) {
        charCode = nativeEvent.charCode; // 优先使用原生 charCode
        // 兼容 Firefox：Enter 键的 charCode 为 0，需用 keyCode=13 修正
        if (charCode === 0 && keyCode === 13) {
            charCode = 13
        }
    // ====================== 步骤2：兼容 IE8（无 charCode，用 keyCode 替代） ======================
    } else {
        charCode = keyCode  // IE8 不支持 charCode，直接使用 keyCode 作为字符编码
    }
    // ====================== 步骤3：修正 Ctrl+Enter 场景的错误编码 ======================
    // IE/Edge/Windows Chrome/Safari：Ctrl+Enter 时 Enter 的 charCode 为 10（\n），需修正为 13（\r）
    if (charCode === 10) {
        charCode = 13
    }

    // ====================== 步骤4：过滤非打印字符（保留 Enter 键） ======================
    // 规则：仅保留可打印字符（charCode ≥32，对应空格及以上字符）和 Enter 键（charCode=13）
    // 非打印字符（如 F1、ESC、Tab）返回 0，表示无有效字符编码
    if (charCode >= 32 || charCode === 13) {
        return charCode
    }

    // 非打印字符返回 0
    return 0
}

export default getEventCharCode