<script lang="ts">
  import type { SuperValidated } from "sveltekit-superforms";
  import type { Infer } from "sveltekit-superforms/adapters";
  import type { UsernameSchema } from "../schema";
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import UsernameForm from "./username-form.svelte";

  let {
    data,
  }: {
    data: {
      usernameForm: SuperValidated<Infer<UsernameSchema>>;
      supabase: SupabaseClient<Database>;
    };
  } = $props();
</script>

<div class="flex flex-row justify-center">
  <div class="mt-24 w-[400px]">
    <UsernameForm data={{ form: data.usernameForm, ...data }} />
  </div>
</div>
