---
name: web-app-data-patterns
description: Client-side caching, optimistic updates, real-time sync, pagination strategies, form state management, and file upload patterns
topics: [web-app, data-fetching, caching, react-query, swr, pagination, forms, file-upload]
---

Data management in web applications spans from simple fetch-and-display to complex real-time collaborative state. The wrong patterns here produce stale UIs, conflicting updates, degraded performance under load, and frustrated users. The right patterns make applications feel instantaneous even over slow networks — by understanding the difference between server state, client state, and ephemeral UI state, and applying the appropriate tool to each.

## Summary

### Server State vs Client State

The most important conceptual distinction in modern web data management:

- **Server state** — data owned by the server, shared across clients, and potentially stale as soon as it's fetched: user profiles, product listings, feed items. Use a data-fetching library (React Query, SWR) to manage this.
- **Client state** — data owned by the current user's session, not persisted to the server: currently selected tab, sidebar open/closed, in-progress form data. Use React local state or Zustand/Jotai/Redux.

Mixing these causes anti-patterns: putting server data in Redux, or making API calls from useEffect without caching. Libraries like React Query exist precisely because server state needs cache management, background refetching, deduplication, and stale-while-revalidate semantics that generic state managers don't provide.

### SWR vs React Query

Both implement stale-while-revalidate caching for server state:

| Concern | SWR | React Query (TanStack Query) |
|---|---|---|
| Bundle size | ~6 KB | ~13 KB |
| Mutations | Manual invalidation | Built-in `useMutation` + auto-invalidation |
| Infinite scroll | `useSWRInfinite` | `useInfiniteQuery` |
| Optimistic updates | Manual | First-class via `onMutate` + rollback |
| DevTools | None built-in | Excellent DevTools panel |
| Best for | Read-heavy apps, minimal mutations | Apps with complex mutation flows |

**Rule:** Use React Query for most production applications. Use SWR for read-heavy dashboards where its simplicity is a net benefit.

### Optimistic Updates

Update the UI before the server confirms the mutation. If the server rejects, roll back.

Optimistic updates are appropriate when: the mutation has a very high success rate, the latency is noticeable, and the rollback experience is not confusing. They are not appropriate when: the server-side result is unpredictable (e.g., a bid on an auction where you may lose).

### Pagination Strategies

**Cursor-based pagination** (preferred):
- Each page returns a `nextCursor` opaque token; the next request passes `?cursor=<token>`
- Stable across concurrent inserts/deletes — no items skipped or duplicated
- Required for infinite scroll (offset pagination breaks on live data)
- Cannot jump to arbitrary page numbers

**Offset-based pagination**:
- `?page=3&limit=20` or `?offset=40&limit=20`
- Supports "jump to page N" UI
- Items shift when rows are inserted/deleted — users see duplicates or skipped items on live data
- Appropriate for admin tables with infrequent writes and explicit page navigation

### Real-Time Data Sync

Three patterns in increasing complexity:
1. **Polling** — simplest, least efficient: re-fetch every N seconds. Acceptable for dashboards that update every few minutes.
2. **Server-Sent Events (SSE)** — server pushes updates to client over a single long-lived HTTP connection. One-directional. Excellent for notifications, activity feeds, live counters. No WebSocket negotiation overhead.
3. **WebSocket** — bidirectional full-duplex. Required for chat, collaborative editing, live games. Higher complexity: connection management, reconnection, presence.

## Deep Guidance

### React Query Patterns

```typescript
// 1. Standard query with stale time
const { data: posts, isLoading, error } = useQuery({
  queryKey: ['posts', { authorId, page }],
  queryFn: () => fetchPosts({ authorId, page }),
  staleTime: 5 * 60 * 1000,  // Data considered fresh for 5 minutes
  gcTime: 10 * 60 * 1000,    // Keep in cache for 10 minutes after unmount
});

// 2. Optimistic mutation with rollback
const queryClient = useQueryClient();

const likeMutation = useMutation({
  mutationFn: (postId: string) => api.likePost(postId),

  onMutate: async (postId) => {
    // Cancel any in-flight refetches that would overwrite optimistic update
    await queryClient.cancelQueries({ queryKey: ['posts'] });

    // Snapshot the previous value
    const previousPosts = queryClient.getQueryData(['posts']);

    // Optimistically update
    queryClient.setQueryData(['posts'], (old: Post[]) =>
      old.map(p => p.id === postId ? { ...p, likeCount: p.likeCount + 1, likedByMe: true } : p)
    );

    // Return context for rollback
    return { previousPosts };
  },

  onError: (error, postId, context) => {
    // Roll back to snapshot on failure
    queryClient.setQueryData(['posts'], context?.previousPosts);
  },

  onSettled: () => {
    // Always refetch to sync with server truth
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  },
});

// 3. Infinite scroll
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => fetchFeed({ cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined as string | undefined,
});
```

### File Upload Pattern

Uploads require a different flow from standard JSON mutations: multipart form data, progress tracking, and (for large files) direct-to-storage upload via presigned URLs.

```typescript
// PATTERN: Presigned URL upload (bypasses app server, goes direct to S3/GCS)
async function uploadFile(file: File, onProgress: (pct: number) => void) {
  // Step 1: Get presigned URL from app server
  const { uploadUrl, fileKey } = await api.getUploadUrl({
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });

  // Step 2: Upload directly to storage (no app server in the critical path)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });

  // Step 3: Notify app server that upload is complete
  return api.confirmUpload({ fileKey });
}
```

Presigned URL uploads: never proxy large files through your app server. A 100 MB upload through an app server occupies a Node.js worker for the entire transfer duration.

### Form State Management

For most forms: `react-hook-form` + Zod schema validation. This pattern avoids controlled component re-renders (critical for large forms), provides schema-driven validation, and integrates cleanly with TypeScript.

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const profileSchema = z.object({
  displayName: z.string().min(2).max(50),
  email: z.string().email(),
  bio: z.string().max(500).optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

function ProfileEditor() {
  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName, email: user.email },
  });

  const onSubmit = async (data: ProfileForm) => {
    await updateProfile(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('displayName')} />
      {errors.displayName && <span>{errors.displayName.message}</span>}
      <button type="submit" disabled={!isDirty || isSubmitting}>Save</button>
    </form>
  );
}
```

Reserve heavier solutions (Formik, final-form) only for highly dynamic form generation requirements. For most product forms, react-hook-form is sufficient and faster.

### Cursor Pagination Implementation

```typescript
// Server-side cursor pagination (PostgreSQL + Prisma)
async function getPaginatedPosts(cursor?: string, limit = 20) {
  const posts = await prisma.post.findMany({
    take: limit + 1,  // Fetch one extra to determine if there's a next page
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,  // Skip the cursor item itself
    }),
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = posts.length > limit;
  const items = hasNextPage ? posts.slice(0, -1) : posts;

  return {
    items,
    nextCursor: hasNextPage ? items[items.length - 1].id : null,
  };
}
```

Always fetch `limit + 1` to check for next page existence without an extra COUNT query.
