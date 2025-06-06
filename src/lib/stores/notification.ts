import { writable } from "svelte/store";

export const notificationStore = writable<{
  message: string;
  type?: "success" | "error" | "warning";
} | null>(null);

export function showNotification(
  message: string,
  type?: "success" | "error" | "warning",
) {
  notificationStore.set({ message, type });
}

export function clearNotification() {
  notificationStore.set(null);
}
