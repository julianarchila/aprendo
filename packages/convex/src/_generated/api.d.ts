/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as diagnostics from "../diagnostics.js";
import type * as myFunctions from "../myFunctions.js";
import type * as pdfPipeline from "../pdfPipeline.js";
import type * as pdfs from "../pdfs.js";
import type * as practice from "../practice.js";
import type * as progress from "../progress.js";
import type * as students from "../students.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  diagnostics: typeof diagnostics;
  myFunctions: typeof myFunctions;
  pdfPipeline: typeof pdfPipeline;
  pdfs: typeof pdfs;
  practice: typeof practice;
  progress: typeof progress;
  students: typeof students;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
