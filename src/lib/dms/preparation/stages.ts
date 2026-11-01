import { z } from "zod";
import { preparationStageReceipt } from "./contracts";

/** A started paid stage without a durable result is held rather than charged again. */
export async function runPreparationStage<T>(
  rpc: (action: string, extra: Record<string, unknown>) => Promise<unknown>,
  stage: string, schema: z.ZodType<T>, work: () => Promise<T>,
  costQuote?:{configId:number;model:string;inputByteCeiling:number;outputTokenCeiling:number},
): Promise<T> {
  const begun = preparationStageReceipt.parse(await rpc("begin", { stage,...(costQuote?{costQuote}:{}) }));
  if (begun.state === "completed") return schema.parse(begun.value);
  if (begun.state !== "started") throw Error("preparation_outcome_unconfirmed");
  const value = schema.parse(await work());
  const finished = preparationStageReceipt.parse(await rpc("complete", { stage, value }));
  if (finished.state !== "completed") throw Error("preparation_outcome_unconfirmed");
  return schema.parse(finished.value);
}
