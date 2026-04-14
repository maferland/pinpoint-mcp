export type AnnotationIntent = "fix" | "change" | "question" | "approve";
export type AnnotationSeverity = "blocking" | "important" | "suggestion";
export type AnnotationStatus = "pending" | "resolved" | "dismissed";

export interface ImageInfo {
  path: string;
  width: number;
  height: number;
}

export interface PinpointAnnotation {
  id: string;
  number: number;
  imageIndex: number;
  pin: { x: number; y: number };
  box?: { x: number; y: number; width: number; height: number };
  comment: string;
  intent: AnnotationIntent;
  severity: AnnotationSeverity;
  status: AnnotationStatus;
}

export interface PinpointReview {
  version: "1.0";
  id: string;
  images: ImageInfo[];
  context?: string;
  createdAt: string;
  annotations: PinpointAnnotation[];
}
