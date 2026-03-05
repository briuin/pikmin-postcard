import { getAuthenticatedUserId } from '@/lib/api-auth';
import {
  requireApprovedCreator,
  requireAuthenticatedUserId,
  withGuardedValue
} from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  createPostcardLocal,
  listMinePostcardsLocal,
  listPublicPostcardsLocal,
  listSavedPostcardsLocal
} from '@/lib/postcards/local-postcard-route-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withOptionalExternalApiProxy({
    request,
    path: `/postcards${url.search}`,
    runLocal: async () => {
      const mineOnly = url.searchParams.get('mine') === '1';
      const savedOnly = url.searchParams.get('saved') === '1';
      const viewerUserId = await getAuthenticatedUserId();

      if (mineOnly) {
        return withGuardedValue(
          requireAuthenticatedUserId({ createIfMissing: true }),
          async (userId) => listMinePostcardsLocal({ request, userId, viewerUserId })
        );
      }

      if (savedOnly) {
        return withGuardedValue(
          requireAuthenticatedUserId({ createIfMissing: true }),
          async (userId) => listSavedPostcardsLocal({ request, userId, viewerUserId })
        );
      }

      return listPublicPostcardsLocal({ url, viewerUserId });
    }
  });
}

export async function POST(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/postcards',
    runLocal: async () =>
      withGuardedValue(requireApprovedCreator(), async (actor) =>
        createPostcardLocal({ request, actorId: actor.id })
      )
  });
}
