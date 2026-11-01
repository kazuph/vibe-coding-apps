// Give young pilots a forgiving margin while detecting clearly unsafe landings.
export function landingIsSafe(speed, verticalSpeed) {
  const horizontal = Math.max(Math.abs(speed) / 3.6 * .18, .01);
  const angle = Math.atan2(Math.max(0, -verticalSpeed), horizontal);
  return speed <= 400 && angle <= 18 * Math.PI / 180;
}
