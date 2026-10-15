import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // La app se renderiza en el cliente: lee sesión, almacenamiento local y datos al montar.
      "react-hooks/set-state-in-effect": "off",
      // Los enlaces internos recargan la página a propósito (cambian de acceso directo o de sesión).
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([".next/**", "next-env.d.ts", "test-results/**", ".tools/**"]),
]);
