/** Unit vector for an angle in degrees, clockwise on screen (y points down), like layer rotation. */
export const dir = (degrees: number): readonly [number, number] => {
  const a = (degrees * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
};
export const radians = (degrees: number): number => (degrees * Math.PI) / 180;
