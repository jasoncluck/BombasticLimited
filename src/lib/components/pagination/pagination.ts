import { goto } from "$app/navigation";

export const PAGINATION_QUERY_KEY = "page";

export function updatePaginationQueryParams({
  url,
  pageNum,
  invalidate
}: {
  url: URL;
  pageNum: number;
  invalidate: string[]
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
      pageNum = parseInt(pageNumQueryString);
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
  count?: number
  perPage: number;
}) {
  return Math.ceil(count / perPage);
}
