export abstract class ChainBase {
  abstract execute(input: string): string;
}

export abstract class ChainMid extends ChainBase {
  abstract execute(input: string): string;
}

export class ChainChild extends ChainMid {
  public execute(input: string): string {
    return `child:${input}`;
  }
}

export abstract class IncompatibleBase {
  abstract use(input: string): string;
}

export class IncompatibleChild extends IncompatibleBase {
  // @ts-ignore intentional incompatible override fixture
  public use(input: number): string {
    return `incompatible:${input}`;
  }
}
