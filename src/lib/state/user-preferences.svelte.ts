import type {
  ContentDescription,
  ContentDisplay,
} from '$lib/components/content/content';

interface UserPreferences {
  contentDisplay: ContentDisplay;
  contentDescription: ContentDescription;
}

export const userPreferences = $state<UserPreferences>({
  contentDisplay: 'TILES',
  contentDescription: 'BRIEF',
});
