export interface Point {
  x: number;
  y: number;
}

/**
 * Where a screen position falls in composition pixels, for an SVG that is drawn with
 * `viewBox="0 0 W H"` over the preview. Uses the SVG's own screen transform, so letterboxing and
 * any CSS scaling are accounted for. Null when the element isn't laid out.
 */
export function clientToComp(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const ctm = svg.getScreenCTM();
  if (ctm === null) return null;
  const inverse = ctm.inverse();
  const point = new DOMPoint(clientX, clientY).matrixTransform(inverse);
  return { x: point.x, y: point.y };
}

/** Pixels on screen per composition pixel (so handles can keep a constant size on screen). */
export function screenScale(svg: SVGSVGElement): number {
  const ctm = svg.getScreenCTM();
  return ctm === null || ctm.a === 0 ? 1 : Math.abs(ctm.a);
}
