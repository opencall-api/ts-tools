export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
  type StreamDescriptor,
} from "./envelope.js"

export {
  DomainError,
  BackendUnavailableError,
  domainError,
  protocolError,
} from "./errors.js"

export type {
  OperationResult,
  OperationModule,
  RegistryEntry,
  RegistryResponse,
} from "./types.js"
