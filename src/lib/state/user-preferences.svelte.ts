import type {
  ContentDescription,
  ContentDisplay,
} from '$lib/components/content/content';

interface UserPreferences {
  contentDisplay: ContentDisplay;
  contentDescription: ContentDescription;
}

export let userPreferences = $state<UserPreferences>({
  contentDisplay: 'TILES',
  contentDescription: 'BRIEF',
});
