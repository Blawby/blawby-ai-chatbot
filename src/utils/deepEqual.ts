/**
 * Performs a deep equality comparison between two values
 * @param a First value to compare
 * @param b Second value to compare
 * @returns true if values are deeply equal, false otherwise
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference
  if (a === b) return true;
  
  // Handle NaN values - NaN !== NaN, but we want deepEqual(NaN, NaN) to return true
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  
  // Handle null/undefined cases
  if (a == null || b == null) return a === b;
  
  // Different types
  if (typeof a !== typeof b) return false;
  
  // Primitive types
  if (typeof a !== 'object') return a === b;
  
  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  
  // One is array, other is not
  if (Array.isArray(a) || Array.isArray(b)) return false;
  
  // Handle special object types
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key)) return false;
      if (!deepEqual(value, b.get(key))) return false;
    }
    return true;
  }
  
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    // Optimize for primitive-only sets: O(n) for primitives, O(n²) for objects
    for (const value of a) {
      // For primitive values, use Set.has() for O(1) lookup
      if (typeof value !== 'object' && typeof value !== 'function') {
        if (!b.has(value)) return false;
      } else {
        // For objects/functions, fall back to deep comparison
        let found = false;
        for (const bValue of b) {
          if (deepEqual(value, bValue)) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
    }
    return true;
  }
  
  // Handle TypedArrays
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    if (a.byteLength !== b.byteLength) return false;
    const ua = new Uint8Array(a);
    const ub = new Uint8Array(b);
    return ua.every((byte, index) => byte === ub[index]);
  }
  
  // Check typed arrays (excluding BigInt arrays which need special handling)
  const numericTypedArrayConstructors = [
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
  ];
  
  for (const TypedArrayConstructor of numericTypedArrayConstructors) {
    if (a instanceof TypedArrayConstructor && b instanceof TypedArrayConstructor) {
      if (a.length !== b.length) return false;
      return Array.from(a).every((element, index) => element === b[index]);
    }
  }
  
  // Handle BigInt typed arrays separately
  if ((a instanceof BigUint64Array && b instanceof BigUint64Array) ||
      (a instanceof BigInt64Array && b instanceof BigInt64Array)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  
  // Handle regular objects
  const keysA = Reflect.ownKeys(a as Record<string | symbol, unknown>);
  const keysB = Reflect.ownKeys(b as Record<string | symbol, unknown>);
  
  if (keysA.length !== keysB.length) return false;
  
  // Use Set for O(1) lookup instead of O(n) includes
  const keysBSet = new Set(keysB);
  
  for (const key of keysA) {
    if (!keysBSet.has(key)) return false;
    if (!deepEqual((a as Record<string | symbol, unknown>)[key], (b as Record<string | symbol, unknown>)[key])) {
      return false;
    }
  }
  
  return true;
}
