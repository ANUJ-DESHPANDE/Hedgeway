export type Page =
  | "Overview"
  | "Markets"
  | "Portfolio"
  | "Research"
  | "IPOs"
  | "Strategy lab"
  | "Journal"
  | "Integrations";
export type Action = (
  fn: () => Promise<any>,
  message: string,
) => Promise<boolean>;
