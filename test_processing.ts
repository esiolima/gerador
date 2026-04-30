
import { CardGenerator } from "./server/cardGenerator";
import path from "path";
import fs from "fs";

async function main() {
  const generator = new CardGenerator();
  const excelPath = "/home/ubuntu/upload/abl.xlsx";
  
  console.log("Iniciando teste de processamento...");
  
  try {
    await generator.initialize();
    console.log("Browser inicializado.");
    
    generator.on("progress", (progress) => {
      console.log(`Progresso: ${progress.processed}/${progress.total} (${progress.percentage}%)`);
    });
    
    const zipPath = await generator.generateCards(excelPath, "abl.xlsx");
    console.log("Sucesso! Arquivo ZIP gerado em:", zipPath);
    
    await generator.close();
  } catch (error) {
    console.error("Erro durante o processamento:", error);
    process.exit(1);
  }
}

main();
