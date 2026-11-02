import { describe, it, expect, vi, afterEach } from "vitest";
import { createClient } from "../../src/lib/openalex";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const res = (status, body = {}) => ({ ok: status < 400, status, statusText: "", json: async () => body });

describe("OpenAlex client", () => {
  it("retries a passing 504 and returns the result", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(res(504)).mockResolvedValueOnce(res(200, { results: [1] }));
    vi.stubGlobal("fetch", fetchMock);
    const p = createClient().get("/works");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ results: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with an error after repeated server errors", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(res(503, { error: "down" }));
    vi.stubGlobal("fetch", fetchMock);
    const p = createClient().get("/works").then(() => "resolved", (e) => e.status);
    await vi.runAllTimersAsync();
    expect(await p).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createClient().get("/works/W1")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
