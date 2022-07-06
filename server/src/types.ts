export enum ActionKind {
  CreateForum,
  GetServerPubkey
}

export interface EndpointParameters {
  kind: ActionKind;
}
