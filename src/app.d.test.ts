import { describe, it, expect } from "vitest";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";

describe("app.d.ts type definitions", () => {
  describe("App.Locals interface", () => {
    it("defines correct supabase client type", () => {
      // This test validates the type structure at compile time
      const mockLocals: App.Locals = {
        supabase: {} as SupabaseClient<Database>,
        safeGetSession: async () => ({ session: null, user: null }),
        session: null,
        user: null,
      };

      expect(mockLocals).toBeDefined();
      expect(typeof mockLocals.safeGetSession).toBe("function");
    });

    it("safeGetSession returns correct type structure", async () => {
      const mockLocals: App.Locals = {
        supabase: {} as SupabaseClient<Database>,
        safeGetSession: async () => ({ 
          session: {} as Session, 
          user: {} as User 
        }),
        session: {} as Session,
        user: {} as User,
      };

      const result = await mockLocals.safeGetSession();
      
      expect(result).toHaveProperty("session");
      expect(result).toHaveProperty("user");
    });

    it("allows null values for session and user", () => {
      const mockLocals: App.Locals = {
        supabase: {} as SupabaseClient<Database>,
        safeGetSession: async () => ({ session: null, user: null }),
        session: null,
        user: null,
      };

      expect(mockLocals.session).toBeNull();
      expect(mockLocals.user).toBeNull();
    });
  });

  describe("App.PageData interface", () => {
    it("defines correct session type", () => {
      const mockPageData: App.PageData = {
        session: null,
      };

      expect(mockPageData).toBeDefined();
      expect(mockPageData.session).toBeNull();
    });

    it("allows session to be a Session object", () => {
      const mockPageData: App.PageData = {
        session: {} as Session,
      };

      expect(mockPageData.session).toBeDefined();
    });

    it("defines correct flash message structure", () => {
      const mockPageDataWithFlash: App.PageData = {
        session: null,
        flash: {
          type: "success",
          message: "Operation completed successfully",
        },
      };

      expect(mockPageDataWithFlash.flash).toBeDefined();
      expect(mockPageDataWithFlash.flash!.type).toBe("success");
      expect(mockPageDataWithFlash.flash!.message).toBe("Operation completed successfully");
    });

    it("supports all flash message types", () => {
      const successFlash: App.PageData["flash"] = {
        type: "success",
        message: "Success message",
      };

      const errorFlash: App.PageData["flash"] = {
        type: "error",
        message: "Error message",
      };

      expect(successFlash?.type).toBe("success");
      expect(errorFlash?.type).toBe("error");
    });

    it("supports all flash message field types", () => {
      const flashWithField: App.PageData["flash"] = {
        type: "error",
        message: "Validation error",
        field: "email",
      };

      expect(flashWithField?.field).toBe("email");

      // Test other field types
      const usernameField: typeof flashWithField = {
        type: "error",
        message: "Username error",
        field: "username",
      };

      const passwordField: typeof flashWithField = {
        type: "error",
        message: "Password error",
        field: "password",
      };

      const deleteField: typeof flashWithField = {
        type: "error",
        message: "Delete error",
        field: "delete",
      };

      expect(usernameField?.field).toBe("username");
      expect(passwordField?.field).toBe("password");
      expect(deleteField?.field).toBe("delete");
    });

    it("flash field is optional", () => {
      const flashWithoutField: App.PageData["flash"] = {
        type: "success",
        message: "General success message",
        // field is optional
      };

      expect(flashWithoutField?.field).toBeUndefined();
    });
  });

  describe("Type compatibility with Supabase types", () => {
    it("Locals.supabase is compatible with SupabaseClient<Database>", () => {
      // This test validates type compatibility at compile time
      const supabaseClient: SupabaseClient<Database> = {} as SupabaseClient<Database>;
      
      const locals: App.Locals = {
        supabase: supabaseClient,
        safeGetSession: async () => ({ session: null, user: null }),
        session: null,
        user: null,
      };

      expect(locals.supabase).toBe(supabaseClient);
    });

    it("PageData.session is compatible with Supabase Session", () => {
      // This test validates type compatibility at compile time
      const session: Session = {} as Session;
      
      const pageData: App.PageData = {
        session: session,
      };

      expect(pageData.session).toBe(session);
    });

    it("Locals session and user are compatible with Supabase types", () => {
      const session: Session = {} as Session;
      const user: User = {} as User;
      
      const locals: App.Locals = {
        supabase: {} as SupabaseClient<Database>,
        safeGetSession: async () => ({ session, user }),
        session: session,
        user: user,
      };

      expect(locals.session).toBe(session);
      expect(locals.user).toBe(user);
    });
  });

  describe("Global namespace declaration", () => {
    it("App namespace is available globally", () => {
      // This test validates that the global App namespace is properly declared
      expect(typeof App).toBe("undefined"); // App is a namespace, not a runtime value
      
      // But we can use the types at compile time
      const locals: App.Locals = {
        supabase: {} as SupabaseClient<Database>,
        safeGetSession: async () => ({ session: null, user: null }),
        session: null,
        user: null,
      };

      const pageData: App.PageData = {
        session: null,
      };

      expect(locals).toBeDefined();
      expect(pageData).toBeDefined();
    });
  });
});