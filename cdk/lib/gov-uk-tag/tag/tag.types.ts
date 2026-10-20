import { Tag } from './tag.const';

export type Tag = (typeof Tag)[keyof typeof Tag];
