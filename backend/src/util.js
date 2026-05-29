// Coerce a value to a finite number, or null if it isn't one.
// Guards against upstream fields being absent/garbage (Number(undefined) === NaN).
function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

module.exports = { toNum };
