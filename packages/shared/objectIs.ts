// 区分 +0 和 -0： 代码通过 1 / x === 1 / y 来区分：1 / +0 是 Infinity，1 / -0 是 -Infinity，两者不相等
/**
 * 区分 +0 和 -0： 
 *      代码通过 1 / x === 1 / y 来区分：1 / +0 是 Infinity，1 / -0 是 -Infinity，两者不相等
 * 正确判断 NaN
 *      原生 === 中 NaN === NaN 为 false（这是 JavaScript 的设计特性）
 *      代码通过 x !== x && y !== y 判断，因为 NaN 是唯一满足 x !== x 的值
 * 使用场景：
 *       React 在比较状态更新前后的值（如 useState 的状态变化）时会用到这个函数，以决定是否需要重新渲染组件
 *      如果 is(prevState, newState) 返回 true，说明状态未发生有意义的变化，可以跳过渲染
 *      如果返回 false，则需要触发组件重新渲染
 * */

function is(x: any, y: any) {
    return (x === y && (x !== 0 || 1/x === 1/y)) || (x !== x && y !== y)
}

const objectIs: (x: any, y: any) => boolean = typeof Object.is === 'function' ? Object.is : is

export default objectIs