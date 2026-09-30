export class ToolFailure extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: 1 | 2 | 3 | 4,
  ) {
    super(message);
    this.name = "ToolFailure";
  }
}
