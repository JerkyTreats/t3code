export interface SketchBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SketchArea {
  readonly ids: ReadonlyArray<string>;
  readonly box: SketchBox;
  readonly updated: number;
}

// About five lines of Excalidraw's default 20px text: a label or stroke drawn beside a shape joins
// it, while sketches a turn's width apart get their own picture.
const SKETCH_AREA_GAP_PX = 120;
const SKETCH_MAX_AREAS = 4;
// Anything near enough to have joined an area's marks shows around them.
const SKETCH_PADDING_PX = SKETCH_AREA_GAP_PX;

const boxesNear = (left: SketchBox, right: SketchBox, gap: number) =>
  left.x - gap <= right.x + right.width &&
  right.x - gap <= left.x + left.width &&
  left.y - gap <= right.y + right.height &&
  right.y - gap <= left.y + left.height;

const boxUnion = (left: SketchBox, right: SketchBox): SketchBox => {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  };
};

/**
 * Splits marks into areas that each make one readable picture: boxes that overlap or sit within
 * `gap` merge until none do. Past `max` areas, the ones changed longest ago are dropped, since the
 * newest marks are the ones the user is talking about. Areas come top to bottom.
 */
export function sketchAreas(
  marks: ReadonlyArray<{ readonly id: string; readonly box: SketchBox; readonly updated: number }>,
  gap = SKETCH_AREA_GAP_PX,
  max = SKETCH_MAX_AREAS,
): ReadonlyArray<SketchArea> {
  const areas: Array<SketchArea> = marks.map((mark) => ({ ...mark, ids: [mark.id] }));
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < areas.length && !merged; i += 1) {
      for (let j = i + 1; j < areas.length && !merged; j += 1) {
        const [left, right] = [areas[i]!, areas[j]!];
        if (!boxesNear(left.box, right.box, gap)) continue;
        areas[i] = {
          ids: [...left.ids, ...right.ids],
          box: boxUnion(left.box, right.box),
          updated: Math.max(left.updated, right.updated),
        };
        areas.splice(j, 1);
        merged = true;
      }
    }
  }
  return areas
    .toSorted((left, right) => right.updated - left.updated)
    .slice(0, max)
    .toSorted((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
}

/**
 * What one area's picture draws: a crop padded around the area and widened to whole text, since
 * words cut at the edge cannot be read, and every element overlapping that crop.
 */
export function sketchFrame<Element extends { readonly type: string }>(
  elements: ReadonlyArray<Element>,
  area: SketchBox,
  boxOf: (element: Element) => SketchBox,
) {
  const padded = {
    x: area.x - SKETCH_PADDING_PX,
    y: area.y - SKETCH_PADDING_PX,
    width: area.width + 2 * SKETCH_PADDING_PX,
    height: area.height + 2 * SKETCH_PADDING_PX,
  };
  const crop = elements
    .filter((element) => element.type === "text" && boxesNear(boxOf(element), padded, 0))
    .reduce((box, text) => boxUnion(box, boxOf(text)), padded);
  return { crop, drawn: elements.filter((element) => boxesNear(boxOf(element), crop, 0)) };
}
