export interface Tweet {
  id: string;
  text: string;
  author: {
    id: string;
    username: string;
    name: string;
  };
  createdAt: Date;
  metrics?: {
    retweets: number;
    likes: number;
    replies: number;
  };
}

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export type WindowType = 'compose' | 'timeline' | 'tweets';
