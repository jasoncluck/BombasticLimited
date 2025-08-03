<script lang="ts">
  import { CalendarIcon } from '@lucide/svelte';
  import { Calendar } from '$lib/components/ui/calendar/index.js';
  import * as Popover from '$lib/components/ui/popover/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import {
    DateFormatter,
    today,
    getLocalTimeZone,
    type DateValue,
  } from '@internationalized/date';

  let {
    label = 'Date',
    value = $bindable(),
    isOpen,
    items = [],
    dateFormatter,
    onChange,
    onClear,
  }: {
    label: string;
    value: DateValue | undefined;
    isOpen: boolean;
    items: { value: number; label: string }[];
    dateFormatter: DateFormatter;
    onChange: (value: DateValue | undefined) => void;
    onClear: () => void;
  } = $props();

  let valueString = $derived(
    value ? dateFormatter.format(value.toDate(getLocalTimeZone())) : ''
  );

  function handleDatePresetChange(v: string) {
    if (!v) return;
    onChange(today(getLocalTimeZone()).add({ days: Number.parseInt(v) }));
    isOpen = false;
  }

  function handleCalendarChange(newValue: DateValue | undefined) {
    onChange(newValue);
    isOpen = false;
  }
</script>

<Popover.Root bind:open={isOpen}>
  <Popover.Trigger
    class={cn(
      buttonVariants({
        variant: 'outline',
        class: 'max-w-[240px] justify-start text-left text-xs font-normal',
      }),
      !value && 'text-muted-foreground'
    )}
  >
    <CalendarIcon />
    {value ? dateFormatter.format(value.toDate(getLocalTimeZone())) : label}
  </Popover.Trigger>
  <Popover.Content class="flex w-auto flex-col space-y-2 p-2">
    {#if value}
      <Button
        variant="secondary"
        onclick={() => {
          onClear();
          isOpen = false;
        }}>Clear</Button
      >
    {/if}
    <Select.Root
      type="single"
      onValueChange={handleDatePresetChange}
      bind:value={valueString}
    >
      <Select.Trigger class="w-full">Date Presets</Select.Trigger>
      <Select.Content>
        {#each items as item (item.value)}
          <Select.Item
            value={`${item.value}`}
            onclick={() => handleDatePresetChange(`${item.value}`)}
          >
            {item.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <div class="rounded-md border">
      <Calendar
        type="single"
        bind:value
        onValueChange={(newValue) => handleCalendarChange(newValue)}
      />
    </div>
  </Popover.Content>
</Popover.Root>
