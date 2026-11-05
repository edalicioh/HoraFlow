export type FieldErrors = Record<string, string[] | undefined>;

export class DomainError extends Error {
  readonly code: string;
  readonly fieldErrors?: FieldErrors;

  constructor(code: string, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("VALIDATION", message, fieldErrors);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("NOT_FOUND", message, fieldErrors);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, fieldErrors?: FieldErrors) {
    super("CONFLICT", message, fieldErrors);
    this.name = "ConflictError";
  }
}
