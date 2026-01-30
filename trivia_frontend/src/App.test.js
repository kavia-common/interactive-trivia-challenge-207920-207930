import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders RetroTrivia brand title", () => {
  render(<App />);
  expect(screen.getByText(/RETROTRIVIA/i)).toBeInTheDocument();
});
