
// 计算 32 位无符号整数中「前导零的个数」：
// 32 的 32 位二进制表示：00000000 00000000 00000000 00100000
// 前导零的个数是 27（前面连续 27 个 0）
export const clz32 = Math.clz32 ? Math.clz32 : clz32Fallback

const log = Math.log
const LN2 = Math.LN2

function clz32Fallback(x: number): number {
    // 将输入转换为 32 位无符号整数（处理负数和超出范围的数）
    const asUint = x >>> 0
    // 特殊情况：如果结果是 0，32 位全为 0，前导零为 32
    if (asUint === 0) {
        return 32
    }
    // 核心计算：通过对数计算最高位 1 的位置，再推导前导零个数
    return (31 - ((log(asUint) / LN2) | 0)) | 0
}
