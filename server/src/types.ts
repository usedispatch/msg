export enum ActionKind {
  CreateForum,
}

export interface EndpointParameters {
  kind: ActionKind;
}
