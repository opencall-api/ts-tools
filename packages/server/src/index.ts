// Re-export the contract surface from @opencall/types so consumers of
// @opencall/server can import envelope types directly without a separate
// install of @opencall/types.
export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
  DomainError,
  BackendUnavailableError,
  domainError,
  protocolError,
  type OperationResult,
  type OperationModule,
  type RegistryEntry,
  type RegistryResponse,
} from "@opencall/types"

// Server-only surface.
export { parseJSDoc } from "./jsdoc.js"

export {
  buildRegistry,
  buildRegistryFromModules,
  type BuildRegistryOptions,
  type BuildRegistryResult,
  type RuntimeAdapters,
  type ModuleEntry,
  type ModuleMeta,
} from "./registry.js"

export {
  generateOpsModule,
  type GenerateOpsOptions,
} from "./codegen.js"

export {
  validateEnvelope,
  validateArgs,
  checkSunset,
  formatResponse,
  safeHandlerCall,
  type DispatchResult,
} from "./validate.js"
