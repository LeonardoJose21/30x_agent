import path from "path";
import fs from "fs";
import { indexPDF } from "../lib/indexer";

const DOCS_DIR = path.join(process.cwd(), "documents");

async function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Documents folder not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(DOCS_DIR, f));

  if (files.length === 0) {
    console.log("No PDF files found in /documents");
    return;
  }

  console.log(`Found ${files.length} PDF(s) to index...\n`);

  let totalChunks = 0;
  for (const filePath of files) {
    const basename = path.basename(filePath);
    process.stdout.write(`Indexing ${basename}... `);
    try {
      const result = await indexPDF(filePath);
      console.log(`done (${result.totalChunks} chunks)`);
      totalChunks += result.totalChunks;
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. Total chunks indexed: ${totalChunks}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
