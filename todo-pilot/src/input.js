// Kept alive across hot module replacement so key releases are never lost mid-update.
export const heldKeys=new Set();
// Analog stick tilt from the on-screen joystick: x right = +1, y up = +1.
export const stick={x:0,y:0};
// On-screen throttle bar: +1 = full acceleration, -1 = full brake / pushback, 0 when released.
export const throttle={value:0};
const codes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','Space','ShiftLeft','ShiftRight']);
window.addEventListener('keydown',e=>{if(codes.has(e.code))heldKeys.add(e.code)});
window.addEventListener('keyup',e=>heldKeys.delete(e.code));
window.addEventListener('blur',()=>heldKeys.clear());
