import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "@/components/ui/Toast";

// Test component that uses the useToast hook
const TestComponent = () => {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success("Success occurred!")}>Success</button>
      <button onClick={() => toast.error("Error occurred!")}>Error</button>
    </div>
  );
};

describe("Toast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders children correctly", () => {
    render(
      <ToastProvider>
        <div>Test Child Content</div>
      </ToastProvider>
    );

    expect(screen.getByText("Test Child Content")).toBeInTheDocument();
  });

  it("adds and dismisses a success toast", async () => {
    const user = userEvent.setup({ delay: null });
    
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Trigger success toast
    await act(async () => {
      await user.click(screen.getByText("Success"));
    });

    expect(screen.getByText("Success occurred!")).toBeInTheDocument();

    // Find and click the dismiss button
    const dismissBtn = screen.getByRole("button", { name: "Dismiss notification" });
    
    await act(async () => {
      await user.click(dismissBtn);
      // Wait for the setTimeout in handleDismiss 
      jest.advanceTimersByTime(350);
    });

    expect(screen.queryByText("Success occurred!")).not.toBeInTheDocument();
  });

  it("adds an error toast and auto-dismisses after timeout", async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Trigger error toast
    await act(async () => {
      await user.click(screen.getByText("Error"));
    });

    expect(screen.getByText("Error occurred!")).toBeInTheDocument();

    // Advance max timeout
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Error occurred!")).not.toBeInTheDocument();
  });
});
