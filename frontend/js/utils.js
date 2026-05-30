/**
 * Creates a debounced function that delays execution until after wait time has elapsed.
 * Subsequent calls reset the timer.
 *
 * @param {Function} func - The function to debounce
 * @param {number} delayMs - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delayMs) {
  let timeoutId = null;

  return function debounced(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delayMs);
  };
}
