import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  // Get the parent layout data
  const parentData = await parent();

  // Return the parent data unchanged - this ensures the test page gets all the
  // same data structure as other pages
  return {
    ...parentData,
  };
};
