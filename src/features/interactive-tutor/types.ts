// Annotation + Whiteboard protocol types for the Interactive AI Tutor.
// Coordinates are normalized (0..1) relative to the page/canvas dimensions.

export type AnnotationShape =
  | {
      type: "circle";
      x: number; // 0..1
      y: number; // 0..1
      r: number; // 0..1 (relative to min(width,height))
      color?: string;
      at?: number; // ms offset when to appear
      duration?: number; // ms, default 4000
      label?: string;
    }
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      color?: string;
      at?: number;
      duration?: number;
      label?: string;
    }
  | {
      type: "arrow";
      from: [number, number];
      to: [number, number];
      color?: string;
      at?: number;
      duration?: number;
      label?: string;
    }
  | {
      type: "highlight";
      x: number;
      y: number;
      w: number;
      h: number;
      color?: string;
      at?: number;
      duration?: number;
    }
  | {
      type: "underline";
      from: [number, number];
      to: [number, number];
      color?: string;
      at?: number;
      duration?: number;
    };

export type WhiteboardStep =
  | { type: "title"; text: string; at?: number }
  | { type: "write"; text: string; at?: number; color?: string }
  | { type: "bullet"; text: string; at?: number }
  | { type: "equation"; tex: string; at?: number }
  | { type: "highlight"; text: string; at?: number };

export type TutorMode = "page" | "whiteboard";

export type StructuredTutorResponse = {
  narration: string;
  annotations?: AnnotationShape[];
  mode?: TutorMode;
  whiteboard?: { title?: string; steps: WhiteboardStep[] };
};
