export class EnhancedMessageData {
  public constructor(
    public subj: string,
    public body: string,
    public ts: string,
    public meta?: object,
  ) {}

  public toString(): string {
    return JSON.stringify(this);
  }

  public static parse(input: string): EnhancedMessageData {
    return JSON.parse(input);
  }
}
