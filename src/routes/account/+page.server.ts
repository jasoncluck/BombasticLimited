import { zod } from "sveltekit-superforms/adapters";
import type { PageServerLoad } from "./$types";
import { accountSchema } from "./schema";
import { superValidate } from "sveltekit-superforms";

export const load: PageServerLoad = async () => {
  return {
    // TODO: Update initial form values in line below

    baz: "tests",
    form: await superValidate({ email: 'test' }, zod(accountSchema)),
  }
};
