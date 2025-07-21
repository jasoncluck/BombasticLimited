import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
	notificationStore,
	showNotification,
	clearNotification,
} from "./notification";

// Mock svelte/store
vi.mock("svelte/store", () => ({
	writable: vi.fn((initialValue) => {
		let value = initialValue;
		const subscribers = new Set<(value: any) => void>();
		
		return {
			set: vi.fn((newValue) => {
				value = newValue;
				subscribers.forEach(callback => callback(newValue));
			}),
			subscribe: vi.fn((callback) => {
				subscribers.add(callback);
				callback(value);
				return () => subscribers.delete(callback);
			}),
			update: vi.fn((updater) => {
				value = updater(value);
				subscribers.forEach(callback => callback(value));
			}),
			get current() { return value; }
		};
	}),
	get: vi.fn((store) => store.current),
}));

describe("notification store", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Don't reset store here to avoid extra calls, let each test control it
	});

	describe("notificationStore", () => {
		it("should initialize with null value", () => {
			expect(get(notificationStore)).toBeNull();
		});

		it("should be a writable store", () => {
			expect(notificationStore).toHaveProperty("set");
			expect(notificationStore).toHaveProperty("subscribe");
		});
	});

	describe("showNotification", () => {
		it("should set notification with message only", () => {
			const message = "Test notification";
			showNotification(message);

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Test notification",
				type: undefined,
			});
		});

		it("should set notification with message and success type", () => {
			const message = "Success message";
			showNotification(message, "success");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Success message",
				type: "success",
			});
		});

		it("should set notification with message and error type", () => {
			const message = "Error message";
			showNotification(message, "error");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Error message",
				type: "error",
			});
		});

		it("should set notification with message and warning type", () => {
			const message = "Warning message";
			showNotification(message, "warning");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Warning message",
				type: "warning",
			});
		});

		it("should handle empty message", () => {
			showNotification("");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "",
				type: undefined,
			});
		});

		it("should handle very long messages", () => {
			const longMessage = "A".repeat(1000);
			showNotification(longMessage, "error");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: longMessage,
				type: "error",
			});
		});
	});

	describe("clearNotification", () => {
		it("should set store to null", () => {
			clearNotification();

			expect(notificationStore.set).toHaveBeenCalledWith(null);
		});

		it("should clear notification after showing one", () => {
			// First show a notification
			showNotification("Test message", "success");
			
			// Then clear it
			clearNotification();

			expect(notificationStore.set).toHaveBeenLastCalledWith(null);
		});

		it("should be safe to call multiple times", () => {
			clearNotification();
			clearNotification();
			clearNotification();

			// Should have been called 3 times with null
			expect(notificationStore.set).toHaveBeenCalledTimes(3);
			expect(notificationStore.set).toHaveBeenCalledWith(null);
		});
	});

	describe("notification workflow", () => {
		it("should support showing and clearing notifications in sequence", () => {
			// Show first notification
			showNotification("First message", "success");
			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "First message",
				type: "success",
			});

			// Show second notification (replaces first)
			showNotification("Second message", "error");
			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Second message",
				type: "error",
			});

			// Clear notification
			clearNotification();
			expect(notificationStore.set).toHaveBeenCalledWith(null);

			// Show third notification
			showNotification("Third message");
			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Third message",
				type: undefined,
			});
		});

		it("should handle rapid notification updates", () => {
			// Simulate rapid notifications like might happen in real usage
			showNotification("Loading...", "warning");
			showNotification("Processing...", "warning");
			showNotification("Complete!", "success");
			clearNotification();

			expect(notificationStore.set).toHaveBeenCalledTimes(4);
		});
	});

	describe("type safety", () => {
		it("should accept all valid notification types", () => {
			// Test that all these calls are valid TypeScript
			showNotification("Message");
			showNotification("Message", "success");
			showNotification("Message", "error");
			showNotification("Message", "warning");

			expect(notificationStore.set).toHaveBeenCalledTimes(4);
		});

		it("should handle undefined type gracefully", () => {
			showNotification("Message", undefined);

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: "Message",
				type: undefined,
			});
		});
	});

	describe("edge cases", () => {
		it("should handle special characters in messages", () => {
			const specialMessage = "Message with émojis 🎉 and special chars: <>&\"'";
			showNotification(specialMessage, "success");

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: specialMessage,
				type: "success",
			});
		});

		it("should handle newlines and whitespace in messages", () => {
			const messageWithNewlines = "Line 1\nLine 2\t\tTabbed";
			showNotification(messageWithNewlines);

			expect(notificationStore.set).toHaveBeenCalledWith({
				message: messageWithNewlines,
				type: undefined,
			});
		});

		it("should handle null-like strings", () => {
			showNotification("null");
			showNotification("undefined");
			showNotification("false");

			expect(notificationStore.set).toHaveBeenCalledTimes(3);
		});
	});
});