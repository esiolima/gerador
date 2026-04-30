import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer-core";
import archiver from "archiver";
import xlsx from "xlsx";
import { EventEmitter } from "events";

const BASE_DIR = path.resolve();
const OUTPUT_DIR = path.join(BASE_DIR, "output");
const TMP_DIR = path.join(BASE_DIR, "tmp");
const TEMPLATES_DIR = path.join(BASE_DIR, "templates");
const LOGOS_DIR = path.join(BASE_DIR, "logos");
const SELOS_DIR = path.join(BASE_DIR, "selos");

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    if (!fs.existsSync(OUTPUT_DIR))
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (!fs.existsSync(TMP_DIR))
      fs.mkdirSync(TMP_DIR, { recursive: true });

    this.browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
  }

  normalizeType(tipo: string): string {
    if (!tipo) return "";

    const normalized = String(tipo)
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes("promo")) return "promocao";
    if (normalized.includes("cupom")) return "cupom";
    if (normalized.includes("queda")) return "queda";
    if (normalized.includes("bc")) return "bc";

    return "";
  }

  imageToBase64(imagePath: string): string {
    if (!imagePath || !fs.existsSync(imagePath)) return "";
    const ext = path.extname(imagePath).replace(".", "");
    const buffer = fs.readFileSync(imagePath);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  }

  async generateCards(excelFilePath: string) {
    if (!this.browser) throw new Error("Browser not initialized");

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const cards: any[] = [];

    let processed = 0;

    for (const row of rows) {
      const tipo = this.normalizeType(row.tipo);
      if (!tipo) continue;

      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);
      if (!fs.existsSync(templatePath)) continue;

      let html = fs.readFileSync(templatePath, "utf8");

      let valorFinal = String(row.valor ?? "").trim();

      if (["cupom", "queda", "bc"].includes(tipo)) {
        valorFinal = valorFinal.replace(/[^0-9,]/g, "");

        const partes = valorFinal.split(",");
        if (partes.length > 2) {
          valorFinal = partes[0] + "," + partes.slice(1).join("");
        }

        if (valorFinal.startsWith(",")) valorFinal = valorFinal.substring(1);
        if (valorFinal.endsWith(",")) valorFinal = valorFinal.slice(0, -1);
      }

      const hasLogo = !!(row.logo && String(row.logo).trim() !== "");

      const logoFile = hasLogo ? String(row.logo).trim() : "";
      const logoBase64 = logoFile
        ? this.imageToBase64(path.join(LOGOS_DIR, logoFile))
        : "";

      const seloBase64 = row.selo
        ? this.imageToBase64(
            path.join(
              SELOS_DIR,
              row.selo.toLowerCase() === "nova"
                ? "acaonova.png"
                : row.selo.toLowerCase() === "renovada"
                ? "acaorenovada.png"
                : ""
            )
          )
        : "";

      html = html
        .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
        .replaceAll("{{VALOR}}", valorFinal)
        .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
        .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
        .replaceAll("{{SEGMENTO}}", String(row.segmento ?? ""))
        .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
        .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
        .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
        .replaceAll("{{LOGO}}", logoBase64)
        .replaceAll("{{SELO}}", seloBase64);

      // ============================
      // GERAR PDF (continua igual)
      // ============================

      const tmpHtmlPath = path.join(TMP_DIR, `card_${processed + 1}.html`);
      fs.writeFileSync(tmpHtmlPath, html);

      const page = await this.browser.newPage();
      await page.setViewport({ width: 700, height: 1058 });

      await page.goto(`file://${tmpHtmlPath}`, {
        waitUntil: "networkidle0",
      });

      const ordem = row.ordem ? String(row.ordem).trim() : processed + 1;
      const pdfName = `${ordem}_${tipo}.pdf`;
      const pdfPath = path.join(OUTPUT_DIR, pdfName);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
      });

      await page.close();

      // ============================
      // 🔥 NOVO: ENVIAR HTML PRO FRONT
      // ============================

      cards.push({
        ordem,
        tipo,
        categoria: String(row.categoria ?? ""),
        html,
        hasLogo,
      });

      processed++;

      this.emit("progress", {
        processed,
        total: rows.length,
        percentage: Math.round((processed / rows.length) * 100),
      });
    }

    const zipPath = path.join(OUTPUT_DIR, "cards.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    fs.readdirSync(OUTPUT_DIR).forEach((file) => {
      if (file.endsWith(".pdf")) {
        archive.file(path.join(OUTPUT_DIR, file), { name: file });
      }
    });

    await archive.finalize();

    return {
      zipPath,
      cards,
      totalRows: rows.length,
      processedRows: processed,
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
