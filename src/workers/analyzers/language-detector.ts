import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface DetectionResult {
  languages: string[];
  frameworks: string[];
}

const LANGUAGE_INDICATORS: Record<string, string[]> = {
  javascript: ["package.json", ".eslintrc.js", "webpack.config.js"],
  typescript: ["tsconfig.json", "tsconfig.app.json"],
  python: ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile", "setup.cfg"],
  ruby: ["Gemfile", "Rakefile", ".ruby-version"],
  go: ["go.mod", "go.sum"],
  java: ["pom.xml", "build.gradle", "build.gradle.kts"],
  rust: ["Cargo.toml"],
  php: ["composer.json"],
};

const FRAMEWORK_INDICATORS: Record<string, { files: string[]; packageNames?: string[] }> = {
  "Next.js": { files: ["next.config.js", "next.config.mjs", "next.config.ts"], packageNames: ["next"] },
  React: { files: [], packageNames: ["react", "react-dom"] },
  Vue: { files: ["vue.config.js", "nuxt.config.js", "nuxt.config.ts"], packageNames: ["vue", "nuxt"] },
  Angular: { files: ["angular.json"], packageNames: ["@angular/core"] },
  Express: { files: [], packageNames: ["express"] },
  Fastify: { files: [], packageNames: ["fastify"] },
  Django: { files: ["manage.py"], packageNames: ["django"] },
  Flask: { files: [], packageNames: ["flask"] },
  FastAPI: { files: [], packageNames: ["fastapi"] },
  "Ruby on Rails": { files: ["config/routes.rb", "bin/rails"], packageNames: [] },
  "Spring Boot": { files: [], packageNames: ["spring-boot-starter"] },
  Prisma: { files: ["prisma/schema.prisma"], packageNames: ["@prisma/client"] },
  Mongoose: { files: [], packageNames: ["mongoose"] },
  Sequelize: { files: [], packageNames: ["sequelize"] },
  Drizzle: { files: [], packageNames: ["drizzle-orm"] },
};

async function fileExists(dir: string, relativePath: string): Promise<boolean> {
  try {
    await readFile(join(dir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function getPackageJsonDeps(dir: string): Promise<string[]> {
  try {
    const content = await readFile(join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(content);
    return [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];
  } catch {
    return [];
  }
}

async function getPythonDeps(dir: string): Promise<string[]> {
  try {
    const content = await readFile(join(dir, "requirements.txt"), "utf-8");
    return content
      .split("\n")
      .map((line) => line.split("==")[0].split(">=")[0].split("<=")[0].trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function detectLanguagesAndFrameworks(repoDir: string): Promise<DetectionResult> {
  const languages: Set<string> = new Set();
  const frameworks: Set<string> = new Set();

  const entries = await readdir(repoDir, { withFileTypes: true, recursive: true })
    .catch(() => []);

  const filePaths = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const parent = e.parentPath || e.path;
      return join(parent, e.name).replace(repoDir + "/", "");
    });

  for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    for (const indicator of indicators) {
      if (filePaths.some((f) => f.endsWith(indicator))) {
        languages.add(lang);
        break;
      }
    }
  }

  const extensions = new Set(
    filePaths
      .map((f) => f.split(".").pop()?.toLowerCase())
      .filter(Boolean)
  );
  if (extensions.has("js") || extensions.has("jsx") || extensions.has("mjs")) languages.add("javascript");
  if (extensions.has("ts") || extensions.has("tsx")) languages.add("typescript");
  if (extensions.has("py")) languages.add("python");
  if (extensions.has("rb")) languages.add("ruby");
  if (extensions.has("go")) languages.add("go");
  if (extensions.has("java")) languages.add("java");
  if (extensions.has("rs")) languages.add("rust");
  if (extensions.has("php")) languages.add("php");

  const npmDeps = await getPackageJsonDeps(repoDir);
  const pyDeps = await getPythonDeps(repoDir);

  for (const [framework, config] of Object.entries(FRAMEWORK_INDICATORS)) {
    for (const file of config.files) {
      if (await fileExists(repoDir, file)) {
        frameworks.add(framework);
        break;
      }
    }
    if (config.packageNames) {
      for (const pkg of config.packageNames) {
        if (npmDeps.includes(pkg) || pyDeps.includes(pkg.toLowerCase())) {
          frameworks.add(framework);
          break;
        }
      }
    }
  }

  return {
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
  };
}
