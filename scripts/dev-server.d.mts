export function createReloadServer(config: {
  port: number;
  token: string;
}): Promise<{
  port: number;
  connections(): number;
  publish(revision: string): void;
  close(): Promise<void>;
}>;
