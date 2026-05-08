import type { WorkflowEvent } from "./workflow-service.js";

export function encodeSseEvent(event: WorkflowEvent): string {
  return [`event: ${event.type}`, `data: ${JSON.stringify(event)}`, "", ""].join("\n");
}
