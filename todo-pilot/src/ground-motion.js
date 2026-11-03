// Signed speed: positive is forward and negative is pushback.
// throttle (-1..1) comes from the on-screen bar and is used when no key is held.
export function nextSpeed(speed, dt, accelerate, brake, airborne, throttle = 0) {
  const drag = 1.2 + .00003 * speed * speed;
  const thrust = brake ? -48 : accelerate ? 48 : 48 * throttle;
  const friction = Math.abs(speed) < .01 ? 0 : Math.sign(speed) * drag;
  let next = speed + (thrust - friction) * dt;
  if (!accelerate && !brake && !throttle && Math.sign(next) !== Math.sign(speed)) next = 0;
  return Math.max(airborne ? 0 : -25, Math.min(airborne ? 900 : 370, next));
}
