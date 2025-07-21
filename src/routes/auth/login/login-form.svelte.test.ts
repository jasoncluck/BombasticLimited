import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import LoginForm from "./login-form.svelte";
import { setupTest } from "../../../tests/utils/test-setup";

// Mock sveltekit-superforms
vi.mock("sveltekit-superforms", () => ({
  superForm: vi.fn((data, options) => ({
    form: {
      subscribe: vi.fn(() => () => {}),
      set: vi.fn(),
      update: vi.fn(),
      email: "",
      password: "",
    },
    enhance: vi.fn(),
  })),
}));

// Mock sveltekit-flash-message
vi.mock("sveltekit-flash-message", () => ({
  getFlash: vi.fn(() => ({
    subscribe: vi.fn(() => () => {}),
  })),
  updateFlash: vi.fn(),
}));

// Mock login schema
vi.mock("../schema", () => ({
  loginSchema: {},
}));

// Mock DiscordIcon component
vi.mock("$lib/assets/icons/DiscordIcon.svelte", () => ({
  default: vi.fn(() => ({
    render: () => ({ html: "<div>Discord Icon</div>" }),
    $$: {},
  })),
}));

describe.skip("Login Form Component", () => {
  setupTest();

  const mockData = {
    form: {
      email: "",
      password: "",
    },
    supabase: {
      auth: {
        signInWithOAuth: vi.fn(),
      },
    },
  };

  it("renders the login form without errors", () => {
    const { container } = render(LoginForm, { props: { data: mockData } });
    expect(container).toBeDefined();
  });

  it("displays the Login title and description", () => {
    render(LoginForm, { props: { data: mockData } });
    
    expect(screen.getByText("Login")).toBeDefined();
    expect(screen.getByText("Enter your email and password to log in")).toBeDefined();
  });

  it("renders Discord OAuth button", () => {
    render(LoginForm, { props: { data: mockData } });
    
    expect(screen.getByText("Discord")).toBeDefined();
  });

  it("renders email and password input fields", () => {
    render(LoginForm, { props: { data: mockData } });
    
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
  });

  it("email input has correct attributes", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveProperty("type", "email");
    expect(emailInput).toHaveProperty("autocomplete", "email");
    expect(emailInput).toHaveProperty("placeholder", "user@example.com");
  });

  it("password input has correct attributes", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveProperty("type", "password");
    expect(passwordInput).toHaveProperty("autocomplete", "current-password");
  });

  it("renders login submit button", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const loginButton = screen.getByRole("button", { name: "Login" });
    expect(loginButton).toBeDefined();
    expect(loginButton).toHaveProperty("type", "submit");
  });

  it("renders signup navigation button", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const signupButton = screen.getByText("Don't have an account? Sign up");
    expect(signupButton).toBeDefined();
  });

  it("has correct form action", () => {
    const { container } = render(LoginForm, { props: { data: mockData } });
    
    const form = container.querySelector('form');
    expect(form).toHaveProperty("action", "?/login");
    expect(form).toHaveProperty("method", "POST");
  });

  it("shows Or continue with divider", () => {
    render(LoginForm, { props: { data: mockData } });
    
    expect(screen.getByText("Or continue with")).toBeDefined();
  });

  it("Discord button triggers OAuth when clicked", async () => {
    const user = userEvent.setup();
    const mockSignIn = vi.fn();
    const dataWithMockAuth = {
      ...mockData,
      supabase: {
        auth: {
          signInWithOAuth: mockSignIn,
        },
      },
    };

    render(LoginForm, { props: { data: dataWithMockAuth } });
    
    const discordButton = screen.getByText("Discord");
    await user.click(discordButton);
    
    expect(mockSignIn).toHaveBeenCalledWith({
      provider: "discord",
    });
  });

  it("login button is enabled by default", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const loginButton = screen.getByRole("button", { name: "Login" });
    expect(loginButton).not.toBeDisabled();
  });

  it("signup button is enabled by default", () => {
    render(LoginForm, { props: { data: mockData } });
    
    const signupButton = screen.getByText("Don't have an account? Sign up");
    expect(signupButton).not.toBeDisabled();
  });

  it("Discord button has correct styling", () => {
    const { container } = render(LoginForm, { props: { data: mockData } });
    
    const discordButton = container.querySelector('button[type="button"]');
    expect(discordButton).toHaveClass("cursor-pointer", "w-full");
  });

  it("component initializes without errors", () => {
    const { container } = render(LoginForm, { props: { data: mockData } });
    expect(container).toBeDefined();
  });
});