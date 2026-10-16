import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**"]),
  {
    rules: {
      // The tool copy quotes ordinary apostrophes ("the accountant's
      // template"). React's rule wants every one escaped; the copy reads
      // worse for it and the escape is not a correctness or security issue.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Page thumbnails (the organizer) and diff shots (compare) are canvas
    // renders turned into data URLs in the browser. next/image cannot
    // optimize data URLs — it would refuse them — and the optimizer is the
    // rule's whole point, so it is off for the one file that draws them.
    files: ["components/Widgets.jsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
