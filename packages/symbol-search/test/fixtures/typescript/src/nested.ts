export namespace Names {
  export interface Inner {
    value: string;
  }

  export function make(value: string): Inner {
    return { value };
  }
}

export default class DefaultThing {
  public value = 1;
}
