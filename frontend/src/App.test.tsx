import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Gmail Bills Tracker heading", () => {
  render(<App />);
  const heading = screen.getByText(/Loading.../i);
  expect(heading).toBeInTheDocument();
});
