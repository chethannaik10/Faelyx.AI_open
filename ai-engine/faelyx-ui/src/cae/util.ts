// Stack-safe max / min of long arrays (Math.max(...a) overflows the call stack for tens of thousands of values).
export function amax(a: ArrayLike<number>, init = -Infinity): number { let m = init; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
export function amin(a: ArrayLike<number>, init = Infinity): number { let m = init; for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
