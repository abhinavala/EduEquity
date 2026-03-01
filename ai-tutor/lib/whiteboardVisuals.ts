"use client";

import { createShapeId, Editor, getIndicesBetween, TLShapeId, toRichText } from "tldraw";
import { VisualPlan } from "@/lib/types";

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

interface SegmentConfig {
  x: number;
  y: number;
  x2: number;
  y2: number;
  color?: StrokeColor;
  size?: StrokeSize;
  dash?: "draw" | "solid";
}

interface LabelConfig {
  x: number;
  y: number;
  text: string;
  width?: number;
  color?: StrokeColor;
  size?: StrokeSize;
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

function createPoint(editor: Editor, x: number, y: number) {
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
      color: "red",
      fill: "solid",
      dash: "solid",
      size: "m",
    },
  });
  return id;
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
  }
}
