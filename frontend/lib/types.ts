export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  description: string;
  price_cents: number;
  stock: number;
  cover_color: string;
  published_year: number;
  featured: boolean;
};
export type User = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
};
export const categories = ["Fiction", "Essays", "Poetry", "Design", "Science"];
export const price = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
