/** The one error class every generator throws for invalid options. */
export class VisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisError";
  }
}
