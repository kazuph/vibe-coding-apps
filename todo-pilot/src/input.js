// Kept alive across hot module replacement so key releases are never lost mid-update.
export const heldKeys=new Set();
const codes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','Space','ShiftLeft','ShiftRight']);
window.addEventListener('keydown',e=>{if(codes.has(e.code))heldKeys.add(e.code)});
window.addEventListener('keyup',e=>heldKeys.delete(e.code));
window.addEventListener('blur',()=>heldKeys.clear());
