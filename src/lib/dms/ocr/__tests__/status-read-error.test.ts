import { expect, it } from "vitest";
import { describeOcrStatusReadError, OcrStatusReadError } from "../status-read-error";

it.each(["authentication", "permission", "document", "files", "text_availability"])("describes the safe %s category with a correlation reference", stage => {
  const error = new OcrStatusReadError(stage, "3b7bc68b-6615-41c5-a395-30f20a048f3a");
  expect(describeOcrStatusReadError(error)).toContain("Reference: 3b7bc68b-6615-41c5-a395-30f20a048f3a");
});
it("does not echo arbitrary database, network or prototype values", () => {
  const secret = "PRIVATE-ERROR-TEXT";
  for (const error of [Error(secret), secret, { message: secret }, new OcrStatusReadError(secret, secret),
    new OcrStatusReadError("constructor", secret), new OcrStatusReadError("__proto__", secret)]) {
    expect(describeOcrStatusReadError(error)).not.toContain(secret);
    expect(describeOcrStatusReadError(error)).not.toContain("function");
  }
});
