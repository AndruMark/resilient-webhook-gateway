export interface InvalidParamDetail {
  readonly name: string;
  readonly reason: string;
}

/**
 * RFC 9457 - Problem Details for HTTP APIs
 * Standardized error representation model.
 */
export interface ProblemDetailsProps {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly invalidParams?: readonly InvalidParamDetail[];
  readonly [key: string]: unknown;
}

export abstract class ProblemDetailsException extends Error {
  public readonly type: string;
  public readonly title: string;
  public readonly status: number;
  public readonly detail: string;
  public readonly instance?: string;
  public readonly invalidParams?: readonly InvalidParamDetail[];
  public readonly extensions?: Record<string, unknown>;

  protected constructor(props: ProblemDetailsProps) {
    super(props.detail);
    this.name = this.constructor.name;
    this.type = props.type;
    this.title = props.title;
    this.status = props.status;
    this.detail = props.detail;
    this.instance = props.instance;
    this.invalidParams = props.invalidParams;

    const { type, title, status, detail, instance, invalidParams, ...rest } = props;
    if (Object.keys(rest).length > 0) {
      this.extensions = rest;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): ProblemDetailsProps {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      ...(this.instance && { instance: this.instance }),
      ...(this.invalidParams && { invalidParams: this.invalidParams }),
      ...this.extensions,
    };
  }
}