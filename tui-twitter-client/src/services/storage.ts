import { Effect, Context, Layer } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeFileSystem, NodeContext } from '@effect/platform-node';
import * as Path from 'path';
import { homedir } from 'os';
import type { Post, StorageConfig } from '../types/post.js';

// Service interface
export interface StorageService {
  createPost: (text: string, tags?: string[]) => Effect.Effect<Post, Error>;
  getTimeline: () => Effect.Effect<Post[], Error>;
  getMyPosts: () => Effect.Effect<Post[], Error>;
  toggleFavorite: (id: string) => Effect.Effect<Post, Error>;
}

// Service tag for dependency injection
export class StorageServiceTag extends Context.Tag('StorageService')<
  StorageServiceTag,
  StorageService
>() {}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const getDataPath = (config: StorageConfig, filename: string): string => {
  return Path.join(config.dataDir, filename);
};

// Live implementation
export const StorageServiceLive = (config: StorageConfig) =>
  Layer.effect(
    StorageServiceTag,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      // Ensure data directory exists
      yield* Effect.tryPromise({
        try: async () => {
          const exists = await fs.exists(config.dataDir);
          if (!exists) {
            await fs.makeDirectory(config.dataDir, { recursive: true });
          }
        },
        catch: (error) => new Error(`Failed to create data directory: ${error}`)
      });

      const readPostsFile = (filename: string): Effect.Effect<Post[], Error> =>
        Effect.gen(function* () {
          const filePath = getDataPath(config, filename);
          const exists = yield* Effect.tryPromise({
            try: () => fs.exists(filePath),
            catch: () => new Error('Failed to check file existence')
          });

          if (!exists) {
            return [];
          }

          const content = yield* Effect.tryPromise({
            try: async () => {
              const data = await fs.readFileString(filePath);
              return data;
            },
            catch: (error) => new Error(`Failed to read ${filename}: ${error}`)
          });

          return yield* Effect.try({
            try: () => {
              const parsed = JSON.parse(content);
              return parsed.map((p: any) => ({
                ...p,
                createdAt: new Date(p.createdAt)
              }));
            },
            catch: () => new Error('Failed to parse JSON')
          });
        });

      const writePostsFile = (filename: string, posts: Post[]): Effect.Effect<void, Error> =>
        Effect.tryPromise({
          try: async () => {
            const filePath = getDataPath(config, filename);
            const content = JSON.stringify(posts, null, 2);
            await fs.writeFileString(filePath, content);
          },
          catch: (error) => new Error(`Failed to write ${filename}: ${error}`)
        });

      return {
        createPost: (text: string, tags?: string[]) =>
          Effect.gen(function* () {
            const newPost: Post = {
              id: generateId(),
              text,
              createdAt: new Date(),
              tags,
              favorite: false
            };

            // Add to my posts
            const myPosts = yield* readPostsFile('my-posts.json');
            const updatedPosts = [newPost, ...myPosts];
            yield* writePostsFile('my-posts.json', updatedPosts);

            // Add to timeline
            const timeline = yield* readPostsFile('timeline.json');
            const updatedTimeline = [newPost, ...timeline];
            yield* writePostsFile('timeline.json', updatedTimeline);

            return newPost;
          }),

        getTimeline: () =>
          Effect.gen(function* () {
            const posts = yield* readPostsFile('timeline.json');
            return posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }),

        getMyPosts: () =>
          Effect.gen(function* () {
            const posts = yield* readPostsFile('my-posts.json');
            return posts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }),

        toggleFavorite: (id: string) =>
          Effect.gen(function* () {
            const myPosts = yield* readPostsFile('my-posts.json');
            const post = myPosts.find(p => p.id === id);

            if (!post) {
              return yield* Effect.fail(new Error('Post not found'));
            }

            post.favorite = !post.favorite;
            yield* writePostsFile('my-posts.json', myPosts);

            // Update timeline too
            const timeline = yield* readPostsFile('timeline.json');
            const timelinePost = timeline.find(p => p.id === id);
            if (timelinePost) {
              timelinePost.favorite = post.favorite;
              yield* writePostsFile('timeline.json', timeline);
            }

            return post;
          })
      };
    })
  ).pipe(Layer.provide(NodeContext.layer));

// Default configuration
export const defaultConfig: StorageConfig = {
  dataDir: Path.join(homedir(), '.tui-posts')
};
