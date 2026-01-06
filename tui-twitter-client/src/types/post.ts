export interface Post {
  id: string;
  text: string;
  createdAt: Date;
  tags?: string[];
  favorite?: boolean;
}

export interface PostCollection {
  timeline: Post[];
  myPosts: Post[];
}

export type WindowType = 'compose' | 'timeline' | 'posts';

export interface StorageConfig {
  dataDir: string;
}
