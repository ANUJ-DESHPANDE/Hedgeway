export type Page =
  | "Today"
  | "Notebook"
  | "Overview"
  | "Markets"
  | "AI desk"
  | "Setup scanner"
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
