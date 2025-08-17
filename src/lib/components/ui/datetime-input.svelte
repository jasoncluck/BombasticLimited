<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let {
    id,
    name,
    label,
    value = $bindable(),
    required = false,
    disabled = false,
    placeholder = '',
    description = '',
    ...restProps
  }: {
    id: string;
    name: string;
    label: string;
    value?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    description?: string;
    [key: string]: any;
  } = $props();

  let localValue = $derived('');

  // Convert between ISO string and local datetime-local format
  function formatDateTimeLocal(dateTimeString: string): string {
    if (!dateTimeString) return '';

    try {
      // If the string already looks like a local datetime, use it as-is
      if (dateTimeString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        return dateTimeString;
      }

      // Otherwise parse as ISO and convert to local
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return '';

      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting datetime:', error);
      return '';
    }
  }

  function convertToISO(localDateTime: string): string {
    if (!localDateTime) return '';

    try {
      // Convert local datetime to ISO string
      const date = new Date(localDateTime);
      if (isNaN(date.getTime())) return '';

      return date.toISOString();
    } catch (error) {
      console.error('Error converting to ISO:', error);
      return '';
    }
  }

  // Initialize local value from props
  $effect(() => {
    localValue = formatDateTimeLocal(value || '');
  });

  // Update parent value when local value changes
  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    localValue = input.value;
    value = localValue ? convertToISO(localValue) : '';
  }
</script>

<div class="space-y-2">
  <Label for={id}>{label}</Label>
  <Input
    {id}
    {name}
    type="datetime-local"
    value={localValue}
    {required}
    {disabled}
    {placeholder}
    oninput={handleInput}
    {...restProps}
  />
  {#if description}
    <p class="text-muted-foreground text-xs">{description}</p>
  {/if}
</div>
