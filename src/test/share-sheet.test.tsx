import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ShareSheet } from "@/components/game/ShareSheet";

afterEach(cleanup);

describe("ShareSheet", () => {
  it("offers each network with the link prefilled", () => {
    const url = "https://example.test/s/abc123";
    render(<ShareSheet open onOpenChange={() => undefined} text="My picks" url={url} />);

    expect(screen.getByText("Share your picks")).toBeTruthy();
    const whatsapp = screen.getByRole("link", { name: /whatsapp/i });
    expect(whatsapp.getAttribute("href")).toContain(encodeURIComponent(url));
    expect(whatsapp.getAttribute("target")).toBe("_blank");
    for (const name of [/^x$/i, /facebook/i, /telegram/i, /reddit/i, /linkedin/i, /email/i]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /copy link/i })).toBeTruthy();
  });
});
