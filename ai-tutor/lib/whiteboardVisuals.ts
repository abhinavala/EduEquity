"use client";

import { createShapeId, Editor, getIndicesBetween, TLShapeId, toRichText } from "tldraw";
import { VisualPlan, VisualPoint } from "@/lib/types";

type StrokeSize = "s" | "m" | "l" | "xl";
type StrokeColor =
  | "black"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "yellow"
  | "violet"
  | "light-violet"
  | "light-blue"
  | "light-green"
  | "light-red"
  | "grey";
type StrokeDash = "draw" | "solid" | "dashed" | "dotted";

interface SegmentConfig {
  x: number;
  y: number;
  x2: number;
  y2: number;
  color?: StrokeColor;
  size?: StrokeSize;
  dash?: StrokeDash;
}

interface LabelConfig {
  x: number;
  y: number;
  text: string;
  width?: number;
  color?: StrokeColor;
  size?: StrokeSize;
}

interface BoxConfig {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: StrokeColor;
  fill?: "solid" | "none";
  opacity?: number;
  geo?: "rectangle" | "ellipse";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSegment(editor: Editor, config: SegmentConfig) {
  const [start, end] = getIndicesBetween(null, null, 2);
  const id = createShapeId();

  editor.createShape({
    id,
    type: "line",
    x: config.x,
    y: config.y,
    props: {
      color: config.color ?? "black",
      size: config.size ?? "m",
      dash: config.dash ?? "draw",
      points: {
        [start]: { id: start, index: start, x: 0, y: 0 },
        [end]: {
          id: end,
          index: end,
          x: config.x2 - config.x,
          y: config.y2 - config.y,
        },
      },
    },
  });

  return id;
}

function updateSegment(editor: Editor, id: TLShapeId, config: SegmentConfig) {
  const [start, end] = getIndicesBetween(null, null, 2);
  editor.updateShape({
    id,
    type: "line",
    x: config.x,
    y: config.y,
    props: {
      color: config.color ?? "black",
      size: config.size ?? "m",
      dash: config.dash ?? "draw",
      points: {
        [start]: { id: start, index: start, x: 0, y: 0 },
        [end]: {
          id: end,
          index: end,
          x: config.x2 - config.x,
          y: config.y2 - config.y,
        },
      },
    },
  });
}

function createLabel(editor: Editor, config: LabelConfig) {
  const id = createShapeId();

  editor.createShape({
    id,
    type: "text",
    x: config.x,
    y: config.y,
    props: {
      richText: toRichText(config.text),
      autoSize: false,
      w: config.width ?? 220,
      size: config.size ?? "m",
      font: "draw",
      color: config.color ?? "blue",
      textAlign: "start",
      scale: 1,
    },
  });

  return id;
}

function updateLabel(editor: Editor, id: TLShapeId, config: LabelConfig) {
  editor.updateShape({
    id,
    type: "text",
    x: config.x,
    y: config.y,
    props: {
      richText: toRichText(config.text),
      autoSize: false,
      w: config.width ?? 220,
      size: config.size ?? "m",
      font: "draw",
      color: config.color ?? "blue",
      textAlign: "start",
      scale: 1,
    },
  });
}

function createPoint(editor: Editor, x: number, y: number, color: StrokeColor = "red") {
  const id = createShapeId();
  editor.createShape({
    id,
    type: "geo",
    x,
    y,
    props: {
      w: 18,
      h: 18,
      geo: "ellipse",
      color,
      fill: "solid",
      dash: "solid",
      size: "m",
    },
  });
  return id;
}

function createBox(editor: Editor, config: BoxConfig) {
  const id = createShapeId();
  editor.createShape({
    id,
    type: "geo",
    x: config.x,
    y: config.y,
    opacity: config.opacity ?? 0.45,
    props: {
      w: config.w,
      h: config.h,
      geo: config.geo ?? "rectangle",
      color: config.color ?? "blue",
      fill: config.fill ?? "solid",
      dash: "solid",
      size: "m",
    },
  });
  return id;
}

function updateBox(editor: Editor, id: TLShapeId, config: BoxConfig) {
  editor.updateShape({
    id,
    type: "geo",
    x: config.x,
    y: config.y,
    opacity: config.opacity ?? 0.45,
    props: {
      w: config.w,
      h: config.h,
      geo: config.geo ?? "rectangle",
      color: config.color ?? "blue",
      fill: config.fill ?? "solid",
      dash: "solid",
      size: "m",
    },
  });
}

function createPolyline(
  editor: Editor,
  points: Array<{ x: number; y: number }>,
  config: Omit<SegmentConfig, "x" | "y" | "x2" | "y2">
) {
  if (points.length < 2) return null;

  const indices = getIndicesBetween(null, null, points.length);
  const origin = points[0];
  const id = createShapeId();
  editor.createShape({
    id,
    type: "line",
    x: origin.x,
    y: origin.y,
    props: {
      color: config.color ?? "black",
      size: config.size ?? "m",
      dash: config.dash ?? "draw",
      points: Object.fromEntries(
        points.map((point, index) => [
          indices[index],
          {
            id: indices[index],
            index: indices[index],
            x: point.x - origin.x,
            y: point.y - origin.y,
          },
        ])
      ),
    },
  });

  return id;
}

async function slideLabel(
  editor: Editor,
  id: TLShapeId,
  from: { x: number; y: number },
  to: { x: number; y: number },
  config: Omit<LabelConfig, "x" | "y">,
  shouldCancel: () => boolean
) {
  const frames = 8;
  for (let frame = 0; frame <= frames; frame += 1) {
    if (shouldCancel()) return;
    const t = frame / frames;
    updateLabel(editor, id, {
      ...config,
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
    await sleep(45);
  }
}

function updatePoint(editor: Editor, id: TLShapeId, x: number, y: number) {
  editor.updateShape({
    id,
    type: "geo",
    x,
    y,
    props: {
      w: 18,
      h: 18,
      geo: "ellipse",
      color: "red",
      fill: "solid",
      dash: "solid",
      size: "m",
    },
  });
}

function normalizeColor(input?: string | null): StrokeColor {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return "blue";

  const directMap: Record<string, StrokeColor> = {
    black: "black",
    dark: "black",
    gray: "grey",
    grey: "grey",
    silver: "grey",
    blue: "blue",
    navy: "blue",
    teal: "light-blue",
    cyan: "light-blue",
    green: "green",
    lime: "light-green",
    yellow: "yellow",
    orange: "orange",
    red: "red",
    pink: "light-red",
    magenta: "light-red",
    purple: "violet",
    violet: "violet",
    lavender: "light-violet",
  };

  return directMap[normalized] ?? "blue";
}

function normalizeSize(input?: string | null): StrokeSize {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return "m";
  if (normalized === "small" || normalized === "thin") return "s";
  if (normalized === "large" || normalized === "thick") return "l";
  if (normalized === "xl" || normalized === "extra-large" || normalized === "extra large") return "xl";
  return normalized === "s" || normalized === "m" || normalized === "l" || normalized === "xl"
    ? normalized
    : "m";
}

function normalizeDash(input?: string | null): StrokeDash {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return "draw";
  if (normalized === "solid") return "solid";
  if (normalized === "dashed" || normalized === "dash") return "dashed";
  if (normalized === "dotted" || normalized === "dot") return "dotted";
  return "draw";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function mapPointToRegion(point: VisualPoint, region: { x: number; y: number; w: number; h: number }) {
  return {
    x: region.x + (clampPercent(point.x) / 100) * region.w,
    y: region.y + (clampPercent(point.y) / 100) * region.h,
  };
}

function createArrow(editor: Editor, config: SegmentConfig) {
  const mainId = createSegment(editor, config);
  const angle = Math.atan2(config.y2 - config.y, config.x2 - config.x);
  const headLength = 18;
  const spread = Math.PI / 7;

  createSegment(editor, {
    x: config.x2,
    y: config.y2,
    x2: config.x2 - Math.cos(angle - spread) * headLength,
    y2: config.y2 - Math.sin(angle - spread) * headLength,
    color: config.color,
    size: config.size,
    dash: "solid",
  });
  createSegment(editor, {
    x: config.x2,
    y: config.y2,
    x2: config.x2 - Math.cos(angle + spread) * headLength,
    y2: config.y2 - Math.sin(angle + spread) * headLength,
    color: config.color,
    size: config.size,
    dash: "solid",
  });

  return mainId;
}

function mapQuadraticPoint(
  xValue: number,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const minX = -3;
  const maxX = 3;
  const maxY = 9;
  const normalizedX = (xValue - minX) / (maxX - minX);
  const yValue = xValue * xValue;
  const normalizedY = yValue / maxY;

  return {
    x: left + normalizedX * width,
    y: top + height - normalizedY * height,
  };
}

function getTangentSegmentForQuadratic(
  xValue: number,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const center = mapQuadraticPoint(xValue, left, top, width, height);
  const scaleX = width / 6;
  const scaleY = height / 9;
  const slope = 2 * xValue;
  const screenSlope = -(slope * scaleY) / scaleX;
  const baseDx = 1;
  const baseDy = screenSlope;
  const magnitude = Math.sqrt(baseDx * baseDx + baseDy * baseDy) || 1;
  const halfLength = 72;
  const unitX = baseDx / magnitude;
  const unitY = baseDy / magnitude;

  return {
    x: center.x - unitX * halfLength,
    y: center.y - unitY * halfLength,
    x2: center.x + unitX * halfLength,
    y2: center.y + unitY * halfLength,
    center,
    slope,
  };
}

async function playParabolaTangentDemo(
  editor: Editor,
  plan: VisualPlan,
  shouldCancel: () => boolean
) {
  const viewport = editor.getViewportPageBounds();
  const graphWidth = Math.min(Math.max(viewport.width * 0.28, 300), 380);
  const graphHeight = Math.min(Math.max(viewport.height * 0.28, 220), 280);
  const left = viewport.x + viewport.width * 0.52;
  const top = viewport.y + viewport.height * 0.18;
  const axisInsetX = 28;
  const axisInsetY = 18;
  const plotLeft = left + axisInsetX;
  const plotTop = top + axisInsetY;
  const plotWidth = graphWidth - axisInsetX * 1.3;
  const plotHeight = graphHeight - axisInsetY * 1.5;

  createLabel(editor, {
    x: left - 18,
    y: top - 42,
    width: graphWidth + 40,
    color: "blue",
    size: "m",
    text: plan.expression || "f(x) = x²",
  });

  createLabel(editor, {
    x: left - 18,
    y: top + graphHeight + 14,
    width: graphWidth + 80,
    color: "green",
    size: "s",
    text: plan.insightLabel ?? "The tangent gets steeper as x gets bigger.",
  });

  createSegment(editor, {
    x: plotLeft,
    y: plotTop + plotHeight,
    x2: plotLeft + plotWidth + 24,
    y2: plotTop + plotHeight,
    color: "black",
    size: "s",
    dash: "solid",
  });

  createSegment(editor, {
    x: plotLeft,
    y: plotTop + plotHeight + 10,
    x2: plotLeft,
    y2: plotTop - 10,
    color: "black",
    size: "s",
    dash: "solid",
  });

  const xAxisLabel = createLabel(editor, {
    x: plotLeft + plotWidth + 14,
    y: plotTop + plotHeight - 20,
    width: 50,
    text: "x",
    color: "black",
    size: "s",
  });
  const yAxisLabel = createLabel(editor, {
    x: plotLeft - 10,
    y: plotTop - 40,
    width: 40,
    text: "y",
    color: "black",
    size: "s",
  });

  const curveSampleXs = [-2.5, -2.2, -1.9, -1.6, -1.3, -1, -0.7, -0.4, -0.1, 0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2, 2.3, 2.6];
  for (let index = 0; index < curveSampleXs.length - 1; index += 1) {
    if (shouldCancel()) return;

    const start = mapQuadraticPoint(curveSampleXs[index], plotLeft, plotTop, plotWidth, plotHeight);
    const end = mapQuadraticPoint(curveSampleXs[index + 1], plotLeft, plotTop, plotWidth, plotHeight);
    createSegment(editor, {
      x: start.x,
      y: start.y,
      x2: end.x,
      y2: end.y,
      color: "blue",
      size: "m",
      dash: "draw",
    });
    await sleep(55);
  }

  if (shouldCancel()) return;

  const pointId = createPoint(editor, plotLeft, plotTop + plotHeight - 9);
  const tangentId = createSegment(editor, {
    x: plotLeft,
    y: plotTop + plotHeight - 9,
    x2: plotLeft + 120,
    y2: plotTop + plotHeight - 9,
    color: "red",
    size: "m",
    dash: "solid",
  });
  const slopeLabelId = createLabel(editor, {
    x: left + graphWidth - 96,
    y: top - 4,
    width: 120,
    color: "red",
    size: "s",
    text: plan.tangentLabel ?? "slope = 2x",
  });

  const pointPositions = [-2.1, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2.1];
  for (const xValue of pointPositions) {
    if (shouldCancel()) return;

    const tangent = getTangentSegmentForQuadratic(xValue, plotLeft, plotTop, plotWidth, plotHeight);
    updatePoint(editor, pointId, tangent.center.x - 9, tangent.center.y - 9);
    updateSegment(editor, tangentId, {
      x: tangent.x,
      y: tangent.y,
      x2: tangent.x2,
      y2: tangent.y2,
      color: "red",
      size: "m",
      dash: "solid",
    });
    updateLabel(editor, slopeLabelId, {
      x: tangent.center.x + 24,
      y: tangent.center.y - 42,
      width: 140,
      color: "red",
      size: "s",
      text: plan.tangentLabel ?? `slope = 2x`,
    });
    await sleep(220);
  }

  updateLabel(editor, xAxisLabel, {
    x: plotLeft + plotWidth + 14,
    y: plotTop + plotHeight - 20,
    width: 50,
    text: "x",
    color: "black",
    size: "s",
  });
  updateLabel(editor, yAxisLabel, {
    x: plotLeft - 10,
    y: plotTop - 40,
    width: 40,
    text: "y",
    color: "black",
    size: "s",
  });
}

async function playConceptStepsDemo(
  editor: Editor,
  plan: VisualPlan,
  shouldCancel: () => boolean
) {
  const viewport = editor.getViewportPageBounds();
  const baseX = viewport.x + viewport.width * 0.58;
  const baseY = viewport.y + viewport.height * 0.22;
  const boxWidth = 210;

  const titleId = createLabel(editor, {
    x: baseX - 18,
    y: baseY - 42,
    width: boxWidth + 40,
    color: "blue",
    size: "m",
    text: plan.expression || "Visual breakdown",
  });

  const firstBoxId = createLabel(editor, {
    x: baseX,
    y: baseY,
    width: boxWidth,
    color: "green",
    size: "m",
    text: plan.conceptLabel ?? "Start here",
  });

  await sleep(90);
  if (shouldCancel()) return;

  createSegment(editor, {
    x: baseX + boxWidth * 0.45,
    y: baseY + 56,
    x2: baseX + boxWidth * 0.45,
    y2: baseY + 108,
    color: "black",
    size: "s",
    dash: "solid",
  });

  const secondBoxId = createLabel(editor, {
    x: baseX - 40,
    y: baseY + 116,
    width: boxWidth + 60,
    color: "violet",
    size: "m",
    text: plan.secondaryLabel ?? plan.tangentLabel ?? "Next relationship",
  });

  await sleep(90);
  if (shouldCancel()) return;

  createSegment(editor, {
    x: baseX + boxWidth * 0.45,
    y: baseY + 172,
    x2: baseX + boxWidth * 0.45,
    y2: baseY + 224,
    color: "black",
    size: "s",
    dash: "solid",
  });

  const insightId = createLabel(editor, {
    x: baseX - 18,
    y: baseY + 232,
    width: boxWidth + 50,
    color: "red",
    size: "m",
    text: plan.insightLabel ?? "This is the key takeaway.",
  });

  updateLabel(editor, titleId, {
    x: baseX - 18,
    y: baseY - 42,
    width: boxWidth + 40,
    color: "blue",
    size: "m",
    text: plan.expression || "Visual breakdown",
  });
  updateLabel(editor, firstBoxId, {
    x: baseX,
    y: baseY,
    width: boxWidth,
    color: "green",
    size: "m",
    text: plan.conceptLabel ?? "Start here",
  });
  updateLabel(editor, secondBoxId, {
    x: baseX - 40,
    y: baseY + 116,
    width: boxWidth + 60,
    color: "violet",
    size: "m",
    text: plan.secondaryLabel ?? plan.tangentLabel ?? "Next relationship",
  });
  updateLabel(editor, insightId, {
    x: baseX - 18,
    y: baseY + 232,
    width: boxWidth + 50,
    color: "red",
    size: "m",
    text: plan.insightLabel ?? "This is the key takeaway.",
  });
}

async function playIntegrationByPartsDemo(
  editor: Editor,
  plan: VisualPlan,
  shouldCancel: () => boolean
) {
  const viewport = editor.getViewportPageBounds();
  const left = viewport.x + viewport.width * 0.16;
  const top = viewport.y + viewport.height * 0.18;
  const expressionWidth = Math.min(Math.max(viewport.width * 0.42, 420), 620);
  const expressionText = plan.expression || "∫ x e^x dx";
  const uPart = plan.uPart || "x";
  const dvPart = plan.dvPart || "e^x dx";
  const duPart = plan.duPart || "dx";
  const vPart = plan.vPart || "e^x";
  const assembledFormula = plan.assembledFormula || `${uPart}(${vPart}) − ∫ ${vPart}(${duPart})`;

  createLabel(editor, {
    x: left,
    y: top - 48,
    width: expressionWidth + 80,
    color: "blue",
    size: "m",
    text: plan.conceptLabel || "Step 1: Identify u and dv",
  });

  const expressionId = createLabel(editor, {
    x: left,
    y: top + 8,
    width: expressionWidth,
    color: "black",
    size: "l",
    text: expressionText,
  });

  await sleep(350);
  if (shouldCancel()) return;

  const uBoxId = createBox(editor, {
    x: left + 44,
    y: top + 6,
    w: Math.max(62, uPart.length * 17),
    h: 44,
    color: "blue",
  });
  const dvBoxId = createBox(editor, {
    x: left + 138,
    y: top + 6,
    w: Math.max(118, dvPart.length * 14),
    h: 44,
    color: "orange",
  });
  createLabel(editor, {
    x: left + 44,
    y: top + 58,
    width: 100,
    color: "blue",
    size: "s",
    text: `u = ${uPart}`,
  });
  createLabel(editor, {
    x: left + 148,
    y: top + 58,
    width: 180,
    color: "orange",
    size: "s",
    text: `dv = ${dvPart}`,
  });

  await sleep(2000);
  if (shouldCancel()) return;

  createLabel(editor, {
    x: left,
    y: top + 118,
    width: expressionWidth + 80,
    color: "blue",
    size: "m",
    text: plan.secondaryLabel || "Step 2: Differentiate u, integrate dv",
  });

  createSegment(editor, {
    x: left + 92,
    y: top + 88,
    x2: left + 92,
    y2: top + 156,
    color: "blue",
    size: "m",
    dash: "solid",
  });
  createSegment(editor, {
    x: left + 228,
    y: top + 88,
    x2: left + 228,
    y2: top + 156,
    color: "orange",
    size: "m",
    dash: "solid",
  });

  createLabel(editor, {
    x: left + 52,
    y: top + 168,
    width: 120,
    color: "blue",
    size: "m",
    text: `${uPart} → ${duPart}`,
  });
  createLabel(editor, {
    x: left + 188,
    y: top + 168,
    width: 160,
    color: "orange",
    size: "m",
    text: `∫dv → ${vPart}`,
  });

  await sleep(2000);
  if (shouldCancel()) return;

  createLabel(editor, {
    x: left,
    y: top + 242,
    width: expressionWidth + 90,
    color: "blue",
    size: "m",
    text: "Step 3: Build uv − ∫v du",
  });

  const firstPieceId = createLabel(editor, {
    x: left + 20,
    y: top + 306,
    width: 110,
    color: "blue",
    size: "l",
    text: `${uPart}${vPart}`,
  });
  await slideLabel(
    editor,
    firstPieceId,
    { x: left + 20, y: top + 306 },
    { x: left + 32, y: top + 286 },
    {
      width: 120,
      color: "blue",
      size: "l",
      text: `${uPart}${vPart}`,
    },
    shouldCancel
  );

  if (shouldCancel()) return;

  const minusPieceId = createLabel(editor, {
    x: left + 184,
    y: top + 306,
    width: 80,
    color: "black",
    size: "l",
    text: "−",
  });
  await slideLabel(
    editor,
    minusPieceId,
    { x: left + 184, y: top + 306 },
    { x: left + 172, y: top + 286 },
    {
      width: 80,
      color: "black",
      size: "l",
      text: "−",
    },
    shouldCancel
  );

  if (shouldCancel()) return;

  const integralPieceId = createLabel(editor, {
    x: left + 252,
    y: top + 306,
    width: 280,
    color: "red",
    size: "l",
    text: `∫ ${vPart} ${duPart}`,
  });
  await slideLabel(
    editor,
    integralPieceId,
    { x: left + 252, y: top + 306 },
    { x: left + 214, y: top + 286 },
    {
      width: 280,
      color: "red",
      size: "l",
      text: `∫ ${vPart} ${duPart}`,
    },
    shouldCancel
  );

  if (shouldCancel()) return;

  createLabel(editor, {
    x: left + 24,
    y: top + 356,
    width: expressionWidth + 100,
    color: "green",
    size: "m",
    text: assembledFormula,
  });

  updateBox(editor, uBoxId, {
    x: left + 44,
    y: top + 6,
    w: Math.max(62, uPart.length * 17),
    h: 44,
    color: "blue",
  });
  updateBox(editor, dvBoxId, {
    x: left + 138,
    y: top + 6,
    w: Math.max(118, dvPart.length * 14),
    h: 44,
    color: "orange",
  });

  await sleep(400);
  if (shouldCancel()) return;

  createLabel(editor, {
    x: left,
    y: top + 412,
    width: expressionWidth + 120,
    color: "violet",
    size: "m",
    text: plan.insightLabel || "Now you try it: which part would you call u?",
  });

  updateLabel(editor, expressionId, {
    x: left,
    y: top + 8,
    width: expressionWidth,
    color: "black",
    size: "l",
    text: expressionText,
  });
}

async function playStructuredDiagram(
  editor: Editor,
  plan: VisualPlan,
  shouldCancel: () => boolean
) {
  const viewport = editor.getViewportPageBounds();
  const region = {
    x: viewport.x + viewport.width * 0.12,
    y: viewport.y + viewport.height * 0.18,
    w: Math.min(Math.max(viewport.width * 0.7, 560), 980),
    h: Math.min(Math.max(viewport.height * 0.58, 360), 620),
  };

  createLabel(editor, {
    x: region.x - 8,
    y: region.y - 52,
    width: region.w + 24,
    color: "blue",
    size: "m",
    text: plan.expression || "Visual explanation",
  });

  if (plan.promptSummary?.trim()) {
    createLabel(editor, {
      x: region.x - 8,
      y: region.y - 18,
      width: region.w + 40,
      color: "grey",
      size: "s",
      text: plan.promptSummary,
    });
  }

  const elements = plan.elements ?? [];
  for (const element of elements) {
    if (shouldCancel()) return;

    const color = normalizeColor(element.color);
    const size = normalizeSize(element.size);
    const dash = normalizeDash(element.dash);
    const fill = element.fill?.trim().toLowerCase() === "none" ? "none" : "solid";
    const basePoint = mapPointToRegion({ x: element.x, y: element.y }, region);

    if (element.kind === "text" && element.text?.trim()) {
      createLabel(editor, {
        x: basePoint.x,
        y: basePoint.y,
        width: element.w ? (clampPercent(element.w) / 100) * region.w : 220,
        color,
        size,
        text: element.text,
      });
    }

    if (element.kind === "box") {
      createBox(editor, {
        x: basePoint.x,
        y: basePoint.y,
        w: Math.max(60, ((element.w ?? 18) / 100) * region.w),
        h: Math.max(48, ((element.h ?? 12) / 100) * region.h),
        color,
        fill,
        opacity: fill === "solid" ? 0.28 : 1,
        geo: "rectangle",
      });
      if (element.label?.trim()) {
        createLabel(editor, {
          x: basePoint.x + 10,
          y: basePoint.y + 10,
          width: Math.max(80, (((element.w ?? 18) / 100) * region.w) - 20),
          color,
          size,
          text: element.label,
        });
      }
    }

    if (element.kind === "ellipse") {
      createBox(editor, {
        x: basePoint.x,
        y: basePoint.y,
        w: Math.max(60, ((element.w ?? 18) / 100) * region.w),
        h: Math.max(48, ((element.h ?? 12) / 100) * region.h),
        color,
        fill,
        opacity: fill === "solid" ? 0.28 : 1,
        geo: "ellipse",
      });
      if (element.label?.trim()) {
        createLabel(editor, {
          x: basePoint.x + 10,
          y: basePoint.y + 12,
          width: Math.max(80, (((element.w ?? 18) / 100) * region.w) - 20),
          color,
          size,
          text: element.label,
        });
      }
    }

    if (element.kind === "line" && typeof element.x2 === "number" && typeof element.y2 === "number") {
      const endPoint = mapPointToRegion({ x: element.x2, y: element.y2 }, region);
      createSegment(editor, {
        x: basePoint.x,
        y: basePoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        color,
        size,
        dash,
      });
    }

    if (element.kind === "arrow" && typeof element.x2 === "number" && typeof element.y2 === "number") {
      const endPoint = mapPointToRegion({ x: element.x2, y: element.y2 }, region);
      createArrow(editor, {
        x: basePoint.x,
        y: basePoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        color,
        size,
        dash,
      });
    }

    if (element.kind === "polyline" && element.points && element.points.length >= 2) {
      createPolyline(
        editor,
        element.points.map((point) => mapPointToRegion(point, region)),
        { color, size, dash }
      );
    }

    if (element.kind === "point") {
      createPoint(editor, basePoint.x - 9, basePoint.y - 9, color);
      if (element.label?.trim()) {
        createLabel(editor, {
          x: basePoint.x + 12,
          y: basePoint.y - 16,
          width: 140,
          color,
          size: "s",
          text: element.label,
        });
      }
    }

    await sleep(140);
  }

  if (!shouldCancel() && plan.insightLabel?.trim()) {
    createLabel(editor, {
      x: region.x,
      y: region.y + region.h + 18,
      width: region.w + 32,
      color: "green",
      size: "m",
      text: plan.insightLabel,
    });
  }
}

export async function playVisualPlan(
  editor: Editor,
  plan: VisualPlan,
  shouldCancel: () => boolean
) {
  if (plan.kind === "parabola_tangent_demo") {
    await playParabolaTangentDemo(editor, plan, shouldCancel);
    return;
  }

  if (plan.kind === "concept_steps") {
    await playConceptStepsDemo(editor, plan, shouldCancel);
    return;
  }

  if (plan.kind === "integration_by_parts_demo") {
    await playIntegrationByPartsDemo(editor, plan, shouldCancel);
    return;
  }

  if (plan.kind === "structured_diagram") {
    await playStructuredDiagram(editor, plan, shouldCancel);
  }
}
