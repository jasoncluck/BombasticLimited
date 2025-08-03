import { playlistOptimisticUpdates } from '$lib/state/optimistic-updates.svelte.js';

export function useOptimisticForm<T>(
  entityId: string,
  originalData: T,
  getOptimisticData: (formData: unknown) => T
) {
  const updateId = `${entityId}`;

  function applyOptimistic(formData: unknown) {
    const optimisticData = getOptimisticData(formData);

    playlistOptimisticUpdates.apply(updateId, optimisticData, () => {
      // Revert function would need to be handled by the component
      console.log('Reverting optimistic update');
    });
  }

  function handleResult(
    result: any,
    originalEntity: T,
    updateEntity: (data: T) => void
  ) {
    if (result.type === 'success' && result.data?.success) {
      playlistOptimisticUpdates.commit(updateId);

      if (result.data.updatedPlaylist) {
        updateEntity(result.data.updatedPlaylist);
      }
    } else {
      playlistOptimisticUpdates.rollback(updateId);
    }
  }

  const optimisticData = $derived(
    playlistOptimisticUpdates.get(updateId) || originalData
  );

  const isPending = $derived(playlistOptimisticUpdates.isPending(updateId));

  return {
    optimisticData,
    isPending,
    applyOptimistic,
    handleResult,
  };
}
