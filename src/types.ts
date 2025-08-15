export type FSItem = {
  id: number;
  name?: string;
  duration?: number;
  license?: string;
  username?: string;
  tags?: string[];
  previews?: {
    "preview-lq-mp3"?: string;
    "preview-hq-mp3"?: string;
    [key: string]: string | undefined;
  };
};

export type Layer = {
  id: string; // e.g., `${tag}-${id}`
  tag: string;
  item?: FSItem;
  gain: number;
  link?: string; // freesound page link
};

export type Scene = {
  prompt: string;
  tags: string[];
  layers: Layer[];
};
