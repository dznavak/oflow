import matter from "gray-matter";
import { z } from "zod";
import {
  ExplorationSchema,
  PlanSchema,
  PlanReviewSchema,
  ImplementationSchema,
  ValidationSchema,
  ReviewSchema,
} from "./schemas/index.js";

type ValidateResult =
  | { success: true; data: unknown }
  | { success: false; errors: string[] };

function normalizeDates(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

const SCHEMA_MAP: Record<string, z.ZodTypeAny> = {
  exploration: ExplorationSchema,
  plan: PlanSchema,
  "plan-review": PlanReviewSchema,
  implementation: ImplementationSchema,
  validation: ValidationSchema,
  review: ReviewSchema,
};

export function validateArtifact(
  artifactName: string,
  content: string
): ValidateResult {
  // Allow implementation-N (e.g. implementation-1, implementation-2) to resolve to the implementation schema
  const schemaKey = /^implementation-\d+$/.test(artifactName)
    ? "implementation"
    : artifactName;
  const schema = SCHEMA_MAP[schemaKey];
  if (!schema) {
    return {
      success: false,
      errors: [`Unknown artifact type: "${artifactName}". Valid types: ${Object.keys(SCHEMA_MAP).join(", ")}`],
    };
  }

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = matter(content);
    // gray-matter parses ISO date strings as Date objects; normalize them back to strings
    frontmatter = normalizeDates(parsed.data as Record<string, unknown>);
  } catch {
    return {
      success: false,
      errors: ["Failed to parse YAML frontmatter"],
    };
  }

  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return {
      success: false,
      errors: ["No YAML frontmatter found — wrap content in --- delimiters"],
    };
  }

  const result = schema.safeParse(frontmatter);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}
