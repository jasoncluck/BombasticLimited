import { goto, preloadData } from '$app/navigation';

export const PAGINATION_QUERY_KEY = 'page';

export function updatePaginationQueryParams({
  url,
  pageNum,
  invalidate,
}: {
  url: URL;
  pageNum: number;
  invalidate: string[];
}) {
  const newUrl = url;
  const searchParams = newUrl.searchParams;

  searchParams.set(PAGINATION_QUERY_KEY, pageNum.toString());

  goto(newUrl.toString(), { invalidate });
}

export function getPaginationQueryParams({
  searchParams,
}: {
  searchParams: URLSearchParams;
}) {
  let pageNum: number | undefined;

  try {
    const pageNumQueryString = searchParams.get(PAGINATION_QUERY_KEY);
    if (pageNumQueryString) {
      const parsed = parseInt(pageNumQueryString);
      if (!isNaN(parsed)) {
        pageNum = parsed;
      }
    }
  } catch {
    return 1;
  }

  return pageNum ?? 1;
}

export function getNumberOfPages({
  count = 0,
  perPage,
}: {
  count?: number;
  perPage: number;
}) {
  return Math.ceil(count / perPage);
}

export function generatePaginationUrl({
  url,
  pageNum,
}: {
  url: URL;
  pageNum: number;
}): string {
  const newUrl = new URL(url);
  const searchParams = newUrl.searchParams;

  searchParams.set(PAGINATION_QUERY_KEY, pageNum.toString());

  return newUrl.toString();
}

export async function preloadPaginationPage({
  url,
  pageNum,
}: {
  url: URL;
  pageNum: number;
}): Promise<void> {
  try {
    const paginationUrl = generatePaginationUrl({
      url,
      pageNum,
    });
    await preloadData(paginationUrl);
  } catch (error) {
    // Silently fail if preloading doesn't work
    console.debug('Pagination preload failed:', error);
  }
}
