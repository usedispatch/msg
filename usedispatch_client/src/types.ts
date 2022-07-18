export interface Error {
  error: true;
  message: string;
};

export type Result<T> = T | Error;
