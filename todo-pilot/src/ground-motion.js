// Signed speed: positive is forward and negative is pushback.
export function nextSpeed(speed, dt, accelerate, brake, airborne) {
  const drag = 1.2 + .00003 * speed * speed;
  const thrust = brake ? -48 : accelerate ? 48 : 0;
  const friction = Math.abs(speed) < .01 ? 0 : Math.sign(speed) * drag;
  let next = speed + (thrust - friction) * dt;
  if (!accelerate && !brake && Math.sign(next) !== Math.sign(speed)) next = 0;
  return Math.max(airborne ? 0 : -25, Math.min(airborne ? 900 : 370, next));
}
