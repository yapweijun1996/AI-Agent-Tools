import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import type { Capabilities, Request, Result } from "../types";

interface ValidationOutcome<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

const schemaRoot = [resolve(__dirname, "../../schemas"), resolve(__dirname, "../../../schemas")].find((candidate) => existsSync(candidate)) ?? resolve(__dirname, "../../schemas");
const ajv = new Ajv2020({ allErrors: true, strict: false });

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(resolve(schemaRoot, name), "utf8")) as object;
}

const requestValidator: ValidateFunction<Request> = ajv.compile<Request>(loadSchema("request.schema.json"));
const resultValidator: ValidateFunction<Result> = ajv.compile<Result>(loadSchema("result.schema.json"));
const capabilitiesValidator: ValidateFunction<Capabilities> = ajv.compile<Capabilities>(loadSchema("capabilities.schema.json"));

function formatError(error: ErrorObject): string {
  const location = error.instancePath || "request";
  if (error.keyword === "additionalProperties" && typeof error.params === "object" && error.params !== null) {
    const property = "additionalProperty" in error.params ? String(error.params.additionalProperty) : "unknown";
    return `${location} contains unsupported property ${property}`;
  }
  if (error.keyword === "required" && typeof error.params === "object" && error.params !== null) {
    const property = "missingProperty" in error.params ? String(error.params.missingProperty) : "unknown";
    return `${location} is missing required property ${property}`;
  }
  return `${location} ${error.message ?? error.keyword}`;
}

function validate<T>(validator: ValidateFunction<T>, value: unknown): ValidationOutcome<T> {
  if (validator(value)) {
    return { valid: true, value: value as T, errors: [] };
  }
  return {
    valid: false,
    errors: (validator.errors ?? []).map(formatError)
  };
}

export function validateRequest(value: unknown): ValidationOutcome<Request> {
  return validate(requestValidator, value);
}

export function validateResult(value: Result): ValidationOutcome<Result> {
  return validate(resultValidator, value);
}

export function validateCapabilities(value: Capabilities): ValidationOutcome<Capabilities> {
  return validate(capabilitiesValidator, value);
}
