export enum ActionKind {
  CreateForum,
  GetServerPubkey
}

export interface CreateForumAction {
  kind: ActionKind.CreateForum;
}

export interface GetServerPubkeyAction {
  kind: ActionKind.GetServerPubkey
}

export type EndpointParameters
  = CreateForumAction
  | GetServerPubkeyAction;
