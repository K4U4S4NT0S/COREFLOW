import fs from "fs";
import path from "path";

const root = process.cwd();
const source = path.join(root, "wwwroot");
const output = path.join(root, "dist");

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, item.name);
    const dest = path.join(to, item.name);
    if (item.isDirectory()) copyDirectory(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(source)) {
  console.error("Pasta wwwroot não encontrada. O build do Vercel precisa dela.");
  process.exit(1);
}

fs.rmSync(output, { recursive: true, force: true });
copyDirectory(source, output);
console.log("Build concluído: arquivos copiados de wwwroot para dist.");
