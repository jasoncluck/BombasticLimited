<script lang="ts">
  import * as Form from "$lib/components/ui/form";
  import Input from "$lib/components/ui/input/input.svelte";
  import { superForm, type SuperValidated } from "sveltekit-superforms";
  import { zodClient, type Infer } from "sveltekit-superforms/adapters";
  import { signupSchema, type SignupSchema } from "./schema";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Loader } from "@lucide/svelte";

  let { data }: { data: { form: SuperValidated<Infer<SignupSchema>> } } =
    $props();

  console.log(data.form);

  const accountForm = superForm(data.form, {
    validators: zodClient(signupSchema),
  });

  let isSubmitting = $state(false);

  const { form: formData, enhance } = $derived(accountForm);
</script>

<div class="flex flex-row justify-center">
  <form use:enhance method="POST" class="mt-24 grid grid-cols-2">
    <div class="flex flex-col relative grow gap-2">
      <Form.Field form={accountForm} name="email">
        <div
          class="md:grid md:grid-cols-4 items-center flex flex-wrap gap-2 md:gap-4"
        >
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label for="name" class="text-right">Email</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$formData.email}
              />
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
      <Form.Field form={accountForm} name="username">
        <div
          class="md:grid md:grid-cols-4 items-center flex flex-wrap gap-2 md:gap-4"
        >
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label for="name" class="text-right">Username</Form.Label>
              <Input
                {...props}
                class="col-span-3"
                bind:value={$formData.username}
              />
            {/snippet}
          </Form.Control>
        </div>
        <Form.FieldErrors class="mb-2" />
      </Form.Field>
      <Button type="submit">
        {#if isSubmitting}
          <Loader class="animate-spin" />
        {:else}
          Save Changes
        {/if}
      </Button>
    </div>
  </form>
</div>
