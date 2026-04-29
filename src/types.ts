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
}

export interface PinpointReview {
  version: "1.0";
  id: string;
  images: ImageInfo[];
  context?: string;
  createdAt: string;
  annotations: PinpointAnnotation[];
}
