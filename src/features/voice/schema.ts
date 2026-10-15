import { z } from "zod";

// Lo que el intérprete devuelve a partir de una frase dictada o escrita.
// null significa "no se dijo": el formulario conserva su valor por defecto.
export const interpretedSchema = z.object({
  kind: z.enum(["expense", "income"]),
  amount: z
    .string()
    .nullable()
    .describe(
      "Importe total como decimal con punto y sin separador de miles, p. ej. 2500.50. null si no se dijo.",
    ),
  currency: z
    .string()
    .nullable()
    .describe("Código de moneda de la lista permitida, o null si no se dijo."),
  category: z
    .string()
    .nullable()
    .describe(
      "Nombre exacto de una categoría existente del mismo tipo; si ninguna encaja, un nombre nuevo corto. null si no se puede inferir.",
    ),
  item: z
    .string()
    .nullable()
    .describe("Qué se compró o el concepto, breve. null si no se dijo."),
  date: z
    .string()
    .nullable()
    .describe("Fecha AAAA-MM-DD, resuelta respecto de hoy. null si no se dijo."),
  method: z
    .string()
    .nullable()
    .describe(
      "Nombre exacto de un medio de pago de la lista, o null si no se dijo o no está.",
    ),
  installments: z
    .number()
    .int()
    .nullable()
    .describe("Cantidad de cuotas si se mencionaron (2 a 60); si no, null."),
  more: z
    .boolean()
    .describe("true si la frase menciona más de un movimiento."),
});
export type Interpreted = z.infer<typeof interpretedSchema>;

export const interpretRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z
    .array(
      z.object({
        name: z.string().max(60),
        kind: z.enum(["expense", "income"]),
      }),
    )
    .max(200),
  methods: z.array(z.string().max(60)).max(100),
  currencies: z.array(z.string().max(3)).min(1).max(20),
  defaultCurrency: z.string().max(3),
});
export type InterpretRequest = z.infer<typeof interpretRequestSchema>;
