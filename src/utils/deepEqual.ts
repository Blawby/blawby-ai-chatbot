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
    Float16Array,
  ];
  
  for (const TypedArrayConstructor of numericTypedArrayConstructors) {
    if (a instanceof TypedArrayConstructor && b instanceof TypedArrayConstructor) {
      if (a.length !== b.length) return false;
      // Use indexed for loop to avoid Array.from allocation and handle NaN values
      for (let i = 0; i < a.length; i++) {
        const valA = a[i];
        const valB = b[i];
        // Treat NaN values as equal (like the top-level Number logic)
        if (Number.isNaN(valA) && Number.isNaN(valB)) {
          continue;
        }
        if (valA !== valB) {
          return false;
        }
      }
      return true;
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
  
  // Definitive guard for typed arrays and DataView: prevent cross-type/cross-realm fallthrough
  // Use Object.prototype.toString to get toStringTag, which works across realms
  const tagA = Object.prototype.toString.call(a);
  const tagB = Object.prototype.toString.call(b);
  
  // Check if both are typed arrays (any type) using toStringTag
  const typedArrayPattern = /^\[object (Uint8ClampedArray|Uint8Array|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float16Array|Float32Array|Float64Array|BigUint64Array|BigInt64Array)\]$/;
  const isTypedArrayA = typedArrayPattern.test(tagA);
  const isTypedArrayB = typedArrayPattern.test(tagB);
  
  if (isTypedArrayA || isTypedArrayB) {
    // If one is a typed array and the other isn't, they're not equal
    if (isTypedArrayA !== isTypedArrayB) return false;
    // Both are typed arrays - require same type and compare elements
    if (tagA !== tagB) return false; // Different types (e.g., Int8Array vs Uint8Array)
    
    // Same type - compare element-wise
    const arrA = a as ArrayLike<number | bigint>;
    const arrB = b as ArrayLike<number | bigint>;
    if (arrA.length !== arrB.length) return false;
    
    for (let i = 0; i < arrA.length; i++) {
      const valA = arrA[i];
      const valB = arrB[i];
      // Treat NaN values as equal when comparing floating typed arrays
      if (typeof valA === 'number' && typeof valB === 'number' && Number.isNaN(valA) && Number.isNaN(valB)) {
        continue;
      }
      // Use Object.is for correct BigInt handling and other comparisons
      if (!Object.is(valA, valB)) return false;
    }
    return true;
  }
  
  // Handle DataView explicitly
  if (tagA === '[object DataView]' || tagB === '[object DataView]') {
    if (tagA !== tagB) return false; // One is DataView, other isn't
    const dvA = a as DataView;
    const dvB = b as DataView;
    // Compare only the viewed range, not the entire buffer or byteOffset
    if (dvA.byteLength !== dvB.byteLength) return false;
    // Create Uint8Array views representing only each DataView's viewed range
    const viewA = new Uint8Array(dvA.buffer, dvA.byteOffset, dvA.byteLength);
    const viewB = new Uint8Array(dvB.buffer, dvB.byteOffset, dvB.byteLength);
    // Compare bytes in the viewed ranges
    return viewA.every((byte, index) => byte === viewB[index]);
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
