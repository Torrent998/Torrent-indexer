import type { FaultCode } from "../types/index.js";

/** A condition that must stop the indexer from advancing (fail closed). */
export class IndexerFault extends Error {
  constructor(
    public readonly code: FaultCode,
    message: string,
    public readonly eventId?: string,
  ) {
    super(message);
    this.name = "IndexerFault";
  }
}
