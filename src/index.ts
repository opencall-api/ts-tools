// Envelope schemas and types
export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
} from "./envelope.js";

// Error handling
export { DomainError, domainError, protocolError } from "./errors.js";

// Core types
export type {
  OperationResult,
  OperationModule,
  RegistryEntry,
  RegistryResponse,
} from "./types.js";

// JSDoc parser
export { parseJSDoc } from "./jsdoc.js";

// Registry builder
export {
  buildRegistry,
  buildRegistryFromModules,
  type BuildRegistryOptions,
  type BuildRegistryResult,
  type RuntimeAdapters,
  type ModuleEntry,
  type ModuleMeta,
} from "./registry.js";

// Code generation
export {
  generateOpsModule,
  type GenerateOpsOptions,
} from "./codegen.js";

// Validation utilities
export {
  validateEnvelope,
  validateArgs,
  checkSunset,
  formatResponse,
  safeHandlerCall,
  type DispatchResult,
} from "./validate.js";
