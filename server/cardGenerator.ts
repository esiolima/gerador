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

export type GeneratedCard = {
  ordem: string;
  tipo: string;
  categoria: string;
  categoriaSlug: string;
  texto: string;
  valor: string;
  cupom: string;
  logoFile: string;
  hasLogo: boolean;
  pdfName: string;
  pngName: string;
  htmlName: string;
  pdfUrl: string;
  pngUrl: string;
  htmlUrl: string;
  html: string;
};

export type GenerateCardsResult = {
  zipPath: string;
  zipName: string;
  jobId: string;
  cards: GeneratedCard[];
  totalRows: number;
  processedRows: number;
};

const VALID_TYPES = ["promocao", "cupom", "cashback", "queda", "bc"];

export class CardGenerator extends EventEmitter {
  private browser: Browser | null = null;

  async initialize() {
    for (const dir of [OUTPUT_DIR, TMP_DIR]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    this.browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_BIN ||
        process.env.CHROMIUM_PATH ||
        "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
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
    if (normalized.includes("cashback")) return "cashback";
    if (normalized === "bc") return "bc";

    return "";
  }

  private sanitizeFileName(value: string): string {
    return (
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .trim() || "sem-nome"
    );
  }

  private getDateStamp(): string {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    );

    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const aa = String(now.getFullYear()).slice(-2);
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    return `${dd}_${mm}_${aa}-${hh}_${min}_${ss}`;
  }

  private getUniqueFilePath(filePath: string): string {
    if (!fs.existsSync(filePath)) return filePath;

    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    let counter = 2;
    let newPath = "";

    do {
      newPath = path.join(dir, `${name}_v${counter}${ext}`);
      counter++;
    } while (fs.existsSync(newPath));

    return newPath;
  }

  imageToBase64(imagePath: string): string {
    if (
      !imagePath ||
      !fs.existsSync(imagePath) ||
      fs.lstatSync(imagePath).isDirectory()
    ) {
      return "";
    }

    const ext = path.extname(imagePath).replace(".", "").toLowerCase();
    const buffer = fs.readFileSync(imagePath);

    let mimeType = `image/${ext}`;
    if (ext === "svg") mimeType = "image/svg+xml";
    if (ext === "jpg" || ext === "jfif") mimeType = "image/jpeg";
    if (ext === "avif") mimeType = "image/avif";

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  private findLogoFile(logoName: string): string {
    if (!fs.existsSync(LOGOS_DIR)) return "";
    if (!logoName || String(logoName).trim() === "") return "";

    const cleanName = String(logoName).trim();
    const extensions = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".jfif", ".avif"];
    const filesInLogos = fs.readdirSync(LOGOS_DIR);

    if (fs.existsSync(path.join(LOGOS_DIR, cleanName))) return cleanName;

    const searchName = cleanName.toLowerCase();

    for (const ext of extensions) {
      const target = searchName.endsWith(ext) ? searchName : searchName + ext;
      const found = filesInLogos.find((f) => f.toLowerCase() === target);
      if (found) return found;
    }

    const validFiles = filesInLogos.filter((f) =>
      extensions.includes(path.extname(f).toLowerCase())
    );

    const prefixMatch = validFiles.find((f) =>
      path.parse(f).name.toLowerCase().startsWith(searchName)
    );

    return prefixMatch || "";
  }

  private validateRows(rows: any[]): void {
    if (!rows.length) {
      throw new Error("A planilha não possui linhas de dados para processar.");
    }

    const headers = Object.keys(rows[0] ?? {}).map((h) => h.toLowerCase().trim());
    const missing = ["tipo"].filter((h) => !headers.includes(h));

    if (missing.length) {
      throw new Error(
        `Coluna obrigatória ausente: ${missing.join(", ")}. Use nomes em minúsculo.`
      );
    }

    rows.forEach((row, index) => {
      const line = index + 2;
      const tipo = this.normalizeType(row.tipo);

      if (!String(row.tipo ?? "").trim()) {
        throw new Error(`Erro na linha ${line}: a coluna "tipo" está vazia.`);
      }

      if (!tipo || !VALID_TYPES.includes(tipo)) {
        throw new Error(
          `Erro na linha ${line}: tipo "${row.tipo}" não reconhecido. Use promocao, cupom, cashback ou queda.`
        );
      }

      if (tipo === "cupom" && !String(row.cupom ?? "").trim()) {
        throw new Error(
          `Erro na linha ${line}: template cupom exige a coluna "cupom" preenchida.`
        );
      }

      if (!String(row.valor ?? "").trim()) {
        throw new Error(`Erro na linha ${line}: a coluna "valor" está vazia.`);
      }
    });
  }

  private injectFittingHelpers(html: string): string {
    const helper = `
<style id="fit-container-helpers">
  html, body {
    width:700px;
    min-width:700px;
    max-width:700px;
    margin:0;
    padding:0;
    overflow:hidden;
    background:transparent;
  }

  .card {
    background:#fff;
    overflow:hidden;
  }

  .logo,
  .selo,
  .valor-container,
  .cupom-codigo {
    overflow:hidden;
  }

  .logo img,
  .selo img,
  #selo-img {
    width:100%;
    height:100%;
    object-fit:contain;
    display:block;
  }

  .logo img[src=""],
  .logo img:not([src]) {
    display:none;
  }

  #valor-texto,
  .valor-texto,
  #cupom-text {
    text-rendering:geometricPrecision;
  }
</style>

<script>
(function(){
  function fitText(el, container, opts){
    if(!el || !container) return;

    var max = opts.max || 480;
    var min = opts.min || 10;

    el.style.display = "block";
    el.style.maxWidth = "100%";
    el.style.textAlign = "center";
    el.style.whiteSpace = opts.nowrap ? "nowrap" : "normal";
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "normal";
    el.style.lineHeight = opts.lineHeight || "0.92";

    for(var size = max; size >= min; size--){
      el.style.fontSize = size + "px";

      if(
        el.scrollWidth <= container.clientWidth &&
        el.scrollHeight <= container.clientHeight
      ){
        break;
      }
    }
  }

  function run(){
    fitText(
      document.getElementById("valor-texto") || document.querySelector(".valor-texto"),
      document.getElementById("valor-container") || document.querySelector(".valor-container"),
      { max: 520, min: 22, nowrap: false, lineHeight: "0.9" }
    );

    fitText(
      document.getElementById("cupom-text"),
      document.querySelector(".cupom-codigo"),
      { max: 120, min: 18, nowrap: true, lineHeight: "1" }
    );
  }

  window.__fitCards = run;

  if(document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run);
  } else {
    window.addEventListener("load", run);
  }
})();
</script>`;

    return html.includes("</body>")
      ? html.replace("</body>", `${helper}</body>`)
      : html + helper;
  }

  private replacePlaceholders(
    html: string,
    row: any,
    tipo: string,
    logoBase64: string,
    seloBase64: string
  ): string {
    let valorFinal = String(row.valor ?? "");

    if (tipo !== "promocao") {
      valorFinal = valorFinal.replace(/%/g, "").trim();
    }

    const segmentoRaw =
      row.segmento && String(row.segmento).trim() !== ""
        ? String(row.segmento).trim()
        : "";

    return html
      .replaceAll("{{TEXTO}}", String(row.texto ?? ""))
      .replaceAll("{{VALOR}}", valorFinal)
      .replaceAll("{{COMPLEMENTO}}", String(row.complemento ?? ""))
      .replaceAll("{{LEGAL}}", String(row.legal ?? ""))
      .replaceAll("{{SEGMENTO}}", segmentoRaw)
      .replaceAll("{{CUPOM}}", String(row.cupom ?? ""))
      .replaceAll("{{UF}}", row.uf ? `UF: ${row.uf}` : "")
      .replaceAll("{{URN}}", row.urn ? `URN: ${row.urn}` : "")
      .replaceAll("{{LOGO}}", logoBase64)
      .replaceAll("{{SELO}}", seloBase64);
  }

  private async waitForPageReady(page: any) {
    await page.evaluate(async () => {
      // @ts-ignore
      if (document.fonts?.ready) await document.fonts.ready;

      const images = Array.from(document.images);

      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();

          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        })
      );

      // @ts-ignore
      if (window.__fitCards) window.__fitCards();
    });
  }

  async generateCards(
    excelFilePath: string,
    originalFileName?: string
  ): Promise<GenerateCardsResult> {
    if (!this.browser) throw new Error("Browser not initialized");

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobDir = path.join(OUTPUT_DIR, jobId);

    fs.mkdirSync(jobDir, { recursive: true });

    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows: any[] = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    this.validateRows(rows);

    const total = rows.length;
    let processed = 0;
    const cards: GeneratedCard[] = [];

    for (const [index, row] of rows.entries()) {
      const tipo = this.normalizeType(row.tipo);
      const templatePath = path.join(TEMPLATES_DIR, `${tipo}.html`);

      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template não encontrado: templates/${tipo}.html`);
      }

      const logoFile = this.findLogoFile(row.logo);
      const logoBase64 = logoFile ? this.imageToBase64(path.join(LOGOS_DIR, logoFile)) : "";
      const hasLogo = Boolean(logoBase64);

      const seloRaw = String(row.selo ?? "").trim().toLowerCase();
      const seloBase64 = seloRaw
        ? this.imageToBase64(
            path.join(
              SELOS_DIR,
              seloRaw === "nova"
                ? "acaonova.png"
                : seloRaw === "renovada"
                  ? "acaorenovada.png"
                  : "blank.png"
            )
          )
        : "";

      let html = fs.readFileSync(templatePath, "utf8");

      html = this.replacePlaceholders(html, row, tipo, logoBase64, seloBase64);
      html = this.injectFittingHelpers(html);

      const ordemFinal =
        row.ordem && String(row.ordem).trim() !== ""
          ? String(row.ordem).trim()
          : String(index + 1);

      const categoriaRaw =
        row.categoria && String(row.categoria).trim() !== ""
          ? String(row.categoria).trim()
          : "sem-categoria";

      const categoriaSlug = this.sanitizeFileName(categoriaRaw);
      const safeOrdem = this.sanitizeFileName(ordemFinal);

      const pdfName = `${safeOrdem}_${tipo}_${categoriaSlug}.pdf`;
      const pngName = `${safeOrdem}_${tipo}_${categoriaSlug}.png`;
      const htmlName = `${safeOrdem}_${tipo}_${categoriaSlug}.html`;

      const pdfPath = path.join(jobDir, pdfName);
      const pngPath = path.join(jobDir, pngName);
      const htmlPath = path.join(jobDir, htmlName);
      const tmpHtmlPath = path.join(TMP_DIR, `${jobId}_card_${index + 1}.html`);

      fs.writeFileSync(tmpHtmlPath, html, "utf8");
      fs.writeFileSync(htmlPath, html, "utf8");

      const page = await this.browser.newPage();

      await page.setViewport({
        width: 700,
        height: 1058,
        deviceScaleFactor: 2,
      });

      await page.goto(`file://${tmpHtmlPath}`, {
        waitUntil: "networkidle0",
        timeout: 120000,
      });

      await this.waitForPageReady(page);

      await page.pdf({
        path: pdfPath,
        width: "700px",
        height: "1058px",
        printBackground: true,
        margin: {
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
      });

      await page.screenshot({
        path: pngPath,
        type: "png",
        fullPage: false,
      });

      await page.close();

      processed++;

      const card: GeneratedCard = {
        ordem: ordemFinal,
        tipo,
        categoria: categoriaRaw,
        categoriaSlug,
        texto: String(row.texto ?? ""),
        valor: String(row.valor ?? ""),
        cupom: String(row.cupom ?? ""),
        logoFile,
        hasLogo,
        pdfName,
        pngName,
        htmlName,
        pdfUrl: `/output/${jobId}/${pdfName}`,
        pngUrl: `/output/${jobId}/${pngName}`,
        htmlUrl: `/output/${jobId}/${htmlName}`,

        // 🔥 ESSA LINHA RESOLVE TUDO
        html
     };

      cards.push(card);

      this.emit("progress", {
        processed,
        total,
        percentage: Math.round((processed / total) * 100),
        currentCard: `${processed}/${total} cards processados`,
      });
    }

    const baseName = originalFileName
      ? path.parse(originalFileName).name
      : path.parse(excelFilePath).name;

    const zipName = `${this.sanitizeFileName(baseName)}_${this.getDateStamp()}.zip`;
    const zipPath = this.getUniqueFilePath(path.join(jobDir, zipName));

    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    for (const card of cards) {
      archive.file(path.join(jobDir, card.pdfName), {
        name: card.pdfName,
      });
    }

    await archive.finalize();

    await new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);
    });

    fs.writeFileSync(
      path.join(jobDir, "cards.json"),
      JSON.stringify({ jobId, cards }, null, 2),
      "utf8"
    );

    return {
      zipPath,
      zipName: path.basename(zipPath),
      jobId,
      cards,
      totalRows: total,
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
