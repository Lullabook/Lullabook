import { serve } from "inngest/next";
import { inngest } from "@/adapters/inngest";
import { workflowFunctions } from "@/workflows/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: workflowFunctions,
});
